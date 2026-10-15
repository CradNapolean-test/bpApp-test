import * as Sentry from '@sentry/nextjs';
import { HOUR, adminRateStore, takeToken } from '@/lib/rateLimit';
import { summariseCspReport } from '@/lib/securityHeaders';

// Where browsers send what the Content-Security-Policy would have blocked (M11). Public (a browser sends it with no session), so it is small
// and cheap: it reads at most 10 KB, keeps only the directive and the cut-down addresses (lib/securityHeaders.ts), takes a sample of at most
// 60 an hour, and always answers 204. Reports go to Sentry as one message per kind of violation.
const MAX_BYTES = 10_000;

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) return new Response(null, { status: 204 });
    const summary = summariseCspReport(JSON.parse(text));
    if (!summary) return new Response(null, { status: 204 });

    const sample = await takeToken(adminRateStore(), 'csp-report', 60, HOUR, { onError: 'deny' });
    if (sample.allowed) {
      Sentry.captureMessage(`CSP would block: ${summary.directive}`, { level: 'info', tags: { area: 'csp' }, extra: summary, fingerprint: ['csp', summary.directive, summary.blocked] });
    }
  } catch {
    // A malformed report is not worth an error.
  }
  return new Response(null, { status: 204 });
}
