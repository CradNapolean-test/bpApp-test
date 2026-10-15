import { describe, expect, it } from 'vitest';
import { CHILD_TABLES, EXPORTS_PER_DAY, OWN_TABLES, buildExport, chatTextOnly, exportFilename, storedFiles } from './dataExport';

describe('chatTextOnly', () => {
  const rows = [
    { id: 1, client_id: 'me', sender_id: 'me', text: 'Hi coach', created_at: '2026-10-01T10:00:00Z', image_path: null, audio_path: null },
    { id: 2, client_id: 'me', sender_id: 'coach', text: 'Hello!', created_at: '2026-10-01T10:01:00Z' },
    { id: 3, client_id: 'me', sender_id: 'me', text: null, image_path: 'me/photo.jpg', created_at: '2026-10-01T10:02:00Z' },
    { id: 4, client_id: 'me', sender_id: 'me', text: '   ', audio_path: 'me/voice.webm', created_at: '2026-10-01T10:03:00Z' },
  ];

  it('keeps the words and who said them, with no attachments inside the file', () => {
    const out = chatTextOnly(rows);
    expect(out).toEqual([
      { id: 1, sent_at: '2026-10-01T10:00:00Z', from: 'me', text: 'Hi coach' },
      { id: 2, sent_at: '2026-10-01T10:01:00Z', from: 'someone else', text: 'Hello!' },
    ]);
    expect(JSON.stringify(out)).not.toContain('photo.jpg');
    expect(JSON.stringify(out)).not.toContain('voice.webm');
  });
});

describe('storedFiles', () => {
  it('lists every kind of file held for the member', () => {
    const files = storedFiles({
      progress_photos: [{ storage_path: 'me/a.jpg' }],
      food_photo_entries: [{ storage_path: 'me/meal.jpg' }],
      body_scans: [{ printout_path: 'me/scan.pdf' }, { printout_path: null }],
      chat_messages: [{ image_path: 'me/c.jpg' }, { audio_path: 'me/v.webm' }, { text: 'no file' }],
    });
    expect(files).toEqual([
      { kind: 'progress photo', path: 'me/a.jpg' },
      { kind: 'meal photo', path: 'me/meal.jpg' },
      { kind: 'body scan printout', path: 'me/scan.pdf' },
      { kind: 'chat photo', path: 'me/c.jpg' },
      { kind: 'chat voice note', path: 'me/v.webm' },
    ]);
  });

  it('is empty when there are no files', () => {
    expect(storedFiles({})).toEqual([]);
  });
});

describe('buildExport', () => {
  const built = buildExport({
    userId: 'u1',
    email: 'member@example.com',
    generatedAt: new Date('2026-10-16T10:00:00Z'),
    tables: { client_profiles: [{ client_id: 'u1', name: 'Member' }], daily_logs: [], progress_photos: [{ storage_path: 'u1/p.jpg' }] },
    chat: [{ id: 1, client_id: 'u1', sender_id: 'u1', text: 'hello', created_at: '2026-10-01T00:00:00Z' }],
  });

  it('holds the member\'s own tables, their chat words and the list of files', () => {
    expect(built.account).toEqual({ id: 'u1', email: 'member@example.com' });
    expect(built.generated_at).toBe('2026-10-16T10:00:00.000Z');
    expect(built.data.client_profiles).toEqual([{ client_id: 'u1', name: 'Member' }]);
    expect(built.chat_messages).toHaveLength(1);
    expect(built.stored_files).toEqual([{ kind: 'progress photo', path: 'u1/p.jpg' }]);
  });

  it('says what is not in it', () => {
    expect(built.about).toMatch(/private notes are not included/i);
    expect(built.about).toMatch(/files/);
  });

  it('is valid JSON', () => {
    expect(() => JSON.parse(JSON.stringify(built))).not.toThrow();
  });
});

describe('what is read', () => {
  it('never includes the coach-only tables', () => {
    const names = [...OWN_TABLES.map((t) => t.table), ...CHILD_TABLES.map((t) => t.table)];
    for (const secret of ['client_coach_notes', 'client_journal_entries', 'coach_reviews', 'red_flag_entries', 'coach_email_log', 'push_subscriptions', 'push_devices']) {
      expect(names).not.toContain(secret);
    }
  });

  it('every child table reads through a parent that is itself read', () => {
    const own = OWN_TABLES.map((t) => t.table);
    for (const child of CHILD_TABLES) expect(own).toContain(child.parent);
  });

  it('is limited per day, and named by date', () => {
    expect(EXPORTS_PER_DAY).toBeLessThanOrEqual(5);
    expect(exportFilename(new Date('2026-10-16T23:30:00Z'))).toBe('my-data-2026-10-16.json');
  });
});
