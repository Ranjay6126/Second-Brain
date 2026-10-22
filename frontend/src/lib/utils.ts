import {
  AudioLines,
  FileText,
  FileType,
  Image as ImageIcon,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { Kind } from './types';

/** Join conditional class names into a single string. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Human readable byte size, e.g. `4.2 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${BYTE_UNITS[exponent]}`;
}

/** Compact relative time, e.g. `3h ago`. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

/** Full local timestamp, e.g. `Mar 4, 2026, 09:12`. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `2026-03-04` key built from a date's local components. */
export function dayKeyFromDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `2026-03-04` key (local time) used for day bucketing. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dayKeyFromDate(date);
}

export function shortDayLabel(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return key;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`;
}

export function initialsOf(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return 'SN';
  const words = trimmed.split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() ?? '').join('');
}

export interface KindMeta {
  /** Singular label, e.g. `PDF`. */
  label: string;
  /** Plural label used in stats, e.g. `PDFs`. */
  plural: string;
  icon: LucideIcon;
  /** Icon tile background + foreground. */
  tile: string;
  /** Small badge pill. */
  badge: string;
  /** Gradient used by distribution bars. */
  bar: string;
  /** Solid swatch colour. */
  hex: string;
}

/** Per-kind accent system: emerald / amber / fuchsia / sky / rose. */
export const KIND_META: Record<Kind, KindMeta> = {
  text: {
    label: 'Text',
    plural: 'Notes',
    icon: FileText,
    tile: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/25',
    badge: 'bg-emerald-500/10 text-emerald-200 ring-1 ring-inset ring-emerald-400/25',
    bar: 'bg-gradient-to-r from-emerald-400 to-teal-400',
    hex: '#34d399',
  },
  pdf: {
    label: 'PDF',
    plural: 'PDFs',
    icon: FileType,
    tile: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/25',
    badge: 'bg-amber-500/10 text-amber-200 ring-1 ring-inset ring-amber-400/25',
    bar: 'bg-gradient-to-r from-amber-400 to-orange-400',
    hex: '#fbbf24',
  },
  image: {
    label: 'Image',
    plural: 'Images',
    icon: ImageIcon,
    tile: 'bg-fuchsia-500/15 text-fuchsia-300 ring-1 ring-inset ring-fuchsia-400/25',
    badge: 'bg-fuchsia-500/10 text-fuchsia-200 ring-1 ring-inset ring-fuchsia-400/25',
    bar: 'bg-gradient-to-r from-fuchsia-400 to-pink-400',
    hex: '#e879f9',
  },
  audio: {
    label: 'Audio',
    plural: 'Audio clips',
    icon: AudioLines,
    tile: 'bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/25',
    badge: 'bg-sky-500/10 text-sky-200 ring-1 ring-inset ring-sky-400/25',
    bar: 'bg-gradient-to-r from-sky-400 to-cyan-400',
    hex: '#38bdf8',
  },
  video: {
    label: 'Video',
    plural: 'Videos',
    icon: Video,
    tile: 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/25',
    badge: 'bg-rose-500/10 text-rose-200 ring-1 ring-inset ring-rose-400/25',
    bar: 'bg-gradient-to-r from-rose-400 to-red-400',
    hex: '#fb7185',
  },
};

export const KIND_ORDER: Kind[] = ['text', 'pdf', 'image', 'audio', 'video'];

/** Safe lookup for values that arrive from the API as plain strings. */
export function kindMeta(kind: string): KindMeta {
  return KIND_META[kind as Kind] ?? KIND_META.text;
}

export const GRADIENT_ACCENT = 'bg-gradient-to-br from-indigo-500 to-violet-500';
export const GRADIENT_TEXT =
  'bg-gradient-to-r from-indigo-300 via-violet-300 to-cyan-200 bg-clip-text text-transparent';
