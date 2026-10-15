import { describe, expect, it } from 'vitest';
import { CSP_REPORT_PATH, buildCsp, securityHeaders, summariseCspReport } from './securityHeaders';

const value = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key === key)?.value;

describe('securityHeaders (what /login and every page is sent)', () => {
  const headers = securityHeaders();

  it('stops content sniffing', () => {
    expect(value(headers, 'X-Content-Type-Options')).toBe('nosniff');
  });

  it('sends a referrer policy', () => {
    expect(value(headers, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('forbids framing, twice: the old header and the policy', () => {
    expect(value(headers, 'X-Frame-Options')).toBe('DENY');
    expect(value(headers, 'Content-Security-Policy')).toBe("frame-ancestors 'none'");
  });

  it('allows the camera and microphone for the app itself, and nothing else', () => {
    expect(value(headers, 'Permissions-Policy')).toBe('camera=(self), microphone=(self), geolocation=(), payment=()');
  });

  it('sends the full policy as report-only first, so nothing can break while it is tuned', () => {
    expect(value(headers, 'Content-Security-Policy-Report-Only')).toContain("default-src 'self'");
    expect(value(headers, 'Content-Security-Policy')).not.toContain('default-src');
  });

  it('switches to an enforced policy with one setting', () => {
    const enforced = securityHeaders({ enforceCsp: true });
    expect(value(enforced, 'Content-Security-Policy')).toContain("default-src 'self'");
    expect(value(enforced, 'Content-Security-Policy-Report-Only')).toBeUndefined();
  });
});

describe('buildCsp', () => {
  const csp = buildCsp();

  it('covers what the app really loads', () => {
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain('connect-src');
    expect(csp).toContain('https://*.supabase.co');
    expect(csp).toContain('wss://*.supabase.co');
    expect(csp).toContain('https://*.ingest.sentry.io');
    expect(csp).toMatch(/img-src 'self' data: blob: https:\/\/\*\.supabase\.co/);
    expect(csp).toContain('https://www.youtube-nocookie.com');
    expect(csp).toContain('https://player.vimeo.com');
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("font-src 'self'");
  });

  it('shuts the doors nothing needs', () => {
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('reports to our own endpoint', () => {
    expect(csp.endsWith(`report-uri ${CSP_REPORT_PATH}`)).toBe(true);
  });

  it('adds the owner\'s extra picture hosts to img-src, as https only', () => {
    const withHosts = buildCsp({ imageHosts: 'cdn.example.com, http://images.example.org/path' });
    expect(withHosts).toContain('https://cdn.example.com');
    expect(withHosts).toContain('https://images.example.org');
    expect(withHosts).not.toContain('http://');
  });
});

describe('summariseCspReport', () => {
  it('reads the classic report format and drops query strings', () => {
    const summary = summariseCspReport({
      'csp-report': {
        'document-uri': 'https://app.example.com/dashboard?token=secret123',
        'effective-directive': 'img-src',
        'blocked-uri': 'https://cdn.evil.example/pic.png?x=1',
      },
    });
    expect(summary).toEqual({ directive: 'img-src', blocked: 'https://cdn.evil.example/pic.png', page: 'https://app.example.com/dashboard' });
    expect(JSON.stringify(summary)).not.toContain('secret123');
  });

  it('reads the newer report format', () => {
    const summary = summariseCspReport([{ type: 'csp-violation', body: { effectiveDirective: 'script-src', blockedURL: 'inline', documentURL: 'https://app.example.com/login' } }]);
    expect(summary).toEqual({ directive: 'script-src', blocked: 'inline', page: 'https://app.example.com/login' });
  });

  it('returns null for anything that is not a report', () => {
    expect(summariseCspReport(null)).toBeNull();
    expect(summariseCspReport({})).toBeNull();
    expect(summariseCspReport({ 'csp-report': {} })).toBeNull();
    expect(summariseCspReport('hello')).toBeNull();
  });
});
