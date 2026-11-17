import Editor from '@monaco-editor/react';
import {useQueryClient} from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Maximize2,
  Minimize2,
  Play,
  Trash2,
} from 'lucide-react';
import React, {useEffect, useRef, useState} from 'react';
import {useLocation} from 'react-router-dom';
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
import {Skeleton} from '../components/ui/skeleton';
import {useAuth} from '../contexts/AuthContext';
import {useTheme} from '../contexts/ThemeContext';
import {AiStreamError, streamAi} from '../lib/aiStream';
import {apiFetch} from '../lib/api';
import {getLanguageById, SUPPORTED_LANGUAGES} from '../lib/languages';
import {
  isLiveRunnable,
  runJavaScriptInWorker,
  runPythonInWorker,
} from '../lib/runnerEngine';
import {cn} from '../lib/utils';

type PanelTab = 'terminal' | 'stdin' | 'preview' | 'ai';

export function RunnerPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const {theme} = useTheme();
  const {settings} = useAuth();

  const incoming =
    (location.state as {code?: string; language?: string; projectId?: string} | null) ??
    null;

  const [language, setLanguage] = useState(incoming?.language || 'javascript');
  const [code, setCode] = useState(
    incoming?.code ?? getLanguageById(incoming?.language || 'javascript').starterContent
  );
  const [stdin, setStdin] = useState('');
  const [activeTab, setActiveTab] = useState<PanelTab>(
    incoming?.language === 'html' ? 'preview' : 'terminal'
  );
  const [terminalHeight, setTerminalHeight] = useState(260);
  const [maximized, setMaximized] = useState(false);

  const [running, setRunning] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [isAiPredicted, setIsAiPredicted] = useState(false);
  const [htmlPreviewDoc, setHtmlPreviewDoc] = useState('');

  const [aiNote, setAiNote] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [copied, setCopied] = useState(false);

  const langMeta = getLanguageById(language);
  const liveSupported = isLiveRunnable(language);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const handleLanguageChange = (nextLang: string) => {
    setLanguage(nextLang);
    const meta = getLanguageById(nextLang);
    setCode(meta.starterContent);
    setStdout('');
    setStderr('');
    setExitCode(null);
    setDurationMs(null);
    setIsAiPredicted(false);
    setStatusNote('');
    if (nextLang === 'html') {
      setActiveTab('preview');
      setHtmlPreviewDoc(meta.starterContent);
    } else {
      setActiveTab('terminal');
    }
  };

  const recordRun = async (payload: {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    isAiPredicted: boolean;
  }) => {
    try {
      await apiFetch('/api/runs', {
        method: 'POST',
        body: JSON.stringify({
          projectId: incoming?.projectId ?? null,
          language,
          codeSnippet: code.slice(0, 50000),
          stdout: payload.stdout,
          stderr: payload.stderr,
          exitCode: payload.exitCode,
          durationMs: payload.durationMs,
          isAiPredicted: payload.isAiPredicted,
        }),
      });
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
    } catch {
      // non-fatal logging error
    }
  };

  const handleRun = async () => {
    if (running) return;
    setAiError(null);
    setIsAiPredicted(false);

    if (language === 'html') {
      setHtmlPreviewDoc(code);
      setActiveTab('preview');
      setStdout('Rendered HTML in sandboxed iframe preview.');
      setStderr('');
      setExitCode(0);
      setDurationMs(0);
      await recordRun({
        stdout: 'HTML preview rendered',
        stderr: '',
        exitCode: 0,
        durationMs: 0,
        isAiPredicted: false,
      });
      return;
    }

    if (!liveSupported) {
      setActiveTab('terminal');
      setStdout('');
      setStderr(
        `${langMeta.name} is not supported for live browser execution. Use "AI-Predicted Output" below to simulate expected output.`
      );
      setExitCode(null);
      return;
    }

    setRunning(true);
    setActiveTab('terminal');
    setStdout('');
    setStderr('');
    setStatusNote(
      language === 'python' ? 'Preparing Pyodide Worker...' : 'Running in Worker...'
    );

    try {
      const result =
        language === 'javascript'
          ? await runJavaScriptInWorker(code, stdin, 5000)
          : await runPythonInWorker(code, stdin, setStatusNote, 5000);

      setStdout(result.stdout);
      setStderr(result.stderr);
      setExitCode(result.exitCode);
      setDurationMs(result.durationMs);
      setStatusNote('');
      await recordRun({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        isAiPredicted: false,
      });
    } finally {
      setRunning(false);
    }
  };

  const lastAiActionRef = useRef<'predict' | 'explain' | null>(null);

  const handleAiPredict = async () => {
    if (running || cooldown > 0 || !code.trim()) return;
    lastAiActionRef.current = 'predict';
    setRunning(true);
    setAiError(null);
    setStdout('');
    setStderr('');
    setIsAiPredicted(true);
    setActiveTab('terminal');
    const start = performance.now();

    try {
      const predicted = await streamAi({
        mode: 'predict_run',
        language,
        messages: [
          {
            role: 'user',
            content: `Code (${langMeta.name}):\n${code}\n\nStdin:\n${stdin || '(empty)'}`,
          },
        ],
        onChunk: (_c, acc) => setStdout(acc),
      });
      const duration = Math.round(performance.now() - start);
      setExitCode(0);
      setDurationMs(duration);
      await recordRun({
        stdout: predicted,
        stderr: '',
        exitCode: 0,
        durationMs: duration,
        isAiPredicted: true,
      });
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
    } catch (err) {
      if (err instanceof AiStreamError) {
        setAiError(err.message);
        if (err.status === 429 && err.retryAfter) setCooldown(err.retryAfter);
      } else {
        setAiError('AI prediction failed.');
      }
    } finally {
      setRunning(false);
    }
  };

  const handleExplainOutput = async () => {
    if (running || cooldown > 0) return;
    lastAiActionRef.current = 'explain';
    setActiveTab('ai');
    setAiNote('');
    setAiError(null);
    setRunning(true);
    try {
      await streamAi({
        mode: 'explain',
        language,
        messages: [
          {
            role: 'user',
            content: `Explain this ${langMeta.name} code and its execution output.\nCode:\n${code}\nStdout:\n${stdout}\nStderr:\n${stderr}`,
          },
        ],
        onChunk: (_c, acc) => setAiNote(acc),
      });
    } catch (err) {
      if (err instanceof AiStreamError) {
        setAiError(err.message);
        if (err.status === 429 && err.retryAfter) setCooldown(err.retryAfter);
      } else {
        setAiError('Failed to analyze output.');
      }
    } finally {
      setRunning(false);
    }
  };

  const handleCopyOutput = async () => {
    const text = [stdout, stderr].filter(Boolean).join('\n');
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const startResize = (e: React.MouseEvent) => {
    const startY = e.clientY;
    const startH = terminalHeight;
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      setTerminalHeight(Math.max(150, Math.min(540, startH + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Runner Toolbar */}
      <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-[#090d1b]/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={language} onValueChange={handleLanguageChange}>
            <SelectTrigger className="w-44 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} (.{l.extension})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-xs text-slate-500 dark:text-slate-400">
            {liveSupported ? (
              langMeta.runtimeNote
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Not supported for live execution in browser
              </span>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {liveSupported ? (
            <Button
              variant="gradient"
              size="sm"
              onClick={handleRun}
              disabled={running}
            >
              <Play className="h-3.5 w-3.5" />
              {running ? 'Running...' : language === 'html' ? 'Render Preview' : 'Run Code'}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAiPredict}
              disabled={running || cooldown > 0}
            >
              <Bot className="h-3.5 w-3.5" />
              {cooldown > 0 ? `Wait ${cooldown}s` : 'Predict Output (AI)'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExplainOutput}
            disabled={running || cooldown > 0}
          >
            Analyze with AI
          </Button>
        </div>
      </div>

      {/* Editor Area */}
      {!maximized && (
        <div className="flex-1 min-h-0">
          <Editor
            height="100%"
            language={langMeta.monacoId}
            value={code}
            loading={<Skeleton className="h-full w-full rounded-none" />}
            onChange={(val) => setCode(val ?? '')}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              fontSize: settings?.editorFontSize ?? 14,
              fontFamily: 'JetBrains Mono, monospace',
              minimap: {enabled: false},
              automaticLayout: true,
              padding: {top: 12},
            }}
          />
        </div>
      )}

      {/* Drag Resize Handle */}
      {!maximized && (
        <div
          onMouseDown={startResize}
          className="h-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-[#4f6bff] cursor-row-resize transition-colors"
          title="Drag to resize terminal"
        />
      )}

      {/* Resizable Terminal Panel */}
      <div
        className={cn(
          'flex flex-col border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090d1b]',
          maximized ? 'flex-1' : 'shrink-0'
        )}
        style={maximized ? undefined : {height: `${terminalHeight}px`}}
      >
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {(['terminal', 'stdin', 'preview', 'ai'] as PanelTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                  activeTab === tab
                    ? 'bg-[#4f6bff]/15 text-[#4f6bff] dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                )}
              >
                {tab === 'terminal'
                  ? 'Terminal'
                  : tab === 'stdin'
                    ? 'Input (stdin)'
                    : tab === 'preview'
                      ? 'Preview'
                      : 'AI'}
              </button>
            ))}

            {isAiPredicted && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                AI-predicted, not a real run
              </span>
            )}

            {exitCode !== null && !isAiPredicted && (
              <span
                className={cn(
                  'ml-2 text-xs font-mono tabular-nums',
                  exitCode === 0 ? 'text-emerald-500' : 'text-red-500'
                )}
              >
                exit {exitCode}
                {durationMs !== null ? ` · ${durationMs}ms` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleCopyOutput}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStdout('');
                setStderr('');
                setExitCode(null);
                setIsAiPredicted(false);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMaximized((m) => !m)}
              aria-label={maximized ? 'Restore terminal size' : 'Maximize terminal'}
            >
              {maximized ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {aiError && (
            <div className="mb-3">
              <AiErrorBanner
                message={aiError}
                cooldownSeconds={cooldown}
                onRetry={() => {
                  if (lastAiActionRef.current === 'predict') {
                    void handleAiPredict();
                  } else if (lastAiActionRef.current === 'explain') {
                    void handleExplainOutput();
                  }
                }}
                onDismiss={() => setAiError(null)}
              />
            </div>
          )}

          {activeTab === 'terminal' && (
            <div className="font-mono text-xs space-y-2">
              {statusNote && (
                <p className="text-[#06b6d4]">{statusNote}</p>
              )}
              {!liveSupported && !stdout && !stderr && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300 space-y-2">
                  <p className="font-sans text-sm font-medium">
                    {langMeta.name} is not supported for live execution
                  </p>
                  <p className="font-sans text-xs opacity-90">
                    Browser workers execute JavaScript and Python (Pyodide) directly,
                    and HTML renders in a sandboxed iframe. Click &ldquo;Predict Output (AI)&rdquo;
                    for a simulated trace clearly marked as AI-predicted.
                  </p>
                </div>
              )}
              {stdout && (
                <pre className="whitespace-pre-wrap text-slate-900 dark:text-slate-100 leading-relaxed">
                  {stdout}
                </pre>
              )}
              {stderr && (
                <pre className="whitespace-pre-wrap text-red-600 dark:text-red-400 leading-relaxed">
                  {stderr}
                </pre>
              )}
              {liveSupported && !statusNote && !stdout && !stderr && (
                <p className="text-slate-400">
                  Press Run Code to execute {langMeta.name} inside a 5-second sandboxed Worker.
                </p>
              )}
            </div>
          )}

          {activeTab === 'stdin' && (
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Provide standard input (stdin) lines for Python input() or JS prompt()..."
              className="w-full h-full min-h-[100px] resize-none rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#4f6bff]"
            />
          )}

          {activeTab === 'preview' && (
            <iframe
              title="Sandboxed HTML Runner Preview"
              sandbox="allow-scripts allow-forms allow-modals"
              srcDoc={htmlPreviewDoc || (language === 'html' ? code : '<p style="font-family:sans-serif;padding:16px">Switch language to HTML and click Render Preview.</p>')}
              className="w-full h-full min-h-[160px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
            />
          )}

          {activeTab === 'ai' && (
            <div>
              {aiNote ? (
                <MarkdownView content={aiNote} />
              ) : running ? (
                <p className="text-xs text-[#4f6bff] dark:text-[#06b6d4]">
                  Arix is analyzing code and output...
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Click &ldquo;Analyze with AI&rdquo; to inspect code or output errors.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
