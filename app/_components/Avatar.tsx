// A handful of saturated hues, not the app's own accent colors, so avatars read as distinct
// per-person identity rather than blending into whichever role's accent is active.
const PALETTE = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-600',
  'bg-emerald-500', 'bg-cyan-600', 'bg-sky-500', 'bg-violet-500', 'bg-fuchsia-500',
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZE_CLS = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-base',
};

export function Avatar({ name, size = 'md' }: { name: string; size?: keyof typeof SIZE_CLS }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${SIZE_CLS[size]} ${colorFor(name)}`}
      aria-hidden
    >
      {initialsFor(name)}
    </div>
  );
}
