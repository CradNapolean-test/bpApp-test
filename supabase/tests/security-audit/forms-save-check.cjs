// Saving a form without losing its answers (R3) and telling event sign-ups about a change (EV2), migration 0135 (fix brief 04).
// SANDBOX ONLY: creates and deletes its own test member, forms, answers, an event and notifications, and restores the sandbox coach.
//   node supabase/tests/security-audit/forms-save-check.cjs --ref=<your sandbox project ref>
//
// Acceptance for R3: save a form with one answered question, edit a word, and find the SAME question id and the answer still there.
// Exit code 1 on any failure, 2 on a script error.
require('./_safety.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../..');
require(root + '/node_modules/dotenv').config({ path: root + '/apps/web/.env.local', quiet: true });
const { createClient } = require(root + '/node_modules/@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const refArg = (process.argv.find((a) => a.startsWith('--ref=')) || '').slice(6);
if (!refArg || refArg !== (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1]) {
  console.error('Refusing to run: pass --ref=<sandbox project ref> matching NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(2);
}
const mk = (k) => createClient(url, k, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };
const TAG = 'zz-forms';

(async () => {
  const failures = [];
  const check = (label, pass, detail) => { if (pass) console.log('  ok:', label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  const refused = (r, re) => !!r.error && (!re || re.test(r.error.message));

  const signIn = async (email, password) => {
    const c = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const s = must(await c.auth.signInWithPassword({ email, password }), 'login ' + email);
    return { c, id: s.user.id };
  };
  const coach = await signIn('coach.sandbox@example.com', creds['coach.sandbox@example.com']);
  const G1 = must(await admin.from('profiles').select('gym_id').eq('id', coach.id).single(), 'coach gym').gym_id;
  const created = { users: [], templates: [], events: [] };

  try {
    const memberEmail = `${TAG}-member@example.com`;
    const memberPassword = 'Zz1!' + crypto.randomBytes(9).toString('base64url');
    const made = await admin.auth.admin.createUser({ email: memberEmail, password: memberPassword, email_confirm: true });
    if (made.error) throw new Error('create member: ' + made.error.message);
    const memberId = made.data.user.id;
    created.users.push(memberId);
    must(await admin.from('profiles').insert({ id: memberId, email: memberEmail, role: 'client', coach_id: coach.id, gym_id: G1 }), 'member profile');
    const member = await signIn(memberEmail, memberPassword);

    // ---------------------------------------------------------------- R3
    console.log('R3: saving a form keeps its answers');
    const template = must(await admin.from('form_templates').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' form' }).select('id').single(), 'template').id;
    created.templates.push(template);
    const q = [];
    for (const [i, text] of ['How many days can you train?', 'Any injuries?', 'Favourite food?'].entries()) {
      q.push(must(await admin.from('form_questions').insert({ template_id: template, order_index: i, question_text: text, question_type: 'short_text', required: true }).select('id').single(), 'question').id);
    }
    const assignment = must(await admin.from('form_assignments').insert({ template_id: template, client_id: memberId, completed_at: new Date().toISOString() }).select('id').single(), 'assignment').id;
    must(await admin.from('form_responses').insert([{ assignment_id: assignment, question_id: q[0], answer: '4' }, { assignment_id: assignment, question_id: q[1], answer: 'No' }]), 'answers');

    const counts = await coach.c.rpc('form_answer_counts', { p_template_id: template });
    const byId = Object.fromEntries((counts.data ?? []).map((r) => [r.question_id, Number(r.answers)]));
    check('the editor can see how many answers each question has', !counts.error && byId[q[0]] === 1 && byId[q[1]] === 1 && byId[q[2]] === 0, JSON.stringify(byId));

    const fields = { name: TAG + ' form', description: null, is_default_onboarding: false };
    const base = (id, text, type = 'short_text', extra = {}) => ({ id, question_text: text, question_type: type, options: null, required: true, ...extra });

    // Edit one word of the answered question.
    const edit = await coach.c.rpc('save_form_template', {
      p_template_id: template,
      p_fields: fields,
      p_questions: [base(q[0], 'How many days a week can you train?'), base(q[1], 'Any injuries?'), base(q[2], 'Favourite food?')],
    });
    check('a one-word edit saves', !edit.error, edit.error?.message);
    const afterEdit = (await admin.from('form_questions').select('id, question_text').eq('template_id', template).order('order_index')).data ?? [];
    check('...and the question has the SAME id', afterEdit.some((x) => x.id === q[0] && x.question_text === 'How many days a week can you train?'));
    const answerAfter = (await admin.from('form_responses').select('answer').eq('question_id', q[0])).data ?? [];
    check('...and its answer is still there', answerAfter.length === 1 && answerAfter[0].answer === '4');
    check('...and the assignment is still completed', !!(await admin.from('form_assignments').select('completed_at').eq('id', assignment).single()).data?.completed_at);

    // Reorder: ids stay, order changes.
    const reorder = await coach.c.rpc('save_form_template', { p_template_id: template, p_fields: fields, p_questions: [base(q[2], 'Favourite food?'), base(q[0], 'How many days a week can you train?'), base(q[1], 'Any injuries?')] });
    const order = (await admin.from('form_questions').select('id, order_index').eq('template_id', template).is('archived_at', null).order('order_index')).data ?? [];
    check('reordering keeps every id and changes the order', !reorder.error && order.map((x) => x.id).join() === [q[2], q[0], q[1]].join());

    // Take out an unanswered question: deleted. Take out an answered one: archived, answers kept.
    const remove = await coach.c.rpc('save_form_template', { p_template_id: template, p_fields: fields, p_questions: [base(q[0], 'How many days a week can you train?')] });
    check('removing questions saves', !remove.error, remove.error?.message);
    const all = (await admin.from('form_questions').select('id, archived_at').eq('template_id', template)).data ?? [];
    check('the unanswered question is deleted', !all.some((x) => x.id === q[2]));
    check('the answered question is archived, not deleted', all.some((x) => x.id === q[1] && x.archived_at));
    check('...and its answer is still on file', ((await admin.from('form_responses').select('id').eq('question_id', q[1])).data ?? []).length === 1);
    check('the kept question is still active', all.some((x) => x.id === q[0] && !x.archived_at));

    // Changing the type of an answered question archives it and starts a new one.
    const retype = await coach.c.rpc('save_form_template', { p_template_id: template, p_fields: fields, p_questions: [base(q[0], 'How many days a week can you train?', 'number')] });
    const afterRetype = (await admin.from('form_questions').select('id, question_type, archived_at').eq('template_id', template)).data ?? [];
    check('a type change on an answered question archives the old one and adds a new one', !retype.error
      && afterRetype.some((x) => x.id === q[0] && x.archived_at && x.question_type === 'short_text')
      && afterRetype.some((x) => x.id !== q[0] && !x.archived_at && x.question_type === 'number'), JSON.stringify(afterRetype));
    check('...and the old answer is still attached to the old question', ((await admin.from('form_responses').select('id').eq('question_id', q[0])).data ?? []).length === 1);

    // Validation.
    check('a choice question with no options is refused', refused(await coach.c.rpc('save_form_template', { p_template_id: template, p_fields: fields, p_questions: [base(null, 'Goal?', 'single_choice', { options: [] })] }), /at least one option/i));
    check('...and nothing was written by the refused save', ((await admin.from('form_questions').select('id').eq('template_id', template).is('archived_at', null)).data ?? []).length === 1);
    check('duplicate options are refused', refused(await coach.c.rpc('save_form_template', { p_template_id: template, p_fields: fields, p_questions: [base(null, 'Goal?', 'multi_choice', { options: ['A', 'A'] })] }), /different/i));
    check('an option can contain a comma', !(await coach.c.rpc('save_form_template', { p_template_id: template, p_fields: fields, p_questions: [base(null, 'Where?', 'single_choice', { options: ['Salford, Quays', 'Worsley'] })] })).error);
    check('a question id from another form is refused', refused(await coach.c.rpc('save_form_template', { p_template_id: template, p_fields: fields, p_questions: [base('00000000-0000-0000-0000-000000000000', 'Ghost')] }), /changed by someone else/i));
    check('a blank form name is refused', refused(await coach.c.rpc('save_form_template', { p_template_id: template, p_fields: { ...fields, name: '  ' }, p_questions: [] }), /name/i));
    check('a member cannot save a form', refused(await member.c.rpc('save_form_template', { p_template_id: template, p_fields: fields, p_questions: [] }), /not found/i));

    // Only one default onboarding form per gym.
    const other = must(await admin.from('form_templates').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' other', is_default_onboarding: false }).select('id').single(), 'other template').id;
    created.templates.push(other);
    const wasDefault = (await admin.from('form_templates').select('id').eq('gym_id', G1).eq('is_default_onboarding', true)).data ?? [];
    check('making a form the default clears the flag on the gym\'s other forms', !(await coach.c.rpc('save_form_template', { p_template_id: other, p_fields: { ...fields, name: TAG + ' other', is_default_onboarding: true }, p_questions: [] })).error
      && ((await admin.from('form_templates').select('id').eq('gym_id', G1).eq('is_default_onboarding', true)).data ?? []).length === 1, JSON.stringify(wasDefault));
    must(await admin.from('form_templates').update({ is_default_onboarding: false }).eq('id', other), 'put the default back');
    for (const prior of wasDefault) await admin.from('form_templates').update({ is_default_onboarding: true }).eq('id', prior.id);

    // ---------------------------------------------------------------- EV2
    console.log('EV2: telling sign-ups about an event change');
    const event = must(await admin.from('gym_events').insert({ gym_id: G1, title: TAG + ' event', starts_at: new Date(Date.now() + 5 * 86400e3).toISOString() }).select('id').single(), 'event').id;
    created.events.push(event);
    must(await admin.from('event_signups').insert({ event_id: event, client_id: memberId }), 'signup');
    const told = await coach.c.rpc('notify_event_signups', { p_event: event, p_message: TAG + ' event has moved to 7pm.' });
    check('a coach at the gym tells the one member signed up', !told.error && told.data === 1, told.error?.message);
    check('...and the notification is there', ((await admin.from('notifications').select('id').eq('client_id', memberId).like('message', TAG + ' event has moved%')).data ?? []).length === 1);
    check('an empty message is refused', refused(await coach.c.rpc('notify_event_signups', { p_event: event, p_message: '  ' })));
    check('a member cannot send event notifications', refused(await member.c.rpc('notify_event_signups', { p_event: event, p_message: 'hello' }), /not found/i));
  } finally {
    if (created.events.length) {
      await admin.from('event_signups').delete().in('event_id', created.events);
      await admin.from('gym_events').delete().in('id', created.events);
    }
    for (const id of created.users) {
      await admin.from('notifications').delete().eq('client_id', id);
      await admin.from('form_assignments').delete().eq('client_id', id);
      await admin.auth.admin.deleteUser(id);
    }
    if (created.templates.length) await admin.from('form_templates').delete().in('id', created.templates);
  }

  console.log(`\n${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });
