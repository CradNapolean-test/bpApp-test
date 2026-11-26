import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 0176's guard refuses a function body it does not know, by md5 of the body with whitespace collapsed (as Postgres computes
// md5(btrim(regexp_replace(prosrc, '\s+', ' ', 'g')))). This keeps the guard and the AFTER notes in step with the bodies, and holds the
// rules each function must keep: who may call it (owner, gym admin at that gym), that it reads only that gym's rows, that no message text
// leaves the database, that "Change coach" and "Move members" share one move, and that the staff record can only be added to.
const migrations = join(__dirname, '..', 'supabase', 'migrations');
const sql = readFileSync(join(migrations, '0176_owner_reports_follow_through_coach_change.sql'), 'utf8');
const sql0131 = readFileSync(join(migrations, '0131_owner_and_admin_functions.sql'), 'utf8');

function bodies(text: string, delim: string): Map<string, { header: string; body: string }> {
  const d = delim.replace(/\$/g, '\\$');
  const re = new RegExp(`create or replace function public\\.([a-z_0-9]+)\\(([^]*?)\\bas ${d}([^]*?)${d};`, 'g');
  const out = new Map<string, { header: string; body: string }>();
  for (const m of text.matchAll(re)) out.set(m[1], { header: m[2], body: m[3] });
  return out;
}

const md5 = (body: string) => createHash('md5').update(body.replace(/[ \t\n\r\f\v]+/g, ' ').replace(/^ +| +$/g, ''), 'utf8').digest('hex');
// The SQL without its comments, for "never contains" checks.
const code = (text: string) => text.replace(/--[^\n]*/g, '');

describe('migration 0176', () => {
  const fns = bodies(sql, '$fn$');
  const body = (name: string) => code(fns.get(name)!.body);

  it('creates the functions it says', () => {
    expect([...fns.keys()].sort()).toEqual([
      '_move_members_to_coach',
      '_reassign_clients',
      'block_staff_record_change',
      'change_member_coach',
      'coach_follow_through',
      'log_staff_login_on',
      'log_staff_membership_change',
      'owner_class_report',
      'owner_retention_report',
      'owner_staff_activity',
    ]);
  });

  it("has each body's md5 in the guard and in the AFTER notes", () => {
    for (const [name, { body: b }] of fns) {
      const hash = md5(b);
      if (name === '_reassign_clients') expect(sql).toContain(`'cfc9908fecfd3f90befcaad8fc8f4b43', '${hash}'`);
      else expect(sql).toContain(`('${name}', '${hash}')`);
      expect(sql).toContain(`${name} ${hash}`);
    }
  });

  it("accepts only 0131's _reassign_clients before replacing it", () => {
    const original = bodies(sql0131, '$$').get('_reassign_clients')!;
    expect(md5(original.body)).toBe('cfc9908fecfd3f90befcaad8fc8f4b43');
    expect(sql).toContain("_reassign_clients cfc9908fecfd3f90befcaad8fc8f4b43 (0131's body)");
  });

  it('runs every function as the owner with a fixed search_path', () => {
    for (const { header } of fns.values()) {
      expect(header).toContain('security definer');
      expect(header).toContain('set search_path = public');
    }
  });

  it('lets only a gym admin at that gym, or its owner, read the follow-through, before reading anything', () => {
    const b = body('coach_follow_through');
    const check = b.indexOf('not coalesce(public.can_manage_gym_business(p_gym), false)');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(b.indexOf('with team as'));
    expect(b).toMatch(/if p_gym is null or not coalesce\(public\.can_manage_gym_business\(p_gym\), false\) then\s+raise exception 'Not authorized'/);
    // only that gym's coaches and members
    expect(b).toContain('where cgm.gym_id = p_gym');
    expect(b).toContain("where m.role = 'client' and m.gym_id = p_gym");
    expect(b).toContain('where cm.client_id in (select gm.id from gym_members gm)');
  });

  it('never hands out a message, a member id or a member name from the follow-through', () => {
    const b = body('coach_follow_through');
    expect(b).not.toMatch(/\bcm\.text\b|\btext\s*,|'text'|image_path|audio_path/);
    const handedOut = [...b.matchAll(/jsonb_build_object\(([^]*?)\)\s*(?:order by|\)|$)/g)].map((m) => m[1]).join(' ');
    expect(handedOut).not.toMatch(/'clientId'|'memberId'|'memberName'|client_id\b(?!\))/);
    expect(b).not.toMatch(/cp\.name|client_profiles cp on cp\.client_id = m\.id\s+where[^]*?cp\.name/);
  });

  it('lets the owner of the member\'s gym or an admin there change a coach, to a coach working at that gym only', () => {
    const b = body('change_member_coach');
    expect(b).toContain("select gym_id into v_gym from profiles where id = p_member and role = 'client';");
    expect(b).toMatch(/if v_gym is null or not coalesce\(public\.can_manage_gym_business\(v_gym\), false\) then\s+raise exception 'Not authorized'/);
    // the gym's team, then the member, locked in the order removing a coach and Move members use
    expect(b.indexOf('perform 1 from gyms where id = v_gym for update;')).toBeGreaterThan(b.indexOf('can_manage_gym_business'));
    expect(b.indexOf('perform 1 from gyms where id = v_gym for update;')).toBeLessThan(b.indexOf('from profiles where id = p_member for update'));
    expect(b).toContain('v_member.gym_id is distinct from v_gym');
    // the same answer for "not a member" as for "not yours": nothing to probe
    expect(b.match(/raise exception 'Not authorized'/g)?.length).toBe(2);
    expect(b).toContain('v_member.coach_id is distinct from p_from');
    expect(b).toMatch(/cgm\.coach_id = p_to and cgm\.gym_id = v_member\.gym_id and c\.role = 'coach' and c\.deactivated_at is null/);
    // the permission check comes before any change
    expect(b.indexOf('can_manage_gym_business')).toBeLessThan(b.indexOf('_move_members_to_coach'));
  });

  it("takes the gym's team lock in Move members too, before moving anyone", () => {
    const b = body('_reassign_clients');
    expect(b.indexOf('perform 1 from gyms where id = p_gym for update;')).toBeGreaterThan(-1);
    expect(b.indexOf('perform 1 from gyms where id = p_gym for update;')).toBeLessThan(b.indexOf('public._move_members_to_coach('));
  });

  it('counts waiting by every staff message but leaves bulk messages (broadcasts, Message each) out of reply times', () => {
    const b = body('coach_follow_through');
    expect(b).toContain('count(*) over (partition by cm.sender_id, cm.created_at) > 1) as bulk');
    expect(b).toContain('sum(case when m0.from_member then 0 else 1 end) over w as staff_seq');
    expect(b).toContain('sum(case when m0.from_member or m0.bulk then 0 else 1 end) over w as reply_seq');
    expect(b).toContain('join last_seq l on l.client_id = r.client_id and l.staff_seq = r.staff_seq');
    expect(b).toContain('not s.from_member and not s.bulk and s.reply_seq = r.reply_seq + 1');
  });

  it("names who added a new coach from the sign-in link the same request records, only when the database couldn't tell", () => {
    const b = body('owner_staff_activity');
    expect(b).toMatch(/coalesce\(s\.actor_id, case when s\.action = 'coach_added' then \(/);
    expect(b).toContain("l.made_for = s.coach_id and l.kind = 'new_coach' and l.gym_id = s.gym_id");
  });

  it('moves one member exactly as Move members does: through the same function', () => {
    expect(body('_reassign_clients')).toContain('public._move_members_to_coach(');
    expect(body('change_member_coach')).toContain('public._move_members_to_coach(v_member.gym_id, v_member.coach_id, p_to, array[p_member])');
    const move = body('_move_members_to_coach');
    expect(move).toContain('set coach_id = p_to');
    expect(move).toContain("contacted = 'no'");
    // 0131's two changes, and nothing else written
    expect(move.match(/\bupdate\s+\w+/g)).toEqual(['update profiles', 'update red_flag_entries']);
    expect(move).not.toMatch(/\b(insert|delete)\b/);
    // 0131's checks are unchanged
    const original = code(bodies(sql0131, '$$').get('_reassign_clients')!.body);
    for (const line of ["raise exception 'Choose both coaches'", "raise exception 'Choose two different coaches'", "raise exception 'Both coaches must work at this gym.'"]) {
      expect(original).toContain(line);
      expect(body('_reassign_clients')).toContain(line);
    }
  });

  it('records moves and changes of coach', () => {
    expect(body('_reassign_clients')).toContain("'members_moved', auth.uid(), p_from, p_to, v_moved");
    expect(body('change_member_coach')).toContain("'member_coach_changed', auth.uid(), v_member.coach_id, p_to, p_member, 1");
    expect(body('log_staff_membership_change')).toContain("'coach_added'");
    expect(body('log_staff_membership_change')).toContain("'coach_removed'");
    expect(body('log_staff_login_on')).toContain("'login_on'");
    expect(sql).toContain('after insert or delete on public.coach_gym_memberships');
    expect(sql).toMatch(/after update of deactivated_at on public\.profiles\s+for each row\s+when \(old\.deactivated_at is not null and new\.deactivated_at is null\)/);
  });

  it('keeps the owner reports to the owner and the gyms of their organisation', () => {
    for (const name of ['owner_class_report', 'owner_retention_report', 'owner_staff_activity']) {
      const b = body(name);
      expect(b).toMatch(/if not public\.is_owner\(\) then\s+raise exception 'Not authorized'/);
      expect(b).toMatch(/if p_gym is not null and not coalesce\(public\.is_owner_of_gym\(p_gym\), false\) then\s+raise exception 'Not authorized'/);
      expect(b).toContain('organisation_id = public.my_org_id()');
    }
  });

  it('hands the class report no member ids', () => {
    const b = body('owner_class_report');
    expect(b).not.toMatch(/'clientId'|'memberId'/);
    expect(b).toContain('count(distinct b.client_id)');
  });

  it('lets signed-in users call the five, nobody signed out, and nobody the internal ones', () => {
    for (const sig of [
      'coach_follow_through(uuid)',
      'change_member_coach(uuid, uuid, uuid)',
      'owner_class_report(uuid, integer, text)',
      'owner_retention_report(uuid, integer, text)',
      'owner_staff_activity(uuid, integer, integer)',
    ]) {
      expect(sql).toContain(`revoke execute on function public.${sig} from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${sig} to authenticated;`);
    }
    for (const sig of [
      '_move_members_to_coach(uuid, uuid, uuid, uuid[])',
      '_reassign_clients(uuid, uuid, uuid)',
      'block_staff_record_change()',
      'log_staff_membership_change()',
      'log_staff_login_on()',
    ]) {
      expect(sql).toContain(`revoke execute on function public.${sig} from public, anon, authenticated;`);
      expect(sql).not.toContain(`grant execute on function public.${sig}`);
    }
  });

  it('keeps the staff record unreadable through the API and append-only', () => {
    expect(sql).toContain('alter table public.staff_activity enable row level security;');
    expect(sql).toContain('revoke all on table public.staff_activity from public, anon, authenticated;');
    expect(code(sql)).not.toMatch(/create policy[^;]*staff_activity/);
    expect(code(sql)).not.toMatch(/grant [^;]* on (table )?public\.staff_activity/);
    expect(sql).toContain('before update or delete on public.staff_activity');
    expect(sql).toContain('before truncate on public.staff_activity');
    expect(sql).toContain('before update or delete on public.admin_audit');
    expect(code(sql)).not.toMatch(/\b(update|delete from)\s+(public\.)?(staff_activity|admin_audit)\b/);
    expect(body('block_staff_record_change')).toContain('raise exception');
  });

  it('is safe to run twice', () => {
    expect(sql).toContain('create table if not exists public.staff_activity');
    for (const trigger of [
      'staff_activity_append_only',
      'staff_activity_no_truncate',
      'admin_audit_append_only',
      'admin_audit_no_truncate',
      'log_staff_membership_change',
      'log_staff_login_on',
    ]) {
      expect(sql).toContain(`drop trigger if exists ${trigger} on`);
    }
  });
});
