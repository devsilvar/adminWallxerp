import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Send,
  Plus,
  Copy,
  Check,
  RotateCcw,
  ArrowDown,
  ChartLine,
  MessageSquare,
  Trash2,
  PanelLeft,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useBusinessStore } from '@/stores/business.store';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import NoBusinessPrompt from '@/components/NoBusinessPrompt';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  error?: boolean;
}

interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

interface QuestionCategory {
  title: string;
  icon: typeof TrendingUp;
  accent: string;
  questions: string[];
}

const QUESTION_CATEGORIES: QuestionCategory[] = [
  {
    title: 'Business health',
    icon: TrendingUp,
    accent: 'text-emerald-700 bg-emerald-50 ring-emerald-700/10',
    questions: [
      'How is my business performing this month?',
      'Is my profit margin healthy compared to target?',
    ],
  },
  {
    title: 'Diagnostics',
    icon: AlertTriangle,
    accent: 'text-rose-700 bg-rose-50 ring-rose-700/10',
    questions: [
      'What is going wrong about my business right now?',
      'Where am I spending or losing the most money?',
    ],
  },
  {
    title: 'Growth',
    icon: Lightbulb,
    accent: 'text-amber-700 bg-amber-50 ring-amber-700/10',
    questions: [
      'What can I improve to increase my profits?',
      'Which expenses should I reduce first?',
    ],
  },
  {
    title: 'Tax & compliance',
    icon: ShieldCheck,
    accent: 'text-primary-700 bg-primary-50 ring-primary-700/10',
    questions: [
      'What is my tax payable and next NRS deadline?',
      'How much revenue is tied up in unpaid invoices?',
    ],
  },
];

const FOLLOW_UPS = [
  'Where am I spending the most money?',
  'What is my tax payable and next NRS deadline?',
  'What can I improve to increase my profits?',
];

const MAX_MESSAGES = 40;
const chatsKey = (id: string) => `ai_chats_${id}`;
const activeKey = (id: string) => `ai_active_${id}`;

function deriveTitle(messages: Message[]) {
  const first = messages.find((m) => m.role === 'user')?.content ?? '';
  const flat = first.replace(/\s+/g, ' ').trim();
  if (!flat) return 'Untitled chat';
  return flat.length > 46 ? `${flat.slice(0, 46)}…` : flat;
}

function dayBucket(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const days = Math.round((b - a) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  return 'Earlier';
}

function relTime(ts: number) {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
  });
}

function clockTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-NG', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function readChats(bizId: string): Chat[] {
  const key = chatsKey(bizId);
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      localStorage.removeItem(key);
    }
  }

  // Migrate the pre-history single-thread key so nobody loses a conversation.
  const legacy = localStorage.getItem(`ai_chat_${bizId}`);
  if (legacy) {
    try {
      const messages = JSON.parse(legacy);
      if (Array.isArray(messages) && messages.length) {
        const chat: Chat = {
          id: crypto.randomUUID(),
          title: deriveTitle(messages),
          createdAt: messages[0].timestamp,
          updatedAt: messages[messages.length - 1].timestamp,
          messages,
        };
        localStorage.setItem(key, JSON.stringify([chat]));
        localStorage.removeItem(`ai_chat_${bizId}`);
        return [chat];
      }
    } catch {
      localStorage.removeItem(`ai_chat_${bizId}`);
    }
  }
  return [];
}

// ── Inline markdown: **bold**, *italic*, `code` ──────────────────────
function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} className='font-semibold text-gray-900'>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={key}
          className='rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-primary-800'
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={key} className='italic text-gray-700'>
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function FormattedMessage({ content }: { content: string }) {
  const blocks = content.split('\n');
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  let ordered: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    out.push(
      <ul key={`ul-${out.length}`} className='my-2 space-y-1.5'>
        {bullets.map((b, i) => (
          <li
            key={i}
            className='flex gap-2.5 text-[0.9375rem] leading-relaxed text-gray-700'
          >
            <span className='mt-[0.5rem] h-1 w-1 shrink-0 rounded-full bg-gray-300' />
            <span>{renderInline(b, `b-${out.length}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  const flushOrdered = () => {
    if (!ordered.length) return;
    out.push(
      <ol key={`ol-${out.length}`} className='my-2 space-y-1.5'>
        {ordered.map((o, i) => (
          <li
            key={i}
            className='flex gap-2.5 text-[0.9375rem] leading-relaxed text-gray-700'
          >
            <span className='mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold tabular-nums text-gray-600'>
              {i + 1}
            </span>
            <span>{renderInline(o, `o-${out.length}-${i}`)}</span>
          </li>
        ))}
      </ol>,
    );
    ordered = [];
  };

  blocks.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      flushOrdered();
      return;
    }

    const bulletMatch = line.match(/^[-•*]\s+(.*)$/);
    const orderedMatch = line.match(/^(\d+)[.)]\s+(.*)$/);

    if (bulletMatch) {
      flushOrdered();
      bullets.push(bulletMatch[1]);
      return;
    }
    if (orderedMatch) {
      flushBullets();
      ordered.push(orderedMatch[2]);
      return;
    }

    flushBullets();
    flushOrdered();

    if (line.startsWith('#### ')) {
      out.push(
        <h4 key={i} className='mt-4 mb-1.5 text-sm font-semibold text-gray-900'>
          {renderInline(line.slice(5), `h4-${i}`)}
        </h4>,
      );
      return;
    }
    if (line.startsWith('### ') || line.startsWith('## ')) {
      out.push(
        <h3
          key={i}
          className='mt-5 mb-2 text-base font-semibold tracking-tight text-gray-900'
        >
          {renderInline(line.replace(/^#{2,3}\s+/, ''), `h3-${i}`)}
        </h3>,
      );
      return;
    }

    out.push(
      <p
        key={i}
        className='my-1.5 text-[0.9375rem] leading-relaxed text-gray-700'
      >
        {renderInline(line, `p-${i}`)}
      </p>,
    );
  });

  flushBullets();
  flushOrdered();
  return <div>{out}</div>;
}

function TypingDots() {
  return (
    <div className='flex items-center gap-1.5 py-1.5'>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className='h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400'
          style={{ animationDelay: `${i * 140}ms`, animationDuration: '1s' }}
        />
      ))}
      <span className='ml-2.5 text-xs text-gray-400'>
        Analysing your books…
      </span>
    </div>
  );
}

export default function AIAssistant() {
  const biz = useBusinessStore((s) => s.activeBusiness);
  const bizId = biz?.id ?? '';
  const { blockIfNeeded, writesBlocked } = useSubscriptionWriteGate();

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!bizId) {
      setChats([]);
      setActiveId(null);
      return;
    }
    const loaded = readChats(bizId);
    setChats(loaded);
    const storedActive = localStorage.getItem(activeKey(bizId));
    setActiveId(
      loaded.some((c) => c.id === storedActive)
        ? storedActive
        : (loaded[0]?.id ?? null),
    );
    setInput('');
    setShowScrollBtn(false);
    setHydrated(true);
  }, [bizId]);

  useEffect(() => {
    if (!bizId || !hydrated) return;
    localStorage.setItem(chatsKey(bizId), JSON.stringify(chats));
    if (activeId) localStorage.setItem(activeKey(bizId), activeId);
  }, [chats, activeId, bizId, hydrated]);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeId) ?? null,
    [chats, activeId],
  );
  const messages = useMemo(() => activeChat?.messages ?? [], [activeChat]);

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt - a.updatedAt),
    [chats],
  );

  const groupedChats = useMemo(() => {
    const groups: Array<{ label: string; items: Chat[] }> = [];
    for (const chat of sortedChats) {
      const label = dayBucket(chat.updatedAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(chat);
      else groups.push({ label, items: [chat] });
    }
    return groups;
  }, [sortedChats]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  // Follow the thread only while already near the bottom, so reading back
  // through earlier answers isn't yanked away.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 180) {
      scrollToBottom(messages.length === 0 ? 'auto' : 'smooth');
    }
  }, [messages, loading, scrollToBottom]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () =>
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, 160);
    ta.style.height = `${next}px`;
    setExpanded(next > 48);
  }, [input]);

  const patchChat = useCallback((chatId: string, fn: (chat: Chat) => Chat) => {
    setChats((prev) => prev.map((c) => (c.id === chatId ? fn(c) : c)));
  }, []);

  const sendMessage = async (text: string, base?: Message[]) => {
    if (blockIfNeeded()) return;
    if (!text.trim() || !bizId || loading) return;

    const query = text.trim();
    const now = Date.now();
    const history = base ?? messages;

    let chatId = activeId;
    if (!chatId) {
      chatId = crypto.randomUUID();
      setChats((prev) => [
        ...prev,
        {
          id: chatId as string,
          title: query.slice(0, 46),
          createdAt: now,
          updatedAt: now,
          messages: [],
        },
      ]);
      setActiveId(chatId);
    }

    const userMessage: Message = {
      id: `${now}-u`,
      role: 'user',
      content: query,
      timestamp: now,
    };
    patchChat(chatId, (c) => ({
      ...c,
      title: c.messages.length ? c.title : deriveTitle([userMessage]),
      updatedAt: now,
      messages: [...c.messages, userMessage],
    }));

    setInput('');
    setLoading(true);

    try {
      const response = await api.post(`/businesses/${bizId}/ai/chat`, {
        message: query,
        history: history
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.content })),
      });

      const reply =
        response.data.data?.reply ||
        response.data.reply ||
        'I read your records but could not produce an answer. Please rephrase and try again.';

      const replyMessage: Message = {
        id: `${Date.now()}-a`,
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };
      patchChat(chatId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: [...c.messages, replyMessage].slice(-MAX_MESSAGES),
      }));
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        'Something went wrong reaching the analysis service.';
      const errorMessage: Message = {
        id: `${Date.now()}-a`,
        role: 'assistant',
        content: msg,
        timestamp: Date.now(),
        error: true,
      };
      patchChat(chatId, (c) => ({
        ...c,
        messages: [...c.messages, errorMessage].slice(-MAX_MESSAGES),
      }));
      toast.error('Could not reach the assistant');
    } finally {
      setLoading(false);
    }
  };

  const regenerate = () => {
    if (!activeChat) return;
    const lastUser = [...activeChat.messages]
      .reverse()
      .find((m) => m.role === 'user');
    if (!lastUser) return;
    const history = activeChat.messages.slice(
      0,
      activeChat.messages.lastIndexOf(lastUser),
    );
    patchChat(activeChat.id, (c) => ({ ...c, messages: history }));
    sendMessage(lastUser.content, history);
  };

  const copyMessage = async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId((c) => (c === msg.id ? null : c)), 1800);
    } catch {
      toast.error('Clipboard unavailable');
    }
  };

  const startNewChat = () => {
    setActiveId(null);
    setInput('');
    setShowScrollBtn(false);
    setDrawerOpen(false);
    textareaRef.current?.focus();
  };

  const deleteChat = (id: string) => {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? null);
      return next;
    });
    toast.success('Chat deleted');
  };

  const selectChat = (id: string) => {
    setActiveId(id);
    setShowScrollBtn(false);
    setDrawerOpen(false);
  };

  if (!biz) return <NoBusinessPrompt />;

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant')?.id;

  return (
    <div className='flex h-[calc(100vh-4rem)] bg-gray-50/70'>
      {drawerOpen && (
        <div
          className='fixed inset-0 z-30 bg-gray-900/20 lg:hidden'
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Chat history ─────────────────────────────────────────── */}
      <aside
        className={`fixed top-16 bottom-0 left-0 z-40 flex w-72 flex-col border-r border-gray-200 bg-white transition-transform duration-200 lg:relative lg:top-0 lg:z-auto lg:w-60 lg:shrink-0 lg:translate-x-0 ${
          drawerOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        }`}
      >
        <div className='flex h-14 shrink-0 items-center justify-between px-3'>
          <h2 className='text-sm font-semibold tracking-tight text-gray-900'>
            Chats
          </h2>
          <button
            onClick={startNewChat}
            className='inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700'
          >
            <Plus className='h-3.5 w-3.5' />
            New
          </button>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-2 pb-3'>
          {sortedChats.length === 0 ? (
            <p className='px-2 py-8 text-center text-xs leading-relaxed text-gray-400'>
              Your past conversations will appear here.
            </p>
          ) : (
            groupedChats.map((group) => (
              <div key={group.label} className='mb-3'>
                <p className='px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400'>
                  {group.label}
                </p>
                <ul className='space-y-0.5'>
                  {group.items.map((chat) => {
                    const active = chat.id === activeId;
                    return (
                      <li key={chat.id} className='group/chat relative'>
                        <button
                          onClick={() => selectChat(chat.id)}
                          className={`flex w-full items-center gap-2 rounded-lg py-2 pl-2.5 pr-9 text-left transition-colors ${
                            active
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <MessageSquare
                            className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-gray-900' : 'text-gray-300'}`}
                          />
                          <span className='min-w-0 flex-1'>
                            <span className='block truncate text-[0.8125rem] font-medium leading-tight'>
                              {chat.title}
                            </span>
                            <span className='mt-0.5 block text-[10px] leading-tight text-gray-400'>
                              {chat.messages.length}{' '}
                              {chat.messages.length === 1
                                ? 'message'
                                : 'messages'}{' '}
                              · {relTime(chat.updatedAt)}
                            </span>
                          </span>
                        </button>
                        <button
                          onClick={() => deleteChat(chat.id)}
                          aria-label={`Delete chat: ${chat.title}`}
                          className='absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-gray-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 group-hover/chat:opacity-100'
                        >
                          <Trash2 className='h-3.5 w-3.5' />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Conversation ────────────────────────────────────────── */}
      <div className='flex min-w-0 flex-1 flex-col'>
        <header className='shrink-0 border-b border-gray-200 bg-white/80 backdrop-blur-sm'>
          <div className='flex h-14 items-center justify-between gap-2 px-3 sm:px-5'>
            <div className='flex min-w-0 items-center gap-2.5'>
              <button
                onClick={() => setDrawerOpen((d) => !d)}
                aria-label='Toggle chat history'
                className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 lg:hidden'
              >
                <PanelLeft className='h-4 w-4' />
              </button>
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white'>
                <ChartLine className='h-4 w-4' />
              </div>
              <div className='min-w-0'>
                <h1 className='truncate text-sm font-semibold leading-tight tracking-tight text-gray-900'>
                  Financial Assistant
                </h1>
                <p className='truncate text-[11px] leading-tight text-gray-500'>
                  {biz.businessName}
                </p>
              </div>
            </div>
            <button
              onClick={startNewChat}
              className='inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900'
            >
              <Plus className='h-3.5 w-3.5' />
              <span className='hidden sm:inline'>New chat</span>
            </button>
          </div>
        </header>

        <div className='relative flex-1'>
          <div ref={scrollerRef} className='h-full overflow-y-auto'>
            <div className='mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8'>
              {messages.length === 0 ? (
                <div className='flex min-h-[60vh] flex-col justify-center'>
                  <div className='mb-8 text-center'>
                    <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-white'>
                      <ChartLine className='h-5 w-5' />
                    </div>
                    <h2 className='text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl'>
                      What would you like to know?
                    </h2>
                    <p className='mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500'>
                      Ask about sales, expenses, margins, debtors or your NRS
                      obligations — answers come straight from your live
                      records.
                    </p>
                  </div>

                  <div className='grid gap-2.5 sm:grid-cols-2'>
                    {QUESTION_CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      return (
                        <div
                          key={cat.title}
                          className='rounded-2xl border border-gray-200 bg-white p-3.5 transition-colors hover:border-gray-300'
                        >
                          <div className='mb-2 flex items-center gap-2'>
                            <span
                              className={`flex h-6 w-6 items-center justify-center rounded-md ring-1 ring-inset ${cat.accent}`}
                            >
                              <Icon className='h-3.5 w-3.5' />
                            </span>
                            <span className='text-xs font-semibold text-gray-800'>
                              {cat.title}
                            </span>
                          </div>
                          <div className='space-y-0.5'>
                            {cat.questions.map((q) => (
                              <button
                                key={q}
                                onClick={() => sendMessage(q)}
                                className='group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] leading-snug text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900'
                              >
                                <span className='flex-1'>{q}</span>
                                <Send className='h-3 w-3 shrink-0 text-gray-300 transition-colors group-hover:text-gray-600' />
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className='space-y-7'>
                  {messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={msg.id}
                        className={`group flex gap-3 ${isUser ? 'justify-end' : ''}`}
                      >
                        {!isUser && (
                          <div className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white'>
                            <ChartLine className='h-3.5 w-3.5' />
                          </div>
                        )}

                        <div
                          className={
                            isUser ? 'max-w-[85%] min-w-0' : 'min-w-0 flex-1'
                          }
                        >
                          {isUser ? (
                            <>
                              <div className='rounded-[26px] rounded-br-lg bg-gray-900 px-4 py-2.5 text-white'>
                                <p className='text-[0.9375rem] leading-relaxed whitespace-pre-wrap'>
                                  {msg.content}
                                </p>
                              </div>
                              <p className='mt-1 pr-1 text-right text-[10px] text-gray-400'>
                                {clockTime(msg.timestamp)}
                              </p>
                            </>
                          ) : (
                            <>
                              {msg.error ? (
                                <div className='flex items-start gap-2.5 rounded-[26px] rounded-tl-lg border border-rose-200 bg-rose-50 px-4 py-3'>
                                  <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-rose-600' />
                                  <div>
                                    <p className='text-sm font-medium text-rose-900'>
                                      Something went wrong
                                    </p>
                                    <p className='mt-0.5 text-[0.8125rem] leading-relaxed text-rose-700'>
                                      {msg.content}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className='rounded-[26px] rounded-tl-lg border border-gray-200 bg-white px-5 py-4 shadow-sm'>
                                  <FormattedMessage content={msg.content} />
                                </div>
                              )}

                              <div className='mt-1.5 flex items-center gap-1 pl-1'>
                                <button
                                  onClick={() => copyMessage(msg)}
                                  className='inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700'
                                >
                                  {copiedId === msg.id ? (
                                    <Check className='h-3 w-3 text-emerald-600' />
                                  ) : (
                                    <Copy className='h-3 w-3' />
                                  )}
                                  {copiedId === msg.id ? 'Copied' : 'Copy'}
                                </button>
                                {!msg.error && msg.id === lastAssistantId && (
                                  <button
                                    onClick={regenerate}
                                    disabled={loading}
                                    className='inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40'
                                  >
                                    <RotateCcw className='h-3 w-3' />
                                    Retry
                                  </button>
                                )}
                                <span className='ml-auto pr-1 text-[10px] text-gray-300'>
                                  {clockTime(msg.timestamp)}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {loading && (
                    <div className='flex gap-3'>
                      <div className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white'>
                        <ChartLine className='h-3.5 w-3.5' />
                      </div>
                      <div className='rounded-[26px] rounded-tl-lg border border-gray-200 bg-white px-5 py-4 shadow-sm'>
                        <TypingDots />
                      </div>
                    </div>
                  )}

                  {!loading && messages.length > 1 && (
                    <div className='flex flex-wrap items-center gap-2 pt-1'>
                      <span className='text-[11px] font-medium text-gray-400'>
                        Ask next
                      </span>
                      {FOLLOW_UPS.map((f) => (
                        <button
                          key={f}
                          onClick={() => sendMessage(f)}
                          className='rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900'
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}

                  <div ref={bottomRef} className='h-px' />
                </div>
              )}
            </div>
          </div>

          {showScrollBtn && messages.length > 0 && (
            <button
              onClick={() => scrollToBottom()}
              aria-label='Scroll to latest message'
              className='absolute bottom-4 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-md transition-colors hover:text-gray-900'
            >
              <ArrowDown className='h-4 w-4' />
            </button>
          )}
        </div>

        {/* ── Composer ───────────────────────────────────────────── */}
        <div className='shrink-0 border-t border-gray-200 bg-white/80 backdrop-blur-sm'>
          <div className='mx-auto max-w-3xl px-4 py-3.5 sm:px-6'>
            <div
              className={`flex items-end gap-2 border border-gray-200 bg-white p-2 transition-all duration-150 focus-within:border-gray-400 ${
                expanded ? 'rounded-3xl' : 'rounded-full'
              }`}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                rows={1}
                disabled={loading || writesBlocked}
                placeholder={writesBlocked ? 'Subscription expired — renew to ask AI questions' : 'Ask about sales, expenses, margins, debtors or tax…'}
                className='max-h-40 min-h-[2.25rem] flex-1 resize-none bg-transparent px-3 py-1.5 text-[0.9375rem] leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-hidden disabled:opacity-60'
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading || writesBlocked}
                aria-label='Send message'
                className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white transition-all hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400'
              >
                {loading ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <Send className='h-3.5 w-3.5' />
                )}
              </button>
            </div>
            <p className='mt-2 text-center text-[11px] text-gray-400'>
              Enter to send · Shift + Enter for a new line · Verify figures with
              your tax consultant
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
