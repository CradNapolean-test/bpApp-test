import { randomBytes } from 'node:crypto';

// A safety catch for every script that WRITES (seed*.ts, stress-test.ts, copy-course-to-gym.ts) and for the one-off set-up scripts (CM8).
// `.env.local` in this repo points at the project the app really uses, and seed and stress scripts create real Auth users and rows. They now
// refuse to run unless:
//   1. --ref=<project ref> is given AND is the project named by NEXT_PUBLIC_SUPABASE_URL (so a sandbox ref cannot be passed while the
//      environment points at the live project),
//   2. that ref is listed in SCRIPT_ALLOWED_REFS (comma separated; empty by default, so nothing runs until a sandbox is named on purpose), and
//   3. it is not LIVE_PROJECT_REF, which must be set (without it the guard cannot tell which project is live, so it refuses).
// The set-up scripts (create-gym, create-coach, create-owner) are meant for the live project, but only with --yes-this-is-live.
// The same idea as supabase/tests/security-audit/_safety.cjs.

export type GuardResult = { ok: true; ref: string } | { ok: false; reason: string };

// https://abcdwxyz.supabase.co -> abcdwxyz
export function projectRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const match = /^([a-z0-9]+)\.supabase\.(co|in|net)$/.exec(host);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const list = (value: string | undefined) => (value ?? '').split(',').map((r) => r.trim()).filter(Boolean);

export function checkSandbox(input: { argv: string[]; env: Record<string, string | undefined> }): GuardResult {
  const ref = (input.argv.find((a) => a.startsWith('--ref=')) ?? '').slice('--ref='.length).trim();
  const live = (input.env.LIVE_PROJECT_REF ?? '').trim();
  const allowed = list(input.env.SCRIPT_ALLOWED_REFS);
  const envRef = projectRefFromUrl(input.env.NEXT_PUBLIC_SUPABASE_URL);

  if (!ref) return { ok: false, reason: 'pass --ref=<sandbox project ref>' };
  if (!live) return { ok: false, reason: 'LIVE_PROJECT_REF is not set, so there is no way to tell the live project from a sandbox' };
  if (ref === live) return { ok: false, reason: `${ref} is the live project` };
  if (!allowed.includes(ref)) return { ok: false, reason: `${ref} is not listed in SCRIPT_ALLOWED_REFS` };
  if (!envRef) return { ok: false, reason: 'NEXT_PUBLIC_SUPABASE_URL is missing or is not a Supabase project address' };
  if (envRef !== ref) return { ok: false, reason: `--ref=${ref} does not match the project in NEXT_PUBLIC_SUPABASE_URL (${envRef})` };
  if (envRef === live) return { ok: false, reason: 'NEXT_PUBLIC_SUPABASE_URL points at the live project' };
  return { ok: true, ref };
}

export function requireSandbox(): string {
  const result = checkSandbox({ argv: process.argv, env: process.env });
  if (!result.ok) {
    console.error(
      `Refusing to run: ${result.reason}.\n` +
        'This script writes test data. Point .env.local at a throwaway sandbox project, set LIVE_PROJECT_REF to the live project\'s ref and\n' +
        'SCRIPT_ALLOWED_REFS to the sandbox\'s ref, then run it with --ref=<sandbox ref>.'
    );
    process.exit(2);
  }
  return result.ref;
}

export function hasLiveConfirmation(argv: string[]): boolean {
  return argv.includes('--yes-this-is-live');
}

// For the set-up scripts that are legitimate on the live project: stop unless the person typed the flag on purpose.
export function requireLiveConfirmation(what: string): void {
  if (!hasLiveConfirmation(process.argv)) {
    console.error(`Refusing to run: ${what} writes to the project named in .env.local, which is normally the LIVE project.\nAdd --yes-this-is-live if that is what you intend.`);
    process.exit(2);
  }
}

// A fresh random password for each run, printed once by the script. Mixed case, a digit and a symbol so it passes any password rule.
export function randomPassword(): string {
  return `Aa1!${randomBytes(15).toString('base64url')}`;
}
