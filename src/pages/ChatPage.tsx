import {useQuery, useQueryClient} from '@tanstack/react-query';
import {
  Check,
  Copy,
  FolderGit2,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {toast} from 'sonner';
import {AiErrorBanner} from '../components/AiErrorBanner';
import {ArixMascot} from '../components/ArixMascot';
import {MarkdownView} from '../components/MarkdownView';
import {Button} from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {Switch} from '../components/ui/switch';
import {useAuth} from '../contexts/AuthContext';
import {AiStreamError, streamAi} from '../lib/aiStream';
import {apiFetch} from '../lib/api';
import type {ProjectSummary} from '../lib/types';
import {cn, formatRelativeTime} from '../lib/utils';
import {
  createSpeechRecognition,
  speakText,
  stopSpeaking,
  VOICE_PRESETS,
} from '../lib/voice';

interface Conversation {
  id: string;
  title: string;
  projectId: string | null;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface StreamingBubbleHandle {
  setContent: (text: string) => void;
}

const SUGGESTION_CARDS = [
  {
    title: 'Design a clean REST API',
    prompt:
      'Design a TypeScript Express REST API with Zod validation and structured error handling.',
  },
  {
    title: 'Optimize a slow algorithm',
    prompt:
      'How do I optimize nested array lookups in JavaScript/TypeScript from O(n^2) to O(n)? Show before and after.',
  },
  {
    title: 'Write unit tests',
    prompt:
      'Show me how to structure clean unit tests with edge cases for an authentication helper.',
  },
  {
    title: 'Debug async race conditions',
    prompt:
      'Explain common async/await race conditions in React data fetching and how to prevent them cleanly.',
  },
];

const ChatSidebarItem = memo(function ChatSidebarItem({
  conv,
  isActive,
  onSelect,
  onDelete,
}: {
  conv: Conversation;
  isActive: boolean;
  onSelect: (conv: Conversation) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        'group flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-colors',
        isActive
          ? 'bg-[#4f6bff]/15 text-[#4f6bff] dark:text-white border border-[#4f6bff]/25'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 border border-transparent'
      )}
      onClick={() => onSelect(conv)}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{conv.title}</p>
        <p className="text-[11px] opacity-70">
          {formatRelativeTime(conv.updatedAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conv.id);
        }}
        aria-label="Delete conversation"
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-red-500 transition-opacity cursor-pointer"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

const ChatMessageItem = memo(function ChatMessageItem({
  msg,
  isCopied,
  isSpeaking,
  canRegenerate,
  onCopy,
  onReadAloud,
  onRegenerate,
}: {
  msg: ChatMessage;
  isCopied: boolean;
  isSpeaking: boolean;
  canRegenerate: boolean;
  onCopy: (id: string, content: string) => void;
  onReadAloud: (id: string, content: string) => void;
  onRegenerate: () => void;
}) {
  return (
    <div
      className={cn(
        'flex gap-3.5',
        msg.role === 'user' ? 'justify-end' : 'justify-start'
      )}
    >
      {msg.role === 'assistant' && (
        <div className="pt-1 shrink-0">
          <ArixMascot size="xs" mood="idle" animateFloat={false} />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3',
          msg.role === 'user'
            ? 'bg-gradient-to-r from-[#4f6bff] to-[#8b5cf6] text-white'
            : 'arix-glass text-slate-800 dark:text-slate-100 w-full'
        )}
      >
        {msg.role === 'user' ? (
          <p className="text-[15px] whitespace-pre-wrap leading-relaxed">
            {msg.content}
          </p>
        ) : (
          <>
            <MarkdownView content={msg.content} />
            <div className="mt-3 pt-2.5 border-t border-slate-200/70 dark:border-slate-800/80 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onCopy(msg.id, msg.content)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer"
              >
                {isCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {isCopied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => onReadAloud(msg.id, msg.content)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer"
              >
                {isSpeaking ? (
                  <VolumeX className="h-3.5 w-3.5 text-[#06b6d4]" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
                {isSpeaking ? 'Stop' : 'Read aloud'}
              </button>
              {canRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

const StreamingAssistantBubble = memo(
  forwardRef<StreamingBubbleHandle, {scrollEndRef: React.RefObject<HTMLDivElement | null>}>(
    function StreamingAssistantBubble({scrollEndRef}, ref) {
      const [content, setContent] = useState('');

      useImperativeHandle(
        ref,
        () => ({
          setContent: (next: string) => {
            setContent(next);
          },
        }),
        []
      );

      useEffect(() => {
        if (content) {
          scrollEndRef.current?.scrollIntoView({behavior: 'auto'});
        }
      }, [content, scrollEndRef]);

      return (
        <div className="flex gap-3.5 justify-start">
          <div className="pt-1 shrink-0">
            <ArixMascot size="xs" mood="thinking" animateFloat={false} />
          </div>
          <div className="arix-glass rounded-2xl px-4 py-3 w-full max-w-[85%]">
            {content ? (
              <MarkdownView content={content} />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Arix is thinking...
              </p>
            )}
          </div>
        </div>
      );
    }
  )
);

export function ChatPage() {
  const {user, settings, updateSettings} = useAuth();
  const queryClient = useQueryClient();

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('none');
  const [input, setInput] = useState('');
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);

  const [convPage, setConvPage] = useState(1);
  const [extraConversations, setExtraConversations] = useState<Conversation[]>([]);
  const [convHasMore, setConvHasMore] = useState(false);

  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [msgPage, setMsgPage] = useState(1);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition>>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const streamBubbleRef = useRef<StreamingBubbleHandle | null>(null);

  const {data: convData, refetch: refetchConvs} = useQuery({
    queryKey: ['conversations', 1],
    queryFn: () =>
      apiFetch<{conversations: Conversation[]; pagination: PaginationMeta}>(
        '/api/conversations?page=1&limit=20'
      ),
  });

  const {data: projectsData} = useQuery({
    queryKey: ['projects', 'summary'],
    queryFn: () =>
      apiFetch<{projects: ProjectSummary[]}>(
        '/api/projects?fields=summary&limit=50'
      ),
  });

  const {data: projectDetail} = useQuery({
    queryKey: ['project', selectedProjectId],
    queryFn: () =>
      apiFetch<{
        project: ProjectSummary;
        files: Array<{path: string; content: string; language: string}>;
      }>(`/api/projects/${selectedProjectId}`),
    enabled: selectedProjectId !== 'none',
  });

  const {data: msgData, refetch: refetchMessages} = useQuery({
    queryKey: ['conversation-messages', activeConvId],
    queryFn: () =>
      apiFetch<{messages: ChatMessage[]; pagination: PaginationMeta}>(
        `/api/conversations/${activeConvId}/messages?page=1&limit=20`
      ),
    enabled: Boolean(activeConvId),
  });

  useEffect(() => {
    setConvPage(1);
    setExtraConversations([]);
    setConvHasMore(Boolean(convData?.pagination?.hasMore));
  }, [convData]);

  useEffect(() => {
    setOlderMessages([]);
    setMsgPage(1);
  }, [activeConvId]);

  const conversations = React.useMemo(() => {
    const first = convData?.conversations ?? [];
    if (extraConversations.length === 0) return first;
    const seen = new Set(first.map((c) => c.id));
    return [...first, ...extraConversations.filter((c) => !seen.has(c.id))];
  }, [convData, extraConversations]);

  const messages = React.useMemo(() => {
    const latest = msgData?.messages ?? [];
    const base =
      olderMessages.length === 0
        ? latest
        : [
            ...olderMessages.filter(
              (m) => !new Set(latest.map((l) => l.id)).has(m.id)
            ),
            ...latest,
          ];
    if (optimisticMessages.length === 0) return base;
    const seen = new Set(base.map((m) => m.id));
    return [...base, ...optimisticMessages.filter((m) => !seen.has(m.id))];
  }, [msgData, olderMessages, optimisticMessages]);

  const hasMoreMessages =
    msgPage === 1
      ? Boolean(msgData?.pagination?.hasMore)
      : msgPage < (msgData?.pagination?.totalPages ?? 1);

  useEffect(() => {
    if (!activeConvId && conversations.length > 0) {
      setActiveConvId(conversations[0].id);
      if (conversations[0].projectId) {
        setSelectedProjectId(conversations[0].projectId);
      }
    }
  }, [activeConvId, conversations]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      const loadVoices = () => {
        setBrowserVoices(synth.getVoices());
      };
      loadVoices();
      synth.addEventListener?.('voiceschanged', loadVoices);
      return () => {
        synth.removeEventListener?.('voiceschanged', loadVoices);
      };
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages.length, isStreaming]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const handleLoadMoreConversations = async () => {
    const nextPage = convPage + 1;
    const res = await apiFetch<{
      conversations: Conversation[];
      pagination: PaginationMeta;
    }>(`/api/conversations?page=${nextPage}&limit=20`);
    setExtraConversations((prev) => [...prev, ...res.conversations]);
    setConvPage(nextPage);
    setConvHasMore(res.pagination.hasMore);
  };

  const handleLoadOlderMessages = async () => {
    if (!activeConvId || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const nextPage = msgPage + 1;
      const res = await apiFetch<{
        messages: ChatMessage[];
        pagination: PaginationMeta;
      }>(`/api/conversations/${activeConvId}/messages?page=${nextPage}&limit=20`);
      setOlderMessages((prev) => [...res.messages, ...prev]);
      setMsgPage(nextPage);
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSelectConv = useCallback((conv: Conversation) => {
    setOptimisticMessages([]);
    setActiveConvId(conv.id);
    if (conv.projectId) setSelectedProjectId(conv.projectId);
  }, []);

  const handleNewChat = async () => {
    stopSpeaking();
    setSpeakingId(null);
    setOptimisticMessages([]);
    const created = await apiFetch<{conversation: Conversation}>(
      '/api/conversations',
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'New Chat',
          projectId: selectedProjectId !== 'none' ? selectedProjectId : null,
        }),
      }
    );
    void refetchConvs();
    setActiveConvId(created.conversation.id);
    setErrorMsg(null);
  };

  const handleDeleteConv = useCallback(
    async (id: string) => {
      await apiFetch(`/api/conversations/${id}`, {method: 'DELETE'});
      if (activeConvId === id) {
        setOptimisticMessages([]);
        setActiveConvId(null);
      }
      await refetchConvs();
    },
    [activeConvId, refetchConvs]
  );

  const buildContextString = useCallback(() => {
    if (!projectDetail) return undefined;
    const filesSummary = projectDetail.files
      .slice(0, 4)
      .map(
        (f) =>
          `--- File: ${f.path} (${f.language}) ---\n${f.content.slice(0, 1200)}`
      )
      .join('\n\n');
    return `Active Project: ${projectDetail.project.name} (${projectDetail.project.primaryLanguage})\n${filesSummary}`.slice(
      0,
      3000
    );
  }, [projectDetail]);

  const sendMessage = useCallback(
    async (overrideText?: string, regenerateLast?: boolean) => {
      const text = (overrideText ?? input).trim();
      if ((!text && !regenerateLast) || isStreaming || cooldown > 0) return;

      setErrorMsg(null);
      setLastFailedPrompt(null);

      const previousMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let apiHistory = previousMessages;
      if (!regenerateLast) {
        setInput('');
        const optimisticUser: ChatMessage = {
          id: `opt-user-${crypto.randomUUID()}`,
          role: 'user',
          content: text,
          createdAt: new Date().toISOString(),
        };
        setOptimisticMessages((prev) => [...prev, optimisticUser]);
        apiHistory = [
          ...previousMessages,
          {role: 'user' as const, content: text},
        ].slice(-10);
      } else {
        const lastUserIdx = [...previousMessages]
          .reverse()
          .findIndex((m) => m.role === 'user');
        if (lastUserIdx !== -1) {
          const cutoff = previousMessages.length - lastUserIdx;
          apiHistory = previousMessages.slice(0, cutoff).slice(-10);
        } else {
          apiHistory = previousMessages.slice(-10);
        }
      }

      // Show typing indicator immediately before any network/DB round-trip
      setIsStreaming(true);
      streamBubbleRef.current?.setContent('');
      const controller = new AbortController();
      abortRef.current = controller;

      // Persist conversation/user message in parallel so AI call starts immediately
      let userPersisted = Boolean(regenerateLast);
      const persistUserPromise = (async () => {
        let convId = activeConvId;
        if (!convId) {
          const created = await apiFetch<{conversation: Conversation}>(
            '/api/conversations',
            {
              method: 'POST',
              body: JSON.stringify({
                title: (text || 'New Chat').slice(0, 48),
                projectId:
                  selectedProjectId !== 'none' ? selectedProjectId : null,
              }),
            }
          );
          convId = created.conversation.id;
          setActiveConvId(convId);
          void refetchConvs();
        }
        if (!regenerateLast && convId) {
          await apiFetch(`/api/conversations/${convId}/messages`, {
            method: 'POST',
            body: JSON.stringify({role: 'user', content: text}),
          });
          userPersisted = true;
        }
        return convId;
      })();

      try {
        const reply = await streamAi({
          mode: 'chat',
          messages: apiHistory,
          language: user?.preferredLanguage || 'typescript',
          context: buildContextString(),
          signal: controller.signal,
          onChunk: (_chunk, acc) => {
            streamBubbleRef.current?.setContent(acc);
          },
        });

        const convId = await persistUserPromise;
        if (reply.trim() && convId) {
          await apiFetch(`/api/conversations/${convId}/messages`, {
            method: 'POST',
            body: JSON.stringify({role: 'assistant', content: reply}),
          });
          await refetchMessages();
          setOptimisticMessages([]);
          void refetchConvs();
          void queryClient.invalidateQueries({queryKey: ['dashboard']});

          if (settings?.autoReadReplies) {
            speakText(reply, {
              voiceName: settings.voiceName,
              rate: settings.voiceRate,
              pitch: settings.voicePitch,
            });
          }
        } else {
          await refetchMessages();
          setOptimisticMessages([]);
        }
      } catch (err) {
        await persistUserPromise.catch(() => null);
        if (userPersisted) {
          await refetchMessages().catch(() => null);
          setOptimisticMessages([]);
        }
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (!regenerateLast && text && !userPersisted) {
          setOptimisticMessages([]);
          setInput(text);
          setLastFailedPrompt(text);
        }
        if (err instanceof AiStreamError) {
          setErrorMsg(err.message);
          if (err.status === 429 && err.retryAfter) {
            setCooldown(err.retryAfter);
          }
        } else {
          setErrorMsg('Unable to reach AI service. Please retry.');
        }
      } finally {
        setIsStreaming(false);
        streamBubbleRef.current?.setContent('');
        abortRef.current = null;
      }
    },
    [
      activeConvId,
      buildContextString,
      cooldown,
      input,
      isStreaming,
      messages,
      queryClient,
      refetchConvs,
      refetchMessages,
      selectedProjectId,
      settings,
      user?.preferredLanguage,
    ]
  );

  const toggleDictation = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = createSpeechRecognition();
    if (!rec) {
      toast.error('Speech recognition is not supported in this browser.');
      return;
    }
    recognitionRef.current = rec;
    let finalTranscript = '';

    rec.onresult = (event) => {
      let combined = '';
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0]?.transcript ?? '';
      }
      finalTranscript = combined;
      setInput(combined);
    };
    rec.onerror = () => {
      setListening(false);
      toast.error('Microphone dictation interrupted.');
    };
    rec.onend = () => {
      setListening(false);
      if (settings?.autoSendSpeech && finalTranscript.trim()) {
        void sendMessage(finalTranscript.trim());
      }
    };
    setListening(true);
    rec.start();
  };

  const handleReadAloud = useCallback(
    (id: string, content: string) => {
      if (speakingId === id) {
        stopSpeaking();
        setSpeakingId(null);
        return;
      }
      setSpeakingId(id);
      speakText(content, {
        voiceName: settings?.voiceName,
        rate: settings?.voiceRate,
        pitch: settings?.voicePitch,
        onEnd: () => setSpeakingId(null),
      });
    },
    [settings?.voiceName, settings?.voicePitch, settings?.voiceRate, speakingId]
  );

  const handleCopy = useCallback(async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }, []);

  const handleRegenerate = useCallback(() => {
    void sendMessage(undefined, true);
  }, [sendMessage]);

  const applyPreset = (presetName: string) => {
    const found = VOICE_PRESETS.find((p) => p.name === presetName);
    if (!found) return;
    void updateSettings({
      voicePreset: found.name,
      voiceRate: found.rate,
      voicePitch: found.pitch,
    });
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden">
      {/* Left Conversation History Sidebar */}
      <aside className="hidden lg:flex w-68 shrink-0 flex-col border-r border-slate-200/80 dark:border-slate-800/80 bg-white/50 dark:bg-[#090d1b]/60">
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-800/80">
          <Button variant="gradient" className="w-full" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 px-3 py-6 text-center">
              No saved chats yet. Start a conversation!
            </p>
          ) : (
            <>
              {conversations.map((conv) => (
                <ChatSidebarItem
                  key={conv.id}
                  conv={conv}
                  isActive={activeConvId === conv.id}
                  onSelect={handleSelectConv}
                  onDelete={handleDeleteConv}
                />
              ))}
              {convHasMore && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs mt-1"
                  onClick={() => void handleLoadMoreConversations()}
                >
                  Load more chats
                </Button>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Main Centered Chat Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Context & Voice Toolbar */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-white/40 dark:bg-[#090d1b]/40">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={handleNewChat}
            >
              <Plus className="h-3.5 w-3.5" />
              New chat
            </Button>
            <div className="flex items-center gap-2">
              <FolderGit2 className="h-4 w-4 text-slate-400 shrink-0" />
              <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
              >
                <SelectTrigger className="h-8 w-48 sm:w-56 text-xs">
                  <SelectValue placeholder="Active project context" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project context</SelectItem>
                  {(projectsData?.projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setVoiceModalOpen(true)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Voice settings
          </Button>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && !isStreaming ? (
              <div className="py-10 space-y-8">
                <div className="text-center space-y-3">
                  <div className="flex justify-center">
                    <ArixMascot size="lg" mood="happy" />
                  </div>
                  <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    Ask Arix anything about your code
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    Select a project above for full file-aware assistance, or
                    start from a prompt below.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SUGGESTION_CARDS.map((card) => (
                    <button
                      key={card.title}
                      type="button"
                      onClick={() => void sendMessage(card.prompt)}
                      className="arix-glass rounded-xl p-4 text-left hover:border-[#4f6bff]/40 transition-colors cursor-pointer"
                    >
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {card.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {card.prompt}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {hasMoreMessages && (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loadingOlder}
                      onClick={() => void handleLoadOlderMessages()}
                    >
                      {loadingOlder ? 'Loading...' : 'Load older messages'}
                    </Button>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <ChatMessageItem
                    key={msg.id}
                    msg={msg}
                    isCopied={copiedId === msg.id}
                    isSpeaking={speakingId === msg.id}
                    canRegenerate={idx === messages.length - 1 && !isStreaming}
                    onCopy={handleCopy}
                    onReadAloud={handleReadAloud}
                    onRegenerate={handleRegenerate}
                  />
                ))}

                {isStreaming && (
                  <StreamingAssistantBubble
                    ref={streamBubbleRef}
                    scrollEndRef={messagesEndRef}
                  />
                )}
              </>
            )}

            {errorMsg && (
              <AiErrorBanner
                message={errorMsg}
                cooldownSeconds={cooldown}
                onRetry={
                  lastFailedPrompt
                    ? () => void sendMessage(lastFailedPrompt)
                    : () => void sendMessage(undefined, true)
                }
                onDismiss={() => setErrorMsg(null)}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Auto-growing Input Pill */}
        <div className="p-4 sm:px-6 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/50 dark:bg-[#090d1b]/60 backdrop-blur-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="max-w-3xl mx-auto flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0d1224] px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-[#4f6bff]"
          >
            <Button
              type="button"
              variant={listening ? 'destructive' : 'ghost'}
              size="icon"
              onClick={toggleDictation}
              aria-label={listening ? 'Stop dictation' : 'Start voice dictation'}
              className="shrink-0 h-9 w-9 rounded-xl"
            >
              {listening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              rows={1}
              placeholder="Ask Arix about code, architecture, or bugs... (Shift+Enter for new line)"
              className="flex-1 resize-none bg-transparent py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none max-h-44"
            />

            {isStreaming ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop response"
                className="shrink-0 h-9 w-9 rounded-xl"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                variant="gradient"
                size="sm"
                disabled={!input.trim() || cooldown > 0}
                className="shrink-0 h-9 rounded-xl px-3.5"
              >
                {cooldown > 0 ? (
                  <span className="font-mono tabular-nums">{cooldown}s</span>
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            )}
          </form>
        </div>
      </div>

      {/* Voice Settings Dialog */}
      <Dialog open={voiceModalOpen} onOpenChange={setVoiceModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Voice & Speech Settings</DialogTitle>
            <DialogDescription>
              Configure speech-to-text dictation and read-aloud TTS defaults.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Voice Preset
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {VOICE_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset.name)}
                    className={cn(
                      'py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer',
                      settings?.voicePreset === preset.name
                        ? 'bg-[#4f6bff] text-white border-[#4f6bff]'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                    )}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Browser Voice
              </label>
              <Select
                value={settings?.voiceName || 'default'}
                onValueChange={(v) =>
                  void updateSettings({voiceName: v === 'default' ? '' : v})
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="System default voice" />
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

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span>Speed</span>
                <span className="font-mono tabular-nums">
                  {(settings?.voiceRate ?? 1).toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={settings?.voiceRate ?? 1}
                onChange={(e) =>
                  void updateSettings({voiceRate: Number(e.target.value)})
                }
                className="w-full accent-[#4f6bff]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span>Pitch</span>
                <span className="font-mono tabular-nums">
                  {(settings?.voicePitch ?? 1).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={settings?.voicePitch ?? 1}
                onChange={(e) =>
                  void updateSettings({voicePitch: Number(e.target.value)})
                }
                className="w-full accent-[#4f6bff]"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-sm">Read replies aloud</span>
              <Switch
                checked={Boolean(settings?.autoReadReplies)}
                onCheckedChange={(checked) =>
                  void updateSettings({autoReadReplies: checked})
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Send automatically after I speak</span>
              <Switch
                checked={Boolean(settings?.autoSendSpeech)}
                onCheckedChange={(checked) =>
                  void updateSettings({autoSendSpeech: checked})
                }
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
