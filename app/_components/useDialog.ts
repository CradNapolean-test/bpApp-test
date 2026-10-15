'use client';

import { useEffect, useRef } from 'react';
import { FOCUSABLE_SELECTOR, createDialogStack, nextTabIndex } from '@/lib/dialogFocus';

// What every dialog, sheet and full-screen panel needs, in one place (SH2, SH3). A component calls it when it is on screen and puts the
// returned ref on its outer element. It then:
//   * moves focus inside when it opens (the element marked data-autofocus, else the close button marked data-dialog-close, else the first
//     focusable thing, else the dialog itself), and gives focus back to whatever opened it when it closes;
//   * keeps Tab and Shift+Tab inside it;
//   * closes on Escape, but only the newest dialog does, so a confirm question over a sheet closes alone;
//   * stops the page behind it scrolling and makes the rest of the page inert (not clickable, not focusable, not read out), so a screen
//     reader no longer wanders into the page behind an open sheet.
// The component supplies role="dialog" (or "alertdialog"), aria-modal="true" and a name; this hook does the behaviour.
//
// Elements marked data-dialog-ignore (the toast region) are left alone, so an error message is still announced while a dialog is open.

const stack = createDialogStack();
let scrollLocks = 0;
let savedOverflow = '';

export interface DialogOptions {
  onClose: () => void;
  // Close on Escape (default true). Set false only for a panel that must not be dismissed by accident.
  escape?: boolean;
}

export function useDialog<T extends HTMLElement>({ onClose, escape = true }: DialogOptions) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const escapeRef = useRef(escape);
  useEffect(() => {
    onCloseRef.current = onClose;
    escapeRef.current = escape;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = stack.push();
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Everything else on the page becomes inert: walk up to <body> and mark the siblings at every level.
    const inerted: HTMLElement[] = [];
    let node: HTMLElement | null = el;
    while (node && node !== document.body) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === node || !(sibling instanceof HTMLElement)) continue;
        if (sibling.hasAttribute('inert') || sibling.hasAttribute('data-dialog-ignore') || sibling.matches('script,style,link,noscript')) continue;
        sibling.setAttribute('inert', '');
        inerted.push(sibling);
      }
      node = parent;
    }

    if (scrollLocks++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((f) => f.getClientRects().length > 0);
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('[data-dialog-close]') ?? focusables()[0];
    if (first) first.focus({ preventScroll: true });
    else {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!stack.isTop(id)) return;
      if (e.key === 'Escape' && escapeRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      const target = nextTabIndex(list.length, list.indexOf(document.activeElement as HTMLElement), e.shiftKey);
      if (target === null) return;
      e.preventDefault();
      if (target === -2) el?.focus();
      else list[target]?.focus();
    }
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      stack.remove(id);
      for (const sibling of inerted) sibling.removeAttribute('inert');
      if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
      // Give focus back to what opened it, if that is still on the page.
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, []);

  return ref;
}
