import { describe, expect, it } from 'vitest';
import { uploadExtension } from './uploadName';

describe('uploadExtension (L9)', () => {
  it('uses the file type, whatever the name says', () => {
    expect(uploadExtension({ name: 'IMG_1.JPG', type: 'image/jpeg' })).toBe('jpg');
    expect(uploadExtension({ name: 'shot', type: 'image/png' })).toBe('png');
    expect(uploadExtension({ name: 'evil.php', type: 'image/webp' })).toBe('webp');
  });

  it('never lets the name put anything odd in the path', () => {
    expect(uploadExtension({ name: 'a/../b.php', type: '' })).toBe('jpg');
    expect(uploadExtension({ name: 'holiday.jpg.php', type: 'application/x-php' })).toBe('jpg');
    expect(uploadExtension({ name: 'x.svg', type: 'image/svg+xml' })).toBe('jpg');
  });

  it('trusts a plain picture extension when the phone sends no type', () => {
    expect(uploadExtension({ name: 'photo.HEIC', type: '' })).toBe('heic');
    expect(uploadExtension({ name: 'photo.jpeg' })).toBe('jpg');
  });

  it('uses the fallback you give it (a logo is a png by default)', () => {
    expect(uploadExtension({ name: 'logo', type: '' }, 'png')).toBe('png');
  });
});
