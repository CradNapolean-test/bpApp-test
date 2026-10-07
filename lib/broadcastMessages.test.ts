import { describe, expect, it } from 'vitest';
import { personaliseMessage } from './broadcastMessages';

describe('personaliseMessage', () => {
  it('puts in the first name', () => {
    expect(personaliseMessage('Hi {first name}, how was your week?', 'Brad Stein')).toBe('Hi Brad, how was your week?');
  });

  it('works whatever the capitals, and more than once', () => {
    expect(personaliseMessage('{First Name}! Great work, {FIRST NAME}.', 'Rob Whittaker')).toBe('Rob! Great work, Rob.');
  });

  it('falls back to "there" when there is no name', () => {
    expect(personaliseMessage('Hi {first name}', null)).toBe('Hi there');
    expect(personaliseMessage('Hi {first name}', '   ')).toBe('Hi there');
  });

  it('leaves a message without the token alone', () => {
    expect(personaliseMessage('See you Monday', 'Brad Stein')).toBe('See you Monday');
  });
});
