import type {
  Citation,
  Conversation,
  Health,
  Item,
  ItemDetail,
  ItemListResponse,
  Kind,
  Message,
  SearchHit,
  Status,
} from './types';

/**
 * The single module in this app that knows about backend URLs.
 * Components must never call `fetch` directly.
 */

const BASE = '/api';

/** Error thrown by every request helper, carrying the backend's `detail` message. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

/** Reads FastAPI's `{ "detail": "..." }` error body, falling back to the status code. */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (isRecord(data) && 'detail' in data) {
      const detail = data.detail;
      if (typeof detail === 'string' && detail.trim() !== '') return detail;
      if (detail !== undefined && detail !== null) return JSON.stringify(detail);
    }
  } catch {
    /* response body was not JSON */
  }
  return `Request failed with status ${res.status}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined && init.body !== null;
  if (hasBody && !isFormData(init.body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError('Could not reach the backend. Is it running on http://127.0.0.1:8000?');
  }

  if (!res.ok) throw new ApiError(await readErrorDetail(res), res.status);
  if (res.status === 204) return undefined as T;

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError('The backend returned a malformed response.', res.status);
  }
}

/* ------------------------------------------------------------------ health */

export function getHealth(): Promise<Health> {
  return request<Health>('/health');
}

/* ------------------------------------------------------------------- items */

export interface ItemListParams {
  kind?: Kind | 'all';
  q?: string;
  status?: Status;
  limit?: number;
  offset?: number;
}

export function listItems(params: ItemListParams = {}): Promise<ItemListResponse> {
  const search = new URLSearchParams();
  if (params.kind && params.kind !== 'all') search.set('kind', params.kind);
  if (params.q && params.q.trim() !== '') search.set('q', params.q.trim());
  if (params.status) search.set('status', params.status);
  if (typeof params.limit === 'number') search.set('limit', String(params.limit));
  if (typeof params.offset === 'number') search.set('offset', String(params.offset));
  const query = search.toString();
  return request<ItemListResponse>(`/items${query ? `?${query}` : ''}`);
}

export function getItem(id: string): Promise<ItemDetail> {
  return request<ItemDetail>(`/items/${encodeURIComponent(id)}`);
}

export interface CreateNoteInput {
  title: string;
  content: string;
  note?: string;
  tags?: string[];
}

export function createNote(input: CreateNoteInput): Promise<Item> {
  return request<Item>('/items/text', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface UploadInput {
  file: File;
  title?: string;
  note?: string;
  /** Comma separated tag string, as required by the multipart contract. */
  tags?: string;
}

/**
 * Uploads a file with `XMLHttpRequest` so real progress can be reported,
 * and supports cancellation through an `AbortSignal`.
 */
export function uploadItem(
  input: UploadInput,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<Item> {
  const { onProgress, signal } = options;

  return new Promise<Item>((resolve, reject) => {
    const form = new FormData();
    form.append('file', input.file);
    if (input.title) form.append('title', input.title);
    if (input.note) form.append('note', input.note);
    if (input.tags) form.append('tags', input.tags);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/items/upload`);
    xhr.responseType = 'text';

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Item);
        } catch {
          reject(new ApiError('Upload succeeded but the response could not be read.'));
        }
        return;
      }
      reject(new ApiError(parseXhrDetail(xhr), xhr.status));
    };

    xhr.onerror = () => reject(new ApiError('Upload failed — could not reach the backend.'));
    xhr.ontimeout = () => reject(new ApiError('Upload timed out.'));
    xhr.onabort = () => reject(new ApiError('Upload cancelled.'));

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}

function parseXhrDetail(xhr: XMLHttpRequest): string {
  try {
    const data: unknown = JSON.parse(xhr.responseText);
    if (isRecord(data) && 'detail' in data) {
      const detail = data.detail;
      if (typeof detail === 'string' && detail.trim() !== '') return detail;
      if (detail !== undefined && detail !== null) return JSON.stringify(detail);
    }
  } catch {
    /* fall through */
  }
  return `Upload failed with status ${xhr.status}`;
}

export function reprocessItem(id: string): Promise<Item> {
  return request<Item>(`/items/${encodeURIComponent(id)}/reprocess`, { method: 'POST' });
}

export function deleteItem(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Direct URL for an item's raw bytes — used by `<img>`, `<audio>`, `<video>` and "open original". */
export function itemFileUrl(id: string): string {
  return `${BASE}/items/${encodeURIComponent(id)}/file`;
}

/* ------------------------------------------------------------------ search */

export function searchItems(query: string, topK = 10): Promise<{ hits: SearchHit[] }> {
  return request<{ hits: SearchHit[] }>('/search', {
    method: 'POST',
    body: JSON.stringify({ query, top_k: topK }),
  });
}

/* ----------------------------------------------------------- conversations */

export function listConversations(): Promise<{ conversations: Conversation[] }> {
  return request<{ conversations: Conversation[] }>('/conversations');
}

export function createConversation(title?: string): Promise<Conversation> {
  return request<Conversation>('/conversations', {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  });
}

export function getConversation(id: string): Promise<{ conversation: Conversation; messages: Message[] }> {
  return request<{ conversation: Conversation; messages: Message[] }>(
    `/conversations/${encodeURIComponent(id)}`,
  );
}

export function renameConversation(id: string, title: string): Promise<Conversation> {
  return request<Conversation>(`/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export function deleteConversation(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* -------------------------------------------------------------------- chat */

export type ChatEvent =
  | { type: 'conversation'; conversation_id: string }
  | { type: 'retrieval'; hits: SearchHit[] }
  | { type: 'token'; text: string }
  | { type: 'notice'; notice: string }
  | { type: 'done'; message: Message }
  | { type: 'error'; message: string };

export interface ChatStreamRequest {
  conversation_id?: string | null;
  message: string;
  top_k?: number;
}

export interface ChatStreamHandlers {
  /** The transport is connected and frames may start arriving. */
  onOpen?: () => void;
  onConversation?: (conversationId: string) => void;
  onRetrieval?: (hits: SearchHit[]) => void;
  onToken?: (text: string) => void;
  /** A system explanation attached to the answer (never model output). */
  onNotice?: (notice: string) => void;
  onDone?: (message: Message) => void;
  onError?: (message: string) => void;
}

/** Rebuilds a `Message` from an untrusted stream payload, filling in safe defaults. */
function toMessage(raw: Record<string, unknown>): Message {
  return {
    id: typeof raw.id === 'string' ? raw.id : `stream-${Date.now()}`,
    conversation_id: typeof raw.conversation_id === 'string' ? raw.conversation_id : '',
    role: raw.role === 'user' ? 'user' : 'assistant',
    content: typeof raw.content === 'string' ? raw.content : '',
    citations: Array.isArray(raw.citations) ? (raw.citations as Citation[]) : [],
    created_at: typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString(),
  };
}

/** Validates one `data:` payload. Keeps the untyped SSE boundary in one place. */
function parseChatEvent(payload: string): ChatEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  switch (value.type) {
    case 'conversation':
      return typeof value.conversation_id === 'string'
        ? { type: 'conversation', conversation_id: value.conversation_id }
        : null;
    case 'retrieval':
      return Array.isArray(value.hits) ? { type: 'retrieval', hits: value.hits as SearchHit[] } : null;
    case 'token':
      return typeof value.text === 'string' ? { type: 'token', text: value.text } : null;
    case 'notice':
      return typeof value.notice === 'string' ? { type: 'notice', notice: value.notice } : null;
    case 'done':
      return isRecord(value.message) && typeof value.message.content === 'string'
        ? { type: 'done', message: toMessage(value.message) }
        : null;
    case 'error':
      return {
        type: 'error',
        message: typeof value.message === 'string' ? value.message : 'The assistant failed.',
      };
    default:
      return null;
  }
}

/**
 * Streams an assistant answer over Server-Sent Events.
 *
 * Each frame is exactly `data: <json>\n\n`. Partial frames are buffered between
 * chunk reads, so tokens are surfaced the instant they arrive.
 */
export async function streamChat(
  body: ChatStreamRequest,
  handlers: ChatStreamHandlers = {},
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError('Could not reach the backend. Is it running on http://127.0.0.1:8000?');
  }

  if (!res.ok) throw new ApiError(await readErrorDetail(res), res.status);
  if (!res.body) throw new ApiError('The chat stream returned no body.');

  handlers.onOpen?.();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopped = false;

  const dispatch = (event: ChatEvent): void => {
    switch (event.type) {
      case 'conversation':
        handlers.onConversation?.(event.conversation_id);
        return;
      case 'retrieval':
        handlers.onRetrieval?.(event.hits);
        return;
      case 'token':
        handlers.onToken?.(event.text);
        return;
      case 'notice':
        handlers.onNotice?.(event.notice);
        return;
      case 'done':
        handlers.onDone?.(event.message);
        return;
      case 'error':
        handlers.onError?.(event.message);
        stopped = true;
        return;
    }
  };

  const consumeFrame = (frame: string): void => {
    for (const line of frame.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || !trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '') continue;
      if (payload === '[DONE]') {
        stopped = true;
        return;
      }
      const event = parseChatEvent(payload);
      if (event) dispatch(event);
      if (stopped) return;
    }
  };

  const drain = (flushAll: boolean): void => {
    for (;;) {
      const boundary = buffer.indexOf('\n\n');
      if (boundary === -1) {
        if (!flushAll) return;
        // The last frame may arrive without its trailing blank line.
        const tail = buffer.trim();
        buffer = '';
        if (tail !== '') consumeFrame(tail);
        return;
      }
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      consumeFrame(frame);
      if (stopped) return;
    }
  };

  try {
    while (!stopped) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes('\r\n')) buffer = buffer.replace(/\r\n/g, '\n');
      drain(false);
    }
    if (!stopped) drain(true);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* reader already released */
    }
  }
}
