import { useEffect, useRef } from 'react';

// Fires onOutside on any mousedown outside the returned ref's element. `active` gates whether
// the listener is attached at all, so closed menus/popovers/comboboxes don't pay for a
// document-level listener while hidden.
export function useClickOutside<T extends HTMLElement>(onOutside: () => void, active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [active, onOutside]);

  return ref;
}
