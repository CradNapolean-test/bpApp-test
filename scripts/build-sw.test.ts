import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSw, renderSw, swVersion } from './build-sw.mjs';

describe('swVersion', () => {
  it('follows the deployment, so every deploy has a new version', () => {
    expect(swVersion({ VERCEL_DEPLOYMENT_ID: 'dpl_ABC123' })).toBe('bp-dpl_ABC123');
    expect(swVersion({ VERCEL_GIT_COMMIT_SHA: 'a1b2c3d4' })).toBe('bp-a1b2c3d4');
    expect(swVersion({ VERCEL_DEPLOYMENT_ID: 'dpl_1', VERCEL_GIT_COMMIT_SHA: 'zzz' })).toBe('bp-dpl_1');
  });

  it('is "bp-dev" on a developer machine, so the file does not change there', () => {
    expect(swVersion({})).toBe('bp-dev');
  });

  it('keeps to plain characters and a short length', () => {
    expect(swVersion({ VERCEL_DEPLOYMENT_ID: 'a b/c?d' })).toBe('bp-a-b-c-d');
    expect(swVersion({ VERCEL_DEPLOYMENT_ID: 'x'.repeat(200) }).length).toBeLessThanOrEqual(51);
  });
});

describe('renderSw', () => {
  it('puts the version in the file', () => {
    const out = renderSw("const VERSION = '__SW_VERSION__';", { VERCEL_DEPLOYMENT_ID: 'dpl_9' });
    expect(out).toBe("const VERSION = 'bp-dpl_9';");
  });

  it('refuses a template with no placeholder (it would never update)', () => {
    expect(() => renderSw("const VERSION = 'bp-v4';", {})).toThrow(/placeholder/);
  });
});

describe('buildSw', () => {
  it('writes the file when the version changes and leaves it alone when it does not', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-'));
    const templatePath = path.join(dir, 'sw.template.js');
    const outPath = path.join(dir, 'sw.js');
    fs.writeFileSync(templatePath, "const VERSION = '__SW_VERSION__';\n");
    expect(buildSw({ VERCEL_DEPLOYMENT_ID: 'dpl_1' }, { templatePath, outPath })).toEqual({ version: 'bp-dpl_1', changed: true });
    expect(fs.readFileSync(outPath, 'utf8')).toContain('bp-dpl_1');
    expect(buildSw({ VERCEL_DEPLOYMENT_ID: 'dpl_1' }, { templatePath, outPath }).changed).toBe(false);
    expect(buildSw({ VERCEL_DEPLOYMENT_ID: 'dpl_2' }, { templatePath, outPath }).changed).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the real template', () => {
  const template = fs.readFileSync(path.join(__dirname, 'sw.template.js'), 'utf8');

  it('has the placeholder and honours the notification tag', () => {
    expect(template).toContain("const VERSION = '__SW_VERSION__';");
    expect(template).toMatch(/payload\.tag/);
    expect(template).toMatch(/renotify: true/);
  });
});
