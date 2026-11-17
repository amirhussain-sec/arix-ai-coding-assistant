import {
  ArrowLeftRight,
  BookOpen,
  Bot,
  Bug,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  FolderGit2,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Play,
  Settings,
  Sparkles,
  Sun,
  User as UserIcon,
  X,
} from 'lucide-react';
import React, {Suspense, useEffect, useState} from 'react';
import {Link, Outlet, useLocation, useNavigate} from 'react-router-dom';
import {useAuth} from '../contexts/AuthContext';
import {useSaveStatus} from '../contexts/SaveStatusContext';
import {useTheme} from '../contexts/ThemeContext';
import {cn} from '../lib/utils';
import {ArixMascot} from './ArixMascot';
import {OnboardingDialog} from './OnboardingDialog';
import {RouteSkeleton} from './RouteSkeleton';
import {Button} from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

export interface NavRouteItem {
  path: string;
  label: string;
  icon: React.ComponentType<{className?: string}>;
}

export const WORKSPACE_NAV_ITEMS: NavRouteItem[] = [
  {path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard},
  {path: '/agent', label: 'Arix Agent', icon: Bot},
  {path: '/generator', label: 'AI Code Generator', icon: Sparkles},
  {path: '/debugger', label: 'Code Debugger', icon: Bug},
  {path: '/editor', label: 'Code Editor', icon: Code2},
  {path: '/runner', label: 'Code Runner', icon: Play},
  {path: '/explainer', label: 'Code Explainer', icon: BookOpen},
  {path: '/converter', label: 'Code Converter', icon: ArrowLeftRight},
  {path: '/chat', label: 'AI Chat', icon: MessageSquare},
  {path: '/projects', label: 'My Projects', icon: FolderGit2},
  {path: '/history', label: 'Code History', icon: History},
  {path: '/settings', label: 'Settings', icon: Settings},
];

const SIDEBAR_STORAGE_KEY = 'arix_sidebar_collapsed';

export function AppShell() {
  const {user, signOut} = useAuth();
  const {theme, toggleTheme} = useTheme();
  const {saveState} = useSaveStatus();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const activeItem =
    WORKSPACE_NAV_ITEMS.find((item) =>
      location.pathname.startsWith(item.path)
    ) ?? WORKSPACE_NAV_ITEMS[0];

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', {replace: true});
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen arix-backdrop flex text-slate-900 dark:text-slate-100">
        {/* Desktop Collapsible Sidebar */}
        <aside
          className={cn(
            'hidden md:flex flex-col shrink-0 border-r border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-[#090d1b]/80 backdrop-blur-xl transition-[width] duration-200',
            collapsed ? 'w-[72px]' : 'w-[248px]'
          )}
          aria-label="Primary sidebar"
        >
          <div
            className={cn(
              'h-16 flex items-center border-b border-slate-200/80 dark:border-slate-800/80 px-3',
              collapsed ? 'justify-center' : 'justify-between'
            )}
          >
            <Link
              to="/dashboard"
              className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6bff] rounded-lg px-1 py-1"
            >
              <ArixMascot size="xs" mood="idle" animateFloat={false} />
              {!collapsed && (
                <span className="font-display text-base font-bold tracking-tight whitespace-nowrap">
                  Arix AI
                </span>
              )}
            </Link>
            {!collapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleCollapsed}
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
          </div>

          {collapsed && (
            <div className="flex justify-center pt-3 pb-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleCollapsed}
                aria-label="Expand sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
            {WORKSPACE_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              const linkEl = (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6bff]',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-[#4f6bff]/12 text-[#4f6bff] dark:bg-[#4f6bff]/18 dark:text-white border border-[#4f6bff]/25'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      isActive
                        ? 'text-[#4f6bff] dark:text-[#06b6d4]'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  />
                  {!collapsed && (
                    <span className="truncate whitespace-nowrap">
                      {item.label}
                    </span>
                  )}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }
              return linkEl;
            })}
          </nav>
        </aside>

        {/* Mobile Drawer Sidebar */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <aside
              className="relative z-10 w-72 max-w-[85vw] h-full bg-white dark:bg-[#090d1b] border-r border-slate-200 dark:border-slate-800 flex flex-col"
              aria-label="Mobile navigation"
            >
              <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <ArixMascot size="xs" mood="idle" animateFloat={false} />
                  <span className="font-display text-base font-bold">
                    Arix AI
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation menu"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {WORKSPACE_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname.startsWith(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-[#4f6bff]/15 text-[#4f6bff] dark:text-white border border-[#4f6bff]/25'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        {/* Main Workspace Column */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top Bar */}
          <header className="h-16 shrink-0 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-[#090d1b]/75 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden shrink-0"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <span className="font-display text-base sm:text-lg font-semibold truncate">
                {activeItem.label}
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Save Indicator */}
              {saveState !== 'idle' && (
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-opacity whitespace-nowrap',
                    saveState === 'saving' &&
                      'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400',
                    saveState === 'saved' &&
                      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                    saveState === 'error' &&
                      'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                  )}
                  role="status"
                  aria-live="polite"
                >
                  {saveState === 'saving' && (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving</span>
                    </>
                  )}
                  {saveState === 'saved' && (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Saved</span>
                    </>
                  )}
                  {saveState === 'error' && <span>Save failed</span>}
                </div>
              )}

              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 px-2.5 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6bff] cursor-pointer"
                    aria-label="User account menu"
                  >
                    <span
                      className="h-6 w-6 rounded-lg flex items-center justify-center text-xs font-semibold text-white shrink-0"
                      style={{
                        backgroundColor: user?.avatarColor || '#4f6bff',
                      }}
                    >
                      {(user?.displayName || 'A').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="hidden sm:inline max-w-[130px] truncate font-medium">
                      {user?.displayName || 'Developer'}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {user?.displayName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {user?.email}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <UserIcon className="h-4 w-4" />
                    <span>Profile & Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/projects')}>
                    <FolderGit2 className="h-4 w-4" />
                    <span>My Projects</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Main Content Viewport */}
          <main className="flex-1 pb-20 md:pb-8">
            <Suspense fallback={<RouteSkeleton />}>
              <Outlet />
            </Suspense>
          </main>

          {/* Mobile Bottom Bar */}
          <nav
            className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#090d1b]/92 backdrop-blur-xl px-2 flex items-center justify-around"
            aria-label="Quick mobile navigation"
          >
            {[
              WORKSPACE_NAV_ITEMS[0], // Dashboard
              WORKSPACE_NAV_ITEMS[1], // Arix Agent
              WORKSPACE_NAV_ITEMS[4], // Code Editor
              WORKSPACE_NAV_ITEMS[8], // AI Chat
              WORKSPACE_NAV_ITEMS[9], // My Projects
            ].map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium min-w-[56px]',
                    isActive
                      ? 'text-[#4f6bff] dark:text-[#06b6d4]'
                      : 'text-slate-500 dark:text-slate-400'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate max-w-[64px]">
                    {item.label.replace('AI ', '').replace('My ', '')}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <OnboardingDialog />
    </TooltipProvider>
  );
}
