import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastRecord {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, { shell: string; icon: string }> = {
  success: {
    shell: 'border-green-200 bg-green-50 text-green-800',
    icon: 'text-green-600',
  },
  error: {
    shell: 'border-red-200 bg-red-50 text-red-800',
    icon: 'text-red-600',
  },
  info: {
    shell: 'border-blue-200 bg-blue-50 text-blue-800',
    icon: 'text-blue-600',
  },
};

const VARIANT_ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const text = message.trim();
      if (text === '') return;
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, message: text, variant }]);
      const timer = window.setTimeout(() => dismiss(id), variant === 'error' ? 7000 : 4200);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-24 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((item) => {
          const Icon = VARIANT_ICONS[item.variant];
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border px-4 py-3',
                VARIANT_STYLES[item.variant].shell,
              )}
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', VARIANT_STYLES[item.variant].icon)} aria-hidden="true" />
              <p className="flex-1 text-sm leading-snug">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                data-focus-ring
                className="rounded-md p-1 hover:bg-gray-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a <ToastProvider>.');
  }
  return context;
}
