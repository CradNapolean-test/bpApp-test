import { describe, expect, it } from 'vitest';
import { MAX_VOICE_SECONDS, baseMimeType, formatVoiceTimer, pickVoiceMimeType, uploadMimeType, voiceExtension } from './voiceFormat';

describe('pickVoiceMimeType (M4)', () => {
  it('prefers MP4 where the browser can record it (Safari on iPhone)', () => {
    expect(pickVoiceMimeType((t) => t === 'audio/mp4' || t.startsWith('audio/webm'))).toBe('audio/mp4');
  });
  it('falls back to Opus in WebM, then plain WebM', () => {
    expect(pickVoiceMimeType((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickVoiceMimeType((t) => t === 'audio/webm')).toBe('audio/webm');
  });
  it('lets the browser choose when it supports none of them', () => {
    expect(pickVoiceMimeType(() => false)).toBeNull();
  });
  it('survives a browser that throws for a type it does not know', () => {
    expect(
      pickVoiceMimeType((t) => {
        if (t === 'audio/mp4') throw new Error('NotSupportedError');
        return t === 'audio/webm';
      })
    ).toBe('audio/webm');
  });
});

describe('the type that goes with the file', () => {
  it('strips the codec parameters storage does not match on', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(baseMimeType('Audio/MP4')).toBe('audio/mp4');
  });
  it('names the file after what it really is', () => {
    expect(voiceExtension('audio/mp4')).toBe('m4a');
    expect(voiceExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(voiceExtension('audio/ogg;codecs=opus')).toBe('ogg');
  });
  it('uses the recorder type first, then the one asked for, and never something that is not audio', () => {
    expect(uploadMimeType('audio/mp4', 'audio/webm')).toBe('audio/mp4');
    expect(uploadMimeType('', 'audio/webm;codecs=opus')).toBe('audio/webm');
    expect(uploadMimeType('', null)).toBe('audio/webm');
    expect(uploadMimeType('text/html', null)).toBe('audio/webm');
  });
});

describe('formatVoiceTimer', () => {
  it('shows the time used against the 2 minute cap', () => {
    expect(MAX_VOICE_SECONDS).toBe(120);
    expect(formatVoiceTimer(45)).toBe('0:45 / 2:00');
    expect(formatVoiceTimer(120)).toBe('2:00 / 2:00');
  });
});
