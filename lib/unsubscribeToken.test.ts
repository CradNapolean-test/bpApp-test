import { describe, expect, it } from 'vitest';
import { signUnsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from './unsubscribeToken';

const SECRET = 'test-secret-not-real';
const MEMBER = '8f14e45f-ceea-467a-9575-0e1a3c3f7e11';

describe('unsubscribe tokens', () => {
  it('a signed token gives back the member it was made for', () => {
    const token = signUnsubscribeToken(MEMBER, SECRET);
    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(MEMBER);
  });

  it('is url-safe, so it survives an email link', () => {
    const token = signUnsubscribeToken(MEMBER, SECRET) as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('a token made with another secret is refused', () => {
    const token = signUnsubscribeToken(MEMBER, 'another-secret');
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull();
  });

  it('changing the member id inside the token is refused', () => {
    const token = signUnsubscribeToken(MEMBER, SECRET) as string;
    const [, signature] = token.split('.');
    const forged = `${Buffer.from('someone-else').toString('base64url')}.${signature}`;
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
  });

  it('a damaged or truncated signature is refused', () => {
    const token = signUnsubscribeToken(MEMBER, SECRET) as string;
    expect(verifyUnsubscribeToken(token.slice(0, -3), SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${token}x`, SECRET)).toBeNull();
  });

  it('refuses junk, empty and missing values', () => {
    for (const bad of ['', 'abc', 'a.b.c', '.', '.x', 'x.', null, undefined]) {
      expect(verifyUnsubscribeToken(bad as string | null | undefined, SECRET)).toBeNull();
    }
  });

  it('cannot sign or verify without a secret', () => {
    expect(signUnsubscribeToken(MEMBER, undefined)).toBeNull();
    expect(signUnsubscribeToken(MEMBER, '')).toBeNull();
    expect(verifyUnsubscribeToken('a.b', undefined)).toBeNull();
  });

  it('builds the link on the app origin', () => {
    expect(unsubscribeUrl('https://app.example.com/', 'a.b')).toBe('https://app.example.com/unsubscribe?t=a.b');
  });
});
