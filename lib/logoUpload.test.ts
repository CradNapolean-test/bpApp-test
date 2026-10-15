import { describe, expect, it } from 'vitest';
import { LOGO_MAX_BYTES, logoPath, logoProblem, previousLogoToDelete } from './logoUpload';

describe('logoProblem', () => {
  it('accepts a small PNG, JPEG or WebP', () => {
    expect(logoProblem({ type: 'image/png', size: 5000 })).toBeNull();
    expect(logoProblem({ type: 'image/jpeg', size: LOGO_MAX_BYTES })).toBeNull();
    expect(logoProblem({ type: 'IMAGE/WEBP', size: 10 })).toBeNull();
  });

  it('refuses other types, including SVG which can carry script', () => {
    expect(logoProblem({ type: 'image/svg+xml', size: 100 })).toMatch(/PNG, JPEG or WebP/);
    expect(logoProblem({ type: 'image/gif', size: 100 })).toMatch(/PNG, JPEG or WebP/);
    expect(logoProblem({ type: 'text/html', size: 100 })).toMatch(/PNG, JPEG or WebP/);
    expect(logoProblem({ type: '', size: 100 })).toMatch(/PNG, JPEG or WebP/);
  });

  it('refuses a picture over 1 MB, and an empty file', () => {
    expect(logoProblem({ type: 'image/png', size: LOGO_MAX_BYTES + 1 })).toMatch(/1 MB/);
    expect(logoProblem({ type: 'image/png', size: 0 })).toMatch(/empty/);
  });
});

describe('logoPath', () => {
  it('uses the coach\'s folder and an extension from the checked type, not the file name', () => {
    expect(logoPath('u1', 'image/png', 1)).toBe('u1/logo-1.png');
    expect(logoPath('u1', 'image/jpeg', 2)).toBe('u1/logo-2.jpg');
    expect(logoPath('u1', 'image/webp', 3)).toBe('u1/logo-3.webp');
  });
});

describe('previousLogoToDelete', () => {
  it('deletes the old logo once a new one is saved', () => {
    expect(previousLogoToDelete('u1/logo-1.png', 'u1/logo-2.png', 'u1')).toBe('u1/logo-1.png');
  });

  it('keeps the file that was just uploaded', () => {
    expect(previousLogoToDelete('u1/logo-2.png', 'u1/logo-2.png', 'u1')).toBeNull();
  });

  it('removing the logo deletes the old one', () => {
    expect(previousLogoToDelete('u1/logo-1.png', null, 'u1')).toBe('u1/logo-1.png');
  });

  it('never deletes anything outside the coach\'s own folder', () => {
    expect(previousLogoToDelete('u2/logo-1.png', 'u1/logo-2.png', 'u1')).toBeNull();
    expect(previousLogoToDelete('u1/../u2/logo.png', 'u1/logo-2.png', 'u1')).toBeNull();
  });

  it('has nothing to delete when there was no logo', () => {
    expect(previousLogoToDelete(null, 'u1/logo-2.png', 'u1')).toBeNull();
    expect(previousLogoToDelete(undefined, 'u1/logo-2.png', 'u1')).toBeNull();
  });
});
