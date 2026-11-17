import {useQuery, useQueryClient} from '@tanstack/react-query';
import {ChevronLeft, ChevronRight, Search, Trash2} from 'lucide-react';
import React, {memo, useEffect, useState} from 'react';
import {toast} from 'sonner';
import {ArixMascot} from '../components/ArixMascot';
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
import {Skeleton} from '../components/ui/skeleton';
import {useDebouncedValue} from '../hooks/useDebouncedValue';
import {apiFetch} from '../lib/api';
import {cn, formatRelativeTime} from '../lib/utils';

interface HistoryEntry {
  id: string;
  category: 'run' | 'ai' | 'save';
  title: string;
  subtitle: string;
  language: string;
  preview: string;
  createdAt: string;
}

interface HistoryResponse {
  entries: HistoryEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const HistoryRow = memo(function HistoryRow({
  entry,
  onSelect,
}: {
  entry: HistoryEntry;
  onSelect: (entry: HistoryEntry) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className="w-full px-5 py-3.5 text-left flex items-center justify-between gap-4 hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
          {entry.title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {entry.language} · {entry.subtitle}
        </p>
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
        {formatRelativeTime(entry.createdAt)}
      </span>
    </button>
  );
});

export function HistoryPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'ai' | 'run' | 'save'>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 800);
  const [page, setPage] = useState(1);
  const [clearOpen, setClearOpen] = useState(false);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filter]);

  const {data, isLoading, refetch} = useQuery({
    queryKey: ['history', page, filter, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        category: filter,
      });
      if (debouncedSearch.trim()) {
        params.set('q', debouncedSearch.trim());
      }
      return apiFetch<HistoryResponse>(`/api/history?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const entries = data?.entries ?? [];
  const pagination = data?.pagination;

  const handleClearAll = async () => {
    await apiFetch('/api/history', {method: 'DELETE'});
    setClearOpen(false);
    toast.success('Cleared AI and execution history');
    await refetch();
    await queryClient.invalidateQueries({queryKey: ['dashboard']});
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Code History
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Audit trail of AI requests, code runs, and file saves
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={entries.length === 0 && (pagination?.total ?? 0) === 0}
          onClick={() => setClearOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear history
        </Button>
      </div>

      <div className="arix-glass rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by language or action..."
            className="pl-9 h-9"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {(
            [
              ['all', 'All'],
              ['ai', 'AI'],
              ['run', 'Runs'],
              ['save', 'Saves'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium cursor-pointer',
                filter === id
                  ? 'bg-white dark:bg-[#17203d] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="arix-glass rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-center gap-3 px-4">
            <ArixMascot size="md" mood="idle" />
            <p className="text-sm font-medium">No history entries found</p>
            <p className="text-xs text-slate-500 max-w-xs">
              Run code, send AI prompts, or save project files to populate your
              activity history.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
            {entries.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                onSelect={setSelected}
              />
            ))}
          </div>
        )}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total}{' '}
            entries)
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

      {/* Entry Detail Modal */}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {selected?.language} · {selected?.subtitle}
            </DialogDescription>
          </DialogHeader>
          <pre className="mt-2 rounded-xl bg-slate-950 text-slate-100 p-4 font-mono text-xs overflow-auto max-h-72 whitespace-pre-wrap">
            {selected?.preview}
          </pre>
        </DialogContent>
      </Dialog>

      {/* Clear Confirmation */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear History?</DialogTitle>
            <DialogDescription>
              This permanently clears your AI request logs and code execution
              history. Your projects and files remain untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearAll}>
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
