// The small rules behind every dialog, sheet and full-screen panel (SH2, SH3): which one is on top, and where Tab goes next. Pure, so they
// are tested; app/_components/useDialog.ts applies them to the page.

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

// Where Tab or Shift+Tab goes inside a dialog with `count` focusable things, given which one has focus now (-1 when focus is outside them).
// Returns null when the browser should do its normal thing (Tab inside the list), or the index to move to by hand (at either end, or when
// focus has escaped). With nothing to focus the dialog itself keeps focus (index -2).
export function nextTabIndex(count: number, current: number, backwards: boolean): number | null {
  if (count <= 0) return -2;
  if (current < 0) return backwards ? count - 1 : 0;
  if (backwards && current === 0) return count - 1;
  if (!backwards && current === count - 1) return 0;
  return null;
}

// Dialogs can open on top of each other (a confirm question over a sheet). Only the newest one answers Escape and traps Tab.
export interface DialogStack {
  push(): number;
  remove(id: number): void;
  isTop(id: number): boolean;
  size(): number;
}

export function createDialogStack(): DialogStack {
  let next = 1;
  const open: number[] = [];
  return {
    push() {
      const id = next++;
      open.push(id);
      return id;
    },
    remove(id) {
      const i = open.indexOf(id);
      if (i >= 0) open.splice(i, 1);
    },
    isTop: (id) => open.length > 0 && open[open.length - 1] === id,
    size: () => open.length,
  };
}

// An id for aria-labelledby / aria-describedby that does not clash when two dialogs are open.
let counter = 0;
export const nextDialogId = (prefix: string) => `${prefix}-${++counter}`;
