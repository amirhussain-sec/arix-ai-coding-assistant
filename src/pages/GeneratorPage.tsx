import {useQueryClient} from '@tanstack/react-query';
import {
  BookOpen,
  Check,
  Code2,
  Copy,
  Download,
  FolderPlus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import React, {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'sonner';
import {AiErrorBanner} from '../components/AiErrorBanner';
import {FileTypeBadge} from '../components/FileTypeBadge';
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
import {cn} from '../lib/utils';

interface GeneratedFile {
  path: string;
  content: string;
}

const FRAMEWORKS = [
  'Vanilla / Standard Library',
  'React + Tailwind CSS',
  'Express + TypeScript',
  'Next.js App Router',
  'FastAPI',
  'Flask',
  'Spring Boot',
  'Gin (Go)',
  'Actix Web (Rust)',
];

const PROJECT_TYPES = [
  'Web Application',
  'REST API Service',
  'CLI Utility',
  'Algorithm / Data Structure',
  'UI Component Module',
  'Automation Script',
];

function parseGeneratedFiles(raw: string, fallbackFile: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const regex = /===FILE:\s*([^\n=]+)===\n([\s\S]*?)(?====END_FILE===|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const path = match[1].trim();
    const content = match[2].replace(/===END_FILE===[\s\S]*$/, '').trimEnd();
    if (path) {
      files.push({path, content});
    }
  }
  if (files.length === 0 && raw.trim()) {
    return [{path: fallbackFile, content: raw}];
  }
  return files;
}

export function GeneratorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {markSaving, markSaved, markError} = useSaveStatus();

  const [prompt, setPrompt] = useState('');
  const [language, setLanguage] = useState('typescript');
  const [framework, setFramework] = useState(FRAMEWORKS[0]);
  const [projectType, setProjectType] = useState(PROJECT_TYPES[0]);
  const [rawOutput, setRawOutput] = useState('');
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [copied, setCopied] = useState(false);

  const langMeta = getLanguageById(language);
  const files = useMemo(
    () => parseGeneratedFiles(rawOutput, langMeta.starterFile),
    [rawOutput, langMeta.starterFile]
  );
  const activeFile = files[activeFileIdx] ?? files[0];

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isStreaming || cooldown > 0) return;
    setErrorMsg(null);
    setRawOutput('');
    setActiveFileIdx(0);
    setIsStreaming(true);

    try {
      const fullPrompt = `Project Type: ${projectType}\nLanguage: ${langMeta.name}\nFramework: ${framework}\n\nSpecification:\n${prompt.trim()}`;
      await streamAi({
        mode: 'generate',
        language,
        messages: [{role: 'user', content: fullPrompt}],
        onChunk: (_c, acc) => setRawOutput(acc),
      });
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
    } catch (err) {
      if (err instanceof AiStreamError) {
        setErrorMsg(err.message);
        if (err.status === 429 && err.retryAfter) setCooldown(err.retryAfter);
      } else {
        setErrorMsg('Failed to generate code. Please retry.');
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleCopy = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.path.split('/').pop() || 'generated.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveAsProject = async (openInEditor: boolean) => {
    if (files.length === 0) return;
    markSaving();
    try {
      const name = prompt.trim().slice(0, 48) || `${langMeta.name} Generator`;
      const res = await apiFetch<{project: ProjectSummary}>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: `${projectType} (${framework})`,
          primaryLanguage: language,
          category: langMeta.category,
          files: files.map((f) => ({
            path: f.path,
            content: f.content,
            language,
          })),
        }),
      });
      markSaved();
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
      await queryClient.invalidateQueries({queryKey: ['projects']});
      toast.success(`Saved "${res.project.name}" to Projects`);
      if (openInEditor) {
        navigate(`/editor?project=${res.project.id}`);
      }
    } catch (err) {
      markError();
      toast.error(err instanceof Error ? err.message : 'Failed to save project.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="arix-glass rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    {l.name} (.{l.extension})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Framework / Stack
            </label>
            <Select value={framework} onValueChange={setFramework}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FRAMEWORKS.map((fw) => (
                  <SelectItem key={fw} value={fw}>
                    {fw}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Project Type
            </label>
            <Select value={projectType} onValueChange={setProjectType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((pt) => (
                  <SelectItem key={pt} value={pt}>
                    {pt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="gen-prompt"
            className="text-xs font-medium text-slate-600 dark:text-slate-400"
          >
            Describe what you want to generate
          </label>
          <textarea
            id="gen-prompt"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Build a rate-limited Express API router with Zod validation and in-memory token bucket tests..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0b1020]/90 p-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4f6bff]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="gradient"
            onClick={handleGenerate}
            disabled={!prompt.trim() || isStreaming || cooldown > 0}
          >
            <Sparkles className="h-4 w-4" />
            {isStreaming
              ? 'Generating...'
              : cooldown > 0
                ? `Wait ${cooldown}s`
                : 'Generate Code'}
          </Button>

          {files.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isStreaming}>
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate('/explainer', {
                    state: {code: activeFile?.content || '', language},
                  })
                }
              >
                <BookOpen className="h-3.5 w-3.5" />
                Explain code
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saveAsProject(true)}
              >
                <Code2 className="h-3.5 w-3.5" />
                Open in editor
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void saveAsProject(false)}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Save to project
              </Button>
            </div>
          )}
        </div>

        {errorMsg && (
          <AiErrorBanner
            message={errorMsg}
            cooldownSeconds={cooldown}
            onRetry={handleGenerate}
            onDismiss={() => setErrorMsg(null)}
          />
        )}
      </div>

      {/* Multi-file Output Viewer */}
      {isStreaming && files.length === 0 && (
        <div className="arix-glass rounded-2xl p-6 text-sm text-slate-600 dark:text-slate-300">
          Arix is thinking and streaming your code...
        </div>
      )}

      {files.length > 0 && (
        <div className="arix-glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#090d1b]/80 overflow-x-auto">
            <div className="flex items-center gap-1.5">
              {files.map((file, idx) => (
                <button
                  key={`${file.path}-${idx}`}
                  type="button"
                  onClick={() => setActiveFileIdx(idx)}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors whitespace-nowrap cursor-pointer',
                    activeFileIdx === idx
                      ? 'bg-[#4f6bff]/15 text-[#4f6bff] dark:text-white border border-[#4f6bff]/30'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  )}
                >
                  <FileTypeBadge filename={file.path} />
                  <span>{file.path}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5" />
                Download file
              </Button>
            </div>
          </div>

          <pre className="p-5 overflow-x-auto text-[13px] leading-relaxed font-mono bg-slate-950 text-slate-100 max-h-[540px]">
            <code>{activeFile?.content}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
