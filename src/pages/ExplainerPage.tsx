import {useQueryClient} from '@tanstack/react-query';
import {BookOpen, Check, Copy} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import {useLocation} from 'react-router-dom';
import {AiErrorBanner} from '../components/AiErrorBanner';
import {MarkdownView} from '../components/MarkdownView';
import {Button} from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {AiStreamError, streamAi} from '../lib/aiStream';
import {SUPPORTED_LANGUAGES} from '../lib/languages';

const EXPLAIN_MODES = [
  {id: 'beginner', label: 'Beginner Overview'},
  {id: 'line_by_line', label: 'Line by Line'},
  {id: 'advanced', label: 'Advanced Analysis'},
  {id: 'optimization', label: 'Optimization Review'},
];

export function ExplainerPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const incomingState = (location.state as {code?: string; language?: string} | null) ?? null;

  const [language, setLanguage] = useState(incomingState?.language || 'typescript');
  const [depthMode, setDepthMode] = useState('beginner');
  const [code, setCode] = useState(incomingState?.code || '');
  const [output, setOutput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const handleExplain = async () => {
    if (!code.trim() || isStreaming || cooldown > 0) return;
    setErrorMsg(null);
    setOutput('');
    setIsStreaming(true);

    const depthLabel =
      EXPLAIN_MODES.find((m) => m.id === depthMode)?.label || 'Beginner Overview';

    try {
      await streamAi({
        mode: 'explain',
        language,
        messages: [
          {
            role: 'user',
            content: `Explanation Mode: ${depthLabel}\nLanguage: ${language}\n\nCode:\n${code}`,
          },
        ],
        onChunk: (_c, acc) => setOutput(acc),
      });
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
    } catch (err) {
      if (err instanceof AiStreamError) {
        setErrorMsg(err.message);
        if (err.status === 429 && err.retryAfter) setCooldown(err.retryAfter);
      } else {
        setErrorMsg('Failed to explain code.');
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 arix-glass rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Language
            </label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Explanation Mode
            </label>
            <Select value={depthMode} onValueChange={setDepthMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPLAIN_MODES.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <textarea
          rows={15}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste the code you want explained..."
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-3.5 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#4f6bff]"
        />

        <Button
          variant="gradient"
          className="w-full"
          onClick={handleExplain}
          disabled={!code.trim() || isStreaming || cooldown > 0}
        >
          <BookOpen className="h-4 w-4" />
          {isStreaming
            ? 'Explaining...'
            : cooldown > 0
              ? `Wait ${cooldown}s`
              : 'Explain Code'}
        </Button>

        {errorMsg && (
          <AiErrorBanner
            message={errorMsg}
            cooldownSeconds={cooldown}
            onRetry={handleExplain}
            onDismiss={() => setErrorMsg(null)}
          />
        )}
      </div>

      <div className="lg:col-span-7 arix-glass rounded-2xl p-5 sm:p-6 min-h-[420px]">
        <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold">Explanation</h2>
          {output && (
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </div>

        {output ? (
          <MarkdownView content={output} />
        ) : isStreaming ? (
          <p className="text-sm text-[#4f6bff] dark:text-[#06b6d4] py-16 text-center">
            Arix is thinking...
          </p>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-16 text-center">
            Choose an explanation mode and paste code to stream a structured
            breakdown.
          </p>
        )}
      </div>
    </div>
  );
}
