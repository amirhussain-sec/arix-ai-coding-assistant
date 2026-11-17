import React, {useState} from 'react';
import {toast} from 'sonner';
import {z} from 'zod';
import {useAuth} from '../contexts/AuthContext';
import {SUPPORTED_LANGUAGES} from '../lib/languages';
import {ArixMascot} from './ArixMascot';
import {Button} from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {Input} from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const onboardingSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Please enter your display name.')
    .max(60, 'Display name must be 60 characters or fewer.'),
  preferredLanguage: z.string().min(1, 'Please select a preferred language.'),
});

export function OnboardingDialog() {
  const {user, updateProfile} = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [preferredLanguage, setPreferredLanguage] = useState(
    user?.preferredLanguage || 'typescript'
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user || user.onboarded) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = onboardingSchema.safeParse({displayName, preferredLanguage});
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSubmitting(true);
    try {
      await updateProfile({
        displayName: parsed.data.displayName,
        preferredLanguage: parsed.data.preferredLanguage,
        onboarded: true,
      });
      toast.success(`Welcome to Arix AI, ${parsed.data.displayName}!`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save your preferences.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true}>
      <DialogContent
        hideClose
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <ArixMascot size="sm" mood="happy" />
            <div>
              <DialogTitle>Welcome to Arix AI</DialogTitle>
              <DialogDescription>
                Personalize your workspace before you start building.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-name"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              What should we call you?
            </label>
            <Input
              id="onboarding-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex Rivera"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-language"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Primary programming language
            </label>
            <Select
              value={preferredLanguage}
              onValueChange={setPreferredLanguage}
            >
              <SelectTrigger id="onboarding-language">
                <SelectValue placeholder="Choose a language" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.id} value={lang.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{backgroundColor: lang.color}}
                      />
                      <span>{lang.name}</span>
                      <span className="text-xs text-slate-400">
                        .{lang.extension}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              variant="gradient"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? 'Setting up workspace...' : 'Enter Workspace'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
