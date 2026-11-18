import type { ReactNode } from 'react';

// The coach screens' building blocks from the November 2026 mock-ups, so every page draws them the same way: the page heading (a small
// line above a large title, the page's buttons on the right), the strip of headline figures, and the white section card with its own
// heading row. Plain markup, usable from server and client components alike.

export const coachCard = 'rounded-[20px] border border-black/[.08] bg-card dark:border-white/10';
// Buttons: teal for the page's main action, a pale teal for an action on a row, and an outline for a quieter one.
export const coachBtnPrimary =
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground disabled:opacity-60';
export const coachBtnSoft =
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent-soft px-4 text-sm font-bold text-accent disabled:opacity-60';
export const coachBtnOutline =
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border-[1.5px] border-black/20 px-4 text-sm font-bold text-black disabled:opacity-60 dark:border-white/25 dark:text-zinc-50';
// The small capitals over a column of figures or a table.
export const coachEyebrow = 'text-xs font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400';

export function CoachPageHeader({
  eyebrow,
  title,
  actions,
  above,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  // Something over the heading, such as a link back to the list the page was opened from.
  above?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        {above}
        {eyebrow && <p className="text-sm text-zinc-500 dark:text-zinc-400">{eyebrow}</p>}
        <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em] text-black sm:text-[32px] dark:text-zinc-50">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

export interface CoachStat {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  // The figure in the darker teal (good news) or amber (needs attention).
  tone?: 'teal' | 'amber';
  href?: string;
}

// The headline figures in one white band, divided by hairlines; two to a row on a phone, all in a row from a tablet up.
export function CoachStatStrip({ label, stats }: { label: string; stats: CoachStat[] }) {
  const cols = stats.length >= 4 ? 'md:grid-cols-4' : stats.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2';
  return (
    <section aria-label={label} className={`grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-black/[.08] bg-black/[.08] dark:border-white/10 dark:bg-white/10 ${cols}`}>
      {stats.map((s) => {
        const body = (
          <>
            <span className={coachEyebrow}>{s.label}</span>
            <span
              className={`text-[28px] font-extrabold leading-tight sm:text-[34px] ${
                s.tone === 'teal' ? 'text-accent' : s.tone === 'amber' ? 'text-amber-700 dark:text-amber-400' : 'text-black dark:text-zinc-50'
              }`}
            >
              {s.value}
            </span>
            {s.sub && <span className="text-[13px] text-zinc-500 dark:text-zinc-400">{s.sub}</span>}
          </>
        );
        const cls = 'flex min-w-0 flex-col gap-1 bg-card px-5 py-4 sm:px-6 sm:py-5';
        return s.href ? (
          <a key={s.label} href={s.href} className={`${cls} transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]`}>
            {body}
          </a>
        ) : (
          <div key={s.label} className={cls}>
            {body}
          </div>
        );
      })}
    </section>
  );
}

// A white section with its own heading row (a title, a count, and a link or button on the right). Rows inside are the caller's, each
// with a hairline above it (coachRow).
export function CoachSection({
  title,
  count,
  action,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`overflow-hidden ${coachCard} ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pb-3.5 pt-[18px] sm:px-6">
        <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">
          {title}
          {count != null && <span className="font-semibold text-zinc-500 dark:text-zinc-400"> · {count}</span>}
        </h2>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export const coachRow = 'border-t border-black/[.07] px-5 sm:px-6 dark:border-white/10';
export const coachLink = 'text-sm font-bold text-accent hover:underline';
