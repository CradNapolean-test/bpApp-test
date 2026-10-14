// Static analysis of the SQL functions: latest definition of each function across schema.sql + all migrations
// (in apply order), with its grants. No database access. Used by rpc-state-change-check.cjs and runnable alone:
//   node supabase/tests/security-audit/parse-functions.cjs
const fs = require('fs');
const path = require('path');

const supabaseDir = path.resolve(__dirname, '../..');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const argTypes = (args) =>
  args.split(',').map((a) => norm(a)).filter(Boolean)
    .map((a) => a.replace(/\s+default\s+.*$/i, '').replace(/^(in|out|inout|variadic)\s+/i, ''))
    .map((a) => { const parts = a.split(' '); return parts.length > 1 ? parts.slice(1).join(' ') : parts[0]; })
    .join(',').toLowerCase();
const sigKey = (name, args) => `${name}(${argTypes(args)})`;

function parseFunctions() {
  const files = [
    supabaseDir + '/schema.sql',
    ...fs.readdirSync(supabaseDir + '/migrations').filter((f) => f.endsWith('.sql')).sort().map((f) => supabaseDir + '/migrations/' + f),
  ];
  const fns = new Map();
  for (const f of files) {
    const label = path.basename(f);
    const sql = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

    for (const d of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s*\(([^)]*)\)/gi)) fns.delete(sigKey(d[1], d[2]));

    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*(returns[\s\S]*?)?(\$[a-z_]*\$)/gi;
    let m;
    while ((m = re.exec(sql))) {
      const [, name, args, headerRest, tag] = m;
      const bodyStart = m.index + m[0].length;
      const end = sql.indexOf(tag, bodyStart);
      if (end < 0) continue;
      const afterEnd = end + tag.length;
      const semi = sql.indexOf(';', afterEnd);
      const h = ((headerRest || '') + ' ' + sql.slice(afterEnd, semi < 0 ? afterEnd : semi)).toLowerCase();
      const key = sigKey(name, args);
      const prev = fns.get(key);
      fns.set(key, {
        name, key, args: norm(args), file: label, body: sql.slice(bodyStart, end),
        securityDefiner: /security\s+definer/.test(h),
        searchPath: (h.match(/set\s+search_path\s*(?:=|to)\s*([^\s;]+)/) || [])[1] || null,
        acl: prev ? prev.acl : [],
      });
      re.lastIndex = afterEnd;
    }

    for (const g of sql.matchAll(/(grant|revoke)\s+(?:all|execute)(?:\s+privileges)?\s+on\s+function\s+(?:public\.)?(\w+)\s*\(([^)]*)\)\s+(to|from)\s+([^;]+);/gi)) {
      const info = fns.get(sigKey(g[2], g[3]));
      if (info) info.acl.push({ op: g[1].toLowerCase(), roles: g[5].toLowerCase().split(',').map((r) => r.trim()) });
    }
  }
  return [...fns.values()];
}

// Effective EXECUTE access by role, assuming Supabase's default grants (public, anon, authenticated, service_role).
function access(fn) {
  const set = new Set(['public', 'anon', 'authenticated', 'service_role']);
  for (const e of fn.acl) for (const r of e.roles) { if (e.op === 'grant') set.add(r); else set.delete(r); }
  const viaPublic = set.has('public');
  return { anon: set.has('anon') || viaPublic, authenticated: set.has('authenticated') || viaPublic };
}

module.exports = { parseFunctions, access };

if (require.main === module) {
  const all = parseFunctions().filter((f) => f.securityDefiner);
  console.log('SECURITY DEFINER functions:', all.length);
  const noPath = all.filter((f) => !f.searchPath);
  console.log('without a pinned search_path:', noPath.length ? noPath.map((f) => f.key).join(', ') : 'none');
  // Helpers that RLS policies call must stay executable; everything else should not be callable by anon.
  const anonCallable = all.filter((f) => access(f).anon);
  console.log('still executable by anon (per migrations):', anonCallable.length, anonCallable.length ? '\n  ' + anonCallable.map((f) => f.name).join(', ') : '');
  // Authorisation checks that are NULL for a logged-out caller / non-coach and then RAISE (fail open).
  const nullable = /(not\s+(public\.)?(is_self|owns_client|is_admin_of_gym|shares_gym_membership)\s*\()|(!=|<>)\s*(public\.)?my_gym_id\(\)|(!=|<>)\s*auth\.uid\(\)/i;
  const risky = all.filter((f) => /raise\s+exception/i.test(f.body) && nullable.test(f.body) && !/coalesce\(|is distinct from|is null or/i.test(f.body));
  console.log('NULL-unsafe permission checks:', risky.length ? risky.map((f) => f.name).join(', ') : 'none');
}
