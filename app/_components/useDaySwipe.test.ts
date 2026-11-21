import { describe, expect, it, vi } from 'vitest';
import { startsOnOwnDrag, stripSwipe } from './useDaySwipe';

// The web's tests run without a browser, so these stand in for the page's elements: what each matches of the selector list, its
// computed style, and how wide its content is against its box.
interface FakeNode {
  matches(selector: string): boolean;
  parentElement: FakeNode | null;
  scrollWidth: number;
  clientWidth: number;
  style: { position: string; overflowX: string; touchAction: string };
}

function node(
  parent: FakeNode | null,
  { is = [], style = {}, widths = [300, 300] }: { is?: string[]; style?: Partial<FakeNode['style']>; widths?: [number, number] } = {}
): FakeNode {
  return {
    matches: (selector) => selector.split(',').some((s) => is.includes(s.trim())),
    parentElement: parent,
    scrollWidth: widths[0],
    clientWidth: widths[1],
    style: { position: 'static', overflowX: 'visible', touchAction: 'auto', ...style },
  };
}
const styleOf = (el: FakeNode) => el.style;
const owns = (target: FakeNode, root: FakeNode) => startsOnOwnDrag(target, root, (el) => styleOf(el as FakeNode));

describe('startsOnOwnDrag', () => {
  it('lets a swipe start on the day itself: text, a card, a button', () => {
    const root = node(null);
    const card = node(root);
    expect(owns(node(card, { is: ['button'] }), root)).toBe(false);
    expect(owns(card, root)).toBe(false);
    expect(owns(root, root)).toBe(false);
  });

  it('leaves form fields and sliders to themselves', () => {
    const root = node(null);
    for (const is of ['input', 'textarea', 'select', '[contenteditable="true"]', '[role="slider"]']) {
      expect(owns(node(node(root), { is: [is] }), root)).toBe(true);
    }
    // Inside one (the text of a slider's thumb), too.
    expect(owns(node(node(root, { is: ['[role="slider"]'] })), root)).toBe(true);
  });

  it('leaves a sheet or menu over the page alone, inline or as a dialog', () => {
    const root = node(null);
    expect(owns(node(node(root, { style: { position: 'fixed' } })), root)).toBe(true);
    expect(owns(node(node(root, { is: ['[role="dialog"]'] })), root)).toBe(true);
    expect(owns(node(node(root, { is: ['dialog'] })), root)).toBe(true);
  });

  it('leaves a row that scrolls sideways to scroll, but not one whose content fits', () => {
    const root = node(null);
    const strip = node(root, { style: { overflowX: 'auto' }, widths: [900, 360] });
    expect(owns(node(strip, { is: ['button'] }), root)).toBe(true);
    expect(owns(node(node(root, { style: { overflowX: 'scroll' }, widths: [400, 360] })), root)).toBe(true);
    expect(owns(node(node(root, { style: { overflowX: 'auto' }, widths: [360, 360] })), root)).toBe(false);
    // Cut off rather than scrollable: nothing there takes the drag.
    expect(owns(node(node(root, { style: { overflowX: 'hidden' }, widths: [900, 360] })), root)).toBe(false);
  });

  it('leaves anything with its own touch handling (a zoomable photo) alone', () => {
    const root = node(null);
    expect(owns(node(node(root, { style: { touchAction: 'none' } })), root)).toBe(true);
    expect(owns(node(node(root, { style: { touchAction: 'pan-y' } })), root)).toBe(true);
    expect(owns(node(node(root, { style: { touchAction: 'manipulation' } })), root)).toBe(false);
  });

  it('can be switched off for a part of the screen', () => {
    const root = node(null);
    expect(owns(node(node(root, { is: ['[data-no-day-swipe]'] })), root)).toBe(true);
  });

  it('looks no further up than the swipe area: a screen inside a dialog (the coach viewing a member) still swipes', () => {
    const dialog = node(null, { is: ['[role="dialog"]'], style: { position: 'fixed' } });
    const root = node(dialog);
    expect(owns(node(node(root)), root)).toBe(false);
  });
});

describe('stripSwipe', () => {
  const days = ['2026-11-20', '2026-11-21', '2026-11-22'];

  it('picks the day before or after, as a tap on it would', () => {
    const pick = vi.fn();
    const swipe = stripSwipe(days, '2026-11-21', pick);
    swipe.previous?.();
    swipe.next?.();
    expect(pick.mock.calls).toEqual([['2026-11-20'], ['2026-11-22']]);
  });

  it('goes nowhere past either end of the strip', () => {
    expect(stripSwipe(days, '2026-11-20', () => {}).previous).toBeNull();
    expect(stripSwipe(days, '2026-11-22', () => {}).next).toBeNull();
  });
});
