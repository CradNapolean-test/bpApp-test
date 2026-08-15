'use client';

import { useState } from 'react';
import { useAction } from './useAction';
import { applyTheme } from './theme';
import type { ThemePreference } from './theme';
import { setThemePreference } from '@/lib/data/theme';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function ThemeToggle({ initial }: { initial: ThemePreference }) {
  const { run } = useAction();
  const [preference, setPreference] = useState(initial);

  async function handleSelect(value: ThemePreference) {
    setPreference(value);
    applyTheme(value); // instant local feedback, no need to wait on the round trip
    await run(() => setThemePreference(value));
  }

  return (
    <div className="flex gap-1 rounded-xl border border-black/[.08] bg-[var(--background)] p-1 dark:border-white/[.12]">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => handleSelect(o.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            preference === o.value
              ? 'bg-accent text-accent-foreground'
              : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
