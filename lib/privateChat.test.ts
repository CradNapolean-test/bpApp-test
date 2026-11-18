import { describe, expect, it } from 'vitest';
import { PRIVATE_CHAT_HINT, privateChatTitle } from './privateChat';

describe('privateChatTitle (MS22)', () => {
  it("names the member's own coach", () => {
    expect(privateChatTitle('Brad')).toBe('Only Brad can see this conversation');
    expect(privateChatTitle('  Coach Sam ')).toBe('Only Coach Sam can see this conversation');
  });

  it('falls back when the coach has no name, or the member has no coach', () => {
    expect(privateChatTitle(null)).toBe("Only this member's coach can see this conversation");
    expect(privateChatTitle('   ')).toBe("Only this member's coach can see this conversation");
  });

  it('says why, and how to take the member on', () => {
    expect(PRIVATE_CHAT_HINT).toMatch(/private between a member and their own coach/);
    expect(PRIVATE_CHAT_HINT).toMatch(/Move members/);
  });
});
