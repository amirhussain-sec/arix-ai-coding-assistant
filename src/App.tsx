import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MotionConfig} from 'motion/react';
import {lazy, Suspense} from 'react';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import {Toaster} from 'sonner';
import {AppShell} from './components/AppShell';
import {ErrorBoundary} from './components/ErrorBoundary';
import {ProtectedRoute} from './components/ProtectedRoute';
import {RouteSkeleton} from './components/RouteSkeleton';
import {AuthProvider} from './contexts/AuthContext';
import {SaveStatusProvider} from './contexts/SaveStatusContext';
import {ThemeProvider} from './contexts/ThemeContext';

const AuthPage = lazy(() =>
  import('./pages/AuthPage').then((m) => ({default: m.AuthPage}))
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({default: m.DashboardPage}))
);
const AgentPage = lazy(() =>
  import('./pages/AgentPage').then((m) => ({default: m.AgentPage}))
);
const GeneratorPage = lazy(() =>
  import('./pages/GeneratorPage').then((m) => ({default: m.GeneratorPage}))
);
const DebuggerPage = lazy(() =>
  import('./pages/DebuggerPage').then((m) => ({default: m.DebuggerPage}))
);
const EditorPage = lazy(() =>
  import('./pages/EditorPage').then((m) => ({default: m.EditorPage}))
);
const RunnerPage = lazy(() =>
  import('./pages/RunnerPage').then((m) => ({default: m.RunnerPage}))
);
const ExplainerPage = lazy(() =>
  import('./pages/ExplainerPage').then((m) => ({default: m.ExplainerPage}))
);
const ConverterPage = lazy(() =>
  import('./pages/ConverterPage').then((m) => ({default: m.ConverterPage}))
);
const ChatPage = lazy(() =>
  import('./pages/ChatPage').then((m) => ({default: m.ChatPage}))
);
const ProjectsPage = lazy(() =>
  import('./pages/ProjectsPage').then((m) => ({default: m.ProjectsPage}))
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({default: m.HistoryPage}))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({default: m.SettingsPage}))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <SaveStatusProvider>
            <AuthProvider>
              <ThemeProvider>
                <BrowserRouter>
                  <Suspense fallback={<RouteSkeleton />}>
                    <Routes>
                      <Route path="/auth" element={<AuthPage />} />
                      <Route element={<ProtectedRoute />}>
                        <Route element={<AppShell />}>
                          <Route path="/" element={<Navigate to="/dashboard" replace />} />
                          <Route path="/dashboard" element={<DashboardPage />} />
                          <Route path="/agent" element={<AgentPage />} />
                          <Route path="/generator" element={<GeneratorPage />} />
                          <Route path="/debugger" element={<DebuggerPage />} />
                          <Route path="/editor" element={<EditorPage />} />
                          <Route path="/runner" element={<RunnerPage />} />
                          <Route path="/explainer" element={<ExplainerPage />} />
                          <Route path="/converter" element={<ConverterPage />} />
                          <Route path="/chat" element={<ChatPage />} />
                          <Route path="/projects" element={<ProjectsPage />} />
                          <Route path="/history" element={<HistoryPage />} />
                          <Route path="/settings" element={<SettingsPage />} />
                          <Route path="*" element={<Navigate to="/dashboard" replace />} />
                        </Route>
                      </Route>
                    </Routes>
                  </Suspense>
                </BrowserRouter>
                <Toaster position="bottom-right" richColors />
              </ThemeProvider>
            </AuthProvider>
          </SaveStatusProvider>
        </QueryClientProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
