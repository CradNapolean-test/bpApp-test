import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

// Shared building blocks for the member app (and, next, the coach side). Everything sits on the
// --card surface, uses one type scale (nothing below 11px), and one radius, so screens built
// from these can't drift apart the way hand-written class strings did.
//
// Type scale used across the app:
//   11px uppercase   section labels, badges, tab labels
//   12px             secondary text, captions
//   14px             body and row titles
//   16-18px          screen and card titles
//   24-32px          big numbers

// The one text-input style for forms (coach and member). Compact inline inputs (text-xs) keep
// their own smaller styling.
export const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm dark:border-white/10';

export const cardBase = 'rounded-2xl border border-black/[.06] bg-card dark:border-white/10';

export function Card({
  children,
  className = '',
  tone = 'default',
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'accent';
  // No inner padding -- for list groups that draw their own row padding.
  flush?: boolean;
}) {
  return (
    <div
      className={`${cardBase} ${tone === 'accent' ? '!border-accent/30 !bg-accent-soft' : ''} ${flush ? '' : 'p-4'} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`px-1 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 ${className}`}>{children}</p>
  );
}

export function IconChip({
  icon: Icon,
  tone = 'accent',
  size = 'md',
}: {
  icon: LucideIcon;
  tone?: 'accent' | 'muted';
  size?: 'sm' | 'md' | 'lg';
}) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-11 w-11 rounded-xl' : 'h-9 w-9 rounded-xl';
  const icon = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-5 w-5' : 'h-[18px] w-[18px]';
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${box} ${
        tone === 'accent' ? 'bg-accent/15 text-accent' : 'bg-black/5 text-zinc-500 dark:bg-white/10 dark:text-zinc-400'
      }`}
    >
      <Icon className={icon} />
    </span>
  );
}

export function Badge({
  children,
  tone = 'accent',
}: {
  children: ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'muted';
}) {
  const cls = {
    accent: 'bg-accent/15 text-accent',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/15 text-danger',
    muted: 'bg-black/5 text-zinc-500 dark:bg-white/10',
  }[tone];
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>
      {children}
    </span>
  );
}

// A grouped list of tappable rows in one card (settings-style). Rows are separated by hairlines.
export function ListGroup({ children }: { children: ReactNode }) {
  return <Card flush className="overflow-hidden">{children}</Card>;
}

export function ListRow({
  icon,
  title,
  subtitle,
  badge,
  onClick,
  href,
  disabled,
  trailing,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        {icon && <IconChip icon={icon} size="sm" tone={disabled ? 'muted' : 'accent'} />}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-black dark:text-zinc-50">{title}</span>
          {subtitle && <span className="block truncate text-xs text-zinc-500">{subtitle}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {badge}
        {trailing ?? (!disabled && (onClick || href) ? <ChevronRight className="h-4 w-4 text-zinc-400" /> : null)}
      </span>
    </>
  );
  const cls = `flex w-full items-center justify-between gap-3 border-b border-black/5 px-4 py-3 text-left last:border-b-0 dark:border-white/5 ${
    disabled ? 'opacity-50' : ''
  }`;
  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  if (onClick && !disabled) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

// A pill switch for choosing one of a few options (replaces native radio buttons, which render in
// the browser's default blue). `fill` stretches it to the full width on a phone.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  fill = false,
  size = 'sm',
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  fill?: boolean;
  // 'md' is a roomier control for forms, easier to hit with a thumb.
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex gap-1 rounded-full border border-black/10 p-0.5 dark:border-white/10 ${fill ? 'w-full sm:w-max' : 'w-max max-w-full overflow-x-auto'}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-full text-center font-bold transition-colors disabled:opacity-40 ${size === 'md' ? 'px-3.5 py-2.5 text-sm' : 'px-3.5 py-1.5 text-xs'} ${fill ? 'flex-1' : ''} ${
            value === o.value ? 'bg-accent text-accent-foreground' : 'text-zinc-500 hover:text-black dark:hover:text-zinc-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
