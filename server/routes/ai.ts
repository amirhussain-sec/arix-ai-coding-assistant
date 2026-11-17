import {GoogleGenAI, ThinkingLevel} from '@google/genai';
import crypto from 'node:crypto';
import {Router} from 'express';
import {z} from 'zod';
import {requireAuth, type AuthenticatedRequest} from '../auth.ts';
import {db, nowIso} from '../db.ts';

const router = Router();
router.use(requireAuth);

const AI_MODES = [
  'chat',
  'generate',
  'debug',
  'explain',
  'convert',
  'agent',
  'optimize',
  'quality',
  'tests',
  'readme',
  'roadmap',
  'error_detective',
  'predict_run',
] as const;

type AiMode = (typeof AI_MODES)[number];

const aiRequestSchema = z.object({
  mode: z.enum(AI_MODES),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().min(1).max(120000),
      })
    )
    .min(1)
    .max(40),
  language: z.string().trim().max(40).default('typescript'),
  context: z.string().max(150000).optional(),
});

const FAST_MODEL = 'gemini-3.1-flash-lite';
const BIG_BUILD_MODEL = 'gemini-4-hydrogen';
const MAX_HISTORY_MESSAGES = 10;
const MAX_CONTEXT_CHARS = 3000;
const FIRST_TOKEN_TIMEOUT_MS = 8000;

const MAX_OUTPUT_TOKENS: Record<AiMode, number> = {
  chat: 800,
  explain: 800,
  debug: 1500,
  convert: 2000,
  generate: 3000,
  agent: 6000,
  optimize: 2000,
  quality: 1000,
  tests: 2000,
  readme: 1500,
  roadmap: 1500,
  error_detective: 1500,
  predict_run: 800,
};

// In-memory per-user sliding window rate limiter (25 req / 60s)
const userRateMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 25;

function checkRateLimit(userId: string): {allowed: boolean; retryAfter: number} {
  const now = Date.now();
  const timestamps = (userRateMap.get(userId) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  if (timestamps.length >= RATE_MAX_REQUESTS) {
    const oldest = timestamps[0] ?? now;
    const retryAfter = Math.max(
      1,
      Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 1000)
    );
    userRateMap.set(userId, timestamps);
    return {allowed: false, retryAfter};
  }
  timestamps.push(now);
  userRateMap.set(userId, timestamps);
  return {allowed: true, retryAfter: 0};
}

let cachedAiClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!cachedAiClient || cachedApiKey !== apiKey) {
    cachedApiKey = apiKey;
    cachedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAiClient;
}

function isBigAgentBuild(
  messages: Array<{role: string; content: string}>
): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return false;
  const raw = lastUser.content;
  const updateMarker = 'Requested update:\n';
  const markerIdx = raw.indexOf(updateMarker);
  const promptPortion =
    markerIdx >= 0 ? raw.slice(markerIdx + updateMarker.length) : raw;

  if (promptPortion.length > 260) return true;
  return /\b(big build|full[- ]featured|multi[- ]page|multipage|dashboard|analytics|e-?commerce|saas|portfolio|crm|kanban|spreadsheet|game|clone|complex)\b/i.test(
    promptPortion
  );
}

function selectModelConfig(
  mode: AiMode,
  messages: Array<{role: string; content: string}>
): {model: string; thinkingLevel: ThinkingLevel} {
  if (mode === 'agent' && isBigAgentBuild(messages)) {
    return {model: BIG_BUILD_MODEL, thinkingLevel: ThinkingLevel.LOW};
  }
  return {model: FAST_MODEL, thinkingLevel: ThinkingLevel.MINIMAL};
}

// Keep every system prompt concise (< 150 words) and instruct minimal preamble.
function getSystemPrompt(mode: AiMode, language: string, context?: string): string {
  const trimmedCtx = context?.trim().slice(0, MAX_CONTEXT_CHARS);
  const ctxBlock = trimmedCtx ? `\n\nCONTEXT:\n${trimmedCtx}` : '';

  switch (mode) {
    case 'chat':
      return `You are Arix, a senior engineer AI. Be concise, skip long introductions, and answer directly with clean Markdown and language-tagged code blocks. Never invent execution output.${ctxBlock}`;
    case 'generate':
      return `You are Arix Code Generator. Be concise; skip long introductions. Output production ${language} code using strictly:
===FILE: filename.ext===
<complete code>
===END_FILE===
Add at most a 2-line summary after files. No placeholders or TODOs.${ctxBlock}`;
    case 'debug':
      return `You are Arix Code Debugger. Analyze the ${language} code concisely. Return ONLY valid JSON (no markdown fences):
{"summary":"Brief diagnosis noting static analysis unless runtime error provided.","errors":[{"line":1,"severity":"error","title":"Short title","explanation":"Brief fix reason","rootCause":"Root cause"}],"correctedCode":"Full corrected code","preventionTips":["Tip 1"]}${ctxBlock}`;
    case 'explain':
      return `You are Arix Code Explainer. Be concise and skip long introductions. Explain the ${language} code for the requested depth mode using short headings, bullet points, and brief code references.${ctxBlock}`;
    case 'convert':
      return `You are Arix Code Converter. Skip introductions. Output:
1. One fenced code block with complete idiomatic converted code.
2. Brief "### Behavior & Runtime Differences" bullets.${ctxBlock}`;
    case 'agent':
      return `You are Arix Agent. Be concise; skip long prose.
Line 1 MUST be a short one-line plan starting with "PLAN: " (e.g. "PLAN: Planning the layout — clean header, interactive cards, and responsive grid").
Line 2+ MUST be ONE compact, complete HTML5 document (<!DOCTYPE html>...</html>) UNDER 400 LINES with inline <style> and <script>.
Rules: zero external URLs/CDNs/fonts (use inline SVGs, CSS gradients, system fonts); responsive across desktop, 768px, 390px; working interactive JS; no markdown fences. If existing HTML is provided, return the updated HTML.${ctxBlock}`;
    case 'optimize':
      return `You are Arix Code Optimizer. Skip long introductions. Refactor the ${language} code for speed, memory, and clarity. Return the complete optimized fenced code block plus brief improvement bullets.${ctxBlock}`;
    case 'quality':
      return `You are Arix Code Quality Analyzer for ${language}. Return ONLY valid JSON (no fences):
{"scores":{"readability":85,"performance":80,"maintainability":82,"security":88},"summary":"Brief assessment","findings":[{"category":"Security","severity":"medium","detail":"Concise finding and fix"}]}${ctxBlock}`;
    case 'tests':
      return `You are Arix Test Generator. Skip introductions. Write concise, runnable ${language} unit and edge-case tests in the standard framework with minimal notes.${ctxBlock}`;
    case 'readme':
      return `You are Arix Docs Writer. Generate a concise, accurate README.md covering overview, features, setup, and usage from the provided context.${ctxBlock}`;
    case 'roadmap':
      return `You are Arix Architect. Output a concise, milestone-based development roadmap tailored to the project's files and language.${ctxBlock}`;
    case 'error_detective':
      return `You are Arix Error Detective for ${language}. Skip introductions. Rank the top root causes concisely with diagnostic checks and exact code fixes.${ctxBlock}`;
    case 'predict_run':
      return `Simulate stdout/stderr for ${language} concisely. Output ONLY the predicted console output or realistic compiler/runtime error without long commentary.${ctxBlock}`;
  }
}

async function streamOnce(params: {
  ai: GoogleGenAI;
  model: string;
  thinkingLevel: ThinkingLevel;
  contents: Array<{role: 'user' | 'model'; parts: Array<{text: string}>}>;
  systemInstruction: string;
  maxOutputTokens: number;
  clientSignal: AbortSignal;
  onText: (text: string) => void;
}): Promise<{totalChars: number; firstTokenTimedOut: boolean}> {
  const {
    ai,
    model,
    thinkingLevel,
    contents,
    systemInstruction,
    maxOutputTokens,
    clientSignal,
    onText,
  } = params;

  const attemptController = new AbortController();
  const onClientAbort = () => attemptController.abort();
  if (clientSignal.aborted) {
    attemptController.abort();
    return {totalChars: 0, firstTokenTimedOut: false};
  }
  clientSignal.addEventListener('abort', onClientAbort, {once: true});

  let receivedFirstToken = false;
  let firstTokenTimedOut = false;
  let firstTokenTimer: ReturnType<typeof setTimeout> | null = null;
  let totalChars = 0;

  try {
    const streamPromise = ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction,
        maxOutputTokens,
        thinkingConfig: {thinkingLevel},
        abortSignal: attemptController.signal,
      },
    });

    const timeoutPromise = new Promise<'FIRST_TOKEN_TIMEOUT'>((resolve) => {
      firstTokenTimer = setTimeout(() => {
        if (!receivedFirstToken && !clientSignal.aborted) {
          firstTokenTimedOut = true;
          attemptController.abort();
          resolve('FIRST_TOKEN_TIMEOUT');
        }
      }, FIRST_TOKEN_TIMEOUT_MS);
    });

    const streamOrTimeout = await Promise.race([streamPromise, timeoutPromise]);
    if (streamOrTimeout === 'FIRST_TOKEN_TIMEOUT') {
      return {totalChars: 0, firstTokenTimedOut: true};
    }

    const iterator = streamOrTimeout[Symbol.asyncIterator]();

    while (true) {
      if (clientSignal.aborted) break;

      let step: IteratorResult<{text?: string}>;
      if (!receivedFirstToken) {
        const nextOrTimeout = await Promise.race([
          iterator.next(),
          timeoutPromise,
        ]);
        if (nextOrTimeout === 'FIRST_TOKEN_TIMEOUT') {
          void iterator.return?.(undefined).catch(() => {});
          return {totalChars, firstTokenTimedOut: true};
        }
        step = nextOrTimeout;
      } else {
        step = await iterator.next();
      }

      if (step.done) break;
      const text = step.value?.text ?? '';
      if (text) {
        if (!receivedFirstToken) {
          receivedFirstToken = true;
          if (firstTokenTimer) {
            clearTimeout(firstTokenTimer);
            firstTokenTimer = null;
          }
        }
        totalChars += text.length;
        onText(text);
      }
    }

    return {totalChars, firstTokenTimedOut: false};
  } finally {
    if (firstTokenTimer) clearTimeout(firstTokenTimer);
    clientSignal.removeEventListener('abort', onClientAbort);
  }
}

router.post('/', async (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = aiRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid AI request payload.',
    });
    return;
  }

  const rate = checkRateLimit(userId);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({
      error: `Rate limit reached. Please wait ${rate.retryAfter}s before sending another request.`,
      retryAfter: rate.retryAfter,
    });
    return;
  }

  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({
      error:
        'Built-in AI service is unavailable in this environment right now. Please try again shortly.',
    });
    return;
  }

  const {mode, messages, language, context} = parsed.data;
  const trimmedMessages = messages
    .filter((m) => m.role !== 'system')
    .slice(-MAX_HISTORY_MESSAGES);
  const contents = trimmedMessages.map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{text: m.content}],
  }));

  const systemInstruction = getSystemPrompt(mode, language, context);
  const maxOutputTokens = MAX_OUTPUT_TOKENS[mode];
  const primary = selectModelConfig(mode, trimmedMessages);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  req.socket?.setNoDelay?.(true);
  res.flushHeaders?.();

  const clientAbortController = new AbortController();
  let aborted = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      aborted = true;
      clientAbortController.abort();
    }
  });

  let totalChars = 0;
  let status = 'success';

  const emitChunk = (text: string) => {
    if (aborted) return;
    totalChars += text.length;
    res.write(`data: ${JSON.stringify({text})}\n\n`);
  };

  try {
    let result = await streamOnce({
      ai,
      model: primary.model,
      thinkingLevel: primary.thinkingLevel,
      contents,
      systemInstruction,
      maxOutputTokens,
      clientSignal: clientAbortController.signal,
      onText: emitChunk,
    }).catch(async (err: unknown) => {
      if (aborted || primary.model === FAST_MODEL) {
        throw err;
      }
      // Transient primary error before first token: fall back once to fastest model
      const msg = err instanceof Error ? err.message : '';
      if (
        msg.includes('429') ||
        msg.includes('402') ||
        msg.includes('403') ||
        msg.toLowerCase().includes('api_key')
      ) {
        throw err;
      }
      return {totalChars: 0, firstTokenTimedOut: true};
    });

    // Fallback once with the fastest model if no first token arrived within 8 seconds
    if (!aborted && result.firstTokenTimedOut) {
      result = await streamOnce({
        ai,
        model: FAST_MODEL,
        thinkingLevel: ThinkingLevel.MINIMAL,
        contents,
        systemInstruction,
        maxOutputTokens,
        clientSignal: clientAbortController.signal,
        onText: emitChunk,
      });

      if (!aborted && result.firstTokenTimedOut) {
        throw new Error('FIRST_TOKEN_TIMEOUT');
      }
    }

    if (!aborted) {
      res.write(`data: ${JSON.stringify({done: true})}\n\n`);
      res.end();
    }
  } catch (err: unknown) {
    status = 'error';
    const message =
      err instanceof Error ? err.message : 'AI generation failed.';
    let errorStatus = 500;
    let userMessage = 'AI request failed. Please retry.';
    let retryAfter: number | undefined;

    if (message === 'FIRST_TOKEN_TIMEOUT') {
      errorStatus = 504;
      userMessage = 'AI took too long to start responding. Please retry.';
    } else if (
      message.includes('429') ||
      message.toLowerCase().includes('resource_exhausted') ||
      message.toLowerCase().includes('quota')
    ) {
      errorStatus = 429;
      retryAfter = 15;
      userMessage = 'AI quota limit reached. Please wait a moment and retry.';
    } else if (
      message.includes('402') ||
      message.toLowerCase().includes('credit')
    ) {
      errorStatus = 402;
      userMessage = 'AI credits exhausted for this workspace.';
    } else if (
      message.includes('403') ||
      message.includes('400') ||
      message.toLowerCase().includes('api_key')
    ) {
      errorStatus = 503;
      userMessage =
        'Built-in AI service configuration issue. Please check Settings > Secrets.';
    }

    if (!aborted) {
      res.write(
        `data: ${JSON.stringify({
          error: userMessage,
          status: errorStatus,
          retryAfter,
        })}\n\n`
      );
      res.end();
    }
  } finally {
    try {
      const timestamp = nowIso();
      const inputChars = trimmedMessages.reduce(
        (sum, m) => sum + m.content.length,
        0
      );
      const tokensEstimate = Math.max(
        1,
        Math.round((inputChars + totalChars) / 4)
      );
      db.prepare(
        `INSERT INTO ai_usage (id, user_id, mode, language, tokens_estimate, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        userId,
        mode,
        language,
        tokensEstimate,
        status,
        timestamp,
        timestamp
      );
    } catch (logErr) {
      console.error('Failed to record ai_usage:', logErr);
    }
  }
});

export default router;
