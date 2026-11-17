import {useQueryClient} from '@tanstack/react-query';
import React, {useEffect, useState} from 'react';
import {toast} from 'sonner';
import {z} from 'zod';
import {useSaveStatus} from '../contexts/SaveStatusContext';
import {apiFetch} from '../lib/api';
import {getLanguageById, SUPPORTED_LANGUAGES} from '../lib/languages';
import type {ProjectSummary} from '../lib/types';
import {Button} from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Project name is required.')
    .max(80, 'Project name must be 80 characters or fewer.'),
  description: z.string().trim().max(300).default(''),
  primaryLanguage: z.string().min(1),
});

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLanguage?: string;
  onCreated?: (project: ProjectSummary) => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  initialLanguage = 'typescript',
  onCreated,
}: CreateProjectDialogProps) {
  const queryClient = useQueryClient();
  const {markSaving, markSaved, markError} = useSaveStatus();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [languageId, setLanguageId] = useState(initialLanguage);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setLanguageId(initialLanguage || 'typescript');
      setError(null);
    }
  }, [initialLanguage, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = createProjectSchema.safeParse({
      name,
      description,
      primaryLanguage: languageId,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid project details.');
      return;
    }

    const langMeta = getLanguageById(parsed.data.primaryLanguage);

    setSubmitting(true);
    markSaving();
    try {
      const res = await apiFetch<{project: ProjectSummary}>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: parsed.data.name,
          description: parsed.data.description,
          primaryLanguage: langMeta.id,
          category: langMeta.category,
          starterFile: langMeta.starterFile,
          starterContent: langMeta.starterContent,
        }),
      });
      markSaved();
      toast.success(`Created project "${res.project.name}"`);
      await queryClient.invalidateQueries({queryKey: ['dashboard']});
      await queryClient.invalidateQueries({queryKey: ['projects']});
      setName('');
      setDescription('');
      onOpenChange(false);
      onCreated?.(res.project);
    } catch (err) {
      markError();
      setError(err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Create a persistent project in your Arix AI workspace.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label
              htmlFor="project-name"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Project name
            </label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Realtime Analytics API"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="project-language"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Language
            </label>
            <Select value={languageId} onValueChange={setLanguageId}>
              <SelectTrigger id="project-language">
                <SelectValue />
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

          <div className="space-y-1.5">
            <label
              htmlFor="project-description"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Description (optional)
            </label>
            <Input
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of what you are building"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="gradient" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
