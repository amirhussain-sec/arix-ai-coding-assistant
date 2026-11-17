import {useQuery, useQueryClient} from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'sonner';
import {ArixMascot} from '../components/ArixMascot';
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
import {Input} from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {Skeleton} from '../components/ui/skeleton';
import {useSaveStatus} from '../contexts/SaveStatusContext';
import {useDebouncedValue} from '../hooks/useDebouncedValue';
import {streamAi} from '../lib/aiStream';
import {apiFetch} from '../lib/api';
import {getLanguageById} from '../lib/languages';
import type {ProjectSummary} from '../lib/types';
import {cn, formatRelativeTime} from '../lib/utils';

interface EnrichedProject extends ProjectSummary {
  previewContent: string;
  previewPath: string;
  filePaths: string[];
}

interface ProjectsResponse {
  projects: EnrichedProject[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  totals: {
    projects: number;
    files: number;
    lines: number;
  };
}

const LazyProjectThumbnail = memo(function LazyProjectThumbnail({
  name,
  isHtml,
  previewContent,
}: {
  name: string;
  isHtml: boolean;
  previewContent: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {rootMargin: '120px'}
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="h-40 bg-slate-950 border-b border-slate-200 dark:border-slate-800 relative overflow-hidden"
    >
      {!visible ? (
        <Skeleton className="h-full w-full rounded-none" />
      ) : isHtml && previewContent ? (
        <iframe
          title={`${name} thumbnail`}
          loading="lazy"
          sandbox="allow-scripts"
          srcDoc={previewContent}
          className="w-[200%] h-[200%] origin-top-left scale-50 pointer-events-none border-0 bg-white"
        />
      ) : (
        <pre className="p-3.5 text-[11px] font-mono text-slate-300 leading-relaxed overflow-hidden h-full">
          {previewContent || '// Empty file'}
        </pre>
      )}
    </div>
  );
});

const ProjectCard = memo(function ProjectCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onExport,
  onReadme,
  onDelete,
}: {
  project: EnrichedProject;
  onOpen: (p: EnrichedProject) => void;
  onRename: (p: EnrichedProject) => void;
  onDuplicate: (p: EnrichedProject) => void;
  onExport: (p: EnrichedProject) => void;
  onReadme: (p: EnrichedProject) => void;
  onDelete: (p: EnrichedProject) => void;
}) {
  const lang = getLanguageById(project.primaryLanguage);
  const isHtml =
    project.primaryLanguage === 'html' ||
    project.previewPath.endsWith('.html') ||
    project.isAgentProject;

  return (
    <article className="arix-glass rounded-2xl overflow-hidden flex flex-col">
      <LazyProjectThumbnail
        name={project.name}
        isHtml={isHtml}
        previewContent={project.previewContent}
      />

      <div className="p-4 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white truncate">
              {project.name}
            </h2>
            <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
              {formatRelativeTime(project.updatedAt)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{lang.name}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {project.fileCount} {project.fileCount === 1 ? 'file' : 'files'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{project.lineCount} lines</span>
          </div>

          {project.filePaths.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {project.filePaths.slice(0, 3).map((fp) => (
                <span
                  key={fp}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400"
                >
                  <FileTypeBadge filename={fp} />
                  <span className="truncate max-w-[90px]">{fp}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
          <Button
            variant="gradient"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpen(project)}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Open
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Rename"
            onClick={() => onRename(project)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Duplicate"
            onClick={() => onDuplicate(project)}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Export JSON"
            onClick={() => onExport(project)}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Generate README with AI"
            onClick={() => onReadme(project)}
          >
            <FileText className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-600"
            title="Delete project"
            onClick={() => onDelete(project)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
});

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {markSaving, markSaved, markError} = useSaveStatus();

  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 800);
  const [category, setCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'files'>('recent');
  const [page, setPage] = useState(1);

  const [renameTarget, setRenameTarget] = useState<EnrichedProject | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EnrichedProject | null>(null);

  const [readmeTarget, setReadmeTarget] = useState<EnrichedProject | null>(null);
  const [readmeText, setReadmeText] = useState('');
  const [readmeLoading, setReadmeLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, sortBy]);

  const {data, isLoading, refetch} = useQuery({
    queryKey: ['projects', page, debouncedSearch, category, sortBy],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        category,
        sort: sortBy,
      });
      if (debouncedSearch.trim()) {
        params.set('q', debouncedSearch.trim());
      }
      return apiFetch<ProjectsResponse>(`/api/projects?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const projects = data?.projects ?? [];
  const pagination = data?.pagination;
  const totalProjects = data?.totals?.projects ?? projects.length;
  const totalFiles = data?.totals?.files ?? 0;
  const totalLines = data?.totals?.lines ?? 0;

  const handleOpenProject = useCallback(
    (p: EnrichedProject) => {
      navigate(p.isAgentProject ? `/agent?project=${p.id}` : `/editor?project=${p.id}`);
    },
    [navigate]
  );

  const handleStartRename = useCallback((p: EnrichedProject) => {
    setRenameTarget(p);
    setRenameText(p.name);
  }, []);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameText.trim()) return;
    markSaving();
    try {
      await apiFetch(`/api/projects/${renameTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({name: renameText.trim()}),
      });
      markSaved();
      setRenameTarget(null);
      await refetch();
      await queryClient.invalidateQueries({queryKey: ['projects']});
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
    } catch {
      markError();
      toast.error('Rename failed.');
    }
  };

  const handleDuplicate = useCallback(
    async (p: EnrichedProject) => {
      markSaving();
      try {
        await apiFetch(`/api/projects/${p.id}/duplicate`, {method: 'POST'});
        markSaved();
        toast.success(`Duplicated "${p.name}"`);
        await refetch();
        await queryClient.invalidateQueries({queryKey: ['projects']});
        await queryClient.invalidateQueries({queryKey: ['dashboard']});
      } catch {
        markError();
        toast.error('Duplicate failed.');
      }
    },
    [markError, markSaved, markSaving, queryClient, refetch]
  );

  const handleExportJson = useCallback(async (p: EnrichedProject) => {
    const detail = await apiFetch<Record<string, unknown>>(
      `/api/projects/${p.id}`
    );
    const blob = new Blob([JSON.stringify(detail, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    markSaving();
    try {
      await apiFetch(`/api/projects/${deleteTarget.id}`, {method: 'DELETE'});
      markSaved();
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await refetch();
      await queryClient.invalidateQueries({queryKey: ['projects']});
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
    } catch {
      markError();
      toast.error('Delete failed.');
    }
  };

  const handleGenerateReadme = useCallback(async (p: EnrichedProject) => {
    setReadmeTarget(p);
    setReadmeText('');
    setReadmeLoading(true);
    try {
      const detail = await apiFetch<{
        project: EnrichedProject;
        files: Array<{path: string; content: string; language: string}>;
      }>(`/api/projects/${p.id}`);

      const ctx = detail.files
        .slice(0, 8)
        .map((f) => `File: ${f.path}\n${f.content.slice(0, 2000)}`)
        .join('\n\n');

      await streamAi({
        mode: 'readme',
        language: p.primaryLanguage,
        context: `Project: ${p.name}\nDescription: ${p.description}\n\n${ctx}`,
        messages: [
          {
            role: 'user',
            content: `Generate a comprehensive README.md for "${p.name}".`,
          },
        ],
        onChunk: (_c, acc) => setReadmeText(acc),
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'README generation failed.'
      );
    } finally {
      setReadmeLoading(false);
    }
  }, []);

  const handleSaveReadmeToProject = async () => {
    if (!readmeTarget || !readmeText.trim()) return;
    markSaving();
    try {
      await apiFetch(`/api/projects/${readmeTarget.id}/files`, {
        method: 'POST',
        body: JSON.stringify({
          path: 'README.md',
          content: readmeText,
          language: 'markdown',
        }),
      });
      markSaved();
      toast.success('Saved README.md to project');
      setReadmeTarget(null);
      await refetch();
    } catch (err) {
      markError();
      toast.error(
        err instanceof Error ? err.message : 'Could not save README.md'
      );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            My Projects
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {totalProjects} projects · {totalFiles} files · {totalLines} lines
          </p>
        </div>
        <Button variant="gradient" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </div>

      {/* Filters Row */}
      <div className="arix-glass rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="pl-9 h-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(['All', 'Web', 'Python', 'JavaScript', 'Other'] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                    category === cat
                      ? 'bg-white dark:bg-[#17203d] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  )}
                >
                  {cat}
                </button>
              )
            )}
          </div>

          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as 'recent' | 'name' | 'files')}
          >
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Sort: Recent</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="files">Sort: Most files</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : projects.length === 0 ? (
        <div className="arix-glass rounded-2xl p-12 flex flex-col items-center text-center gap-3">
          <ArixMascot size="md" mood="idle" />
          <p className="text-base font-medium">
            {totalProjects === 0
              ? 'No projects created yet'
              : 'No matching projects'}
          </p>
          <p className="text-xs text-slate-500 max-w-xs">
            Create a project or build a web app in Arix Agent to see it here.
          </p>
          <Button variant="gradient" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={handleOpenProject}
                onRename={handleStartRename}
                onDuplicate={handleDuplicate}
                onExport={handleExportJson}
                onReadme={handleGenerateReadme}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total}{' '}
                total)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Rename Modal */}
      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>
              Update the display name for this project.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-4 mt-2">
            <Input
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              autoFocus
              required
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gradient">
                Save name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Project?</DialogTitle>
            <DialogDescription>
              This permanently deletes &ldquo;{deleteTarget?.name}&rdquo; and all
              its files and versions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI README Modal */}
      <Dialog
        open={Boolean(readmeTarget)}
        onOpenChange={(o) => !o && setReadmeTarget(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>README.md for {readmeTarget?.name}</DialogTitle>
            <DialogDescription>
              Review the AI-generated README before saving it to your project.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2">
            {readmeText ? (
              <MarkdownView content={readmeText} />
            ) : readmeLoading ? (
              <p className="text-sm text-slate-500">Generating README...</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReadmeTarget(null)}>
              Close
            </Button>
            <Button
              variant="gradient"
              disabled={!readmeText || readmeLoading}
              onClick={handleSaveReadmeToProject}
            >
              Save README.md to project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
