import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'danger-solid' | 'icon';
type Size = 'sm' | 'md';

// Single source of truth for button styling, keyed off the CSS variables in globals.css
// (--accent/--accent-foreground/--danger) rather than raw Tailwind colours -- that's what
// makes every variant automatically reskin correctly between the client view (teal accent)
// and the coach view ([data-view="coach"], black/white accent) with zero per-component work.
const VARIANT_CLS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-foreground hover:opacity-90',
  outline: 'border border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5',
  ghost: 'text-zinc-600 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/5',
  danger: 'text-danger hover:bg-danger/10',
  'danger-solid': 'bg-danger text-white hover:opacity-90',
  icon: 'text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5',
};

const SIZE_CLS: Record<Exclude<Variant, 'icon'>, Record<Size, string>> = {
  primary: { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' },
  outline: { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' },
  ghost: { sm: 'px-2 py-1 text-xs', md: 'px-3 py-1.5 text-sm' },
  danger: { sm: 'px-2 py-1 text-xs', md: 'px-3 py-1.5 text-sm' },
  'danger-solid': { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' },
};

const ICON_SIZE_CLS: Record<Size, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
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
  const shapeCls = variant === 'icon' ? 'flex items-center justify-center rounded-md' : 'rounded-md font-medium';
  return (
    <button
      className={`${shapeCls} ${VARIANT_CLS[variant]} ${sizeCls} shrink-0 whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
