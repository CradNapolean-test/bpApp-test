import type { KeyboardEvent } from 'react';
import { tabKeyIndex } from '@/lib/menuKeys';

// Arrow-key support for a row of tabs (role="tablist" holding role="tab" buttons): Left and Right move focus between tabs (wrapping),
// Home and End jump to the ends. Enter and Space then choose the tab, as for any button. Put it on the tablist's onKeyDown.
export function handleTabListKeys(e: KeyboardEvent<HTMLElement>): void {
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'));
  const next = tabKeyIndex(e.key, tabs.indexOf(document.activeElement as HTMLElement), tabs.length);
  if (next === null) return;
  e.preventDefault();
  tabs[next]?.focus();
  tabs[next]?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}
