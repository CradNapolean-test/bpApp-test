import { describe, expect, it } from 'vitest';
import { broadcastPreview } from './broadcastPreview';

describe('broadcastPreview (MS14)', () => {
  it('leaves out blank lines, so the 3-line preview shows the message', () => {
    expect(broadcastPreview('Hey Team,\n\nClasses are on as usual.\n\n\nSee you Monday!')).toBe('Hey Team,\nClasses are on as usual.\nSee you Monday!');
  });

  it('treats lines of only spaces, and Windows line ends, as blank', () => {
    expect(broadcastPreview('Hi {first_name},\r\n   \r\nWelcome!\r\n')).toBe('Hi {first_name},\nWelcome!');
  });

  it('keeps a one-line message and its wording as it is', () => {
    expect(broadcastPreview('Gym closed Friday')).toBe('Gym closed Friday');
    expect(broadcastPreview('  indented line')).toBe('  indented line');
  });

  it('is empty for a message of only blank lines', () => {
    expect(broadcastPreview('\n\n  \n')).toBe('');
  });
});
