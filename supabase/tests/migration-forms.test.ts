import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Static checks on migration 0135 (fix brief 04): the latest definition of each function after every migration is replayed. The live
// behaviour is checked by supabase/tests/security-audit/forms-save-check.cjs against a sandbox project.
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; key: string; body: string; securityDefiner: boolean }[];
  access: (fn: unknown) => { anon: boolean; authenticated: boolean };
};

const fns = parseFunctions();
const latest = (name: string) => {
  const matches = fns.filter((f) => f.name === name);
  if (matches.length === 0) throw new Error(`function ${name} not found in the migrations`);
  return matches[matches.length - 1];
};
const code = (name: string) => latest(name).body.replace(/--.*$/gm, '');

describe('save_form_template (R3)', () => {
  const body = code('save_form_template');

  it('is for coaches who work at the form\'s gym and signed-in only', () => {
    expect(body).toMatch(/is_coach_in_gym\(v_template\.gym_id\)/);
    expect(access(latest('save_form_template'))).toEqual({ anon: false, authenticated: true });
  });

  it('updates a question that has an id in place and never deletes by form', () => {
    expect(body).toMatch(/update form_questions\s+set order_index = v_position/);
    expect(body).not.toMatch(/delete from form_questions\s+where template_id = p_template_id;/);
  });

  it('removes only questions nobody answered and archives the rest', () => {
    expect(body).toMatch(/delete from form_questions q[\s\S]*not exists \(select 1 from form_responses r where r\.question_id = q\.id\)/);
    expect(body).toMatch(/update form_questions q set archived_at = now\(\)/);
  });

  it('archives an answered question whose type changed and starts a new one', () => {
    expect(body).toMatch(/question_type is distinct from v_type[\s\S]*exists \(select 1 from form_responses where question_id = v_id\)/);
    expect(body).toMatch(/update form_questions set archived_at = now\(\) where id = v_id;/);
  });

  it('refuses a choice question with no options, before anything is written', () => {
    const firstWrite = body.search(/update form_templates|insert into form_questions/);
    const optionCheck = body.search(/needs at least one option/);
    expect(optionCheck).toBeGreaterThan(-1);
    expect(optionCheck).toBeLessThan(firstWrite);
  });

  it('keeps one default onboarding form per gym', () => {
    expect(body).toMatch(/update form_templates set is_default_onboarding = false\s+where gym_id = v_template\.gym_id/);
  });

  it('shows answer counts only to coaches at the gym', () => {
    expect(code('form_answer_counts')).toMatch(/is_coach_in_gym\(t\.gym_id\)/);
    expect(access(latest('form_answer_counts'))).toEqual({ anon: false, authenticated: true });
  });
});

describe('notify_event_signups (EV2)', () => {
  it('is for a coach at the event\'s gym, limits the message, and writes one notification per sign-up', () => {
    const body = code('notify_event_signups');
    expect(body).toMatch(/is_coach_in_gym\(v_event\.gym_id\)/);
    expect(body).toMatch(/char_length\(v_message\) > 300/);
    expect(body).toMatch(/from event_signups s where s\.event_id = p_event/);
    expect(access(latest('notify_event_signups'))).toEqual({ anon: false, authenticated: true });
  });
});
