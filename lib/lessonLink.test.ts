import { describe, expect, it } from 'vitest';
import { normaliseLessonLink } from './lessonLink';

describe('normaliseLessonLink', () => {
  it('leaves an empty link empty', () => {
    expect(normaliseLessonLink('')).toEqual({ ok: true, url: null });
    expect(normaliseLessonLink('   ')).toEqual({ ok: true, url: null });
    expect(normaliseLessonLink(null)).toEqual({ ok: true, url: null });
  });

  it('accepts an https link and trims it', () => {
    expect(normaliseLessonLink('  https://www.youtube.com/watch?v=abc  ')).toEqual({ ok: true, url: 'https://www.youtube.com/watch?v=abc' });
  });

  it.each(['http://example.com/video', 'javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://example.com/a', 'mailto:a@example.com'])(
    'refuses %s',
    (link) => {
      const result = normaliseLessonLink(link);
      expect(result.ok).toBe(false);
    }
  );

  it('refuses text that is not a full address', () => {
    expect(normaliseLessonLink('www.example.com').ok).toBe(false);
    expect(normaliseLessonLink('just some words').ok).toBe(false);
  });

  it('refuses https with no host', () => {
    expect(normaliseLessonLink('https://').ok).toBe(false);
  });
});
