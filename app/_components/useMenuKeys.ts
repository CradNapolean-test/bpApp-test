'use client';

import { useEffect, useRef } from 'react';
import { closesOnTab, menuKeyAction } from '@/lib/menuKeys';

// Keyboard support for a pop-up menu or list of choices (UI1, GS2): put `triggerRef` on the button that opens it and `menuRef` on the
// element that holds the items. While it is open: focus moves to the first item, the arrow keys, Home and End move between items,
// Escape closes it from anywhere inside and puts focus back on the trigger, and Tab closes it. Items are the buttons (or links) inside
// `menuRef` that are not disabled.
export function useMenuKeys<M extends HTMLElement, T extends HTMLElement>(open: boolean, close: () => void) {
  const menuRef = useRef<M>(null);
  const triggerRef = useRef<T>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const items = () => Array.from(menu.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[role="menuitem"]:not([disabled]),[role="option"]:not([disabled])'));
    items()[0]?.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      const list = items();
      if (closesOnTab(e.key)) {
        closeRef.current();
        return;
      }
      const action = menuKeyAction(e.key, list.indexOf(document.activeElement as HTMLElement), list.length);
      if (!action) return;
      e.preventDefault();
      if (action.type === 'close') {
        closeRef.current();
        triggerRef.current?.focus({ preventScroll: true });
      } else {
        list[action.index]?.focus({ preventScroll: true });
      }
    }
    // On the document, so Escape and the arrows work from the trigger as well as from inside the menu.
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return { menuRef, triggerRef };
}
