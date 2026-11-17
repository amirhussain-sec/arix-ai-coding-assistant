import {Download, Trash2} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'sonner';
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
import {Switch} from '../components/ui/switch';
import {useAuth} from '../contexts/AuthContext';
import {useTheme} from '../contexts/ThemeContext';
import {apiFetch, setStoredSessionToken} from '../lib/api';
import {SUPPORTED_LANGUAGES} from '../lib/languages';
import {isLiveRunnable} from '../lib/runnerEngine';
import {VOICE_PRESETS} from '../lib/voice';

export function SettingsPage() {
  const navigate = useNavigate();
  const {user, settings, updateProfile, updateSettings, signOut} = useAuth();
  const {theme, setTheme} = useTheme();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [preferredLanguage, setPreferredLanguage] = useState(
    user?.preferredLanguage || 'typescript'
  );
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setPreferredLanguage(user.preferredLanguage);
    }
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      const load = () => setBrowserVoices(synth.getVoices());
      load();
      synth.addEventListener?.('voiceschanged', load);
      return () => {
        synth.removeEventListener?.('voiceschanged', load);
      };
    }
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    try {
      await updateProfile({
        displayName: displayName.trim(),
        preferredLanguage,
      });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const handleExportAll = async () => {
    try {
      const dump = await apiFetch<Record<string, unknown>>('/api/export-all');
      const blob = new Blob([JSON.stringify(dump, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arix-ai-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported all workspace data');
    } catch {
      toast.error('Failed to export data.');
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmWord !== 'DELETE') return;
    try {
      await apiFetch('/api/account', {method: 'DELETE'});
      setStoredSessionToken(null);
      await signOut();
      navigate('/auth', {replace: true});
    } catch {
      toast.error('Account deletion failed.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
        Settings
      </h1>

      {/* Profile */}
      <section className="arix-glass rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-base font-semibold">Profile</h2>
        <form
          onSubmit={handleSaveProfile}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Display name
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Preferred language
            </label>
            <Select
              value={preferredLanguage}
              onValueChange={setPreferredLanguage}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" variant="gradient" size="sm">
              Save profile
            </Button>
          </div>
        </form>
      </section>

      {/* Appearance & Editor */}
      <section className="arix-glass rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-base font-semibold">
          Appearance & Editor
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Theme
            </label>
            <Select
              value={theme}
              onValueChange={(v) => setTheme(v as 'dark' | 'light')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Dark (Deep Navy)</SelectItem>
                <SelectItem value="light">Light</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
              <span>Editor font size</span>
              <span className="font-mono tabular-nums">
                {settings?.editorFontSize ?? 14}px
              </span>
            </div>
            <input
              type="range"
              min="11"
              max="24"
              step="1"
              value={settings?.editorFontSize ?? 14}
              onChange={(e) =>
                void updateSettings({editorFontSize: Number(e.target.value)})
              }
              className="w-full accent-[#4f6bff]"
            />
          </div>
        </div>
      </section>

      {/* Voice Defaults */}
      <section className="arix-glass rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-base font-semibold">Voice Defaults</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Preset
            </label>
            <Select
              value={settings?.voicePreset || 'Natural'}
              onValueChange={(name) => {
                const found = VOICE_PRESETS.find((p) => p.name === name);
                if (found) {
                  void updateSettings({
                    voicePreset: found.name,
                    voiceRate: found.rate,
                    voicePitch: found.pitch,
                  });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_PRESETS.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Browser voice
            </label>
            <Select
              value={settings?.voiceName || 'default'}
              onValueChange={(v) =>
                void updateSettings({voiceName: v === 'default' ? '' : v})
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">System default</SelectItem>
                {browserVoices.map((v) => (
                  <SelectItem key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm">Read AI replies aloud</span>
            <Switch
              checked={Boolean(settings?.autoReadReplies)}
              onCheckedChange={(checked) =>
                void updateSettings({autoReadReplies: checked})
              }
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm">Auto-send after speech dictation</span>
            <Switch
              checked={Boolean(settings?.autoSendSpeech)}
              onCheckedChange={(checked) =>
                void updateSettings({autoSendSpeech: checked})
              }
            />
          </div>
        </div>
      </section>

      {/* Supported vs Unsupported Runtime Table */}
      <section className="arix-glass rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold">
            Language & Runtime Execution Support
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            All 17 languages support AI generation, debugging, explanation,
            conversion, and Monaco editing. Live execution honesty is listed
            below.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-4 font-medium">Language</th>
                <th className="py-2 pr-4 font-medium">Live Execution</th>
                <th className="py-2 font-medium">Runtime Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const live = isLiveRunnable(lang.id);
                return (
                  <tr key={lang.id}>
                    <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-slate-100">
                      {lang.name} (.{lang.extension})
                    </td>
                    <td className="py-2.5 pr-4">
                      {live ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Supported
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          Not supported (AI-predicted option)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-500 dark:text-slate-400">
                      {live
                        ? lang.runtimeNote
                        : 'AI-predicted simulation clearly labelled in Runner'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Data Export & Account Deletion */}
      <section className="arix-glass rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold">
            Data Export & Account
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Download all your projects, chats, and history, or permanently
            delete your account.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={handleExportAll}>
            <Download className="h-3.5 w-3.5" />
            Export all data
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete account
          </Button>
        </div>
      </section>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Account & All Data?</DialogTitle>
            <DialogDescription>
              This permanently removes your profile, projects, files, chats, and
              history. Type DELETE below to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmWord}
            onChange={(e) => setConfirmWord(e.target.value)}
            placeholder="Type DELETE"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmWord !== 'DELETE'}
              onClick={handleDeleteAccount}
            >
              Permanently delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
