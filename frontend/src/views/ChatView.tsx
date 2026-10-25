import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  Check,
  Info,
  MessageSquarePlus,
  MessagesSquare,
  PanelLeft,
  Pencil,
  SendHorizontal,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteConversation,
  errorMessage,
  getConversation,
  isAbortError,
  listConversations,
  renameConversation,
  streamChat,
} from '../lib/api';
import type { Conversation, Message, SearchHit } from '../lib/types';
import { cn, relativeTime } from '../lib/utils';
import { ChatMessage, RetrievalSkeleton } from '../components/ChatMessage';
import { EmptyState } from '../components/EmptyState';
import { SectionTitle } from '../components/SectionTitle';
import { SkeletonConversationRow } from '../components/Skeleton';
import { useToast } from '../components/Toast';

interface LiveAnswer {
  content: string;
  hits: SearchHit[] | null;
  startedAt: string;
}

interface ChatViewProps {
  onOpenItem: (itemId: string) => void;
}

const SUGGESTIONS = [
  'Summarize everything I saved about focus',
  'What did I save last week?',
  'What are the key ideas in my PDFs?',
  'Which topics do I keep coming back to?',
];

export function ChatView({ onOpenItem }: ChatViewProps) {
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState<LiveAnswer | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const liveContentRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await listConversations();
      setConversations(res.conversations);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }, [toast]);

  useEffect(() => {
    setConversationsLoading(true);
    void refreshConversations().finally(() => setConversationsLoading(false));
  }, [refreshConversations]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, live?.content, live?.hits, messagesLoading, notice]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 168)}px`;
  }, [draft]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      setActiveId(id);
      setLive(null);
      setNotice(null);
      setRailOpen(false);
      setMessagesLoading(true);
      try {
        const res = await getConversation(id);
        setMessages(res.messages);
      } catch (error) {
        toast(errorMessage(error), 'error');
        setMessages([]);
      } finally {
        setMessagesLoading(false);
      }
    },
    [toast],
  );

  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setLive(null);
    setNotice(null);
    setRailOpen(false);
    setDraft('');
    textareaRef.current?.focus();
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (text === '' || streaming) return;

      const conversationId = activeId;
      const localUserId = `local-user-${Date.now()}`;
      const localUser: Message = {
        id: localUserId,
        conversation_id: conversationId ?? '',
        role: 'user',
        content: text,
        citations: [],
        created_at: new Date().toISOString(),
      };

      setDraft('');
      setMessages((current) => [...current, localUser]);
      setLive({ content: '', hits: null, startedAt: new Date().toISOString() });
      setNotice(null);
      liveContentRef.current = '';
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      let finished = false;

      const finalize = () => {
        const partial = liveContentRef.current.trim();
        if (partial !== '') {
          const partialMessage: Message = {
            id: `local-assistant-${Date.now()}`,
            conversation_id: conversationId ?? '',
            role: 'assistant',
            content: partial,
            citations: [],
            created_at: new Date().toISOString(),
          };
          setMessages((current) => [...current, partialMessage]);
        }
        setLive(null);
      };

      try {
        await streamChat(
          { conversation_id: conversationId, message: text, top_k: 8 },
          {
            onConversation: (id) => setActiveId(id),
            onRetrieval: (hits) => setLive((current) => (current ? { ...current, hits } : current)),
            onToken: (token) => {
              liveContentRef.current += token;
              setLive((current) => (current ? { ...current, content: current.content + token } : current));
            },
            onNotice: (value) => setNotice(value),
            onDone: (finalMessage) => {
              finished = true;
              setMessages((current) => [...current, finalMessage]);
              setLive(null);
              liveContentRef.current = '';
              void refreshConversations();
            },
            onError: (message) => {
              toast(message, 'error');
            },
          },
          controller.signal,
        );
        if (!finished) finalize();
      } catch (error) {
        if (isAbortError(error)) {
          finalize();
          toast('Generation stopped.', 'info');
        } else {
          toast(errorMessage(error), 'error');
          finalize();
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [activeId, refreshConversations, streaming, toast],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send(draft);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  };

  const handleDeleteConversation = async (conversation: Conversation) => {
    try {
      await deleteConversation(conversation.id);
      toast('Conversation deleted.', 'success');
      if (activeId === conversation.id) {
        setActiveId(null);
        setMessages([]);
        setLive(null);
      }
      await refreshConversations();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  const commitRename = async (conversation: Conversation) => {
    const title = editingTitle.trim();
    setEditingId(null);
    if (title === '' || title === conversation.title) return;
    try {
      const updated = await renameConversation(conversation.id, title);
      setConversations((current) =>
        current.map((entry) => (entry.id === updated.id ? { ...entry, title: updated.title } : entry)),
      );
      toast('Conversation renamed.', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  const showThread = messages.length > 0 || live !== null;

  return (
    <div className="flex h-[calc(100dvh-13.5rem)] min-h-[30rem] gap-5 md:h-[calc(100dvh-9rem)]">
      {railOpen ? (
        <button
          type="button"
          aria-label="Close conversations"
          onClick={() => setRailOpen(false)}
          className="fixed inset-0 z-30 cursor-default bg-black/40 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          'z-40 flex-col overflow-hidden rounded-md border border-gray-300 bg-white',
          'fixed inset-y-3 left-3 w-[86%] max-w-sm p-4',
          railOpen ? 'flex' : 'hidden',
          'lg:static lg:inset-auto lg:flex lg:w-72 lg:max-w-none',
        )}
      >
        <SectionTitle
          hint={`${conversations.length} ${conversations.length === 1 ? 'thread' : 'threads'}`}
          right={
            <button
              type="button"
              onClick={() => setRailOpen(false)}
              aria-label="Close conversations"
              data-focus-ring
              className="rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-100 lg:hidden"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          }
        >
          Conversations
        </SectionTitle>

        <button
          type="button"
          onClick={startNewChat}
          data-focus-ring
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors duration-150 hover:bg-blue-700"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          New chat
        </button>

        <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {conversationsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, index) => (
                <SkeletonConversationRow key={index} />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-gray-500">
              No conversations yet. Ask your first question to get started.
            </p>
          ) : (
            conversations.map((conversation) => {
              const active = conversation.id === activeId;
              const editing = editingId === conversation.id;
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    'group relative rounded-md border transition-colors duration-150',
                    active
                      ? 'border-gray-300 bg-gray-100'
                      : 'border-transparent hover:bg-gray-50',
                  )}
                >
                  {editing ? (
                    <div className="flex items-center gap-1 p-2">
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void commitRename(conversation);
                          }
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={() => void commitRename(conversation)}
                        aria-label="Conversation title"
                        className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => void commitRename(conversation)}
                        aria-label="Save title"
                        className="rounded-md p-1.5 text-gray-700 transition-colors duration-150 hover:bg-gray-100"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1">
                      <button
                        type="button"
                        onClick={() => void openConversation(conversation.id)}
                        onDoubleClick={() => {
                          setEditingId(conversation.id);
                          setEditingTitle(conversation.title);
                        }}
                        data-focus-ring
                        title="Double-click to rename"
                        className="min-w-0 flex-1 rounded-md px-3 py-2.5 text-left"
                      >
                        <span className={cn('block truncate text-xs font-medium', active ? 'text-gray-900' : 'text-gray-700')}>
                          {conversation.title || 'Untitled chat'}
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                          <span>{relativeTime(conversation.updated_at)}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {conversation.message_count}{' '}
                            {conversation.message_count === 1 ? 'msg' : 'msgs'}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 flex-col gap-1 py-2 pr-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(conversation.id);
                            setEditingTitle(conversation.title);
                          }}
                          aria-label={`Rename ${conversation.title || 'conversation'}`}
                          data-focus-ring
                          className="rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteConversation(conversation)}
                          aria-label={`Delete ${conversation.title || 'conversation'}`}
                          data-focus-ring
                          className="rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-gray-300 bg-white">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3.5 sm:px-5">
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label="Show conversations"
            data-focus-ring
            className="rounded-md border border-gray-300 bg-white p-2 text-gray-600 transition-colors duration-150 hover:text-gray-900 lg:hidden"
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {activeConversation?.title ?? 'New chat'}
            </h3>
          </div>

          {streaming ? (
            <span className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600">
              Thinking…
            </span>
          ) : (
            <button
              type="button"
              onClick={startNewChat}
              aria-label="Start a new chat"
              data-focus-ring
              className="hidden shrink-0 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 transition-colors duration-150 hover:bg-gray-50 sm:flex"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
              New chat
            </button>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
          {messagesLoading ? (
            <div className="space-y-3">
              <div className="skeleton ml-auto h-14 w-2/3 rounded-md" />
              <div className="skeleton h-24 w-4/5 rounded-md" />
              <div className="skeleton ml-auto h-12 w-1/2 rounded-md" />
            </div>
          ) : !showThread ? (
            <EmptyState
              icon={Sparkles}
              title="No messages yet"
              description="Ask a question about your items."
            >
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setDraft(suggestion);
                      textareaRef.current?.focus();
                    }}
                    data-focus-ring
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 transition-colors duration-150 hover:bg-gray-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </EmptyState>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  citations={message.citations ?? []}
                  createdAt={message.created_at}
                  onOpenCitation={onOpenItem}
                />
              ))}

              {live ? (
                live.content.trim() === '' ? (
                  <RetrievalSkeleton hits={live.hits ?? []} />
                ) : (
                  <ChatMessage
                    role="assistant"
                    content={live.content}
                    citations={[]}
                    createdAt={live.startedAt}
                    streaming
                    onOpenCitation={onOpenItem}
                  />
                )
              ) : null}

              {notice ? (
                <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <p className="min-w-0">{notice}</p>
                </div>
              ) : null}
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-gray-200 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-end gap-2 rounded-md border border-gray-300 bg-white p-2 transition-colors duration-150 focus-within:border-blue-500">
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask your brain anything…"
              aria-label="Message"
              disabled={streaming}
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stopStreaming}
                data-focus-ring
                className="flex shrink-0 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50"
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={draft.trim() === ''}
                aria-label="Send message"
                data-focus-ring
                className="flex shrink-0 items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Send</span>
              </button>
            )}
          </div>
          <p className="mt-2 flex items-center gap-1.5 px-2 text-xs text-gray-500">
            <MessagesSquare className="h-3 w-3" aria-hidden="true" />
            Enter to send · Shift + Enter for a new line
          </p>
        </form>
      </section>
    </div>
  );
}
