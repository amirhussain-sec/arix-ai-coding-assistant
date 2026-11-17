import Editor, {type OnMount} from '@monaco-editor/react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {
  ChevronDown,
  Command,
  FilePlus2,
  FolderPlus,
  Minus,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {AnimatePresence, motion} from 'motion/react';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {toast} from 'sonner';
import {AiErrorBanner} from '../components/AiErrorBanner';
import {CreateProjectDialog} from '../components/CreateProjectDialog';
import {FileTypeBadge} from '../components/FileTypeBadge';
import {MarkdownView} from '../components/MarkdownView';
import {Button} from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {Input} from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {Skeleton} from '../components/ui/skeleton';
import {useAuth} from '../contexts/AuthContext';
import {useSaveStatus} from '../contexts/SaveStatusContext';
import {useTheme} from '../contexts/ThemeContext';
import {useDebouncedValue} from '../hooks/useDebouncedValue';
import {AiStreamError, streamAi, type AiMode} from '../lib/aiStream';
import {apiFetch} from '../lib/api';
import {getLanguageById, SUPPORTED_LANGUAGES} from '../lib/languages';
import {isLiveRunnable} from '../lib/runnerEngine';
import type {ProjectSummary} from '../lib/types';
import {cn} from '../lib/utils';

interface ProjectFile {
  id: string;
  path: string;
  content: string;
  language: string;
  updatedAt: string;
}

interface QualityReport {
  scores: {
    readability: number;
    performance: number;
    maintainability: number;
    security: number;
  };
  summary: string;
  findings: Array<{category: string; severity: string; detail: string}>;
}

function inferLanguageFromPath(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const match = SUPPORTED_LANGUAGES.find((l) => l.extension === ext);
  if (match) return match.id;
  if (ext === 'json') return 'json';
  if (ext === 'md') return 'markdown';
  return 'typescript';
}

function getMonacoLanguage(langId: string): string {
  if (langId === 'json') return 'json';
  if (langId === 'markdown') return 'markdown';
  return getLanguageById(langId).monacoId;
}

export function EditorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {theme} = useTheme();
  const {settings, updateSettings} = useAuth();
  const {markSaving, markSaved, markError} = useSaveStatus();

  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [renameFileOpen, setRenameFileOpen] = useState(false);
  const [renameFileTarget, setRenameFileTarget] = useState<ProjectFile | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [commandOpen, setCommandOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');

  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [dirtyContent, setDirtyContent] = useState<Record<string, string>>({});
  const [cursorPos, setCursorPos] = useState({line: 1, col: 1});
  const [symbolPill, setSymbolPill] = useState<string | null>(null);

  // AI Side Drawer state
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiTitle, setAiTitle] = useState('');
  const [aiOutput, setAiOutput] = useState('');
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const pillTimerRef = useRef<number | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const dirtyContentRef = useRef<Record<string, string>>({});
  dirtyContentRef.current = dirtyContent;

  const {data: projectsData} = useQuery({
    queryKey: ['projects', 'summary'],
    queryFn: () =>
      apiFetch<{projects: ProjectSummary[]}>(
        '/api/projects?fields=summary&limit=50'
      ),
  });

  const projects = projectsData?.projects ?? [];
  const selectedProjectId =
    searchParams.get('project') || projects[0]?.id || '';

  const {data: projectDetail, refetch: refetchProject} = useQuery({
    queryKey: ['project', selectedProjectId],
    queryFn: () =>
      apiFetch<{project: ProjectSummary; files: ProjectFile[]}>(
        `/api/projects/${selectedProjectId}`
      ),
    enabled: Boolean(selectedProjectId),
  });

  const files = projectDetail?.files ?? [];

  useEffect(() => {
    if (files.length === 0) {
      setOpenFileIds([]);
      setActiveFileId(null);
      return;
    }
    setOpenFileIds((prev) => {
      const valid = prev.filter((id) => files.some((f) => f.id === id));
      return valid.length > 0 ? valid : [files[0].id];
    });
    setActiveFileId((prev) =>
      prev && files.some((f) => f.id === prev) ? prev : files[0].id
    );
  }, [files]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const activeFile = files.find((f) => f.id === activeFileId) ?? null;
  const activeDirtyText = activeFile ? dirtyContent[activeFile.id] : undefined;
  const activeCode = activeFile
    ? activeDirtyText ?? activeFile.content
    : '';

  const handleSaveFile = useCallback(
    async (fileToSave?: ProjectFile) => {
      const target = fileToSave ?? activeFile;
      if (!target || !selectedProjectId) return;
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const contentToSave = dirtyContentRef.current[target.id] ?? target.content;
      markSaving();
      try {
        await apiFetch(`/api/projects/${selectedProjectId}/files/${target.id}`, {
          method: 'PATCH',
          body: JSON.stringify({content: contentToSave}),
        });
        setDirtyContent((prev) => {
          if (prev[target.id] !== contentToSave) {
            return prev;
          }
          const next = {...prev};
          delete next[target.id];
          return next;
        });
        await refetchProject();
        await queryClient.invalidateQueries({queryKey: ['dashboard']});
        markSaved();
      } catch (err) {
        markError();
        toast.error(err instanceof Error ? err.message : 'Failed to save file.');
      }
    },
    [
      activeFile,
      markError,
      markSaved,
      markSaving,
      queryClient,
      refetchProject,
      selectedProjectId,
    ]
  );

  // 800 ms debounced autosave on active file edits
  useEffect(() => {
    if (!activeFile || activeDirtyText === undefined) return;
    if (activeDirtyText === activeFile.content) return;

    const fileSnapshot = activeFile;
    autosaveTimerRef.current = window.setTimeout(() => {
      void handleSaveFile(fileSnapshot);
    }, 800);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [activeDirtyText, activeFile, handleSaveFile]);

  const handleRunInRunner = useCallback(() => {
    if (!activeFile) return;
    navigate('/runner', {
      state: {
        code: activeCode,
        language: activeFile.language,
        projectId: selectedProjectId,
      },
    });
  }, [activeCode, activeFile, navigate, selectedProjectId]);

  const handleFormat = () => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run();
  };

  const handleFindReplace = () => {
    editorRef.current
      ?.getAction('editor.action.startFindReplaceAction')
      ?.run();
  };

  const handleCommentToggle = () => {
    editorRef.current?.getAction('editor.action.commentLine')?.run();
  };

  // Global Command Palette & shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setCommandOpen((o) => !o);
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSaveFile();
      } else if (mod && e.key === 'Enter') {
        e.preventDefault();
        handleRunInRunner();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRunInRunner, handleSaveFile]);

  const triggerSymbolDetection = (lineText: string, lineNumber: number) => {
    const fnMatch =
      /(?:function\s+([A-Za-z_$][\w$]*)|def\s+([A-Za-z_][\w]*)|func\s+([A-Za-z_][\w]*)|fn\s+([A-Za-z_][\w]*)|class\s+([A-Za-z_$][\w$]*))/.exec(
        lineText
      );
    if (!fnMatch) return;
    const isClass = lineText.includes('class ');
    const symName = fnMatch[1] || fnMatch[2] || fnMatch[3] || fnMatch[4] || fnMatch[5];
    if (!symName) return;

    setSymbolPill(isClass ? `C ${symName}` : `ƒ ${symName}()`);
    if (pillTimerRef.current) window.clearTimeout(pillTimerRef.current);
    pillTimerRef.current = window.setTimeout(() => setSymbolPill(null), 2200);

    if (editorRef.current && monacoRef.current) {
      const monaco = monacoRef.current;
      decorationIdsRef.current = editorRef.current.deltaDecorations(
        decorationIdsRef.current,
        [
          {
            range: new monaco.Range(lineNumber, 1, lineNumber, 1),
            options: {
              isWholeLine: true,
              className: 'bg-[#4f6bff]/15',
            },
          },
        ]
      );
      window.setTimeout(() => {
        if (editorRef.current) {
          decorationIdsRef.current = editorRef.current.deltaDecorations(
            decorationIdsRef.current,
            []
          );
        }
      }, 900);
    }
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.onDidChangeCursorPosition((ev) => {
      setCursorPos({line: ev.position.lineNumber, col: ev.position.column});
    });
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !newFileName.trim()) return;
    const path = newFileName.trim();
    const lang = inferLanguageFromPath(path);
    markSaving();
    try {
      const res = await apiFetch<{file: ProjectFile}>(
        `/api/projects/${selectedProjectId}/files`,
        {
          method: 'POST',
          body: JSON.stringify({
            path,
            content: '',
            language: lang,
          }),
        }
      );
      markSaved();
      setNewFileName('');
      setNewFileOpen(false);
      await refetchProject();
      setOpenFileIds((prev) => [...prev, res.file.id]);
      setActiveFileId(res.file.id);
    } catch (err) {
      markError();
      toast.error(err instanceof Error ? err.message : 'Could not create file.');
    }
  };

  const handleRenameFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameFileTarget || !selectedProjectId || !renameValue.trim()) return;
    markSaving();
    try {
      await apiFetch(
        `/api/projects/${selectedProjectId}/files/${renameFileTarget.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            path: renameValue.trim(),
            language: inferLanguageFromPath(renameValue.trim()),
          }),
        }
      );
      markSaved();
      setRenameFileOpen(false);
      await refetchProject();
    } catch (err) {
      markError();
      toast.error(err instanceof Error ? err.message : 'Rename failed.');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!selectedProjectId) return;
    markSaving();
    try {
      await apiFetch(`/api/projects/${selectedProjectId}/files/${fileId}`, {
        method: 'DELETE',
      });
      markSaved();
      setOpenFileIds((prev) => prev.filter((id) => id !== fileId));
      await refetchProject();
    } catch (err) {
      markError();
      toast.error(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const lastAiActionRef = useRef<{mode: AiMode; label: string} | null>(null);

  const runAiAction = async (mode: AiMode, label: string) => {
    if (!activeFile || aiLoading || cooldown > 0) return;
    lastAiActionRef.current = {mode, label};
    setAiDrawerOpen(true);
    setAiTitle(label);
    setAiOutput('');
    setQualityReport(null);
    setAiError(null);
    setAiLoading(true);

    const projectContext = files
      .slice(0, 6)
      .map((f) => `${f.path} (${f.language})`)
      .join(', ');

    try {
      const full = await streamAi({
        mode,
        language: activeFile.language,
        context: `Project: ${projectDetail?.project.name ?? ''}\nFiles: ${projectContext}`,
        messages: [
          {
            role: 'user',
            content: `File: ${activeFile.path}\n\n${activeCode}`,
          },
        ],
        onChunk: (_c, acc) => setAiOutput(acc),
      });

      if (mode === 'quality') {
        const cleaned = full
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```$/i, '')
          .trim();
        try {
          setQualityReport(JSON.parse(cleaned) as QualityReport);
        } catch {
          // keep markdown fallback
        }
      }
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
    } catch (err) {
      if (err instanceof AiStreamError) {
        setAiError(err.message);
        if (err.status === 429 && err.retryAfter) setCooldown(err.retryAfter);
      } else {
        setAiError('AI action failed.');
      }
    } finally {
      setAiLoading(false);
    }
  };

  const debouncedCommandSearch = useDebouncedValue(commandSearch, 800);

  const commands = useMemo(
    () => [
      {label: 'Save Active File (Ctrl+S)', action: () => void handleSaveFile()},
      {label: 'Run in Code Runner (Ctrl+Enter)', action: handleRunInRunner},
      {label: 'Format Document', action: handleFormat},
      {label: 'Find and Replace', action: handleFindReplace},
      {label: 'Toggle Line Comment (Ctrl+/)', action: handleCommentToggle},
      {label: 'New File', action: () => setNewFileOpen(true)},
      {
        label: 'AI: Optimize Code',
        action: () => void runAiAction('optimize', 'Code Optimizer'),
      },
      {
        label: 'AI: Code Quality Analyzer',
        action: () => void runAiAction('quality', 'Code Quality Analyzer'),
      },
      {
        label: 'AI: Generate Test Cases',
        action: () => void runAiAction('tests', 'Test Case Generator'),
      },
      {
        label: 'AI: Generate README',
        action: () => void runAiAction('readme', 'README Generator'),
      },
      {
        label: 'AI: Development Roadmap',
        action: () => void runAiAction('roadmap', 'Development Roadmap'),
      },
      {
        label: 'AI: Smart Error Detective',
        action: () => void runAiAction('error_detective', 'Smart Error Detective'),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleRunInRunner, handleSaveFile]
  );

  const filteredCommands = useMemo(
    () =>
      commands.filter((c) =>
        c.label.toLowerCase().includes(debouncedCommandSearch.toLowerCase())
      ),
    [commands, debouncedCommandSearch]
  );

  const fontSize = settings?.editorFontSize ?? 14;
  const activeLangMeta = getLanguageById(activeFile?.language || 'typescript');

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Top IDE Toolbar */}
      <div className="px-3 sm:px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-[#090d1b]/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selectedProjectId}
            onValueChange={(id) => setSearchParams({project: id})}
          >
            <SelectTrigger className="h-8 w-44 sm:w-52 text-xs">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setCreateProjectOpen(true)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New project
          </Button>

          {selectedProjectId && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setNewFileOpen(true)}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              New file
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={handleFindReplace}
            disabled={!activeFile}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Find</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={handleFormat}
            disabled={!activeFile}
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Format</span>
          </Button>

          <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg h-8 px-1">
            <button
              type="button"
              onClick={() =>
                void updateSettings({editorFontSize: Math.max(11, fontSize - 1)})
              }
              className="p-1 hover:text-[#4f6bff] cursor-pointer"
              aria-label="Decrease font size"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-[11px] font-mono px-1.5 tabular-nums">
              {fontSize}px
            </span>
            <button
              type="button"
              onClick={() =>
                void updateSettings({editorFontSize: Math.min(24, fontSize + 1)})
              }
              className="p-1 hover:text-[#4f6bff] cursor-pointer"
              aria-label="Increase font size"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setCommandOpen(true)}
          >
            <Command className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Palette</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#4f6bff]" />
                <span>AI Tools</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => void runAiAction('optimize', 'Code Optimizer')}
              >
                Optimize Code
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void runAiAction('quality', 'Code Quality Analyzer')
                }
              >
                Quality Analyzer
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void runAiAction('tests', 'Test Case Generator')
                }
              >
                Generate Tests
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void runAiAction('readme', 'README Generator')}
              >
                Generate README
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void runAiAction('roadmap', 'Development Roadmap')
                }
              >
                Project Roadmap
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void runAiAction('error_detective', 'Smart Error Detective')
                }
              >
                Error Detective
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="secondary"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void handleSaveFile()}
            disabled={!activeFile}
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>

          <Button
            variant="gradient"
            size="sm"
            className="h-8 text-xs"
            onClick={handleRunInRunner}
            disabled={!activeFile}
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </Button>
        </div>
      </div>

      {/* Main Split: Explorer + Editor + Optional AI Drawer */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* File Explorer */}
        <aside className="hidden sm:flex w-56 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#090d1b]/60">
          <div className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
            <span>Files</span>
            {selectedProjectId && (
              <button
                type="button"
                onClick={() => setNewFileOpen(true)}
                aria-label="New file"
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {files.map((file) => {
              const isDirty = dirtyContent[file.id] !== undefined;
              const isActive = activeFileId === file.id;
              return (
                <div
                  key={file.id}
                  onClick={() => {
                    if (!openFileIds.includes(file.id)) {
                      setOpenFileIds((prev) => [...prev, file.id]);
                    }
                    setActiveFileId(file.id);
                  }}
                  className={cn(
                    'group flex items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 text-xs cursor-pointer transition-colors',
                    isActive
                      ? 'bg-[#4f6bff]/15 text-[#4f6bff] dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileTypeBadge filename={file.path} />
                    <span className="truncate font-mono">{file.path}</span>
                    {isDirty && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    )}
                  </div>
                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameFileTarget(file);
                        setRenameValue(file.path);
                        setRenameFileOpen(true);
                      }}
                      aria-label={`Rename ${file.path}`}
                      className="p-1 rounded hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {files.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteFile(file.id);
                        }}
                        aria-label={`Delete ${file.path}`}
                        className="p-1 rounded hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Editor Column */}
        <div className="flex-1 min-w-0 flex flex-col relative">
          {/* File Tabs */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#080c18] overflow-x-auto">
            {openFileIds.map((id) => {
              const f = files.find((item) => item.id === id);
              if (!f) return null;
              const isDirty = dirtyContent[f.id] !== undefined;
              const isActive = activeFileId === f.id;
              return (
                <div
                  key={f.id}
                  onClick={() => setActiveFileId(f.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-mono cursor-pointer border whitespace-nowrap',
                    isActive
                      ? 'bg-white dark:bg-[#0d1224] text-slate-900 dark:text-white border-slate-200 dark:border-slate-700'
                      : 'text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-200/50 dark:hover:bg-slate-800/40'
                  )}
                >
                  <FileTypeBadge filename={f.path} />
                  <span>{f.path}</span>
                  {isDirty && <span className="text-amber-500">●</span>}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = openFileIds.filter((fid) => fid !== f.id);
                      setOpenFileIds(next);
                      if (activeFileId === f.id) {
                        setActiveFileId(next[0] ?? null);
                      }
                    }}
                    aria-label={`Close ${f.path}`}
                    className="ml-1 rounded hover:text-red-500 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Animated Function/Class Pill */}
          <AnimatePresence>
            {symbolPill && (
              <motion.div
                initial={{opacity: 0, y: -6, scale: 0.96}}
                animate={{opacity: 1, y: 0, scale: 1}}
                exit={{opacity: 0, y: -6, scale: 0.96}}
                transition={{duration: 0.16}}
                className="absolute right-6 top-12 z-20 rounded-lg border border-[#06b6d4]/40 bg-slate-900/90 px-2.5 py-1 text-xs font-mono text-[#06b6d4] shadow-lg pointer-events-none"
              >
                {symbolPill}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Monaco Surface */}
          <div className="flex-1 min-h-0">
            {activeFile ? (
              <Editor
                height="100%"
                path={activeFile.path}
                language={getMonacoLanguage(activeFile.language)}
                value={activeCode}
                loading={<Skeleton className="h-full w-full rounded-none" />}
                onMount={handleEditorMount}
                onChange={(val) => {
                  const next = val ?? '';
                  setDirtyContent((prev) => ({...prev, [activeFile.id]: next}));
                  const pos = editorRef.current?.getPosition();
                  if (pos) {
                    const lineContent =
                      editorRef.current?.getModel()?.getLineContent(pos.lineNumber) ??
                      '';
                    triggerSymbolDetection(lineContent, pos.lineNumber);
                  }
                }}
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                options={{
                  fontSize,
                  fontFamily: 'JetBrains Mono, monospace',
                  automaticLayout: true,
                  minimap: {enabled: false},
                  folding: true,
                  autoIndent: 'full',
                  tabSize: 2,
                  padding: {top: 12},
                }}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {projects.length === 0
                    ? 'Create your first project to start editing'
                    : 'Select a file from the explorer to begin editing'}
                </p>
                {projects.length === 0 && (
                  <Button
                    variant="gradient"
                    onClick={() => setCreateProjectOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    New project
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* VS Code Style Status Bar */}
          <div className="h-7 px-4 border-t border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-[#080c18] flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-4 tabular-nums">
              <span>
                Ln {cursorPos.line}, Col {cursorPos.col}
              </span>
              <span>{activeLangMeta.name}</span>
            </div>
            <div>
              <span>
                {activeFile
                  ? isLiveRunnable(activeFile.language)
                    ? `Runtime: ${activeLangMeta.runtimeNote}`
                    : 'Runtime: Static editing (AI-predicted run in Runner)'
                  : 'Ready'}
              </span>
            </div>
          </div>
        </div>

        {/* AI Assistant Drawer */}
        {aiDrawerOpen && (
          <aside className="w-88 sm:w-96 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#0b1020]/90 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="font-display text-sm font-semibold">
                {aiTitle}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setAiDrawerOpen(false)}
                aria-label="Close AI panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {aiError && (
                <AiErrorBanner
                  message={aiError}
                  cooldownSeconds={cooldown}
                  onRetry={
                    lastAiActionRef.current
                      ? () => {
                          const last = lastAiActionRef.current;
                          if (last) void runAiAction(last.mode, last.label);
                        }
                      : undefined
                  }
                  onDismiss={() => setAiError(null)}
                />
              )}

              {qualityReport ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    {(
                      Object.entries(qualityReport.scores) as Array<
                        [string, number]
                      >
                    ).map(([metric, score]) => (
                      <div
                        key={metric}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1.5"
                      >
                        <div className="flex justify-between text-xs capitalize">
                          <span>{metric}</span>
                          <span className="font-mono font-semibold tabular-nums">
                            {score}/100
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#4f6bff] to-[#06b6d4]"
                            style={{width: `${Math.min(100, Math.max(0, score))}%`}}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {qualityReport.summary}
                  </p>
                  <div className="space-y-2">
                    {qualityReport.findings.map((f, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-xs space-y-1"
                      >
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {f.category} · {f.severity}
                        </div>
                        <p className="text-slate-600 dark:text-slate-400">
                          {f.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : aiOutput ? (
                <MarkdownView content={aiOutput} />
              ) : aiLoading ? (
                <p className="text-xs text-slate-500">Analyzing active file...</p>
              ) : null}
            </div>
          </aside>
        )}
      </div>

      {/* New File Dialog with Live Colored File-Type Icon Preview */}
      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
            <DialogDescription>
              Type a filename with extension (e.g. app.py, utils.ts, index.html).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateFile} className="space-y-4 mt-2">
            <div className="flex items-center gap-2.5">
              <FileTypeBadge filename={newFileName || 'file.ts'} />
              <Input
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="e.g. server.py"
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewFileOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gradient">
                Create file
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename File Dialog */}
      <Dialog open={renameFileOpen} onOpenChange={setRenameFileOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
            <DialogDescription>
              Enter a new filename or path for this project file.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameFile} className="space-y-4 mt-2">
            <div className="flex items-center gap-2.5">
              <FileTypeBadge filename={renameValue || 'file.ts'} />
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameFileOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gradient">
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Command Palette */}
      <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Command Palette</DialogTitle>
            <DialogDescription>
              Search and execute editor or AI commands.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 border-b border-slate-200 dark:border-slate-800">
            <Input
              value={commandSearch}
              onChange={(e) => setCommandSearch(e.target.value)}
              placeholder="Type a command..."
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {filteredCommands.map((cmd) => (
              <button
                key={cmd.label}
                type="button"
                onClick={() => {
                  setCommandOpen(false);
                  setCommandSearch('');
                  cmd.action();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
              >
                {cmd.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={(proj) => setSearchParams({project: proj.id})}
      />
    </div>
  );
}
