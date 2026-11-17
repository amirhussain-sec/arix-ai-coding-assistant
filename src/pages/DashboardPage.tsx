import {useQuery} from '@tanstack/react-query';
import {
  Activity,
  Bot,
  Bug,
  Code2,
  FolderGit2,
  History,
  MessageSquare,
  Play,
  Plus,
  Sparkles,
  Terminal,
} from 'lucide-react';
import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArixMascot} from '../components/ArixMascot';
import {CreateProjectDialog} from '../components/CreateProjectDialog';
import {UsageChart} from '../components/UsageChart';
import {Button} from '../components/ui/button';
import {Skeleton} from '../components/ui/skeleton';
import {useAuth} from '../contexts/AuthContext';
import {apiFetch} from '../lib/api';
import {getLanguageById, SUPPORTED_LANGUAGES} from '../lib/languages';
import type {DashboardData} from '../lib/types';
import {formatRelativeTime} from '../lib/utils';

export function DashboardPage() {
  const {user} = useAuth();
  const navigate = useNavigate();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState<string>(
    user?.preferredLanguage || 'typescript'
  );

  const {data, isLoading, isError, refetch} = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardData>('/api/dashboard'),
  });

  const openNewProject = (langId?: string) => {
    setSelectedLang(langId || user?.preferredLanguage || 'typescript');
    setCreateOpen(true);
  };

  const quickActions = [
    {
      label: 'Arix Agent',
      description: 'Split-screen app builder',
      path: '/agent',
      icon: Bot,
    },
    {
      label: 'AI Chat',
      description: 'Context-aware coding assistant',
      path: '/chat',
      icon: MessageSquare,
    },
    {
      label: 'Code Editor',
      description: 'Multi-file Monaco workspace',
      path: '/editor',
      icon: Code2,
    },
    {
      label: 'Code Generator',
      description: 'Generate multi-file modules',
      path: '/generator',
      icon: Sparkles,
    },
    {
      label: 'Code Debugger',
      description: 'Line-by-line root cause fixes',
      path: '/debugger',
      icon: Bug,
    },
    {
      label: 'Code Runner',
      description: 'Execute JS, Python, HTML & more',
      path: '/runner',
      icon: Play,
    },
  ];

  const statItems = [
    {
      label: 'Total projects',
      value: data?.stats.totalProjects ?? 0,
      icon: FolderGit2,
    },
    {
      label: 'Code executions',
      value: data?.stats.codeExecutions ?? 0,
      icon: Terminal,
    },
    {
      label: 'AI requests',
      value: data?.stats.aiRequests ?? 0,
      icon: Sparkles,
    },
    {
      label: 'History entries',
      value: data?.stats.historyEntries ?? 0,
      icon: History,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
      {/* Header Row */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {user?.displayName || 'Developer'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Preferred stack: {getLanguageById(user?.preferredLanguage || 'typescript').name}
            {' · '}
            All workspace data is private to your account.
          </p>
        </div>

        <Button
          variant="gradient"
          onClick={() => openNewProject()}
          className="self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </section>

      {isError && (
        <div className="arix-glass rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-red-500/30">
          <p className="text-sm text-red-600 dark:text-red-400">
            Could not load dashboard metrics from the server.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* 4 Stat Cards */}
      <section
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        aria-label="Workspace statistics"
      >
        {statItems.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="arix-glass rounded-2xl p-5 flex items-start justify-between gap-4"
            >
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {stat.label}
                </p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white tabular-nums">
                    {stat.value}
                  </p>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-[#4f6bff]/10 dark:bg-[#4f6bff]/15 border border-[#4f6bff]/20 flex items-center justify-center text-[#4f6bff] dark:text-[#06b6d4] shrink-0">
                <Icon className="h-5 w-5" />
              </div>
            </div>
          );
        })}
      </section>

      {/* Main Split: Usage Chart + Quick Actions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 arix-glass rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                AI Usage (Last 7 Days)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Daily requests recorded across your workspace
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {data?.stats.aiRequests ?? 0} total
            </span>
          </div>

          {isLoading ? (
            <Skeleton className="h-52 w-full mt-4" />
          ) : (
            <UsageChart data={data?.usageChart ?? []} />
          )}
        </div>

        <div className="lg:col-span-5 arix-glass rounded-2xl p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-1">
            Quick Actions
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Jump directly into any Arix AI tool
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.path}
                  type="button"
                  onClick={() => navigate(action.path)}
                  className="text-left rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/40 hover:bg-slate-100/90 dark:hover:bg-slate-800/60 hover:border-[#4f6bff]/35 p-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6bff] cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 text-[#4f6bff] dark:text-[#06b6d4] shrink-0" />
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {action.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                    {action.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Recent Projects & Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Projects */}
        <div className="lg:col-span-7 arix-glass rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Recent Projects
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pick up where you left off
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/projects')}
            >
              View all
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : data && data.recentProjects.length > 0 ? (
            <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
              {data.recentProjects.map((project) => {
                const lang = getLanguageById(project.primaryLanguage);
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => navigate(`/editor?project=${project.id}`)}
                    className="w-full py-3.5 px-2 -mx-2 rounded-xl flex items-center justify-between gap-4 text-left hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6bff]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{backgroundColor: lang.color}}
                        />
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {project.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span>{lang.name}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {project.fileCount}{' '}
                          {project.fileCount === 1 ? 'file' : 'files'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {project.lineCount}{' '}
                          {project.lineCount === 1 ? 'line' : 'lines'}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                      {formatRelativeTime(project.updatedAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-10 flex flex-col items-center text-center gap-3">
              <ArixMascot size="md" mood="idle" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  No projects yet
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                  Create your first project to organize files, run code, and
                  collaborate with Arix AI.
                </p>
              </div>
              <Button
                variant="gradient"
                size="sm"
                onClick={() => openNewProject()}
              >
                <Plus className="h-4 w-4" />
                Create your first project
              </Button>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-5 arix-glass rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Recent Activity
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Latest saves, runs, and AI sessions
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/history')}
            >
              History
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : data && data.recentActivity.length > 0 ? (
            <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
              {data.recentActivity.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.language} · {item.detail}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 flex flex-col items-center text-center gap-2.5">
              <Activity className="h-8 w-8 text-slate-400 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No activity yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                Your project saves, code runs, and AI generations will appear
                here in real time.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 17 Language Shortcuts */}
      <section className="arix-glass rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Language Shortcuts
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Start a new project in any of the 17 supported languages
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            17 languages
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              type="button"
              onClick={() => openNewProject(lang.id)}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/40 hover:bg-slate-100/90 dark:hover:bg-slate-800/60 hover:border-[#4f6bff]/35 px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6bff] cursor-pointer"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{backgroundColor: lang.color}}
                />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {lang.name}
                </span>
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                .{lang.extension}
              </span>
            </button>
          ))}
        </div>
      </section>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialLanguage={selectedLang}
      />
    </div>
  );
}
