import fs from 'node:fs';
import path from 'node:path';

// Shared by the static migration tests: replays `create policy` / `drop policy` across schema.sql and every migration, in apply
// order, and returns what is left per public table as { policy name -> command }.
const supabaseDir = path.resolve(__dirname, '..');

export const sqlFiles = [
  path.join(supabaseDir, 'schema.sql'),
  ...fs
    .readdirSync(path.join(supabaseDir, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(supabaseDir, 'migrations', f)),
];

export function replayPolicies(): Map<string, Map<string, string>> {
  const tables = new Map<string, Map<string, string>>();
  for (const file of sqlFiles) {
    const sql = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const events: { index: number; kind: 'create' | 'drop'; table: string; name: string; command: string }[] = [];
    for (const m of sql.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?(\w+)\s+for\s+(\w+)/gi)) {
      events.push({ index: m.index ?? 0, kind: 'create', table: m[2], name: m[1], command: m[3].toLowerCase() });
    }
    for (const m of sql.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+(?:public\.)?(\w+)/gi)) {
      events.push({ index: m.index ?? 0, kind: 'drop', table: m[2], name: m[1], command: '' });
    }
    events.sort((a, b) => a.index - b.index);
    for (const e of events) {
      const policies = tables.get(e.table) ?? new Map<string, string>();
      if (e.kind === 'create') policies.set(e.name, e.command);
      else policies.delete(e.name);
      tables.set(e.table, policies);
    }
  }
  return tables;
}
