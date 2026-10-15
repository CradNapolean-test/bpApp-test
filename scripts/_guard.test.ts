import { describe, expect, it } from 'vitest';
import { checkSandbox, hasLiveConfirmation, projectRefFromUrl, randomPassword } from './_guard';

const SANDBOX = 'sandboxref12345';
const LIVE = 'liveprojectref99';
const env = (extra: Record<string, string | undefined> = {}) => ({
  NEXT_PUBLIC_SUPABASE_URL: `https://${SANDBOX}.supabase.co`,
  SCRIPT_ALLOWED_REFS: SANDBOX,
  LIVE_PROJECT_REF: LIVE,
  ...extra,
});
const run = (argv: string[], e = env()) => checkSandbox({ argv: ['node', 'script.ts', ...argv], env: e });

describe('projectRefFromUrl', () => {
  it('reads the project ref from a Supabase address', () => {
    expect(projectRefFromUrl('https://abcdwxyz.supabase.co')).toBe('abcdwxyz');
    expect(projectRefFromUrl('https://abcdwxyz.supabase.co/rest/v1')).toBe('abcdwxyz');
  });

  it('is null for anything else', () => {
    expect(projectRefFromUrl(undefined)).toBeNull();
    expect(projectRefFromUrl('not a url')).toBeNull();
    expect(projectRefFromUrl('https://example.com')).toBeNull();
    expect(projectRefFromUrl('http://localhost:54321')).toBeNull();
  });
});

describe('checkSandbox', () => {
  it('runs against a listed sandbox when --ref matches the project in the environment', () => {
    expect(run([`--ref=${SANDBOX}`])).toEqual({ ok: true, ref: SANDBOX });
  });

  it('refuses without --ref', () => {
    expect(run([])).toMatchObject({ ok: false });
  });

  it('refuses the live project, even when it is listed as allowed', () => {
    const e = env({ NEXT_PUBLIC_SUPABASE_URL: `https://${LIVE}.supabase.co`, SCRIPT_ALLOWED_REFS: `${SANDBOX},${LIVE}` });
    expect(run([`--ref=${LIVE}`], e)).toMatchObject({ ok: false, reason: expect.stringMatching(/live/) });
  });

  it('refuses a sandbox ref passed while .env.local points at the live project (the case that matters)', () => {
    const e = env({ NEXT_PUBLIC_SUPABASE_URL: `https://${LIVE}.supabase.co` });
    const result = run([`--ref=${SANDBOX}`], e);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/does not match/);
  });

  it('refuses a ref that is not listed', () => {
    expect(run(['--ref=otherproject'], env({ NEXT_PUBLIC_SUPABASE_URL: 'https://otherproject.supabase.co' }))).toMatchObject({ ok: false, reason: expect.stringMatching(/SCRIPT_ALLOWED_REFS/) });
    expect(run([`--ref=${SANDBOX}`], env({ SCRIPT_ALLOWED_REFS: '' }))).toMatchObject({ ok: false });
    expect(run([`--ref=${SANDBOX}`], env({ SCRIPT_ALLOWED_REFS: undefined }))).toMatchObject({ ok: false });
  });

  it('refuses when LIVE_PROJECT_REF is not set, because it could not tell live from sandbox', () => {
    const result = run([`--ref=${SANDBOX}`], env({ LIVE_PROJECT_REF: undefined }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/LIVE_PROJECT_REF/);
  });

  it('refuses when the environment has no usable project address', () => {
    expect(run([`--ref=${SANDBOX}`], env({ NEXT_PUBLIC_SUPABASE_URL: undefined }))).toMatchObject({ ok: false });
    expect(run([`--ref=${SANDBOX}`], env({ NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' }))).toMatchObject({ ok: false });
  });
});

describe('the set-up scripts', () => {
  it('need --yes-this-is-live typed on purpose', () => {
    expect(hasLiveConfirmation(['node', 'create-coach.ts', '--email=a@b.co'])).toBe(false);
    expect(hasLiveConfirmation(['node', 'create-coach.ts', '--yes-this-is-live'])).toBe(true);
  });
});

describe('randomPassword', () => {
  it('is different each time, long, and satisfies a mixed-character rule', () => {
    const a = randomPassword();
    const b = randomPassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(20);
    expect(a).toMatch(/[a-z]/);
    expect(a).toMatch(/[A-Z]/);
    expect(a).toMatch(/\d/);
    expect(a).toMatch(/[^A-Za-z0-9]/);
  });
});
