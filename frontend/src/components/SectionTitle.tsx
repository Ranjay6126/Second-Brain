import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

interface SectionTitleProps {
  /** Heading text — rendered inside an `<h3>`. */
  children: ReactNode;
  /** Optional trailing content (filters, buttons). */
  right?: ReactNode;
  /** Optional helper line shown under the heading. */
  hint?: ReactNode;
  className?: string;
}

/** Panel/section heading: an `<h3>` with an optional trailing control and hint. */
export function SectionTitle({ children, right, hint, className }: SectionTitleProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h3 className="truncate text-lg font-semibold text-gray-900">{children}</h3>
        {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
