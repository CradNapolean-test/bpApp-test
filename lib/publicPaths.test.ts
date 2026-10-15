import { describe, expect, it } from 'vitest';
import { PUBLIC_PATHS, isPublicPath } from './publicPaths';

describe('isPublicPath', () => {
  it('lets a signed-out visitor reach the legal pages, which the sign-in and join pages link to (H3)', () => {
    expect(isPublicPath('/legal/privacy')).toBe(true);
    expect(isPublicPath('/legal/terms')).toBe(true);
    expect(isPublicPath('/legal')).toBe(true);
  });

  it('lets through the unsubscribe page, the confirm route and the csp report endpoint', () => {
    expect(isPublicPath('/unsubscribe')).toBe(true);
    expect(isPublicPath('/auth/confirm')).toBe(true);
    expect(isPublicPath('/api/csp-report')).toBe(true);
  });

  it('keeps what was public before public', () => {
    for (const p of ['/login', '/reset-password', '/join/abc123', '/api/join', '/api/version', '/api/cron/birthdays']) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it('keeps everything else behind sign-in', () => {
    for (const p of ['/', '/dashboard', '/coach', '/coach/clients', '/owner', '/owner/account', '/api/push/send', '/api/coach/create-client', '/api/gym/create-coach', '/api/estimate-food-photo']) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  it('matches whole path segments, not prefixes of a name', () => {
    expect(isPublicPath('/legalese')).toBe(false);
    expect(isPublicPath('/loginx')).toBe(false);
    expect(isPublicPath('/unsubscribed')).toBe(false);
    expect(isPublicPath('/api/joinery')).toBe(false);
  });

  it('every entry says why it is public', () => {
    for (const entry of PUBLIC_PATHS) {
      expect(entry.path.startsWith('/')).toBe(true);
      expect(entry.why.length).toBeGreaterThan(15);
    }
  });
});
