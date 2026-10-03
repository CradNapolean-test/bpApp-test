import { config } from 'dotenv';
config({ path: '.env.local' });
import { createAdminClient } from '../lib/supabase/admin';

// One-off: copies an education course (modules and lessons, no assignments) into another gym.
//   npm run copy-course -- --title="Education Library" --to="Ballistic Performance - Salford Quays"
// Picks the oldest course with that title, skips if the target gym already has a course with that
// title, and credits the copy to a coach who belongs to the target gym.
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const title = arg('title');
  const toName = arg('to');
  if (!title || !toName) throw new Error('Usage: --title="Course title" --to="Gym name"');
  const admin = createAdminClient();

  const { data: gyms } = await admin.from('gyms').select('id, name');
  const target = (gyms ?? []).find((g) => g.name === toName);
  if (!target) throw new Error(`No gym called "${toName}". Gyms: ${(gyms ?? []).map((g) => g.name).join(', ')}`);

  const { data: existing } = await admin.from('education_courses').select('id').eq('gym_id', target.id).eq('title', title);
  if ((existing ?? []).length > 0) {
    console.log(`"${toName}" already has "${title}", nothing to do.`);
    return;
  }

  const { data: sources, error } = await admin
    .from('education_courses')
    .select('id, title, description, gym_id, created_at, education_modules(title, sort_order, education_lessons(title, body, link_url, unlock_at, sort_order))')
    .eq('title', title)
    .neq('gym_id', target.id)
    .order('created_at');
  if (error) throw error;
  const source = sources?.[0];
  if (!source) throw new Error(`No course called "${title}" in another gym.`);

  const { data: memberships } = await admin
    .from('coach_gym_memberships')
    .select('coach_id, is_gym_admin')
    .eq('gym_id', target.id)
    .order('is_gym_admin', { ascending: false });
  const coachId = memberships?.[0]?.coach_id;
  if (!coachId) throw new Error(`No coach belongs to "${toName}".`);

  const { data: course, error: courseError } = await admin
    .from('education_courses')
    .insert({ coach_id: coachId, gym_id: target.id, title: source.title, description: source.description })
    .select('id')
    .single();
  if (courseError) throw courseError;

  let lessons = 0;
  for (const m of (source.education_modules ?? []) as {
    title: string;
    sort_order: number;
    education_lessons: { title: string; body: string | null; link_url: string | null; unlock_at: string | null; sort_order: number }[];
  }[]) {
    const { data: mod, error: modError } = await admin
      .from('education_modules')
      .insert({ course_id: course.id, title: m.title, sort_order: m.sort_order })
      .select('id')
      .single();
    if (modError) throw modError;
    if (m.education_lessons.length > 0) {
      const { error: lessonError } = await admin
        .from('education_lessons')
        .insert(m.education_lessons.map((l) => ({ module_id: mod.id, title: l.title, body: l.body, link_url: l.link_url, unlock_at: l.unlock_at, sort_order: l.sort_order })));
      if (lessonError) throw lessonError;
      lessons += m.education_lessons.length;
    }
  }
  console.log(`Copied "${source.title}" to "${toName}": ${source.education_modules?.length ?? 0} modules, ${lessons} lessons.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
