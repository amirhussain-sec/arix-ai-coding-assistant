import {useQueryClient} from '@tanstack/react-query';
import {
  AlertTriangle,
  Bug,
  Check,
  Copy,
  ShieldAlert,
  Upload,
  Wrench,
} from 'lucide-react';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {toast} from 'sonner';
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

interface DebugIssue {
  line: number;
  severity: string;
  title: string;
  explanation: string;
  rootCause: string;
}

interface DebugResult {
  summary: string;
  errors: DebugIssue[];
  correctedCode: string;
  preventionTips: string[];
}

function computeLineDiff(before: string, after: string) {
  const bLines = before.split('\n');
  const aLines = after.split('\n');
  const max = Math.max(bLines.length, aLines.length);
  const rows: Array<{
    line: number;
    type: 'same' | 'changed';
    before?: string;
    after?: string;
  }> = [];

  for (let i = 0; i < max; i++) {
    const b = bLines[i];
    const a = aLines[i];
    if (b === a) {
      rows.push({line: i + 1, type: 'same', before: b, after: a});
    } else {
      rows.push({line: i + 1, type: 'changed', before: b, after: a});
    }
  }
  return rows;
}

export function DebuggerPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<'debug' | 'error_detective'>('debug');
  const [language, setLanguage] = useState('typescript');
  const [code, setCode] = useState('');
  const [errorInput, setErrorInput] = useState('');
  const [rawResult, setRawResult] = useState('');
  const [parsedResult, setParsedResult] = useState<DebugResult | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const diffRows = useMemo(() => {
    if (!parsedResult?.correctedCode) return [];
    return computeLineDiff(code, parsedResult.correctedCode);
  }, [code, parsedResult]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCode(text);
    toast.success(`Loaded ${file.name}`);
  };

  const handleAnalyze = async () => {
    if (mode === 'debug' && !code.trim()) return;
    if (mode === 'error_detective' && !errorInput.trim()) return;
    if (isStreaming || cooldown > 0) return;

    setErrorMsg(null);
    setRawResult('');
    setParsedResult(null);
    setIsStreaming(true);

    try {
      const prompt =
        mode === 'debug'
          ? `Language: ${language}\n\nCode:\n${code}\n\n${
              errorInput.trim() ? `Observed Error:\n${errorInput.trim()}` : 'No runtime error pasted.'
            }`
          : `Language: ${language}\n\nError / Stack Trace:\n${errorInput.trim()}\n\n${
              code.trim() ? `Related Code:\n${code}` : ''
            }`;

      const full = await streamAi({
        mode,
        language,
        messages: [{role: 'user', content: prompt}],
        onChunk: (_c, acc) => setRawResult(acc),
      });

      if (mode === 'debug') {
        const cleaned = full
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```$/i, '')
          .trim();
        try {
          const parsed = JSON.parse(cleaned) as DebugResult;
          setParsedResult(parsed);
        } catch {
          // Keep raw markdown fallback if JSON parsing fails
        }
      }

      await queryClient.invalidateQueries({queryKey: ['dashboard']});
    } catch (err) {
      if (err instanceof AiStreamError) {
        setErrorMsg(err.message);
        if (err.status === 429 && err.retryAfter) setCooldown(err.retryAfter);
      } else {
        setErrorMsg('Analysis failed. Please retry.');
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleFixAll = () => {
    if (!parsedResult?.correctedCode) return;
    setCode(parsedResult.correctedCode);
    toast.success('Applied corrected code to editor');
  };

  const handleCopyCorrected = async () => {
    if (!parsedResult?.correctedCode) return;
    await navigator.clipboard.writeText(parsedResult.correctedCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="arix-glass rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setMode('debug')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                mode === 'debug'
                  ? 'bg-white dark:bg-[#17203d] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Code Debugger
            </button>
            <button
              type="button"
              onClick={() => setMode('error_detective')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                mode === 'error_detective'
                  ? 'bg-white dark:bg-[#17203d] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Smart Error Detective
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-44 h-9 text-xs">
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

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload file
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Source Code {mode === 'error_detective' && '(optional)'}
            </label>
            <textarea
              rows={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste your code here..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-3.5 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#4f6bff]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Error Message / Stack Trace {mode === 'debug' && '(optional)'}
            </label>
            <textarea
              rows={10}
              value={errorInput}
              onChange={(e) => setErrorInput(e.target.value)}
              placeholder="Paste compiler error, runtime exception, or stack trace..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0b1020]/90 p-3.5 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#4f6bff]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="gradient"
            onClick={handleAnalyze}
            disabled={
              isStreaming ||
              cooldown > 0 ||
              (mode === 'debug' ? !code.trim() : !errorInput.trim())
            }
          >
            <Bug className="h-4 w-4" />
            {isStreaming
              ? 'Analyzing...'
              : cooldown > 0
                ? `Wait ${cooldown}s`
                : mode === 'debug'
                  ? 'Analyze & Debug'
                  : 'Run Error Detective'}
          </Button>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Static analysis note: run code in Code Runner to verify runtime behavior.
          </p>
        </div>

        {errorMsg && (
          <AiErrorBanner
            message={errorMsg}
            cooldownSeconds={cooldown}
            onRetry={handleAnalyze}
            onDismiss={() => setErrorMsg(null)}
          />
        )}
      </div>

      {/* Structured Debugger Output */}
      {parsedResult ? (
        <div className="space-y-6">
          <div className="arix-glass rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold">
                  Diagnostic Summary
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  {parsedResult.summary}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyCorrected}>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Copy fixed code
                </Button>
                <Button variant="gradient" size="sm" onClick={handleFixAll}>
                  <Wrench className="h-3.5 w-3.5" />
                  Fix all errors
                </Button>
              </div>
            </div>

            {parsedResult.errors.length > 0 && (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {parsedResult.errors.map((err, i) => (
                  <div key={i} className="py-3.5 space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="font-mono text-xs text-[#4f6bff] dark:text-[#06b6d4]">
                        Line {err.line}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {err.title}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 pl-6">
                      {err.explanation}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 pl-6">
                      Root cause: {err.rootCause}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Before & After Diff */}
          <div className="arix-glass rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">
                Before & After Diff
              </h3>
              <span className="text-xs text-slate-500">
                Red: original · Green: corrected
              </span>
            </div>
            <div className="bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto max-h-96 p-3 space-y-0.5">
              {diffRows.map((row) =>
                row.type === 'same' ? (
                  <div key={row.line} className="flex gap-3 px-2 py-0.5 opacity-65">
                    <span className="w-8 text-right text-slate-500 select-none">
                      {row.line}
                    </span>
                    <span className="whitespace-pre">{row.before ?? ''}</span>
                  </div>
                ) : (
                  <React.Fragment key={row.line}>
                    {row.before !== undefined && (
                      <div className="flex gap-3 px-2 py-0.5 bg-red-500/15 text-red-300">
                        <span className="w-8 text-right select-none">
                          -{row.line}
                        </span>
                        <span className="whitespace-pre">{row.before}</span>
                      </div>
                    )}
                    {row.after !== undefined && (
                      <div className="flex gap-3 px-2 py-0.5 bg-emerald-500/15 text-emerald-300">
                        <span className="w-8 text-right select-none">
                          +{row.line}
                        </span>
                        <span className="whitespace-pre">{row.after}</span>
                      </div>
                    )}
                  </React.Fragment>
                )
              )}
            </div>
          </div>

          {/* Prevention Tips */}
          {parsedResult.preventionTips.length > 0 && (
            <div className="arix-glass rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-[#06b6d4]" />
                <h3 className="font-display text-sm font-semibold">
                  Prevention Tips
                </h3>
              </div>
              <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300 list-disc pl-5">
                {parsedResult.preventionTips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : rawResult ? (
        <div className="arix-glass rounded-2xl p-5">
          <MarkdownView content={rawResult} />
        </div>
      ) : isStreaming ? (
        <div className="arix-glass rounded-2xl p-5 text-sm text-slate-600 dark:text-slate-300">
          Arix is analyzing your code...
        </div>
      ) : null}
    </div>
  );
}
