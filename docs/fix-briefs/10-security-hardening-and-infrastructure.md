# Brief 10: Security hardening and infrastructure (app code and config)

**Goal:** close the web-layer holes (framework version, headers, redirects, public sign-up endpoint, secrets that fail open, scripts that can hit the live database) and make app updates and caching behave.

**Migration number reserved:** `0140` (a small `rate_limits` table and join-link limits).
**Read for evidence:** `docs/MEMBERS_APP_AUDIT.md` (H3, H4, M6, M7, M11, M13), `docs/COACH_OWNER_AUDIT.md` (CM8), `docs/AUDIT_ROUND_2.md` (R1, R8, R43, R44, "Checked and sound", LT5).

## Ground rules (same in every brief)

1. Read `CLAUDE.md`. The stack is fixed (Next.js, Supabase, Vercel). `lib/calculations.ts` formulas must not change.
2. **Never write to the live database, run seed or stress scripts, or call production APIs with real keys.** `.env.local` points at the live project. Do not print secrets. Verify with unit tests and `npm run build`; header and redirect behaviour can be checked on the local dev server with GET requests only.
3. Never edit an existing migration; new file `0140_*.sql` only, idempotent; functions `security definer` with `set search_path = public`, revoke from `public, anon`.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` **and `npm run build`** must pass.
5. Stay inside this brief's files (ownership in `00-README.md`): `next.config.ts`, `vercel.json`, `package.json`, `lib/supabase/middleware.ts`, `app/auth/confirm`, `app/api/join`, `app/api/estimate-food-photo`, `public/sw.js`, `scripts/*`, `app/legal/*`, and only the **secret check at the top** of each cron route (brief 09 owns their bodies). No secrets or personal data. One commit per finding, imperative message, do not push.
6. For each **DECISION Dn** (`12-owner-tasks-and-decisions.md`) implement the recommended default and say so.
7. Finish by appending a `## Status` section to this file.

## H4. `next@16.3.1` is in the range of a critical advisory (High)

- **Where:** `package.json` (`next` 16.3.1). `npm audit --omit=dev` (14 Oct) reported 5 advisories: `next` critical for 16.0.0 to 16.3.7 (remote code execution advisories fixed in 16.3.3 and 16.3.6; SSRF, cache poisoning and information disclosure fixed in 16.3.8), plus high: `sharp`, `fast-uri`, `source-map-js`, `brace-expansion` (transitive). The app uses `next/image` in two places and is hosted on Vercel, which reduces but does not remove exposure.
- **Change:** upgrade `next` (and `eslint-config-next`, which must match) to the latest 16.x patch (at least 16.3.8; `npm audit` suggested 16.4.0); `npm audit fix` for the transitive ones; `npm run build`; run the tests and the dev server; read the release notes for anything that changes `middleware`/`proxy` or Server Actions. Note the dev server already warns that the `middleware` file convention is deprecated in favour of `proxy`: migrate it with the codemod only if the build and the redirects still behave (check `/dashboard`, `/coach`, `/owner` redirects with cookies omitted).
- **Acceptance:** `npm audit --omit=dev` reports no critical or high advisories (or a written reason for any that remain).

## M11. No security headers (Medium)

- **Where:** `next.config.ts` and `vercel.json` set none. Production sends only HSTS (confirmed live). Missing: Content-Security-Policy, framing protection (the app can be framed for clickjacking), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **Change (`headers()` in `next.config.ts`):** `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`; `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=()`. Add a **CSP in Report-Only mode first**: `default-src 'self'`; `script-src 'self' 'unsafe-inline'` (Next inlines a theme script and flight data; plan a nonce-based tightening later); `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io`; `img-src 'self' data: blob: https://*.supabase.co`; `frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com`; `media-src 'self' blob: https://*.supabase.co`; `font-src 'self'`; `worker-src 'self'`. Send violation reports to a Sentry or your own endpoint. Provide the owner with the switch from Report-Only to enforcing after a week of clean reports.
- **Acceptance:** a test or script that fetches `/login` locally and asserts each header; a note listing what the Report-Only policy would block.

## M6. `/auth/confirm` (Medium)

- **Where:** `app/auth/confirm/route.ts`. **Open redirect (line 34):** it redirects to any `next` value, so a link built with an attacker's own valid token and `next=https://evil.example` logs the victim into the attacker's account and then sends them off-site. **Change:** accept only a same-origin relative path (starts with a single `/`, not `//`, no scheme); otherwise use `/`.
- **Token burned by scanners:** the route verifies the one-time token on a GET, so email security scanners that open links in advance use it up and the user lands on `/login` with no explanation (line 38). **Change:** the GET renders a small page with a "Continue" button that POSTs the token; on failure show "This link has expired. Request a new one." with a link to reset.
- **Acceptance:** unit tests for the path allow-list (`/dashboard` ok; `//evil.example`, `https://evil.example`, `/\evil`, empty rejected).

## M7. Public sign-up endpoint (Medium, DECISION D17)

- **Where:** `app/api/join/route.ts` (account creation at lines 34-45). Anyone with a coach's reusable join link can create unlimited accounts: no rate limit or CAPTCHA; `email_confirm: true` marks any address verified without proof of ownership; the 409 "already an account with that email" reveals which emails are registered; raw Auth error text is returned for other failures. Every account is attached to the coach and gym, so spam appears in the client list.
- **Default (D17):**
  1. **Rate limit** in the database (migration `0140`: `rate_limits(key text, window_start timestamptz, count int, primary key (key, window_start))` and a small helper `takeToken(key, limit, windowSeconds)` using the admin client): 5 attempts per IP per hour and 50 per link per day. No new external service.
  2. **Per-link limits:** `onboarding_links.max_uses_per_day int default 100`, `expires_at timestamptz null`, `uses_today`; show them to the coach in brief 08's join-link card (note in `## Status`).
  3. **Verify the email:** create the user **unconfirmed** and send a confirmation through Supabase Auth (it works without Resend) instead of `email_confirm: true`; the member signs in after confirming. If the owner prefers the current one-step flow, keep `email_confirm: true` but then the rate limits are mandatory.
  4. **One neutral message** for every failure ("We could not create your account. Check your details or ask your coach."); log the real reason to Sentry.
- **Acceptance:** unit tests for the limiter (fake clock) and the neutral-error mapping.

## M13. Secrets that fail open; unprotected AI route (Medium)

- **Cron and push routes:** all seven routes under `app/api/cron/*` and `app/api/push/send` compare `Authorization` with `` `Bearer ${process.env.CRON_SECRET}` `` (for example `expire-credits/route.ts:9`). If the variable is unset the expected string is `"Bearer undefined"`, which any caller can send, and middleware exempts `/api/cron/*` from login. (In production both secrets are currently set, so this is a safety net.) **Change:** add `lib/cronAuth.ts` with `isAuthorizedCron(request, secretName)`: refuse when the variable is missing or empty, compare with `crypto.timingSafeEqual`; use it as the first lines of every route (edit **only** the check; brief 09 owns the rest of those files). The comment in `.env.local.example` that says a Postgres trigger calls `/api/push/send` is wrong: fix it.
- **`/api/estimate-food-photo`:** lets any logged-in member trigger paid Anthropic calls repeatedly. It is unused by the UI (the photo diary is visual only), has an unchecked `request.json()`, interpolates the member's text into the prompt, rewrites the day's macros, and uses model id `claude-sonnet-5` (`lib/ai/estimateFoodPhoto.ts:8`, not verified as valid). **Default:** return 404 unless `FEATURE_AI_PHOTO=true`; when enabled, require a per-member daily limit (use `rate_limits`), validate the body, cap image size, and use a valid current model id from the project's configuration. `ANTHROPIC_API_KEY` is unset in production, so nothing changes today.

## H3 (code). Privacy Policy and Terms are placeholders and unreachable when logged out (High)

- **Where:** `app/legal/_components/LegalPageShell.tsx` (the text is "Your coach hasn't published a … yet"); `lib/supabase/middleware.ts:52-59`: the login-redirect exemption list has no `/legal`, so a logged-out visitor is redirected to login (confirmed live) even though the sign-in and join pages link to them and the join form says "By continuing you agree to our terms and privacy policy".
- **Change:** add `/legal` to the exemption list (and `/unsubscribe` and `/auth/confirm` if brief 09 or M6 needs them: keep the list in one constant with a comment per entry). Rebuild the legal pages as real content slots: `app/legal/privacy/page.tsx` and `terms/page.tsx` render markdown or structured sections from `content/legal/*.md` (new files the owner or their lawyer fills in), show "Last updated" and a version, and never show "your coach hasn't published" to members. Until the owner supplies text, ship clearly marked draft headings built from `docs/PRE_TESTING_CHECKLIST.md` section 5 (the data inventory), marked "DRAFT: not legal advice".
- **Data access request (DECISION D13):** add a member-facing "Download my data" (`exportMyData()` server action) returning a JSON file of the member's own rows (profile, logs, bookings, credits ledger, forms and answers, chat text without attachments) plus a list of stored files. Keep it behind a confirmation and rate-limit it.

## CM8. Seed and stress scripts can hit the live project (Medium)

- **Where:** `scripts/seed-demo-fleet.ts` (tracked in git), `seed-smoke-fleet.ts` and `seed-walkthrough.ts` (untracked) create real Auth users with fixed passwords written in the source (a different fixed password in each script; not repeated here). `stress-test.ts` creates users, books classes and moves credits. None has a guard like `supabase/tests/security-audit/_safety.cjs`. The live project already contains 219 seeded accounts and the owner's notes say the dev database is shared with real data.
- **Change:** every script that **writes** (`seed*.ts`, `stress-test.ts`, `copy-course-to-gym.ts`) first calls a shared `scripts/_guard.ts` that refuses unless `--ref=<project ref>` is listed in `SCRIPT_ALLOWED_REFS` **and** the project is not the live one named in `LIVE_PROJECT_REF`; generate passwords at run time (random, printed once) instead of constants; add a `--cleanup` option to every seed script that deletes only what it created (tag created rows with a marker). The operational scripts (`create-gym`, `create-coach`, `create-owner`) are legitimate on live: require an explicit `--yes-this-is-live` flag. **Do not run any of them.**
- **Note for the owner (list in `## Status`):** The fixed password in `seed-demo-fleet.ts` is in git history; if any account with it exists on a real project, change or delete it.

## R8, R43, R44. App updates, caching and weight (Medium/Low)

- **R44 caching:** every file in `public/` (the logo, three app icons, 11 iPhone splash images, `manifest.json`) is served `max-age=0, must-revalidate`, so every launch re-checks each one. Add `headers()` rules: `/icons/*`, `/splash/*`, `/logo-*.png` with `public, max-age=31536000, immutable` **after** giving them versioned names or query strings (or `max-age=86400, stale-while-revalidate=604800` if you keep the names); `manifest.json` `max-age=3600`. There are no iPad splash images: add the missing `apple-touch-startup-image` sizes (generate from the existing artwork; ask the owner for approval of the look) so an iPad install does not flash white.
- **R8 service worker and skew:** `public/sw.js` only updates when its own bytes change (a `VERSION` constant). Generate the version from the **build id** at build time (a small script in `package.json` `prebuild` that writes `public/sw.js` from a template, or `next.config.ts` `generateBuildId`) so every deploy updates it; expose `/api/version` returning the build id for brief 07's banner. Do not auto-reload: brief 07 shows the banner. Enable **Skew Protection** in Vercel is an owner setting (brief 12).
- **R43 weight:** after brief 07's lazy loading, record the new sign-in page weight; here only check `next.config.ts` for `images` settings, compression and `reactCompiler`/`optimizePackageImports` options that shrink the bundle (for example `lucide-react`).

## Report only (do not change code): server-action errors in production

- In production, a thrown error inside a Server Action reaches the browser as a generic message ("An error occurred in the Server Components render…"), so any action that calls `raise(error)` shows members and coaches an unhelpful failure (the audit saw this note on the barcode scan). Produce `docs/RAISE_CALLSITES.md`: a table of every `raise(` call site in `lib/data/*.ts` that a user can trigger, with file, function, the screen that calls it, and whether it uses the `ActionResult` pattern instead. Do **not** edit those files (every other brief owns some of them); the owner will route each to the right brief.

## Definition of done

- `npm run build`, tests, lint and type-check green; `npm audit --omit=dev` result recorded; header test passing; the guard script and `docs/RAISE_CALLSITES.md` present.
- `## Status` lists new env vars (`LIVE_PROJECT_REF`, `SCRIPT_ALLOWED_REFS`, `FEATURE_AI_PHOTO`), the CSP report-to-enforce switch, and every owner step (content for the legal pages, Vercel skew protection).
