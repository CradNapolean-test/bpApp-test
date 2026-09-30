// Generic pulsing placeholder block for loading.tsx route skeletons -- shape/size is set via
// className per call site rather than variants, since every skeleton here is a one-off shape.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-black/[.06] dark:bg-white/[.08] ${className}`} />;
}
