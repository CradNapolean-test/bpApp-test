import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { isPublicPath } from '@/lib/publicPaths';
import JoinWithoutLinkPage from './page';

// A bare /join (BO11): a branded page saying to use the gym's link, open to anyone signed out, and reading nothing about any gym or member.
describe('the bare /join page', () => {
  it('is open without signing in', () => {
    expect(isPublicPath('/join')).toBe(true);
  });

  it('says to use the link from the gym, in the sign-in pages look, with a way to sign in', () => {
    const html = renderToStaticMarkup(<JoinWithoutLinkPage />);
    expect(html).toContain('Use the link from your gym');
    expect(html).toContain('BALLISTIC');
    expect(html).toContain('href="/login"');
  });

  it('reads no data: nothing in it can show a gym, a coach or a member', () => {
    const source = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/supabase|createClient|createAdminClient|fetch\(|searchParams|params/);
  });
});
