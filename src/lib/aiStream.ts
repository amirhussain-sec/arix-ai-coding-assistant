import {getStoredSessionToken} from './api';

export type AiMode =
  | 'chat'
  | 'generate'
  | 'debug'
  | 'explain'
  | 'convert'
  | 'agent'
  | 'optimize'
  | 'quality'
  | 'tests'
  | 'readme'
  | 'roadmap'
  | 'error_detective'
  | 'predict_run';

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class AiStreamError extends Error {
  status: number;
  retryAfter?: number;

  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = 'AiStreamError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export interface StreamAiOptions {
  mode: AiMode;
  messages: AiChatMessage[];
  language?: string;
  context?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onChunk: (chunk: string, accumulated: string) => void;
}

export async function streamAi(options: StreamAiOptions): Promise<string> {
  const {
    mode,
    messages,
    language = 'typescript',
    context,
    signal,
    timeoutMs = 30_000,
    onChunk,
  } = options;

  const trimmedMessages = messages.slice(-10);
  const trimmedContext = context ? context.slice(0, 3000) : undefined;

  const controller = new AbortController();
  let timedOut = false;

  const abortFromExternal = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    signal.addEventListener('abort', abortFromExternal);
  }

  let timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const resetTimeout = () => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };

  try {
    const headers = new Headers({'Content-Type': 'application/json'});
    const token = getStoredSessionToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers,
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({
        mode,
        messages: trimmedMessages,
        language,
        context: trimmedContext,
      }),
    });

    if (!response.ok) {
      let msg = `AI request failed (${response.status}).`;
      let retryAfter: number | undefined;
      try {
        const body = (await response.json()) as {
          error?: string;
          retryAfter?: number;
        };
        if (body.error) msg = body.error;
        if (body.retryAfter) retryAfter = body.retryAfter;
      } catch {
        // ignore JSON parse failure
      }
      const headerRetry = response.headers.get('Retry-After');
      if (!retryAfter && headerRetry) {
        const parsedRetry = Number(headerRetry);
        if (!Number.isNaN(parsedRetry)) retryAfter = parsedRetry;
      }
      throw new AiStreamError(msg, response.status, retryAfter);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new AiStreamError('Streaming response unavailable.', 500);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';

    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      resetTimeout();

      buffer += decoder.decode(value, {stream: true});
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const evt of events) {
        const lines = evt.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const payload = JSON.parse(jsonStr) as {
              text?: string;
              done?: boolean;
              error?: string;
              status?: number;
              retryAfter?: number;
            };
            if (payload.error) {
              throw new AiStreamError(
                payload.error,
                payload.status ?? 500,
                payload.retryAfter
              );
            }
            if (payload.text) {
              accumulated += payload.text;
              onChunk(payload.text, accumulated);
            }
          } catch (err) {
            if (err instanceof AiStreamError) throw err;
          }
        }
      }
    }

    return accumulated;
  } catch (err) {
    if (timedOut) {
      throw new AiStreamError(
        'AI request timed out after 30 seconds without a response. Please click Retry.',
        408
      );
    }
    if (err instanceof AiStreamError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new AiStreamError(
      err instanceof Error ? err.message : 'Network error connecting to AI.',
      0
    );
  } finally {
    window.clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', abortFromExternal);
    }
  }
}
