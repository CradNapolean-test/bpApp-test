import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '../lib/supabase/admin';
import { calcEngine, weeklyTarget, stepTargetForWeek, type ClientProfile } from '../lib/calculations';

// Generates N weeks of plausible daily_logs history for one client, ending today, so
// Insights/Overview/Weekly Log have something real to show instead of an empty state.
// Upserts on (client_id, log_date), so re-running it just refreshes the same date range.

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, '').split('=');
      return [key, rest.join('=')];
    })
  );
  if (!args.email) {
    console.error('Usage: npm run seed-demo-history -- --email=client@example.com [--weeks=6]');
    process.exit(1);
  }
  return { email: args.email as string, weeks: Number(args.weeks ?? 6) };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const SAMPLE_NOTES = [
  'Felt strong in training today.',
  'Struggled with cravings in the afternoon.',
  'Slept poorly, low energy all day.',
  'Great session, hit a new rep PR.',
  'Busy day, meals were rushed.',
  'Feeling good about progress this week.',
];

async function main() {
  const { email, weeks } = parseArgs();
  const supabase = createAdminClient();

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .single();
  if (profileError || !profileRow) throw profileError ?? new Error(`No profile for ${email}`);

  const { data: clientProfile, error: cpError } = await supabase
    .from('client_profiles')
    .select('*')
    .eq('client_id', profileRow.id)
    .single();
  if (cpError || !clientProfile) throw cpError ?? new Error(`No client_profiles row for ${email}`);
  if (!clientProfile.age || !clientProfile.body_fat_pct) {
    throw new Error('Client profile is missing age/body_fat_pct — complete Setup first.');
  }

  const profile: ClientProfile = {
    age: clientProfile.age,
    gender: clientProfile.gender === 'Male' ? 'Male' : 'Female',
    startWeight: clientProfile.start_weight,
    goalWeight: clientProfile.goal_weight,
    bodyFatPct: clientProfile.body_fat_pct,
    activityLevel: clientProfile.activity_level,
    dietApproach: clientProfile.diet_approach,
    tier: clientProfile.tier,
    cycling: false, // demo data uses the flat daily target regardless of the profile's own cycling setting
  };
  const engine = calcEngine(profile);
  if (!engine) throw new Error('calcEngine returned null for this profile — check Setup data.');

  const totalDays = weeks * 7;
  const today = new Date();
  const totalLossKg = weeks * 0.5; // ~0.5kg/week, a realistic pace for this deficit range
  const isFemale = profile.gender === 'Female';

  const rows = [];
  for (let d = 0; d < totalDays; d++) {
    const date = addDays(today, d - (totalDays - 1)); // d=0 is the oldest day, d=last is today
    const weekNum = Math.floor(d / 7) + 1;
    const target = weeklyTarget(profile, weekNum);
    if (!target?.dailyFlat) throw new Error('weeklyTarget returned no dailyFlat target');

    const variance = () => randomBetween(0.9, 1.1);
    const protein = Math.round(target.dailyFlat.protein * variance() * 10) / 10;
    const carbs = Math.round(target.dailyFlat.carbs * variance() * 10) / 10;
    const fat = Math.round(target.dailyFlat.fat * variance() * 10) / 10;

    const progress = d / (totalDays - 1);
    const bodyweight =
      Math.round((profile.startWeight - totalLossKg * progress + randomBetween(-0.3, 0.3)) * 10) / 10;

    const stepTarget = stepTargetForWeek(weekNum);
    const steps = Math.round(randomBetween(stepTarget * 0.7, stepTarget * 1.1));

    rows.push({
      client_id: profileRow.id,
      log_date: toIsoDate(date),
      protein,
      carbs,
      fat,
      fibre: Math.round(randomBetween(15, 30)),
      water: Math.round(randomBetween(1.5, 3.5) * 10) / 10,
      bodyweight,
      steps,
      sleep: Math.round(randomBetween(6, 8.5) * 10) / 10,
      gym_session: Math.random() < 0.7,
      day_type: 'flat' as const,
      hunger: Math.ceil(randomBetween(1, 5)),
      energy: Math.ceil(randomBetween(1, 5)),
      motivation: Math.ceil(randomBetween(1, 5)),
      stress: Math.ceil(randomBetween(1, 5)),
      period_started: isFemale && (d === 3 || d === 31),
      notes: Math.random() < 0.15 ? SAMPLE_NOTES[Math.floor(Math.random() * SAMPLE_NOTES.length)] : null,
    });
  }

  const { error } = await supabase.from('daily_logs').upsert(rows, { onConflict: 'client_id,log_date' });
  if (error) throw error;

  console.log(`Seeded ${rows.length} days (${weeks} weeks) of demo history for ${email}`);
  console.log(`Bodyweight: ${rows[0].bodyweight}kg -> ${rows[rows.length - 1].bodyweight}kg`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
