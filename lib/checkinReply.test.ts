import { describe, expect, it } from 'vitest';
import { CHAT_TEXT_MAX, checkinReplyHeading, checkinReplyMax, checkinReplyText } from './checkinReply';

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
