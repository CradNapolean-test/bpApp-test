import type { ClientHealthBucket } from '@/lib/data/coach';

// Colored pill, not just a gray dot + text -- replaces the near-identical STATUS_META shapes
// that used to be duplicated across ProgramHealth.tsx, ClientTable.tsx and ClientSidebar.tsx.
const META: Record<ClientHealthBucket, { label: string; bg: string; text: string; dot: string }> = {
  red: {
    label: 'Action required',
    bg: 'bg-red-100 dark:bg-red-950/40',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
  },
  amber: {
    label: 'Keep watch',
    bg: 'bg-amber-100 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  green: {
    label: 'Running okay',
    bg: 'bg-emerald-100 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  unmonitored: {
    label: 'Not monitored',
    bg: 'bg-zinc-100 dark:bg-zinc-800/60',
    text: 'text-zinc-600 dark:text-zinc-400',
    dot: 'bg-zinc-400 dark:bg-zinc-500',
  },
};

export function StatusBadge({ status }: { status: ClientHealthBucket }) {
  const m = META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${m.bg} ${m.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}
