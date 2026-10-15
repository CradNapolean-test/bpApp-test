import { useEffect, useRef } from 'react';

// Fires onOutside on any pointer press outside the returned ref's element. It listens for pointerdown, not mousedown: on iOS a tap on a
// non-interactive area does not produce mouse events, so popovers did not close when someone tapped the page behind them. `active` gates
// whether the listener is attached at all, so closed menus/popovers/comboboxes don't pay for a document-level listener while hidden.
export function useClickOutside<T extends HTMLElement>(onOutside: () => void, active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    function handler(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [active, onOutside]);

  return ref;
}
