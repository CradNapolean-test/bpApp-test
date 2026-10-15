import { describe, expect, it } from 'vitest';
import { detectDevice } from './device';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_OLD = 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1';
// iPadOS 13+ in its default "desktop website" mode.
const IPAD_NEW = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const MAC = IPAD_NEW;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

describe('detectDevice (UI2)', () => {
  it('knows an iPhone and an older iPad', () => {
    expect(detectDevice(IPHONE, 'iPhone', 5)).toEqual({ ios: true, mobile: true });
    expect(detectDevice(IPAD_OLD, 'iPad', 5)).toEqual({ ios: true, mobile: true });
  });

  it('knows an iPad that calls itself a Mac (iPadOS 13 and later) by its touch screen', () => {
    expect(detectDevice(IPAD_NEW, 'MacIntel', 5)).toEqual({ ios: true, mobile: true });
  });

  it('does not take a real Mac for an iPad', () => {
    expect(detectDevice(MAC, 'MacIntel', 0)).toEqual({ ios: false, mobile: false });
    expect(detectDevice(MAC, 'MacIntel', 1)).toEqual({ ios: false, mobile: false });
  });

  it('knows Android, and leaves Windows and Linux desktops alone', () => {
    expect(detectDevice(ANDROID, 'Linux armv81', 5)).toEqual({ ios: false, mobile: true });
    expect(detectDevice(WINDOWS, 'Win32', 0)).toEqual({ ios: false, mobile: false });
  });
});
