import {useQueryClient} from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Check,
  Code2,
  Copy,
  FolderPlus,
} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
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
import {useSaveStatus} from '../contexts/SaveStatusContext';
import {AiStreamError, streamAi} from '../lib/aiStream';
import {apiFetch} from '../lib/api';
import {getLanguageById, SUPPORTED_LANGUAGES} from '../lib/languages';
import type {ProjectSummary} from '../lib/types';

function extractFirstCodeBlock(md: string): string {
  const match = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/.exec(md);
  return match ? match[1].trim() : md;
}

export function ConverterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {markSaving, markSaved, markError} = useSaveStatus();

  const [sourceLang, setSourceLang] = useState('python');
  const [targetLang, setTargetLang] = useState('typescript');
  const [code, setCode] = useState('');
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

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  };

  const handleConvert = async () => {
    if (!code.trim() || isStreaming || cooldown > 0) return;
    setErrorMsg(null);
    setOutput('');
    setIsStreaming(true);

    const srcMeta = getLanguageById(sourceLang);
    const tgtMeta = getLanguageById(targetLang);

    try {
      await streamAi({
        mode: 'convert',
        language: targetLang,
        messages: [
          {
            role: 'user',
            content: `Convert from ${srcMeta.name} to ${tgtMeta.name}:\n\n${code}`,
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
        setErrorMsg('Conversion failed.');
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleCopyCode = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(extractFirstCodeBlock(output));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const saveConverted = async (openInEditor: boolean) => {
    if (!output) return;
    const tgtMeta = getLanguageById(targetLang);
    markSaving();
    try {
      const res = await apiFetch<{project: ProjectSummary}>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: `Converted ${tgtMeta.name}`,
          description: `Converted from ${getLanguageById(sourceLang).name}`,
          primaryLanguage: tgtMeta.id,
          category: tgtMeta.category,
          starterFile: tgtMeta.starterFile,
          starterContent: extractFirstCodeBlock(output),
        }),
      });
      markSaved();
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
      await queryClient.invalidateQueries({queryKey: ['projects']});
      toast.success(`Saved "${res.project.name}"`);
      if (openInEditor) {
        navigate(`/editor?project=${res.project.id}`);
      }
    } catch (err) {
      markError();
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="arix-glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={sourceLang} onValueChange={setSourceLang}>
            <SelectTrigger className="w-44">
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

          <Button
            variant="ghost"
            size="icon"
            onClick={swapLanguages}
            aria-label="Swap source and target languages"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>

          <Select value={targetLang} onValueChange={setTargetLang}>
            <SelectTrigger className="w-44">
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

        <Button
          variant="gradient"
          onClick={handleConvert}
          disabled={!code.trim() || isStreaming || cooldown > 0}
        >
          {isStreaming
            ? 'Converting...'
            : cooldown > 0
              ? `Wait ${cooldown}s`
              : 'Convert Code'}
        </Button>
      </div>

      {errorMsg && (
        <AiErrorBanner
          message={errorMsg}
          cooldownSeconds={cooldown}
          onRetry={handleConvert}
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="arix-glass rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Source ({getLanguageById(sourceLang).name})
            </span>
          </div>
          <textarea
            rows={18}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste source code to convert..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-3.5 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#4f6bff]"
          />
        </div>

        <div className="arix-glass rounded-2xl p-4 space-y-3 min-h-[420px]">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Target ({getLanguageById(targetLang).name}) & Differences
            </span>
            {output && (
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={handleCopyCode}>
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
                  onClick={() => void saveConverted(true)}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  Editor
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void saveConverted(false)}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Save
                </Button>
              </div>
            )}
          </div>

          {output ? (
            <MarkdownView content={output} />
          ) : isStreaming ? (
            <p className="text-sm text-[#4f6bff] dark:text-[#06b6d4] py-16 text-center">
              Converting to {getLanguageById(targetLang).name}...
            </p>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-16 text-center">
              Converted code and behavioral differences across languages will
              stream here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
