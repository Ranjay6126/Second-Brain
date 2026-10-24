import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { NotebookPen, Paperclip, UploadCloud, X } from 'lucide-react';
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
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none';

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
        <SectionTitle hint={tab === 'file' ? 'Choose a file to add.' : 'Write a short note.'}>
          Upload
        </SectionTitle>
        {variant === 'modal' ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close upload panel"
            data-focus-ring
            className="rounded-md p-2 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="mt-4 inline-flex rounded-md border border-gray-300 p-1">
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
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors duration-150',
                active ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              <Icon className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {entry.label}
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
              'flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-6 py-8 text-center transition-colors duration-150',
              dragActive ? 'border-gray-400 bg-gray-100' : 'border-gray-300 hover:border-gray-400',
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
            />
            <UploadCloud className="h-6 w-6 text-gray-500" aria-hidden="true" />
            <span className="mt-3 text-sm text-gray-900">
              {dragActive ? 'Drop it here' : 'Drag & drop a file here'}
            </span>
            <span className="mt-1 text-xs text-gray-500">
              or <span className="text-gray-700 underline">browse</span> · text, PDF, image, audio, video
            </span>
          </label>

          {file ? (
            <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-200">
                <Paperclip className="h-4 w-4 text-gray-500" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-900" title={file.name}>
                  {file.name}
                </span>
                <span className="block text-xs text-gray-500">
                  {formatBytes(file.size)} · {file.type || 'unknown type'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => resetFileForm()}
                aria-label="Remove selected file"
                data-focus-ring
                className="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-200 hover:text-gray-700"
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
              <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
                <span>Uploading…</span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-gray-200">
                <div className="h-full rounded bg-blue-600" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!file || uploading}
            data-focus-ring
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload file'}
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
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingNote ? 'Saving…' : 'Add note'}
          </button>
        </form>
      )}
    </>
  );

  if (variant === 'modal') {
    return (
      <div
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
          className="fixed inset-0 cursor-default bg-black/40"
        />
        <div className="relative my-auto w-full max-w-2xl rounded-md border border-gray-300 bg-white p-6">
          {body}
        </div>
      </div>
    );
  }

  return <div className="rounded-md border border-gray-200 bg-white p-5 sm:p-6">{body}</div>;
}

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-gray-600">
        {label}
        {hint ? <span className="font-normal text-gray-400">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
