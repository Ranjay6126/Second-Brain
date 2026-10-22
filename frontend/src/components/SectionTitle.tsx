import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

interface SectionTitleProps {
  /** Heading text — rendered inside an `<h3>`. */
  children: ReactNode;
  /** Optional trailing content (filters, buttons). */
  right?: ReactNode;
  /** Optional helper line shown under the decorative bar. */
  hint?: ReactNode;
  className?: string;
  barClassName?: string;
}

/**
 * Every panel/section heading in the app: an `<h3>` with a short decorative
 * gradient underline bar directly beneath it.
 */
export function SectionTitle({ children, right, hint, className, barClassName }: SectionTitleProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h3 className="truncate text-[0.95rem] font-semibold tracking-tight text-white">{children}</h3>
        <span
          aria-hidden="true"
          className={cn(
            'mt-2 block h-[3px] w-12 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500',
            barClassName,
          )}
        />
        {hint ? <p className="mt-2 text-xs leading-relaxed text-slate-400">{hint}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
