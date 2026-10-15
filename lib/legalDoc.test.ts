import { describe, expect, it } from 'vitest';
import { loadLegalDocument } from './legalContent';
import { LEGAL_SLUGS, parseLegalMarkdown, splitBold, unavailableDoc } from './legalDoc';

const SAMPLE = `---
title: Privacy Policy
version: 1.2
updated: 2026-11-01
status: final
---

## What we collect

First line
second line of the same paragraph.

- **Name** and email
- Phone

### Detail

Last paragraph.
`;

describe('parseLegalMarkdown', () => {
  const doc = parseLegalMarkdown(SAMPLE);

  it('reads the title, version, date and status from the top of the file', () => {
    expect(doc).toMatchObject({ title: 'Privacy Policy', version: '1.2', updated: '2026-11-01', draft: false });
  });

  it('turns headings, paragraphs and bullet lists into blocks', () => {
    expect(doc.blocks).toEqual([
      { type: 'h2', text: 'What we collect' },
      { type: 'p', text: 'First line second line of the same paragraph.' },
      { type: 'ul', items: ['**Name** and email', 'Phone'] },
      { type: 'h3', text: 'Detail' },
      { type: 'p', text: 'Last paragraph.' },
    ]);
  });

  it('is a draft unless the file says final', () => {
    expect(parseLegalMarkdown('---\ntitle: T\n---\n\nText').draft).toBe(true);
    expect(parseLegalMarkdown('No header at all').draft).toBe(true);
    expect(parseLegalMarkdown('---\nstatus: FINAL\n---\n\nText').draft).toBe(false);
  });

  it('uses the fallback title when the file has none', () => {
    expect(parseLegalMarkdown('Just text', 'Terms of Service').title).toBe('Terms of Service');
  });

  it('never passes HTML through: markup stays as plain text blocks', () => {
    const risky = parseLegalMarkdown('<script>alert(1)</script>\n\n- <img src=x onerror=alert(1)>');
    expect(risky.blocks).toEqual([
      { type: 'p', text: '<script>alert(1)</script>' },
      { type: 'ul', items: ['<img src=x onerror=alert(1)>'] },
    ]);
  });
});

describe('splitBold', () => {
  it('marks only **double-starred** text as bold', () => {
    expect(splitBold('a **b** c')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' c' }]);
    expect(splitBold('no bold here')).toEqual([{ text: 'no bold here' }]);
    expect(splitBold('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4' }]);
  });
});

describe('the pages members see', () => {
  it('a missing file never says "your coach has not published"', () => {
    const doc = unavailableDoc('Privacy Policy');
    expect(JSON.stringify(doc)).not.toMatch(/coach/i);
    expect(doc.blocks[0]).toEqual({ type: 'p', text: 'This page is being prepared. Please ask your gym for a copy of the Privacy Policy.' });
  });

  it('falls back to that page when the content file cannot be read', async () => {
    const doc = await loadLegalDocument('privacy', 'C:/definitely/not/a/real/folder');
    expect(doc.blocks[0]).toMatchObject({ type: 'p' });
    expect(JSON.stringify(doc)).not.toMatch(/coach/i);
  });

  it('the shipped draft files exist, parse, and are marked as drafts, not legal advice', async () => {
    for (const slug of LEGAL_SLUGS) {
      const doc = await loadLegalDocument(slug);
      expect(doc.title.length).toBeGreaterThan(3);
      expect(doc.version).toBeTruthy();
      expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.draft).toBe(true);
      expect(JSON.stringify(doc.blocks)).toMatch(/DRAFT: not legal advice/);
      expect(JSON.stringify(doc.blocks)).not.toMatch(/hasn't published|has not published/i);
      expect(doc.blocks.length).toBeGreaterThan(5);
    }
  });

  it('the privacy draft covers what the data inventory says is collected, and the member rights that exist', async () => {
    const text = JSON.stringify((await loadLegalDocument('privacy')).blocks);
    for (const word of ['Health and body', 'Supabase', 'Vercel', 'Resend', 'Sentry', 'Open Food Facts', 'Download my data', 'Delete my account']) {
      expect(text).toContain(word);
    }
  });
});
