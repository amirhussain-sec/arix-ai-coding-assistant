import {useQueryClient} from '@tanstack/react-query';
import {Plus, Sparkles} from 'lucide-react';
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {AiErrorBanner} from '../components/AiErrorBanner';
import {ArixMascot} from '../components/ArixMascot';
import {Button} from '../components/ui/button';
import {AiStreamError, streamAi} from '../lib/aiStream';
import {cn} from '../lib/utils';

interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AgentStreamingHandle {
  setRaw: (raw: string) => void;
}

const TEMPLATES = [
  {
    title: 'Landing Page',
    description:
      'Modern SaaS product hero, feature grid, pricing, and responsive nav.',
    prompt:
      'Build a polished SaaS landing page for a developer analytics tool with a hero section, feature highlights, interactive pricing toggle, and clean footer.',
  },
  {
    title: 'Analytics Dashboard',
    description:
      'KPI cards, interactive SVG charts, and filterable activity table.',
    prompt:
      'Build an interactive product analytics dashboard with 4 KPI cards, a timeframe filter, an SVG bar chart, and a searchable recent events table.',
  },
  {
    title: 'Task Manager',
    description:
      'Interactive task board with status columns, priorities, and persistence.',
    prompt:
      'Build a clean task manager web app with add/complete/delete tasks, priority tags, status filter tabs, and localStorage persistence.',
  },
  {
    title: 'Focus Timer',
    description:
      'Pomodoro timer with circular SVG ring, session presets, and task list.',
    prompt:
      'Build a Pomodoro focus timer with a circular SVG progress ring, Focus and Break mode tabs, start/pause/reset controls, and a quick session checklist.',
  },
];

function parseAgentStream(raw: string): {planLine: string; codePart: string} {
  const trimmed = raw.trimStart();
  if (/^PLAN:/i.test(trimmed)) {
    const newlineIdx = trimmed.indexOf('\n');
    if (newlineIdx === -1) {
      return {
        planLine: trimmed.replace(/^PLAN:\s*/i, '').trim(),
        codePart: '',
      };
    }
    return {
      planLine: trimmed.slice(0, newlineIdx).replace(/^PLAN:\s*/i, '').trim(),
      codePart: trimmed.slice(newlineIdx + 1).trimStart(),
    };
  }
  const htmlIdx = trimmed.search(/<!doctype html|<html|```/i);
  if (htmlIdx > 0) {
    return {
      planLine: trimmed.slice(0, htmlIdx).trim(),
      codePart: trimmed.slice(htmlIdx).trimStart(),
    };
  }
  return {planLine: '', codePart: trimmed};
}

function extractHtmlDocument(raw: string): string {
  const {codePart} = parseAgentStream(raw);
  const cleaned = codePart
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const docIdx = cleaned.search(/<!doctype html|<html/i);
  return docIdx >= 0 ? cleaned.slice(docIdx) : cleaned;
}

const AgentMessageRow = memo(function AgentMessageRow({
  msg,
}: {
  msg: AgentChatMessage;
}) {
  return (
    <div
      className={cn(
        'flex gap-2.5',
        msg.role === 'user' ? 'justify-end' : 'justify-start'
      )}
    >
      {msg.role === 'assistant' && (
        <div className="pt-0.5 shrink-0">
          <ArixMascot size="xs" mood="idle" animateFloat={false} />
        </div>
      )}
      <div
        className={cn(
          'rounded-2xl px-3.5 py-2.5 text-sm max-w-[85%] leading-relaxed whitespace-pre-wrap',
          msg.role === 'user'
            ? 'bg-gradient-to-r from-[#4f6bff] to-[#8b5cf6] text-white'
            : 'arix-glass text-slate-800 dark:text-slate-100'
        )}
      >
        {msg.content}
      </div>
    </div>
  );
});

const AgentStreamingBubble = memo(
  forwardRef<
    AgentStreamingHandle,
    {scrollEndRef: React.RefObject<HTMLDivElement | null>}
  >(function AgentStreamingBubble({scrollEndRef}, ref) {
    const [raw, setRaw] = useState('');

    useImperativeHandle(
      ref,
      () => ({
        setRaw: (next: string) => setRaw(next),
      }),
      []
    );

    useEffect(() => {
      if (raw) {
        scrollEndRef.current?.scrollIntoView({behavior: 'auto'});
      }
    }, [raw, scrollEndRef]);

    const {planLine, codePart} = parseAgentStream(raw);
    const codeLines = codePart ? codePart.split('\n') : [];
    const tailPreview =
      codeLines.length > 0 ? codeLines.slice(-4).join('\n') : '';

    return (
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5 shrink-0">
          <ArixMascot size="xs" mood="thinking" animateFloat={false} />
        </div>
        <div className="arix-glass rounded-2xl px-3.5 py-2.5 max-w-[85%] space-y-2">
          <p className="text-xs font-medium text-[#4f6bff] dark:text-[#06b6d4]">
            {planLine || 'Planning the layout...'}
          </p>
          {codeLines.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Streaming HTML ({codeLines.length} lines)...
              </p>
              <pre className="rounded-lg bg-slate-950/90 text-slate-200 p-2 font-mono text-[10px] leading-snug overflow-hidden max-h-20">
                <code>{tailPreview}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  })
);

const AgentPreviewPane = memo(function AgentPreviewPane({
  htmlContent,
  isBuilding,
  onSelectTemplate,
}: {
  htmlContent: string;
  isBuilding: boolean;
  onSelectTemplate: (prompt: string) => void;
}) {
  if (!htmlContent && !isBuilding) {
    return (
      <div className="max-w-3xl w-full m-auto space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Starter Templates
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Pick a template to generate a self-contained app, or type your own
            prompt on the left and click Create.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.title}
              type="button"
              onClick={() => onSelectTemplate(tpl.prompt)}
              className="arix-glass rounded-2xl p-5 text-left hover:border-[#4f6bff]/50 transition-colors cursor-pointer space-y-2"
            >
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {tpl.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {tpl.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white shadow-lg">
      {htmlContent ? (
        <iframe
          title="Arix Agent Sandboxed Preview"
          sandbox="allow-scripts allow-forms allow-modals"
          srcDoc={htmlContent}
          className="w-full h-full border-0 bg-white"
        />
      ) : (
        <div className="h-full flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-300">
          <ArixMascot size="md" mood="thinking" />
          <p className="text-sm">Building your self-contained HTML preview...</p>
        </div>
      )}
    </div>
  );
});

export function AgentPage() {
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const streamBubbleRef = useRef<AgentStreamingHandle | null>(null);
  const lastPromptRef = useRef<string>('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(
      () => setCooldown((c) => Math.max(0, c - 1)),
      1000
    );
    return () => window.clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages.length, isBuilding]);

  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const htmlContentRef = useRef(htmlContent);
  htmlContentRef.current = htmlContent;

  const handleCreate = useCallback(
    async (overridePrompt?: string) => {
      const cleanPrompt = (overridePrompt ?? promptRef.current).trim();
      if (!cleanPrompt || isBuilding || cooldown > 0) return;

      lastPromptRef.current = cleanPrompt;
      setErrorMsg(null);
      if (!overridePrompt) setPrompt('');
      setIsBuilding(true);
      streamBubbleRef.current?.setRaw('');

      const userMsg: AgentChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: cleanPrompt,
      };
      setMessages((prev) => [...prev, userMsg]);

      const currentHtml = htmlContentRef.current;

      try {
        const apiMessages = currentHtml
          ? [
              {
                role: 'user' as const,
                content: `Current HTML document:\n${currentHtml}\n\nRequested update:\n${cleanPrompt}`,
              },
            ]
          : [
              {
                role: 'user' as const,
                content: `Build a compact, self-contained HTML application (under 400 lines) for:\n${cleanPrompt}`,
              },
            ];

        const rawOutput = await streamAi({
          mode: 'agent',
          language: 'html',
          messages: apiMessages,
          onChunk: (_chunk, acc) => {
            streamBubbleRef.current?.setRaw(acc);
          },
        });

        const {planLine} = parseAgentStream(rawOutput);
        const finalHtml = extractHtmlDocument(rawOutput);
        if (!finalHtml.includes('<')) {
          throw new AiStreamError(
            'AI response did not contain valid HTML.',
            500
          );
        }

        setHtmlContent(finalHtml);
        const statusSummary = currentHtml
          ? `Updated the live preview for: "${cleanPrompt}".`
          : 'Built your app and rendered the live preview.';
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: planLine ? `${planLine}\n\n${statusSummary}` : statusSummary,
          },
        ]);
        void queryClient.invalidateQueries({queryKey: ['dashboard']});
      } catch (err) {
        if (!overridePrompt) setPrompt(cleanPrompt);
        if (err instanceof AiStreamError) {
          setErrorMsg(err.message);
          if (err.status === 429 && err.retryAfter) setCooldown(err.retryAfter);
        } else {
          setErrorMsg(
            err instanceof Error ? err.message : 'Build failed. Please retry.'
          );
        }
      } finally {
        setIsBuilding(false);
        streamBubbleRef.current?.setRaw('');
      }
    },
    [cooldown, isBuilding, queryClient]
  );

  const handleSelectTemplate = useCallback(
    (tplPrompt: string) => {
      void handleCreate(tplPrompt);
    },
    [handleCreate]
  );

  const handleReset = () => {
    setMessages([]);
    setHtmlContent('');
    setPrompt('');
    setErrorMsg(null);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row overflow-hidden">
      {/* Left Chat Box & Input */}
      <section className="w-full lg:w-[400px] shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-[#090d1b]/75 max-h-[45vh] lg:max-h-none">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ArixMascot
              size="xs"
              mood={isBuilding ? 'thinking' : 'happy'}
              animateFloat={false}
            />
            <span className="font-display text-sm font-semibold">
              Arix Agent
            </span>
          </div>
          {htmlContent && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleReset}
              disabled={isBuilding}
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !isBuilding && (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Describe what you want to build
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enter a prompt below or choose one of the 4 template cards on
                the right.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <AgentMessageRow key={msg.id} msg={msg} />
          ))}

          {isBuilding && (
            <AgentStreamingBubble
              ref={streamBubbleRef}
              scrollEndRef={chatEndRef}
            />
          )}

          {errorMsg && (
            <AiErrorBanner
              message={errorMsg}
              cooldownSeconds={cooldown}
              onRetry={() => void handleCreate(lastPromptRef.current)}
              onDismiss={() => setErrorMsg(null)}
            />
          )}

          <div ref={chatEndRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
          className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-end gap-2"
        >
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleCreate();
              }
            }}
            placeholder={
              htmlContent
                ? 'Ask Arix to update the app...'
                : 'Describe the web app to build...'
            }
            className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1224] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4f6bff]"
          />
          <Button
            type="submit"
            variant="gradient"
            size="sm"
            className="h-10 px-4 shrink-0"
            disabled={!prompt.trim() || isBuilding || cooldown > 0}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {cooldown > 0
              ? `${cooldown}s`
              : isBuilding
                ? 'Building...'
                : 'Create'}
          </Button>
        </form>
      </section>

      {/* Right Live Preview / 4 Template Cards */}
      <section className="flex-1 min-w-0 flex flex-col bg-slate-100/40 dark:bg-[#060812] p-4 sm:p-6 overflow-y-auto">
        <AgentPreviewPane
          htmlContent={htmlContent}
          isBuilding={isBuilding}
          onSelectTemplate={handleSelectTemplate}
        />
      </section>
    </div>
  );
}
