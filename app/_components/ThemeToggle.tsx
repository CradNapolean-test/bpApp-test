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
    // The boards' segmented switch: the chosen one white on a grey track.
    <div role="group" aria-label="Colour theme" className="flex gap-1 rounded-xl bg-black/[.06] p-1 dark:bg-white/10">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={preference === o.value}
          onClick={() => handleSelect(o.value)}
          className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-bold transition-colors ${
            preference === o.value
              ? 'bg-card text-black shadow-sm dark:text-zinc-50'
              : 'text-zinc-600 hover:text-black dark:text-zinc-300 dark:hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
