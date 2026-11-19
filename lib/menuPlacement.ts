// Where a pop-up list opens under the button that opened it, in the window's own coordinates. The list is drawn `position: fixed` in the
// page's body rather than inside the button's own boxes, so a header that cuts off overflowing text (the title's `truncate`) or a sidebar
// that scrolls (`overflow-y-auto`) cannot hide it. It opens just under the button, lined up with its left edge, and moves left only as far
// as it must to stay inside the window, with a small margin on each side.
export function placeUnder(
  button: { left: number; bottom: number },
  menuWidth: number,
  windowWidth: number,
  gap = 6,
  margin = 8
): { top: number; left: number } {
  const left = Math.max(margin, Math.min(button.left, windowWidth - menuWidth - margin));
  return { top: button.bottom + gap, left };
}
