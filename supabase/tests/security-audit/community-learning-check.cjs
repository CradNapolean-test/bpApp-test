// Community, learning, nutrition extras and Big Dog, as members. SANDBOX ONLY: creates and deletes test rows (tagged
// rls-comm) and puts back anything it touches.
//   node supabase/tests/security-audit/community-learning-check.cjs --ref=<your sandbox project ref> [--expect-0112]
//
// A member must reach only their own data and only what their coach gave them. They must NOT be able to: sign anyone else up
// for an event, read other members' sign-ups, create or change events; read or write other members' feedback, grants, recipes,
// meal plans, lesson completions or Big Dog scores; give themselves a reward; mark a lesson complete that is not in a course
// assigned to them; or write a verified Big Dog score. Controls prove the legitimate paths still work (sign up and leave,
// feedback, reading assigned courses, recipes, the meal plan, a self-reported score and deleting it).
// The checks marked [0112] only hold once migration 0112 is applied: they are listed as pending until then, and count as
// failures when you run with --expect-0112. The rest must pass either way. Exit code 1 on any failure.
require('./_safety.cjs');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
require(root + '/node_modules/dotenv').config({ path: root + '/apps/web/.env.local', quiet: true });
const { createClient } = require(root + '/node_modules/@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const refArg = (process.argv.find((a) => a.startsWith('--ref=')) || '').slice(6);
if (!refArg || refArg !== (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1]) {
  console.error('Refusing to run: pass --ref=<sandbox project ref> matching NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(2);
}
const mk = (k) => createClient(url, k, { auth: { persistSession: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };
const TAG = 'rls-comm';
const DAY = 86400000;

(async () => {
  const login = async (email) => {
    const c = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const s = must(await c.auth.signInWithPassword({ email, password: creds[email] }), 'login ' + email);
    return { c, id: s.user.id };
  };
  const S = await login('member.b.sandbox@example.com'); // member under test
  const O = await login('member.a.sandbox@example.com'); // someone else
  const coach = await login('coach.sandbox@example.com');
  const anon = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const gymId = must(await admin.from('profiles').select('gym_id').eq('id', coach.id).single(), 'coach gym').gym_id;

  const failures = [];
  const needs0112 = [];
  const infos = [];
  const ok = (label) => console.log('  ok:', label);
  const check = (label, pass, detail) => { if (pass) ok(label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  const check0112 = (label, pass, detail) => { if (pass) ok(label + ' [0112]'); else needs0112.push(label + (detail ? ' (' + detail + ')' : '')); };
  const denied = (r) => !!r.error || (r.data ?? []).length === 0;
  const refused = (r) => !!r.error;

  const created = { events: [], courses: [], rewards: [], feedback: [], recipes: [], meal: [], bigdog: [] };

  async function preClean() {
    for (const t of [['gym_events', 'title'], ['education_courses', 'title'], ['rewards', 'name']]) {
      const rows = (await admin.from(t[0]).select('id').like(t[1], TAG + '%')).data ?? [];
      for (const r of rows) await admin.from(t[0]).delete().eq('id', r.id);
    }
    await admin.from('member_feedback').delete().like('comment', TAG + '%');
    const rec = (await admin.from('recipes').select('id').like('name', TAG + '%')).data ?? [];
    for (const r of rec) await admin.from('recipes').delete().eq('id', r.id);
    await admin.from('big_dog_results').delete().like('result_text', TAG + '%');
  }
  await preClean();

  // ---- fixtures ----
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const ev = async (title, startsMs, capacity) => must(await admin.from('gym_events').insert({ gym_id: gymId, title: TAG + ' ' + title, starts_at: iso(startsMs), capacity }).select('id').single(), 'event ' + title);
  const E1 = await ev('one spot', 7 * DAY, 1);
  const E2 = await ev('past', -3 * DAY, null);
  const E3 = await ev('open', 8 * DAY, null);
  created.events.push(E1.id, E2.id, E3.id);

  const course = async (title) => must(await admin.from('education_courses').insert({ coach_id: coach.id, gym_id: gymId, title: TAG + ' ' + title }).select('id').single(), 'course');
  const mod = async (courseId) => must(await admin.from('education_modules').insert({ course_id: courseId, title: 'Module', sort_order: 0 }).select('id').single(), 'module');
  const lesson = async (moduleId, title, unlock) => must(await admin.from('education_lessons').insert({ module_id: moduleId, title, sort_order: 0, unlock_at: unlock }).select('id').single(), 'lesson');
  const C1 = await course('assigned to S'); const M1 = await mod(C1.id);
  const L1 = await lesson(M1.id, 'Open lesson', null);
  const L2 = await lesson(M1.id, 'Locked lesson', new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10));
  const C2 = await course('assigned to O only'); const M2 = await mod(C2.id);
  const L3 = await lesson(M2.id, 'Other course lesson', null);
  created.courses.push(C1.id, C2.id);
  must(await admin.from('education_course_assignments').insert([{ course_id: C1.id, client_id: S.id }, { course_id: C2.id, client_id: O.id }]), 'assign courses');

  const R1 = must(await admin.from('rewards').insert({ gym_id: gymId, name: TAG + ' hoodie', kind: 'sessions', threshold: 100 }).select('id').single(), 'reward');
  created.rewards.push(R1.id);
  must(await admin.from('reward_grants').insert({ reward_id: R1.id, client_id: O.id }), 'grant to O');

  const oFeedback = must(await admin.from('member_feedback').insert({ client_id: O.id, rating: 4, comment: TAG + ' O feedback' }).select('id').single(), 'O feedback');
  created.feedback.push(oFeedback.id);

  const food = must(await admin.from('foods').select('id').limit(1), 'a food')[0];
  const oRecipe = must(await admin.from('recipes').insert({ client_id: O.id, name: TAG + ' O recipe' }).select('id').single(), 'O recipe');
  const oIng = must(await admin.from('recipe_ingredients').insert({ recipe_id: oRecipe.id, food_id: food.id, portions: 100 }).select('id').single(), 'O ingredient');
  const oMeal = must(await admin.from('meal_plan_entries').insert({ client_id: O.id, section: 'lunch', food_id: food.id, portions: 100 }).select('id').single(), 'O meal');
  created.recipes.push(oRecipe.id); created.meal.push(oMeal.id);
  const oBig = must(await admin.from('big_dog_results').insert({ client_id: O.id, exercise_key: 'squat', level: 'strong', result_text: TAG + ' O verified', result_value: 100, self_reported: false }).select('id').single(), 'O big dog');
  created.bigdog.push(oBig.id);

  try {
    // ================= events =================
    console.log('  -- events');
    const seen = await S.c.from('gym_events').select('id').in('id', [E1.id, E3.id]);
    check('control: a member reads their gym\'s events', !seen.error && seen.data?.length === 2, seen.error?.message);
    const counts = await S.c.rpc('event_signup_counts');
    check('control: the headcount function works for a member', !counts.error, counts.error?.message);
    check('cannot create, change or delete events (coaches only)', denied(await S.c.from('gym_events').insert({ gym_id: gymId, title: TAG + ' member made', starts_at: iso(DAY) }).select('id')) && denied(await S.c.from('gym_events').update({ title: 'x' }).eq('id', E3.id).select('id')) && denied(await S.c.from('gym_events').delete().eq('id', E3.id).select('id')));
    const join = await S.c.from('event_signups').insert({ event_id: E1.id, client_id: S.id }).select('event_id');
    check('control: a member signs up for an event', !join.error && join.data?.length === 1, join.error?.message);
    check('cannot sign someone else up', denied(await S.c.from('event_signups').insert({ event_id: E3.id, client_id: O.id }).select('event_id')));
    const full = await O.c.from('event_signups').insert({ event_id: E1.id, client_id: O.id }).select('event_id');
    check0112('a full event refuses another sign-up', !!full.error, 'the sign-up was accepted past capacity');
    if (!full.error) await admin.from('event_signups').delete().eq('event_id', E1.id).eq('client_id', O.id);
    const past = await S.c.from('event_signups').insert({ event_id: E2.id, client_id: S.id }).select('event_id');
    check0112('an event that already happened refuses a sign-up', !!past.error, 'the sign-up was accepted');
    if (!past.error) await admin.from('event_signups').delete().eq('event_id', E2.id).eq('client_id', S.id);
    must(await admin.from('event_signups').insert({ event_id: E3.id, client_id: O.id }), 'seed O signup');
    check("cannot read another member's sign-ups", denied(await S.c.from('event_signups').select('client_id').eq('event_id', E3.id).eq('client_id', O.id)));
    check("cannot remove another member's sign-up", denied(await S.c.from('event_signups').delete().eq('event_id', E3.id).eq('client_id', O.id).select('event_id')));
    check('signed-out callers read no events or sign-ups', denied(await anon.from('gym_events').select('id').limit(1)) && denied(await anon.from('event_signups').select('event_id').limit(1)));
    const leave = await S.c.from('event_signups').delete().eq('event_id', E1.id).eq('client_id', S.id).select('event_id');
    check('control: a member leaves an event', !leave.error && leave.data?.length === 1, leave.error?.message);

    // ================= feedback =================
    console.log('  -- feedback');
    const fb = await S.c.from('member_feedback').insert({ client_id: S.id, rating: 5, comment: TAG + ' S feedback' }).select('id');
    if (fb.data?.[0]) created.feedback.push(fb.data[0].id);
    check('control: a member sends feedback', !fb.error && fb.data?.length === 1, fb.error?.message);
    check('a rating outside 1 to 5 is refused', refused(await S.c.from('member_feedback').insert({ client_id: S.id, rating: 6, comment: TAG + ' bad' }).select('id')) && refused(await S.c.from('member_feedback').insert({ client_id: S.id, rating: 0, comment: TAG + ' bad' }).select('id')));
    check('cannot send feedback as someone else', denied(await S.c.from('member_feedback').insert({ client_id: O.id, rating: 5, comment: TAG + ' spoof' }).select('id')));
    check("cannot read, change or delete another member's feedback", denied(await S.c.from('member_feedback').select('id').eq('id', oFeedback.id)) && denied(await S.c.from('member_feedback').update({ rating: 1 }).eq('id', oFeedback.id).select('id')) && denied(await S.c.from('member_feedback').delete().eq('id', oFeedback.id).select('id')));
    check('cannot change or delete their own feedback once sent', denied(await S.c.from('member_feedback').update({ rating: 1 }).eq('client_id', S.id).like('comment', TAG + '%').select('id')) && denied(await S.c.from('member_feedback').delete().eq('client_id', S.id).like('comment', TAG + '%').select('id')));
    check('signed-out callers cannot send feedback', refused(await anon.from('member_feedback').insert({ client_id: S.id, rating: 5, comment: TAG + ' anon' }).select('id')));
    const longFb = await S.c.from('member_feedback').insert({ client_id: S.id, rating: 3, comment: TAG + ' ' + 'x'.repeat(1100) }).select('id');
    if (longFb.data?.[0]) created.feedback.push(longFb.data[0].id);
    check0112('a comment over 1,000 characters is refused', !!longFb.error);

    // ================= rewards =================
    console.log('  -- rewards');
    const rw = await S.c.from('rewards').select('id').eq('id', R1.id);
    check('control: a member reads their gym\'s rewards', !rw.error && rw.data?.length === 1, rw.error?.message);
    const prog = await S.c.rpc('member_reward_progress');
    check('control: reward progress returns only the member\'s own row', !prog.error && (prog.data ?? []).length === 1 && prog.data[0].client_id === S.id, prog.error?.message ?? (prog.data ?? []).length + ' rows');
    check('cannot give themselves (or anyone) a reward', denied(await S.c.from('reward_grants').insert({ reward_id: R1.id, client_id: S.id }).select('reward_id')) && denied(await S.c.from('reward_grants').insert({ reward_id: R1.id, client_id: O.id }).select('reward_id')));
    check("cannot read or remove another member's reward grant", denied(await S.c.from('reward_grants').select('reward_id').eq('client_id', O.id)) && denied(await S.c.from('reward_grants').delete().eq('client_id', O.id).select('reward_id')));
    check('cannot create, change or delete rewards', denied(await S.c.from('rewards').insert({ gym_id: gymId, name: TAG + ' own', kind: 'sessions', threshold: 1 }).select('id')) && denied(await S.c.from('rewards').update({ threshold: 1 }).eq('id', R1.id).select('id')) && denied(await S.c.from('rewards').delete().eq('id', R1.id).select('id')));

    // ================= education =================
    console.log('  -- education');
    const asg = await S.c.from('education_course_assignments').select('id, course:education_courses(id, education_modules(id, education_lessons(id)))').eq('client_id', S.id).eq('course_id', C1.id);
    check('control: a member reads their assigned course with its lessons', !asg.error && asg.data?.length === 1 && asg.data[0].course?.education_modules?.[0]?.education_lessons?.length === 2, asg.error?.message);
    check("cannot read another member's course assignments", denied(await S.c.from('education_course_assignments').select('id').eq('client_id', O.id)));
    check('cannot assign a course (coaches only)', refused(await S.c.rpc('assign_education_course', { p_course_id: C2.id, p_client_id: S.id })) && denied(await S.c.from('education_course_assignments').insert({ course_id: C2.id, client_id: S.id }).select('id')));
    const otherCourse = await S.c.from('education_lessons').select('id').eq('id', L3.id);
    if (!otherCourse.error && (otherCourse.data ?? []).length > 0) infos.push('a member can READ the lessons of a course that is not assigned to them (their coach\'s other courses)');
    const done1 = await S.c.from('education_lesson_completions').insert({ lesson_id: L1.id, client_id: S.id }).select('id');
    check('control: a member marks a lesson of their course complete', !done1.error && done1.data?.length === 1, done1.error?.message);
    check('cannot mark a lesson complete for someone else', denied(await S.c.from('education_lesson_completions').insert({ lesson_id: L1.id, client_id: O.id }).select('id')));
    const notMine = await S.c.from('education_lesson_completions').insert({ lesson_id: L3.id, client_id: S.id }).select('id');
    check0112('a lesson from a course that is not assigned to them cannot be marked complete', !!notMine.error, 'accepted');
    if (!notMine.error) await admin.from('education_lesson_completions').delete().eq('lesson_id', L3.id).eq('client_id', S.id);
    const locked = await S.c.from('education_lesson_completions').insert({ lesson_id: L2.id, client_id: S.id }).select('id');
    check0112('a lesson that is still locked cannot be marked complete', !!locked.error, 'accepted');
    if (!locked.error) await admin.from('education_lesson_completions').delete().eq('lesson_id', L2.id).eq('client_id', S.id);
    must(await admin.from('education_lesson_completions').insert({ lesson_id: L3.id, client_id: O.id }), 'seed O completion');
    check("cannot read or delete another member's completions", denied(await S.c.from('education_lesson_completions').select('id').eq('client_id', O.id)) && denied(await S.c.from('education_lesson_completions').delete().eq('client_id', O.id).select('id')));
    const undo = await S.c.from('education_lesson_completions').delete().eq('lesson_id', L1.id).eq('client_id', S.id).select('id');
    check('control: a member unmarks their own lesson', !undo.error && undo.data?.length === 1, undo.error?.message);
    check('cannot create, change or delete courses, modules or lessons', denied(await S.c.from('education_courses').update({ title: 'x' }).eq('id', C1.id).select('id')) && denied(await S.c.from('education_lessons').update({ title: 'x' }).eq('id', L1.id).select('id')) && denied(await S.c.from('education_lessons').delete().eq('id', L1.id).select('id')) && denied(await S.c.from('education_courses').insert({ coach_id: S.id, gym_id: gymId, title: TAG + ' member course' }).select('id')));

    // ================= recipes and meal plan =================
    console.log('  -- recipes and meal plan');
    const rec = await S.c.from('recipes').insert({ client_id: S.id, name: TAG + ' S recipe', servings: 2 }).select('id');
    if (rec.data?.[0]) created.recipes.push(rec.data[0].id);
    const sRecipe = rec.data?.[0];
    check('control: a member creates a recipe', !rec.error && !!sRecipe, rec.error?.message);
    const ing = sRecipe ? await S.c.from('recipe_ingredients').insert({ recipe_id: sRecipe.id, food_id: food.id, portions: 150 }).select('id') : { error: { message: 'no recipe' } };
    check('control: a member adds an ingredient to their recipe', !ing.error && ing.data?.length === 1, ing.error?.message);
    check('cannot create a recipe for someone else', denied(await S.c.from('recipes').insert({ client_id: O.id, name: TAG + ' spoof' }).select('id')));
    check("cannot add to, change or delete another member's recipe", denied(await S.c.from('recipe_ingredients').insert({ recipe_id: oRecipe.id, food_id: food.id, portions: 1 }).select('id')) && denied(await S.c.from('recipe_ingredients').update({ portions: 1 }).eq('id', oIng.id).select('id')) && denied(await S.c.from('recipe_ingredients').delete().eq('id', oIng.id).select('id')) && denied(await S.c.from('recipes').update({ name: 'x' }).eq('id', oRecipe.id).select('id')) && denied(await S.c.from('recipes').delete().eq('id', oRecipe.id).select('id')));
    check("cannot read another member's recipes or ingredients", denied(await S.c.from('recipes').select('id').eq('id', oRecipe.id)) && denied(await S.c.from('recipe_ingredients').select('id').eq('id', oIng.id)));
    const meal = await S.c.from('meal_plan_entries').insert({ client_id: S.id, section: 'dinner', food_id: food.id, portions: 120 }).select('id');
    if (meal.data?.[0]) created.meal.push(meal.data[0].id);
    check('control: a member plans a meal', !meal.error && meal.data?.length === 1, meal.error?.message);
    check('an unknown meal slot is refused', refused(await S.c.from('meal_plan_entries').insert({ client_id: S.id, section: 'midnight', food_id: food.id, portions: 1 }).select('id')));
    check("cannot plan, change, read or delete another member's meals", denied(await S.c.from('meal_plan_entries').insert({ client_id: O.id, section: 'lunch', food_id: food.id, portions: 1 }).select('id')) && denied(await S.c.from('meal_plan_entries').update({ portions: 1 }).eq('id', oMeal.id).select('id')) && denied(await S.c.from('meal_plan_entries').delete().eq('id', oMeal.id).select('id')) && denied(await S.c.from('meal_plan_entries').select('id').eq('id', oMeal.id)));
    check('signed-out callers read no recipes or meal plans', denied(await anon.from('recipes').select('id').limit(1)) && denied(await anon.from('meal_plan_entries').select('id').limit(1)));
    const longName = await S.c.from('recipes').insert({ client_id: S.id, name: TAG + ' ' + 'n'.repeat(200) }).select('id');
    if (longName.data?.[0]) created.recipes.push(longName.data[0].id);
    check0112('a recipe name over 100 characters is refused', !!longName.error);
    const badServings = await S.c.from('recipes').insert({ client_id: S.id, name: TAG + ' servings', servings: 5000 }).select('id');
    if (badServings.data?.[0]) created.recipes.push(badServings.data[0].id);
    check0112('a recipe that makes 5,000 servings is refused', !!badServings.error);
    if (sRecipe) {
      check0112('an ingredient amount of zero, negative or over 10,000 is refused', !!(await S.c.from('recipe_ingredients').insert({ recipe_id: sRecipe.id, food_id: food.id, portions: 0 }).select('id')).error && !!(await S.c.from('recipe_ingredients').insert({ recipe_id: sRecipe.id, food_id: food.id, portions: -5 }).select('id')).error && !!(await S.c.from('recipe_ingredients').insert({ recipe_id: sRecipe.id, food_id: food.id, portions: 99999 }).select('id')).error);
    }
    const hugeMeal = await S.c.from('meal_plan_entries').insert({ client_id: S.id, section: 'lunch', food_id: food.id, portions: 99999 }).select('id');
    if (hugeMeal.data?.[0]) created.meal.push(hugeMeal.data[0].id);
    check0112('a planned amount over 10,000 is refused', !!hugeMeal.error);
    const act = await S.c.from('activities').select('id, name, met').limit(3);
    check('control: a member reads the activity list', !act.error && (act.data ?? []).length > 0, act.error?.message);
    check('cannot change the activity list', denied(await S.c.from('activities').update({ met: 99 }).eq('id', (act.data ?? [{}])[0].id ?? '00000000-0000-0000-0000-000000000000').select('id')) && denied(await S.c.from('activities').insert({ name: TAG + ' x', met: 1 }).select('id')));

    // ================= Big Dog =================
    console.log('  -- Big Dog');
    const mine = await S.c.from('big_dog_results').insert({ client_id: S.id, exercise_key: 'squat', level: 'strong', result_text: TAG + ' 110kg', result_value: 110, self_reported: true }).select('id');
    if (mine.data?.[0]) created.bigdog.push(mine.data[0].id);
    check('control: a member logs their own score (marked self-reported)', !mine.error && mine.data?.length === 1, mine.error?.message);
    check('a member cannot write a VERIFIED score, for themselves or anyone', denied(await S.c.from('big_dog_results').insert({ client_id: S.id, exercise_key: 'squat', level: 'big_dog', result_text: TAG + ' verified?', result_value: 200, self_reported: false }).select('id')) && denied(await S.c.from('big_dog_results').insert({ client_id: O.id, exercise_key: 'squat', level: 'big_dog', result_text: TAG + ' spoof', result_value: 200, self_reported: true }).select('id')));
    check("cannot read, change or delete another member's scores (or a verified one)", denied(await S.c.from('big_dog_results').select('id').eq('id', oBig.id)) && denied(await S.c.from('big_dog_results').update({ level: 'rookie' }).eq('id', oBig.id).select('id')) && denied(await S.c.from('big_dog_results').delete().eq('id', oBig.id).select('id')));
    check('a score cannot be edited once logged (append-only)', denied(await S.c.from('big_dog_results').update({ level: 'big_dog' }).eq('id', mine.data?.[0]?.id ?? '00000000-0000-0000-0000-000000000000').select('id')));
    const longTxt = await S.c.from('big_dog_results').insert({ client_id: S.id, exercise_key: 'squat', level: 'rookie', result_text: TAG + ' ' + 't'.repeat(100), result_value: 50, self_reported: true }).select('id');
    if (longTxt.data?.[0]) created.bigdog.push(longTxt.data[0].id);
    check0112('a score label over 40 characters is refused', !!longTxt.error);
    const hugeVal = await S.c.from('big_dog_results').insert({ client_id: S.id, exercise_key: 'squat', level: 'rookie', result_text: TAG + ' big', result_value: 9999999, self_reported: true }).select('id');
    if (hugeVal.data?.[0]) created.bigdog.push(hugeVal.data[0].id);
    check0112('a score value outside 0 to 100,000 is refused', !!hugeVal.error);
    const old = await S.c.from('big_dog_results').insert({ client_id: S.id, exercise_key: 'squat', level: 'rookie', result_text: TAG + ' old', result_value: 50, self_reported: true, tested_date: '1990-01-01' }).select('id');
    if (old.data?.[0]) created.bigdog.push(old.data[0].id);
    const future = await S.c.from('big_dog_results').insert({ client_id: S.id, exercise_key: 'squat', level: 'rookie', result_text: TAG + ' future', result_value: 50, self_reported: true, tested_date: '2099-01-01' }).select('id');
    if (future.data?.[0]) created.bigdog.push(future.data[0].id);
    check0112('a self-reported score dated long ago or in the future is refused', !!old.error && !!future.error);
    if (mine.data?.[0]) {
      const del = await S.c.from('big_dog_results').delete().eq('id', mine.data[0].id).select('id');
      check('control: a member deletes their own self-reported score', !del.error && del.data?.length === 1, del.error?.message);
    }
  } finally {
    // ---- put everything back ----
    for (const id of created.events) await admin.from('gym_events').delete().eq('id', id);
    for (const id of created.courses) await admin.from('education_courses').delete().eq('id', id);
    for (const id of created.rewards) await admin.from('rewards').delete().eq('id', id);
    for (const id of created.feedback) await admin.from('member_feedback').delete().eq('id', id);
    await admin.from('member_feedback').delete().like('comment', TAG + '%');
    for (const id of created.recipes) await admin.from('recipes').delete().eq('id', id);
    for (const id of created.meal) await admin.from('meal_plan_entries').delete().eq('id', id);
    for (const id of created.bigdog) await admin.from('big_dog_results').delete().eq('id', id);
    await admin.from('big_dog_results').delete().like('result_text', TAG + '%');
  }

  console.log('');
  if (infos.length) { console.log('Noted (not counted):'); infos.forEach((i) => console.log('  - ' + i)); }
  if (process.argv.includes('--expect-0112')) failures.push(...needs0112.map((f) => '[0112] ' + f));
  else if (needs0112.length) {
    console.log(needs0112.length + ' check(s) need migration 0112 (not applied yet, or failing):');
    needs0112.forEach((f) => console.log('  - ' + f));
  }
  console.log(failures.length + ' failure(s)');
  failures.forEach((f) => console.log('  FAIL: ' + f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('Script error:', e.message); process.exit(2); });
