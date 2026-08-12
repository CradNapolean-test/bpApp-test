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
    <div>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Theme</h3>
      <div className="mt-2 flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => handleSelect(o.value)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              preference === o.value
                ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50'
                : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
