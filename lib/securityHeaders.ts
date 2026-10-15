import { parseHostList } from './imageHosts';

// The security headers every page and route is sent with (M11), kept here so they can be tested and so next.config.ts stays short.
//
// Enforced now: nosniff, a referrer policy, framing protection (X-Frame-Options and CSP frame-ancestors), and a permissions policy.
// Report-only for now: the full Content-Security-Policy. It only REPORTS what it would have blocked (to /api/csp-report, which logs to
// Sentry), so nothing can break while it is tuned. After about a week with no real violations, switch it on by changing
// CSP_ENFORCE in next.config.ts from false to true (see the brief 10 status), which sends the same policy as Content-Security-Policy.
//
// script-src keeps 'unsafe-inline' for now: Next writes small inline scripts (the theme script, flight data). Tightening that needs a nonce
// per request and is a later job.

export interface HeaderPair {
  key: string;
  value: string;
}

export const CSP_REPORT_PATH = '/api/csp-report';

export function buildCsp(options: { imageHosts?: string | null; supabaseHost?: string | null } = {}): string {
  const extraImages = parseHostList(options.imageHosts).map((h) => `https://${h}`);
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'unsafe-inline' for scripts: see the note at the top.
    'script-src': ["'self'", "'unsafe-inline'"],
    // React writes style="" attributes (bar widths and the like), which need 'unsafe-inline' for styles.
    'style-src': ["'self'", "'unsafe-inline'"],
    'connect-src': ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', 'https://*.ingest.sentry.io', 'https://*.ingest.de.sentry.io', 'https://*.ingest.us.sentry.io'],
    'img-src': ["'self'", 'data:', 'blob:', 'https://*.supabase.co', ...extraImages],
    'frame-src': ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com'],
    'media-src': ["'self'", 'blob:', 'https://*.supabase.co'],
    'font-src': ["'self'"],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
  return `${policy}; report-uri ${CSP_REPORT_PATH}`;
}

export function securityHeaders(options: { imageHosts?: string | null; enforceCsp?: boolean } = {}): HeaderPair[] {
  const csp = buildCsp({ imageHosts: options.imageHosts });
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    // Cameras and microphones are used by the app itself (photos, voice notes, barcode scanning); everything else is off.
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=()' },
    // frame-ancestors is not applied by a report-only policy, so framing protection is also sent as an enforced policy on its own.
    ...(options.enforceCsp
      ? [{ key: 'Content-Security-Policy', value: csp }]
      : [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ]),
  ];
}

// The small, harmless part of a browser's violation report (either report format), with addresses cut down to origin and path so a token in a
// query string never reaches the logs. Returns null for something that is not a report.
export function summariseCspReport(body: unknown): { directive: string; blocked: string; page: string } | null {
  const raw = (body as { 'csp-report'?: Record<string, unknown>; body?: Record<string, unknown> } | null) ?? null;
  const report = raw?.['csp-report'] ?? raw?.body ?? (Array.isArray(body) ? ((body[0] as { body?: Record<string, unknown> })?.body ?? null) : null);
  if (!report || typeof report !== 'object') return null;
  const r = report as Record<string, unknown>;
  const directive = String(r['effective-directive'] ?? r['effectiveDirective'] ?? r['violated-directive'] ?? r['violatedDirective'] ?? '');
  if (!directive) return null;
  const trim = (value: unknown) => {
    const text = String(value ?? '');
    try {
      const u = new URL(text);
      return `${u.origin}${u.pathname}`.slice(0, 200);
    } catch {
      return text.slice(0, 40); // "inline", "eval", "data", "blob"
    }
  };
  return { directive: directive.slice(0, 60), blocked: trim(r['blocked-uri'] ?? r['blockedURL'] ?? r['blockedUri']), page: trim(r['document-uri'] ?? r['documentURL'] ?? r['documentUri']) };
}
