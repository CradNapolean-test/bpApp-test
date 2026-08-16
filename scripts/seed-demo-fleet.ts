import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '../lib/supabase/admin';

// Configurable so this can be smoke-tested at tiny scale before the real run.
const NUM_COACHES = Number(process.env.SEED_COACHES ?? 3);
const CLIENTS_PER_COACH = Number(process.env.SEED_CLIENTS ?? 100);
const CONCURRENCY = 8;
const PASSWORD = 'DemoFleet123!';

const supabase = createAdminClient();

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth',
  'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen',
  'Chris', 'Emma', 'Daniel', 'Olivia', 'Matthew', 'Sophie', 'Anthony', 'Grace', 'Mark', 'Chloe',
  'Paul', 'Amelia', 'Steven', 'Isla', 'Andrew', 'Ava', 'Kenneth', 'Mia', 'Joshua', 'Ella',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White',
  'Harris', 'Clark', 'Lewis', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Green',
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number, decimals = 1): number {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}
function randChoice<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

async function seedEducationCourse(coachId: string): Promise<void> {
  const { data: course, error: courseErr } = await supabase
    .from('education_courses')
    .insert({ coach_id: coachId, title: 'Education Library', description: 'Foundational nutrition, FAQ, and training videos.' })
    .select('id')
    .single();
  if (courseErr) throw courseErr;

  const MODULES: { title: string; lessons: { title: string; link_url: string | null }[] }[] = [
    {
      title: 'Nutrition',
      lessons: [
        { title: 'Setting Up Your Diet', link_url: 'https://www.youtube.com/watch?v=_NWYGK7ZmLU&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=10' },
        { title: 'Building A Diet', link_url: 'https://www.youtube.com/watch?v=YZppeX726a4&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=1' },
        { title: 'Nutrition Basics', link_url: 'https://www.youtube.com/watch?v=2ACIYdK8PDU&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=16' },
        { title: 'How To Use MFP Part 1', link_url: 'https://www.youtube.com/watch?v=c9T32XChk7U&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=9' },
        { title: 'How To Use MFP Part 2', link_url: 'https://www.youtube.com/watch?v=2rJWteGxawE&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=8' },
        { title: 'Energy Balance & Calories', link_url: 'https://www.youtube.com/watch?v=bFXn5cCxEzQ&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=17' },
        { title: 'Importance of Protein', link_url: 'https://www.youtube.com/watch?v=rr2b1xeFIok&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=5' },
        { title: 'Building Better Habits', link_url: 'https://www.youtube.com/watch?v=wGtHJJSRkAQ&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=15' },
        { title: 'Under Reporting', link_url: null },
        { title: 'Alcohol', link_url: 'https://www.youtube.com/watch?v=LPiNEyevw_g' },
        { title: 'Increasing NEAT', link_url: 'https://www.youtube.com/watch?v=3Scy1oMUZjE&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=18' },
        { title: 'Calorie Density', link_url: 'https://www.youtube.com/watch?v=kd6AYb5Xwic' },
      ],
    },
    {
      title: 'FAQ',
      lessons: [
        { title: 'My Calories Are Too High?', link_url: 'https://www.youtube.com/watch?v=QSGuCjfQecY&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=22' },
        { title: 'Interpreting Your Weight', link_url: 'https://www.youtube.com/watch?v=mDB2U8hvvBE&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=23' },
        { title: 'Skipping Breakfast', link_url: 'https://www.youtube.com/watch?v=p2gMxIwTeLs&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=24' },
        { title: 'Vegan, Plant Based & Vegetarian Diets', link_url: 'https://www.youtube.com/watch?v=lXZGQJNhO-0&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=25' },
        { title: 'Menstrual Cycle & Training', link_url: 'https://www.youtube.com/watch?v=nj9LSH3VcBg&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=27' },
        { title: 'Planning Ahead & Eating Out', link_url: 'https://www.youtube.com/watch?v=QtwmkRwwrRA&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=30' },
        { title: 'Food Choices', link_url: 'https://www.youtube.com/watch?v=XuqBpUgdfos&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=2' },
        { title: 'Understanding Inbody Scanner Results', link_url: 'https://www.youtube.com/watch?v=Jcxx2eh2EFY&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=35' },
        { title: 'How To Use The Inbody Scanner', link_url: 'https://www.youtube.com/watch?v=Vn3Z8ZKy2eY&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=37&t=2s' },
        { title: 'How To Take Your Circumference Measurements', link_url: 'https://www.youtube.com/watch?v=OW4aqd1hijE&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=38' },
        { title: 'Training During Pregnancy', link_url: 'https://www.youtube.com/watch?v=yRWttoINXkg&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=39' },
      ],
    },
    {
      title: 'Training',
      lessons: [
        { title: 'The Training Program', link_url: 'https://www.youtube.com/watch?v=0nsSUkIY7rw&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=14' },
        { title: 'How To Progress', link_url: 'https://www.youtube.com/watch?v=lxc5vYBcZrM&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=12' },
        { title: 'Logging Training Sessions', link_url: 'https://www.youtube.com/watch?v=qsBkTE5R0lA&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=13' },
        { title: 'Building Muscle: Training', link_url: 'https://www.youtube.com/watch?v=k3M6Xbjynms&list=PLYd7vZMYuBLaZAR0CR--szioN39P3ntbr&index=40' },
      ],
    },
  ];

  for (let m = 0; m < MODULES.length; m++) {
    const mod = MODULES[m];
    const { data: moduleRow, error: moduleErr } = await supabase
      .from('education_modules')
      .insert({ course_id: course.id, title: mod.title, sort_order: m })
      .select('id')
      .single();
    if (moduleErr) throw moduleErr;

    const lessonRows = mod.lessons.map((lesson, i) => ({
      module_id: moduleRow.id,
      title: lesson.title,
      body: null,
      link_url: lesson.link_url,
      sort_order: i,
      unlock_at: null,
    }));
    const { error: lessonErr } = await supabase.from('education_lessons').insert(lessonRows);
    if (lessonErr) throw lessonErr;
  }
}

async function seedClasses(coachId: string): Promise<string[]> {
  const rows = [
    { coach_id: coachId, name: 'Group HIIT', day_of_week: 1, start_time: '06:00', capacity: 12 },
    { coach_id: coachId, name: 'Strength Circuit', day_of_week: 3, start_time: '17:30', capacity: 10 },
    { coach_id: coachId, name: 'Mobility & Recovery', day_of_week: 5, start_time: '09:00', capacity: 15 },
  ];
  const { data, error } = await supabase.from('classes').insert(rows).select('id');
  if (error) throw error;
  return (data ?? []).map((c) => c.id);
}

async function seedClient(coachId: string, coachEmail: string, index: number, classIds: string[], educationCourseId: string) {
  const first = randChoice(FIRST_NAMES);
  const last = randChoice(LAST_NAMES);
  const emailSafeCoach = coachEmail.split('@')[0];
  const email = `${emailSafeCoach}-client${index}@example.com`;

  const { data: user, error: userErr } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userErr) throw new Error(`createUser ${email}: ${userErr.message}`);
  const clientId = user.user.id;

  const { error: profileErr } = await supabase
    .from('profiles')
    .insert({ id: clientId, role: 'client', email, coach_id: coachId });
  if (profileErr) throw profileErr;

  const startWeight = randFloat(60, 100, 1);
  const goalWeight = Number((startWeight + randFloat(-10, -3, 1)).toFixed(1));
  const { error: cpErr } = await supabase.from('client_profiles').insert({
    client_id: clientId,
    name: `${first} ${last}`,
    gender: randChoice(['Male', 'Female']),
    age: randInt(19, 58),
    body_fat_pct: randFloat(12, 32, 1),
    start_weight: startWeight,
    goal_weight: goalWeight,
    experience: randChoice(['Beginner', 'Intermediate', 'Advanced']),
    tier: randChoice([1, 2, 3]),
  });
  if (cpErr) throw cpErr;

  // ~70% "engaged" clients get a full data profile; ~30% stay sparse (new/inactive), so
  // ProgramHealth/ActivityFeed have realistic variance to look at rather than 300 identical rows.
  const engaged = Math.random() < 0.7;
  if (!engaged) return;

  // 2 weeks of daily logs, most days but not every single one (skips simulate real gaps).
  const logRows = [];
  for (let d = 13; d >= 0; d--) {
    if (Math.random() < 0.15) continue;
    logRows.push({
      client_id: clientId,
      log_date: toIso(daysAgo(d)),
      protein: randInt(100, 190),
      carbs: randInt(120, 280),
      fat: randInt(45, 90),
      fibre: randInt(15, 35),
      water: randFloat(1.5, 4, 1),
      bodyweight: Number((startWeight - (13 - d) * randFloat(0.02, 0.08, 2)).toFixed(1)),
      steps: randInt(4000, 14000),
      sleep: randFloat(5.5, 8.5, 1),
      gym_session: Math.random() < 0.5,
      hunger: randInt(1, 5),
      energy: randInt(1, 5),
      motivation: randInt(1, 5),
      stress: randInt(1, 5),
    });
  }
  if (logRows.length > 0) {
    const { error } = await supabase.from('daily_logs').insert(logRows);
    if (error) throw error;
  }

  // Workout program: 2 weeks x 3 days, 3 exercises per day.
  const { data: program, error: programErr } = await supabase
    .from('workout_programs')
    .insert({ client_id: clientId, name: 'Base Block', start_date: toIso(daysAgo(13)) })
    .select('id')
    .single();
  if (programErr) throw programErr;

  const dayLabels = ['Day A', 'Day B', 'Day C'];
  // Matches seedClasses' day_of_week values (1=Mon, 3=Wed, 5=Fri) so the seeded classes
  // actually auto-link to these program days for check-in, demonstrating the feature live.
  const dayPositions = [1, 3, 5];
  const exerciseNames = ['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull Up'];
  for (let week = 1; week <= 2; week++) {
    const { data: days, error: daysErr } = await supabase
      .from('workout_program_days')
      .insert(
        dayLabels.map((label, i) => ({ program_id: program.id, week_num: week, day_label: label, day_position: dayPositions[i] }))
      )
      .select('id');
    if (daysErr) throw daysErr;
    for (const day of days ?? []) {
      const exercises = [0, 1, 2].map((i) => ({
        program_day_id: day.id,
        name: randChoice(exerciseNames),
        sets: randInt(3, 5),
        reps: randChoice(['5', '8-10', '10-12']),
        rpe: randInt(6, 9),
        sort_order: i,
      }));
      const { error } = await supabase.from('workout_exercises').insert(exercises);
      if (error) throw error;
    }
  }

  // Measurements: one entry.
  await supabase.from('measurement_logs').insert({
    client_id: clientId,
    log_date: toIso(daysAgo(2)),
    arm: randFloat(28, 38),
    chest: randFloat(85, 110),
    waist: randFloat(70, 100),
    hips: randFloat(85, 110),
  });

  // One habit with ~10 days of logs.
  const { data: habit, error: habitErr } = await supabase
    .from('habits')
    .insert({ client_id: clientId, name: randChoice(['Drink 3L water', 'Morning walk', '10 mins mobility', 'Track all meals']) })
    .select('id')
    .single();
  if (!habitErr && habit) {
    const habitLogs = [];
    for (let d = 9; d >= 0; d--) {
      if (Math.random() < 0.2) continue;
      habitLogs.push({ habit_id: habit.id, log_date: toIso(daysAgo(d)), completed: Math.random() < 0.75 });
    }
    if (habitLogs.length > 0) await supabase.from('habit_logs').insert(habitLogs);
  }

  // Education: assign the course, complete a random subset of lessons.
  await supabase.from('education_course_assignments').insert({ course_id: educationCourseId, client_id: clientId });
  const { data: lessons } = await supabase
    .from('education_lessons')
    .select('id, education_modules!inner(course_id)')
    .eq('education_modules.course_id', educationCourseId);
  if (lessons && lessons.length > 0) {
    const completedCount = randInt(0, lessons.length);
    const shuffled = [...lessons].sort(() => Math.random() - 0.5).slice(0, completedCount);
    if (shuffled.length > 0) {
      await supabase.from('education_lesson_completions').insert(shuffled.map((l) => ({ lesson_id: l.id, client_id: clientId })));
    }
  }

  // Chat: client sent a message, ~50% chance the coach replied -- realistic mix of
  // answered/unanswered threads for the upcoming Communications tab rescope.
  const chatMessages = [
    {
      client_id: clientId,
      sender_id: clientId,
      text: randChoice([
        'Hey, quick question about my macros this week.',
        'Should I still train if I\'m feeling a bit run down?',
        'Just logged today\'s weigh-in, is that on track?',
        'Can we move Thursday\'s check-in to Friday?',
      ]),
    },
  ];
  if (Math.random() < 0.5) {
    chatMessages.push({
      client_id: clientId,
      sender_id: coachId,
      text: randChoice(['On it, will take a look today!', 'Yep that\'s fine, see you Friday.', 'Looks good, keep it up!']),
    });
  }
  await supabase.from('chat_messages').insert(chatMessages);

  // Booking: ~40% chance of an upcoming class booking.
  if (classIds.length > 0 && Math.random() < 0.4) {
    await supabase.from('bookings').insert({
      class_id: randChoice(classIds),
      client_id: clientId,
      booking_date: toIso(daysAgo(-randInt(1, 10))),
      status: 'booked',
    });
  }
}

async function withConcurrency<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        await fn(items[i], i);
      } catch (err) {
        console.error(`Item ${i} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

async function main() {
  console.log(`Seeding ${NUM_COACHES} coach(es) x ${CLIENTS_PER_COACH} client(s) each...`);

  for (let c = 1; c <= NUM_COACHES; c++) {
    const coachEmail = `demo-coach-${c}@example.com`;
    console.log(`\n[Coach ${c}] Creating ${coachEmail}...`);

    const { data: coachUser, error: coachErr } = await supabase.auth.admin.createUser({
      email: coachEmail,
      password: PASSWORD,
      email_confirm: true,
    });
    if (coachErr) throw coachErr;
    const coachId = coachUser.user.id;

    const { error: coachProfileErr } = await supabase
      .from('profiles')
      .insert({ id: coachId, role: 'coach', email: coachEmail });
    if (coachProfileErr) throw coachProfileErr;

    console.log(`[Coach ${c}] Seeding education course...`);
    await seedEducationCourse(coachId);
    const { data: courseRow } = await supabase.from('education_courses').select('id').eq('coach_id', coachId).single();

    console.log(`[Coach ${c}] Seeding classes...`);
    const classIds = await seedClasses(coachId);

    console.log(`[Coach ${c}] Seeding ${CLIENTS_PER_COACH} clients (concurrency ${CONCURRENCY})...`);
    const indices = Array.from({ length: CLIENTS_PER_COACH }, (_, i) => i + 1);
    let done = 0;
    await withConcurrency(indices, CONCURRENCY, async (i) => {
      await seedClient(coachId, coachEmail, i, classIds, courseRow!.id);
      done++;
      if (done % 10 === 0) console.log(`[Coach ${c}] ${done}/${CLIENTS_PER_COACH} clients done`);
    });

    console.log(`[Coach ${c}] Done. Login: ${coachEmail} / ${PASSWORD}`);
  }

  console.log('\nAll done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
