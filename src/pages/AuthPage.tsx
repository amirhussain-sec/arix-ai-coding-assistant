import {ArrowRight, Lock, Mail, Moon, Sun, User} from 'lucide-react';
import React, {useState} from 'react';
import {Navigate} from 'react-router-dom';
import {z} from 'zod';
import {ArixMascot} from '../components/ArixMascot';
import {Button} from '../components/ui/button';
import {Input} from '../components/ui/input';
import {useAuth} from '../contexts/AuthContext';
import {useTheme} from '../contexts/ThemeContext';

const signInSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const signUpSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required.')
    .max(60, 'Display name must be 60 characters or fewer.'),
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(128),
});

export function AuthPage() {
  const {user, isLoading, signIn, signUp} = useAuth();
  const {theme, toggleTheme} = useTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signin') {
      const parsed = signInSchema.safeParse({email, password});
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Invalid credentials.');
        return;
      }
      setSubmitting(true);
      try {
        await signIn(parsed.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed.');
      } finally {
        setSubmitting(false);
      }
    } else {
      const parsed = signUpSchema.safeParse({displayName, email, password});
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Invalid details.');
        return;
      }
      setSubmitting(true);
      try {
        await signUp(parsed.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Account creation failed.');
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen arix-backdrop flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <ArixMascot size="sm" mood="idle" />
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Arix AI
          </span>
        </div>
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
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <section className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-3">
              <ArixMascot size="lg" mood="happy" />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              Your complete AI coding workspace, engineered for flow.
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed">
              Build full web apps with Arix Agent, edit with Monaco, run real
              JavaScript and Python in sandboxed workers, debug line-by-line, and
              keep every project synced to your private account.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
              <span>17 languages</span>
              <span aria-hidden="true">·</span>
              <span>Sandboxed execution</span>
              <span aria-hidden="true">·</span>
              <span>Private user isolation</span>
            </div>
          </section>

          <section className="lg:col-span-6">
            <div className="arix-glass rounded-2xl p-6 sm:p-8 shadow-2xl max-w-md w-full mx-auto">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                    mode === 'signin'
                      ? 'bg-white dark:bg-[#17203d] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                    mode === 'signup'
                      ? 'bg-white dark:bg-[#17203d] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Create account
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-name"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      Display name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="auth-name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Alex Rivera"
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-email"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="pl-9"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-password"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="auth-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        mode === 'signup'
                          ? 'At least 8 characters'
                          : 'Enter your password'
                      }
                      className="pl-9"
                      autoComplete={
                        mode === 'signup' ? 'new-password' : 'current-password'
                      }
                      required
                    />
                  </div>
                </div>

                {error && (
                  <p
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="gradient"
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting
                    ? mode === 'signin'
                      ? 'Signing in...'
                      : 'Creating account...'
                    : mode === 'signin'
                      ? 'Sign in to Arix AI'
                      : 'Create account'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
