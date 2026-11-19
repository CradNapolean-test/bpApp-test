import { describe, expect, it } from 'vitest';
import { CHAT_TEXT_MAX, checkinChatLine, checkinChatWindow, checkinReplyHeading, checkinReplyMax, checkinReplyText } from './checkinReply';

describe('checkinChatWindow (CW1)', () => {
  const at = (iso: string) => new Date(iso).getTime();

  it("starts at the member's midnight on the week's Sunday and runs a week", () => {
    // Winter: London is on UTC.
    expect(checkinChatWindow('2026-11-09', 'Europe/London', at('2026-11-17T09:00:00Z'))).toEqual({
      sunday: '2026-11-15',
      fromIso: '2026-11-15T00:00:00.000Z',
      toIso: '2026-11-22T00:00:00.000Z',
    });
    // Summer: London midnight is 23:00 UTC the day before.
    expect(checkinChatWindow('2026-07-06', 'Europe/London', at('2026-07-14T09:00:00Z'))).toMatchObject({
      sunday: '2026-07-12',
      fromIso: '2026-07-11T23:00:00.000Z',
      toIso: '2026-07-18T23:00:00.000Z',
    });
  });

  it('follows the member across a clock change inside the window', () => {
    // Clocks go back on Sun 25 Oct 2026: the window opens at BST midnight and closes at GMT midnight.
    expect(checkinChatWindow('2026-10-19', 'Europe/London', at('2026-10-27T09:00:00Z'))).toMatchObject({
      fromIso: '2026-10-24T23:00:00.000Z',
      toIso: '2026-11-01T00:00:00.000Z',
    });
  });

  it('is empty before that Sunday has begun', () => {
    expect(checkinChatWindow('2026-11-16', 'Europe/London', at('2026-11-19T09:00:00Z'))).toBeNull();
    expect(checkinChatWindow('2026-11-16', 'Europe/London', at('2026-11-22T00:00:00Z'))).not.toBeNull();
  });
});

describe('checkinChatLine', () => {
  const base = { text: null, audio_path: null, audio_duration_seconds: null, image_path: null };
  it('shows the words, or what was sent instead', () => {
    expect(checkinChatLine({ ...base, text: '  Tough week at work  ' })).toBe('Tough week at work');
    expect(checkinChatLine({ ...base, audio_path: 'a.webm', audio_duration_seconds: 65.4 })).toBe('Voice note (1:05)');
    expect(checkinChatLine({ ...base, audio_path: 'a.webm' })).toBe('Voice note');
    expect(checkinChatLine({ ...base, image_path: 'p.jpg' })).toBe('Photo');
    expect(checkinChatLine({ ...base, text: 'Look', image_path: 'p.jpg' })).toBe('Look');
  });
});

describe('checkinReplyText', () => {
  it('heads the reply with the week it is about', () => {
    expect(checkinReplyHeading('2026-10-26')).toBe('Your check-in, week of 26 Oct:');
  });

  it('puts the trimmed reply under the heading', () => {
    expect(checkinReplyText('2026-10-26', '  Great week, keep the steps up.  \n')).toBe(
      'Your check-in, week of 26 Oct:\n\nGreat week, keep the steps up.'
    );
  });

  it('leaves room for the heading inside the chat limit', () => {
    const max = checkinReplyMax('2026-10-26');
    expect(checkinReplyText('2026-10-26', 'x'.repeat(max)).length).toBe(CHAT_TEXT_MAX);
  });
});
