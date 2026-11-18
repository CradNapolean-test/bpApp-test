import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'danger-solid' | 'danger-soft' | 'icon';
type Size = 'sm' | 'md';

// Single source of truth for button styling, keyed off the CSS variables in globals.css
// (--accent/--accent-foreground/--danger) rather than raw Tailwind colours.
// The November 2026 boards: 12px corners and 44px tall (36px small). A primary button is teal on the coach's screens and black on a
// member's (bp-btn-primary, globals.css), where teal is kept for booking and signing in.
const VARIANT_CLS: Record<Variant, string> = {
  primary: 'bp-btn-primary bg-accent font-extrabold text-accent-foreground hover:opacity-90',
  outline:
    'border-[1.5px] border-black/20 font-bold text-black hover:bg-black/[.03] dark:border-white/25 dark:text-zinc-50 dark:hover:bg-white/5',
  ghost: 'font-bold text-zinc-600 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/5',
  danger: 'font-bold text-danger hover:bg-danger/10',
  'danger-solid': 'bg-danger font-extrabold text-white hover:opacity-90',
  // Full-width treatment for a screen-level destructive action (e.g. Sign out) rather
  // than an inline row action -- persistently tinted, not just on hover, so it doesn't read
  // as a plain link.
  'danger-soft': 'border border-danger/20 bg-danger/10 font-bold text-danger hover:bg-danger/15',
  icon: 'text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5',
};

const SIZE_CLS: Record<Exclude<Variant, 'icon'>, Record<Size, string>> = {
  primary: { sm: 'min-h-9 px-3 text-[13px]', md: 'min-h-11 px-4 text-sm' },
  outline: { sm: 'min-h-9 px-3 text-[13px]', md: 'min-h-11 px-4 text-sm' },
  ghost: { sm: 'min-h-9 px-2.5 text-[13px]', md: 'min-h-11 px-3 text-sm' },
  danger: { sm: 'min-h-9 px-2.5 text-[13px]', md: 'min-h-11 px-3 text-sm' },
  'danger-solid': { sm: 'min-h-9 px-3 text-[13px]', md: 'min-h-11 px-4 text-sm' },
  'danger-soft': { sm: 'min-h-9 px-3 text-[13px]', md: 'min-h-12 px-4 text-sm' },
};

const ICON_SIZE_CLS: Record<Size, string> = {
  sm: 'h-9 w-9',
  md: 'h-10 w-10',
};

export function Button({
  variant = 'outline',
  size = 'md',
  className = '',
  children,
  ...props
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  children?: React.ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizeCls = variant === 'icon' ? ICON_SIZE_CLS[size] : SIZE_CLS[variant][size];
  const shapeCls =
    variant === 'icon'
      ? 'flex items-center justify-center rounded-full'
      : 'rounded-xl text-center';
  return (
    <button
      className={`${shapeCls} ${VARIANT_CLS[variant]} ${sizeCls} shrink-0 whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
