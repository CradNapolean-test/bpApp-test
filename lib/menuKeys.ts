// Keyboard behaviour of a pop-up menu or list of choices (UI1, GS2): arrow keys move, Home and End jump, Escape closes. Pure, so the key map is
// tested; app/_components/useMenuKeys.ts applies it.

export type MenuKeyAction = { type: 'move'; index: number } | { type: 'close' } | null;

// `current` is the index of the item that has focus, or -1 when focus is on the trigger or nowhere in the list. Arrows wrap round.
export function menuKeyAction(key: string, current: number, count: number): MenuKeyAction {
  if (key === 'Escape') return { type: 'close' };
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown':
      return { type: 'move', index: current < 0 ? 0 : (current + 1) % count };
    case 'ArrowUp':
      return { type: 'move', index: current < 0 ? count - 1 : (current - 1 + count) % count };
    case 'Home':
      return { type: 'move', index: 0 };
    case 'End':
      return { type: 'move', index: count - 1 };
    default:
      return null;
  }
}

// A row of tabs: Left and Right move focus to the neighbouring tab (wrapping), Home and End jump to the ends. `current` is the tab with
// focus, or -1 when focus is elsewhere. Returns the tab to focus, or null for any other key.
export function tabKeyIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowLeft':
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

// "Tab" leaves a menu: it closes and lets focus carry on to the next thing on the page.
export const closesOnTab = (key: string): boolean => key === 'Tab';
