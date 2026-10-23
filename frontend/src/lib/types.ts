/**
 * Shared API contract types.
 *
 * These mirror the backend response shapes exactly — do not invent new fields here
 * without updating the backend contract first.
 */

export type Kind = 'text' | 'pdf' | 'image' | 'audio' | 'video';
export type Status = 'processing' | 'ready' | 'failed';

export interface Item {
  id: string;
  title: string;
  kind: Kind;
  source: string;
  mime: string | null;
  size_bytes: number;
  file_url: string | null;
  note: string | null;
  summary: string | null;
  tags: string[];
  status: Status;
  error: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface ItemChunk {
  idx: number;
  text: string;
}

export interface ItemDetail extends Item {
  content: string | null;
  chunks: ItemChunk[];
}

export interface SearchHit {
  item_id: string;
  title: string;
  kind: Kind;
  chunk_idx: number;
  text: string;
  score: number;
  file_url: string | null;
}

export interface Citation {
  item_id: string;
  title: string;
  kind: Kind;
  chunk_idx: number;
  score: number;
  snippet: string;
  /** PDF page number, when the source is a PDF. */
  page?: number | null;
  /** Seconds into an audio/video source, rendered as "at 04:15". */
  timestamp?: number | null;
  end_timestamp?: number | null;
  /** Human readable location such as "page 12" or "at 04:15-05:02". */
  location?: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  created_at: string;
}

export interface Health {
  status: string;
  provider: 'local' | 'gemini' | 'openrouter' | 'groq' | 'pollinations';
  embed_model: string;
  chat_model: string;
  capabilities: Record<Kind, boolean>;
  top_k: number;
  index: { chunks: number; dim: number };
  key_configured: boolean;
  items: number;
  chunks: number;
}

export interface ItemListResponse {
  items: Item[];
  total: number;
}
