import type { LucideIcon } from 'lucide-react';

// Two variants on purpose. The full block suits a main content area that is otherwise
// blank; `compact` is for inline spots -- a narrow sidebar, a search dropdown, one section
// of a six-section list -- where a centred icon block would be heavier than the thing it
// is describing.
export function EmptyState({
  icon: Icon,
  title,
  hint,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  compact?: boolean;
}) {
  if (compact) {
    return <p className="px-2 py-1.5 text-sm text-zinc-500">{title}</p>;
  }

  return (
    <div className="rounded-lg border border-dashed border-black/10 p-8 text-center dark:border-white/15">
      {Icon && <Icon className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />}
      <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">{hint}</p>}
    </div>
  );
}
