'use client';

import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

const STORAGE_PREFIX = 'form-section:';

type FormSectionProps = {
  number?: number;
  title: string;
  description?: string;
  rightSlot?: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  collapsible?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
};

export function FormSection({
  number,
  title,
  description,
  rightSlot,
  defaultOpen = true,
  storageKey,
  collapsible = true,
  className,
  bodyClassName,
  children,
}: FormSectionProps) {
  const [open, setOpen] = React.useState<boolean>(defaultOpen);

  React.useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
      if (stored === 'open') setOpen(true);
      else if (stored === 'closed') setOpen(false);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  function toggle() {
    if (!collapsible) return;
    setOpen((prev) => {
      const next = !prev;
      if (storageKey && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_PREFIX + storageKey, next ? 'open' : 'closed');
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }

  const headerId = React.useId();
  const panelId = React.useId();

  return (
    <section
      data-slot="form-section"
      data-open={open ? 'open' : 'closed'}
      className={cn(
        'overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5">
        <button
          type="button"
          id={headerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          disabled={!collapsible}
          className={cn(
            'group/section-header flex flex-1 items-center gap-2 text-left disabled:cursor-default',
            collapsible && 'cursor-pointer',
          )}
        >
          {collapsible ? (
            <span
              aria-hidden
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground transition-colors group-hover/section-header:text-foreground"
            >
              {open ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronRightIcon className="h-4 w-4" />
              )}
            </span>
          ) : null}
          <h2 className="font-heading text-base font-semibold leading-snug sm:text-lg">
            {number !== undefined ? (
              <span className="mr-1.5 text-muted-foreground">{number}.</span>
            ) : null}
            {title}
          </h2>
        </button>
        {rightSlot ? (
          <div className="shrink-0 text-right text-xs leading-tight text-muted-foreground">
            {rightSlot}
          </div>
        ) : null}
      </div>
      {description && open ? (
        <p className="-mt-1 px-4 pb-2 text-sm text-muted-foreground sm:px-5">{description}</p>
      ) : null}
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        hidden={!open}
        className={cn('border-t px-4 py-4 sm:px-5', bodyClassName)}
      >
        {children}
      </div>
    </section>
  );
}

type FormSubCardProps = {
  title: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
};

export function FormSubCard({
  title,
  action,
  className,
  bodyClassName,
  children,
}: FormSubCardProps) {
  return (
    <div
      data-slot="form-subcard"
      className={cn('overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10', className)}
    >
      <div className="flex items-center justify-between gap-2 bg-slate-800 px-3 py-2 text-white">
        <h3 className="text-sm font-semibold leading-snug">{title}</h3>
        {action ? <div className="text-xs text-white/80">{action}</div> : null}
      </div>
      <div className={cn('space-y-3 p-3 sm:p-4', bodyClassName)}>{children}</div>
    </div>
  );
}

type SectionTotalProps = {
  label: string;
  value: React.ReactNode;
  className?: string;
};

export function SectionTotal({ label, value, className }: SectionTotalProps) {
  return (
    <div className={cn('flex flex-col items-end gap-0.5', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-heading text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}
