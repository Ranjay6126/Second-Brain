import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  FileUp,
  Loader2,
  NotebookPen,
  Paperclip,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { createNote, errorMessage, uploadItem } from '../lib/api';
import { cn, formatBytes } from '../lib/utils';
import { SectionTitle } from './SectionTitle';
import { useToast } from './Toast';

type UploadTab = 'file' | 'note';

interface UploadPanelProps {
  variant?: 'panel' | 'modal';
  onClose?: () => void;
  /** Fired after any successful mutation so the library can refresh. */
  onUploaded: () => void;
}

const ACCEPT = 'text/*,application/pdf,image/*,audio/*,video/*';

const FIELD =
  'w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none backdrop-blur-xl transition placeholder:text-slate-500 focus:border-indigo-400/40 focus:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-indigo-400/60';

function parseTags(value: string): string[] | undefined {
  const tags = value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
  return tags.length > 0 ? tags : undefined;
}

export function UploadPanel({ variant = 'panel', onClose, onUploaded }: UploadPanelProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<UploadTab>('file');

  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [fileNote, setFileNote] = useState('');
  const [fileTags, setFileTags] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (variant !== 'modal') return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [variant, onClose]);

  const acceptFile = (next: File | null) => {
    setFile(next);
    setProgress(0);
    if (next) {
      const base = next.name.replace(/\.[^.]+$/, '');
      setFileTitle((current) => (current.trim() === '' ? base : current));
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) acceptFile(dropped);
  };

  const resetFileForm = () => {
    acceptFile(null);
    setFileTitle('');
    setFileNote('');
    setFileTags('');
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || uploading) return;

    setUploading(true);
    setProgress(0);
    try {
      const created = await uploadItem(
        {
          file,
          title: fileTitle.trim() || undefined,
          note: fileNote.trim() || undefined,
          tags: fileTags.trim() || undefined,
        },
        { onProgress: setProgress },
      );
      toast(`“${created.title}” added — indexing in the background.`, 'success');
      resetFileForm();
      onUploaded();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleNoteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = noteTitle.trim();
    const content = noteContent.trim();

    if (title === '' || content === '') {
      toast('A note needs both a title and some content.', 'error');
      return;
    }

    setSavingNote(true);
    try {
      const created = await createNote({ title, content, tags: parseTags(noteTags) });
      toast(`“${created.title}” added to your brain.`, 'success');
      setNoteTitle('');
      setNoteContent('');
      setNoteTags('');
      onUploaded();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const body = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          hint={
            tab === 'file'
              ? 'Text, PDF, image, audio or video — the AI reads it for you.'
              : 'A quick markdown note that lives beside your files.'
          }
        >
          Add to your brain
        </SectionTitle>
        {variant === 'modal' ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close upload panel"
            data-focus-ring
            className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
        {(
          [
            { id: 'file' as const, label: 'File', icon: UploadCloud },
            { id: 'note' as const, label: 'Note', icon: NotebookPen },
          ]
        ).map((entry) => {
          const active = tab === entry.id;
          const Icon = entry.icon;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-pressed={active}
              data-focus-ring
              className={cn(
                'relative flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors',
                active ? 'text-white' : 'text-slate-400 hover:text-white',
              )}
            >
              {active ? (
                <motion.span
                  layoutId={`upload-tab-${variant}`}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              ) : null}
              <Icon className="relative h-3.5 w-3.5" aria-hidden="true" />
              <span className="relative">{entry.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'file' ? (
        <form onSubmit={handleFileSubmit} className="mt-5 space-y-4">
          <label
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
            }}
            onDrop={handleDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed px-6 py-9 text-center transition',
              dragActive
                ? 'border-indigo-400/60 bg-indigo-500/10'
                : 'border-white/15 bg-white/[0.02] hover:border-indigo-400/40 hover:bg-white/[0.04]',
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
            />
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-violet-500/25 ring-1 ring-inset ring-white/10">
              <UploadCloud className="h-5 w-5 text-indigo-200" aria-hidden="true" />
            </span>
            <span className="mt-3 text-sm font-medium text-white">
              {dragActive ? 'Drop it in' : 'Drag & drop a file here'}
            </span>
            <span className="mt-1 text-xs text-slate-400">
              or <span className="text-indigo-300 underline decoration-indigo-400/40 underline-offset-2">browse</span> ·
              text, PDF, image, audio, video
            </span>
          </label>

          {file ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                <Paperclip className="h-4 w-4 text-slate-300" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white" title={file.name}>
                  {file.name}
                </span>
                <span className="block text-[0.7rem] text-slate-500">
                  {formatBytes(file.size)} · {file.type || 'unknown type'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => resetFileForm()}
                aria-label="Remove selected file"
                data-focus-ring
                className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          <Field label="Title" hint="optional">
            <input
              value={fileTitle}
              onChange={(event) => setFileTitle(event.target.value)}
              placeholder="Give this item a memorable name"
              className={FIELD}
            />
          </Field>

          <Field label="Context note" hint="optional · sent to the AI">
            <textarea
              value={fileNote}
              onChange={(event) => setFileNote(event.target.value)}
              rows={3}
              placeholder="Why does this matter? Anything the AI should know while indexing."
              className={cn(FIELD, 'resize-y')}
            />
          </Field>

          <Field label="Tags" hint="comma separated">
            <input
              value={fileTags}
              onChange={(event) => setFileTags(event.target.value)}
              placeholder="research, to-read, thesis"
              className={FIELD}
            />
          </Field>

          {uploading ? (
            <div>
              <div className="mb-2 flex items-center justify-between text-[0.7rem] text-slate-400">
                <span>Uploading…</span>
                <span className="tabular-nums text-indigo-300">{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                />
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!file || uploading}
            data-focus-ring
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_36px_-14px_rgba(99,102,241,0.95)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {uploading ? 'Uploading…' : 'Add to Brain'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleNoteSubmit} className="mt-5 space-y-4">
          <Field label="Title">
            <input
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              placeholder="What is this thought about?"
              className={FIELD}
            />
          </Field>

          <Field label="Content" hint="markdown supported">
            <textarea
              value={noteContent}
              onChange={(event) => setNoteContent(event.target.value)}
              rows={7}
              placeholder="Write it down before it evaporates…"
              className={cn(FIELD, 'resize-y leading-relaxed')}
            />
          </Field>

          <Field label="Tags" hint="comma separated">
            <input
              value={noteTags}
              onChange={(event) => setNoteTags(event.target.value)}
              placeholder="idea, product, q3"
              className={FIELD}
            />
          </Field>

          <button
            type="submit"
            disabled={savingNote}
            data-focus-ring
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_36px_-14px_rgba(99,102,241,0.95)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {savingNote ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileUp className="h-4 w-4" aria-hidden="true" />
            )}
            {savingNote ? 'Saving…' : 'Add to Brain'}
          </button>
        </form>
      )}
    </>
  );

  if (variant === 'modal') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label="Add something to your brain"
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close upload panel"
          onClick={onClose}
          className="fixed inset-0 cursor-default bg-void-950/75 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="relative my-auto w-full max-w-2xl rounded-3xl border border-white/10 bg-void-900/95 p-6 shadow-[0_30px_90px_-30px_rgba(2,6,23,1)] backdrop-blur-2xl"
        >
          {body}
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl sm:p-6">{body}</div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">
        {label}
        {hint ? <span className="font-normal normal-case tracking-normal text-slate-500">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
