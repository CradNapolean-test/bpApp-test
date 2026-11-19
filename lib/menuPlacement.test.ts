import { describe, expect, it } from 'vitest';
import { placeUnder } from './menuPlacement';

describe('placeUnder', () => {
  it('opens just under the button, lined up with its left edge', () => {
    expect(placeUnder({ left: 40, bottom: 100 }, 192, 1280)).toEqual({ top: 106, left: 40 });
  });

  it('moves left to stay inside the window when the button is near the right edge', () => {
    // A phone 375 wide, the pill at 300: the list (192) would run off the edge, so it ends 8 from it.
    expect(placeUnder({ left: 300, bottom: 50 }, 192, 375)).toEqual({ top: 56, left: 175 });
  });

  it('never starts off the left edge, even when the window is narrower than the list', () => {
    expect(placeUnder({ left: 4, bottom: 20 }, 192, 180)).toEqual({ top: 26, left: 8 });
  });
});
