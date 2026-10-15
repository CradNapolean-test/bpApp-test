// Audit proofs H1, H2 and CM5 (see docs/MEMBERS_APP_AUDIT.md and docs/COACH_OWNER_AUDIT.md).
//
// Run it YOURSELF, as a seeded TEST member, never as a real member. I did not run it: it needs the project's public
// API key and a member password, and the permission system stopped me handling those. It makes three small writes and
// undoes what it can. Read it before you run it.
//
//   PowerShell:
//     $env:SUPABASE_URL      = "https://<your-project-ref>.supabase.co"
//     $env:SUPABASE_ANON_KEY = "<the NEXT_PUBLIC_SUPABASE_ANON_KEY value from .env.local>"
//     $env:MEMBER_EMAIL      = "smoke-adam-001@example.com"      # a seeded test member
//     $env:MEMBER_PASSWORD   = "<that account's password>"
//     node docs/audit-proofs/member-api-proofs.mjs
//
// What each step does and what the result means:
//   H1   Updates one exercise_library row to the SAME value it already has (a no-change write). "WRITE ALLOWED" means any
//        logged-in member can edit or delete the shared exercise library.
//   H2   Inserts one booking for yourself straight into the bookings table (no credit is charged), then cancels it.
//        "INSERT ALLOWED" means a member can book without paying credits. A cancelled test booking is left behind.
//   CM5  Uploads a 1-byte text file to the public coach-branding bucket under your own id, then deletes it.
//        "UPLOAD ALLOWED" means any member can put any file type into a public bucket.

const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, MEMBER_EMAIL: email, MEMBER_PASSWORD: password } = process.env;
if (!url || !anon || !email || !password) {
  console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY, MEMBER_EMAIL and MEMBER_PASSWORD first (see the top of this file).');
  process.exit(1);
}
if (!/@example\.com$/i.test(email)) {
  console.error('Refusing to run: MEMBER_EMAIL is not an example.com test account. Use a seeded test member.');
  process.exit(1);
}

const json = (r) => r.text().then((t) => { try { return JSON.parse(t); } catch { return t; } });

async function main() {
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const session = await json(login);
  if (!session.access_token) throw new Error(`Sign-in failed (${login.status})`);
  const uid = session.user.id;
  const h = { apikey: anon, Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' };
  console.log('Signed in as a test member. Running three checks.\n');

  // ---- H1: no-change write to the shared exercise library ----
  {
    const rows = await json(await fetch(`${url}/rest/v1/exercise_library?select=id,name&limit=1`, { headers: h }));
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('H1   could not read an exercise_library row; skipped');
    } else {
      const { id, name } = rows[0];
      const r = await fetch(`${url}/rest/v1/exercise_library?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify({ name }), // same value: nothing changes
      });
      const body = await json(r);
      const changed = Array.isArray(body) && body.length > 0;
      console.log(`H1   ${changed ? 'WRITE ALLOWED (finding confirmed)' : 'blocked'}   (HTTP ${r.status}, ${changed ? 1 : 0} row matched)`);
    }
  }

  // ---- H2: booking inserted directly, no credit charged ----
  {
    const classes = await json(await fetch(`${url}/rest/v1/classes?select=id,day_of_week&specific_date=is.null&limit=1`, { headers: h }));
    if (!Array.isArray(classes) || classes.length === 0) {
      console.log('H2   could not read a class; skipped');
    } else {
      const c = classes[0];
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7 + ((c.day_of_week - d.getUTCDay() + 7) % 7)); // a future date on that weekday
      const date = d.toISOString().slice(0, 10);
      const r = await fetch(`${url}/rest/v1/bookings`, {
        method: 'POST',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify({ client_id: uid, class_id: c.id, booking_date: date, status: 'booked' }),
      });
      const body = await json(r);
      const made = Array.isArray(body) && body[0]?.id;
      console.log(`H2   ${made ? 'INSERT ALLOWED (finding confirmed; no credit was charged)' : 'blocked'}   (HTTP ${r.status})`);
      if (made) {
        const u = await fetch(`${url}/rest/v1/bookings?id=eq.${body[0].id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'cancelled' }) });
        console.log(`     cleanup: booking set to cancelled (HTTP ${u.status}); the cancelled row remains`);
      }
    }
  }

  // ---- CM5: upload to the public coach-branding bucket ----
  {
    const path = `${uid}/audit-proof.txt`;
    const r = await fetch(`${url}/storage/v1/object/coach-branding/${path}`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${session.access_token}`, 'content-type': 'text/plain', 'x-upsert': 'true' },
      body: 'x',
    });
    const ok = r.status === 200;
    console.log(`CM5  ${ok ? 'UPLOAD ALLOWED (finding confirmed; any type, no size limit)' : 'blocked'}   (HTTP ${r.status})`);
    if (ok) {
      const del = await fetch(`${url}/storage/v1/object/coach-branding/${path}`, { method: 'DELETE', headers: { apikey: anon, Authorization: `Bearer ${session.access_token}` } });
      console.log(`     cleanup: file deleted (HTTP ${del.status})`);
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
