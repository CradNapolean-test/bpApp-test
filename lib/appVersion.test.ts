import { describe, expect, it } from 'vitest';
import { buildId, isNewerVersion } from './appVersion';

describe('isNewerVersion (R8)', () => {
  it('is true when the server is on a different deployment from the one this page came from', () => {
    expect(isNewerVersion('dpl_aaa', 'dpl_bbb')).toBe(true);
  });
  it('is false when they match', () => {
    expect(isNewerVersion('dpl_aaa', 'dpl_aaa')).toBe(false);
  });
  it('is false when either is unknown, so a failed check never shows the banner', () => {
    expect(isNewerVersion('dpl_aaa', null)).toBe(false);
    expect(isNewerVersion(undefined, 'dpl_bbb')).toBe(false);
    expect(isNewerVersion('', 'dpl_bbb')).toBe(false);
  });
  it('never compares on a developer machine', () => {
    expect(isNewerVersion('dev', 'dpl_bbb')).toBe(false);
    expect(isNewerVersion('dpl_aaa', 'dev')).toBe(false);
  });
});

describe('buildId', () => {
  it('prefers the deployment id, then the commit, then "dev"', () => {
    expect(buildId({ VERCEL_DEPLOYMENT_ID: 'dpl_1', VERCEL_GIT_COMMIT_SHA: 'abc' })).toBe('dpl_1');
    expect(buildId({ VERCEL_GIT_COMMIT_SHA: 'abc' })).toBe('abc');
    expect(buildId({})).toBe('dev');
  });
});
