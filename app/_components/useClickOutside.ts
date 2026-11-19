import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

// Fires onOutside on any pointer press outside the returned ref's element. It listens for pointerdown, not mousedown: on iOS a tap on a
// non-interactive area does not produce mouse events, so popovers did not close when someone tapped the page behind them. `active` gates
// whether the listener is attached at all, so closed menus/popovers/comboboxes don't pay for a document-level listener while hidden.
// `alsoInside` is a second element that counts as inside: a list drawn elsewhere in the page (a portal) for the button in the ref.
export function useClickOutside<T extends HTMLElement>(onOutside: () => void, active: boolean, alsoInside?: RefObject<HTMLElement | null>) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    function handler(e: PointerEvent) {
      const target = e.target as Node;
      if (alsoInside?.current?.contains(target)) return;
      if (ref.current && !ref.current.contains(target)) onOutside();
    }
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [active, onOutside, alsoInside]);

  return ref;
}
