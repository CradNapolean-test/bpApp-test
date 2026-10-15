import { describe, expect, it } from 'vitest';
import { clampZoomPan, IDENTITY, KEY_PAN_STEP, KEY_ZOOM_STEP, MAX_SCALE, panBy, toggleZoom, zoomAt, zoomKeyAction } from './zoomPan';

describe('zoomPan', () => {
  it('cannot pan when not zoomed, and keeps the image covering the box when zoomed', () => {
    expect(panBy(IDENTITY, 50, 50, 300, 400)).toEqual(IDENTITY);
    expect(panBy({ scale: 2, x: 0, y: 0 }, 500, -500, 300, 400)).toEqual({ scale: 2, x: 150, y: -200 });
  });
  it('limits the scale', () => {
    expect(clampZoomPan({ scale: 20, x: 0, y: 0 }, 300, 400).scale).toBe(MAX_SCALE);
    expect(clampZoomPan({ scale: 0.2, x: 10, y: 10 }, 300, 400)).toEqual(IDENTITY);
  });
  it('zooms about the point under the finger', () => {
    // Pinching on the right edge (150px from centre) at 2x keeps that point where it was.
    const t = zoomAt(IDENTITY, 2, 150, 0, 300, 400);
    expect(t.scale).toBe(2);
    expect(150 * t.scale + t.x).toBeCloseTo(150, 5); // that image point still renders at x = 150
  });
  it('double tap zooms in then back out', () => {
    const zoomed = toggleZoom(IDENTITY, 0, 0, 300, 400);
    expect(zoomed.scale).toBe(2.5);
    expect(toggleZoom(zoomed, 0, 0, 300, 400)).toEqual(IDENTITY);
  });
});

describe('zoomKeyAction (zooming a photo with the keyboard)', () => {
  it('+ and = zoom in, - and _ zoom out', () => {
    expect(zoomKeyAction('+')).toEqual({ type: 'zoom', factor: KEY_ZOOM_STEP });
    expect(zoomKeyAction('=')).toEqual({ type: 'zoom', factor: KEY_ZOOM_STEP });
    expect(zoomKeyAction('-')).toEqual({ type: 'zoom', factor: 1 / KEY_ZOOM_STEP });
    expect(zoomKeyAction('_')).toEqual({ type: 'zoom', factor: 1 / KEY_ZOOM_STEP });
  });

  it('in and out undo each other', () => {
    const inn = zoomKeyAction('+') as { factor: number };
    const out = zoomKeyAction('-') as { factor: number };
    expect(inn.factor * out.factor).toBeCloseTo(1);
  });

  it('the arrow keys move the picture the way the finger would drag it', () => {
    expect(zoomKeyAction('ArrowLeft')).toEqual({ type: 'pan', dx: KEY_PAN_STEP, dy: 0 });
    expect(zoomKeyAction('ArrowRight')).toEqual({ type: 'pan', dx: -KEY_PAN_STEP, dy: 0 });
    expect(zoomKeyAction('ArrowUp')).toEqual({ type: 'pan', dx: 0, dy: KEY_PAN_STEP });
    expect(zoomKeyAction('ArrowDown')).toEqual({ type: 'pan', dx: 0, dy: -KEY_PAN_STEP });
  });

  it('0 resets, and other keys are left to the browser', () => {
    expect(zoomKeyAction('0')).toEqual({ type: 'reset' });
    expect(zoomKeyAction('a')).toBeNull();
    expect(zoomKeyAction('Tab')).toBeNull();
    expect(zoomKeyAction('Enter')).toBeNull();
  });
});
