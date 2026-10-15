// Fetches the sign-in page (and a few static files) from a running copy of the app and checks the response headers (M11, R44).
// GET requests only: it reads nothing but headers and changes nothing.
//
//   node scripts/check-headers.mjs                       checks http://localhost:3000 (start it first: npm run dev, or npm run build && npm start)
//   node scripts/check-headers.mjs https://your-app.example   checks a deployment
const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '');

const problems = [];
const check = (label, ok, got) => {
  if (!ok) problems.push(`${label}${got === undefined ? '' : `: got ${JSON.stringify(got)}`}`);
};

const login = await fetch(`${base}/login`, { redirect: 'manual' });
check('/login answers 200', login.status === 200, login.status);
const h = (name) => login.headers.get(name);

check('X-Content-Type-Options is nosniff', h('x-content-type-options') === 'nosniff', h('x-content-type-options'));
check('Referrer-Policy is strict-origin-when-cross-origin', h('referrer-policy') === 'strict-origin-when-cross-origin', h('referrer-policy'));
check('X-Frame-Options is DENY', h('x-frame-options') === 'DENY', h('x-frame-options'));
check("Permissions-Policy allows camera and microphone for the app and nothing else", h('permissions-policy') === 'camera=(self), microphone=(self), geolocation=(), payment=()', h('permissions-policy'));

const enforced = h('content-security-policy');
const reportOnly = h('content-security-policy-report-only');
check("an enforced CSP carries frame-ancestors 'none'", !!enforced && enforced.includes("frame-ancestors 'none'"), enforced);
const policy = reportOnly ?? enforced ?? '';
for (const part of ["default-src 'self'", "script-src 'self' 'unsafe-inline'", 'https://*.supabase.co', 'wss://*.supabase.co', 'https://www.youtube-nocookie.com', "worker-src 'self'", 'report-uri /api/csp-report']) {
  check(`the CSP includes ${part}`, policy.includes(part));
}
console.log(reportOnly ? 'CSP mode: report-only (nothing is blocked yet)' : 'CSP mode: enforced');

const icon = await fetch(`${base}/icons/icon-192.png`);
check('/icons/icon-192.png is cached for a day, not re-checked on every launch', /max-age=86400/.test(icon.headers.get('cache-control') ?? ''), icon.headers.get('cache-control'));
const manifest = await fetch(`${base}/manifest.json`);
check('/manifest.json is cached for an hour', /max-age=3600/.test(manifest.headers.get('cache-control') ?? ''), manifest.headers.get('cache-control'));

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) at ${base}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`All header checks pass at ${base}`);
