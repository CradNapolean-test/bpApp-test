'use server';

import { createClient } from '@/lib/supabase/server';
import { fetchAllPages } from '@/lib/paging';
import { CHILD_TABLES, EXPORTS_PER_DAY, OWN_TABLES, buildExport, exportFilename } from '@/lib/dataExport';
import { DAY, adminRateStore, takeToken } from '@/lib/rateLimit';

// "Download my data" (H3, decision D13): a JSON file of the member's own rows. It reads as the member (row level security), so it holds
// only what they can already see; photos, scan printouts and voice notes are listed by name, not copied in. Asking is limited to a few
// times a day, because each one reads a lot of the database.

export type ExportResult = { ok: true; filename: string; json: string } | { ok: false; error: string };

type Row = Record<string, unknown>;

export async function exportMyData(): Promise<ExportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const limit = await takeToken(adminRateStore(), `export:${user.id}`, EXPORTS_PER_DAY, DAY, { onError: 'deny' });
  if (!limit.allowed) return { ok: false, error: 'You have already downloaded your data a few times today. Please try again tomorrow.' };

  const tables: Record<string, Row[]> = {};
  const readAll = async (table: string, column: string, values: string[]): Promise<Row[]> => {
    const { rows, error } = await fetchAllPages<Row>((from, to) => {
      const base = supabase.from(table).select('*');
      return (values.length === 1 ? base.eq(column, values[0]) : base.in(column, values)).range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message?: string } | null }>;
    });
    if (error) throw new Error(`${table}: ${error.message ?? 'read failed'}`);
    return rows;
  };

  try {
    for (const { table, column } of OWN_TABLES) tables[table] = await readAll(table, column, [user.id]);

    // Rows that belong to the member through a parent row (a day's food entries, a form's answers). Read in groups of 100 ids.
    for (const { table, column, parent } of CHILD_TABLES) {
      const ids = (tables[parent] ?? []).map((r) => r.id).filter((v): v is string => typeof v === 'string');
      const rows: Row[] = [];
      for (let i = 0; i < ids.length; i += 100) rows.push(...(await readAll(table, column, ids.slice(i, i + 100))));
      tables[table] = rows;
    }

    // Chat: their own thread. Only the words go in the file; attachments are listed as stored files.
    const chat = await readAll('chat_messages', 'client_id', [user.id]);

    const built = buildExport({ userId: user.id, email: user.email ?? null, generatedAt: new Date(), tables, chat });
    return { ok: true, filename: exportFilename(), json: JSON.stringify(built, null, 2) };
  } catch {
    return { ok: false, error: 'We could not gather your data just now. Please try again in a few minutes.' };
  }
}
