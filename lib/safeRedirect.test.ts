import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safeRedirect';

const ORIGIN = 'https://app.example.com';

describe('safeNextPath allows only this site', () => {
  it('accepts a path on this site', () => {
    expect(safeNextPath('/dashboard', ORIGIN)).toBe('/dashboard');
    expect(safeNextPath('/reset-password', ORIGIN)).toBe('/reset-password');
    expect(safeNextPath('/coach/clients/abc?open=messages', ORIGIN)).toBe('/coach/clients/abc?open=messages');
    expect(safeNextPath('/', ORIGIN)).toBe('/');
  });

  it('accepts this site\'s own absolute address (what the email templates pass) and keeps only the path', () => {
    expect(safeNextPath('https://app.example.com/reset-password', ORIGIN)).toBe('/reset-password');
    expect(safeNextPath('https://app.example.com/dashboard?x=1#top', ORIGIN)).toBe('/dashboard?x=1#top');
  });

  it('refuses another site', () => {
    expect(safeNextPath('https://evil.example', ORIGIN)).toBe('/');
    expect(safeNextPath('https://evil.example/dashboard', ORIGIN)).toBe('/');
    expect(safeNextPath('http://app.example.com/dashboard', ORIGIN)).toBe('/');
    expect(safeNextPath('https://app.example.com.evil.example/', ORIGIN)).toBe('/');
    expect(safeNextPath('https://app.example.com@evil.example/', ORIGIN)).toBe('/');
  });

  it('refuses a scheme-relative address', () => {
    expect(safeNextPath('//evil.example', ORIGIN)).toBe('/');
    expect(safeNextPath('//evil.example/dashboard', ORIGIN)).toBe('/');
  });

  it('refuses a backslash, which browsers read as a slash', () => {
    expect(safeNextPath('/\\evil.example', ORIGIN)).toBe('/');
    expect(safeNextPath('\\\\evil.example', ORIGIN)).toBe('/');
    expect(safeNextPath('/dashboard\\..\\evil', ORIGIN)).toBe('/');
  });

  it('refuses empty, missing, and other schemes', () => {
    expect(safeNextPath('', ORIGIN)).toBe('/');
    expect(safeNextPath('   ', ORIGIN)).toBe('/');
    expect(safeNextPath(null, ORIGIN)).toBe('/');
    expect(safeNextPath(undefined, ORIGIN)).toBe('/');
    expect(safeNextPath('javascript:alert(1)', ORIGIN)).toBe('/');
    expect(safeNextPath('data:text/html,<script>', ORIGIN)).toBe('/');
  });

  it('refuses control characters that could split a header or hide a host', () => {
    expect(safeNextPath('/dashboard\r\nSet-Cookie: a=b', ORIGIN)).toBe('/');
    expect(safeNextPath('/\t/evil.example', ORIGIN)).toBe('/');
  });

  it('uses the fallback you give it', () => {
    expect(safeNextPath('https://evil.example', ORIGIN, '/login')).toBe('/login');
  });
});
