import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRunClassData } from '@/lib/data/runClass';
import { SECTIONS, SECTION_TITLE, PART_TITLE, blockFormatOf, formatDescription, groupIntoBlocks, parseBlockKey } from '@/lib/workoutSections';
import { formatClassTime } from '@/lib/utils/dates';
import type { WorkoutExerciseRow } from '@/lib/data/types';

// The workout for a class, laid out to be read from across the room: put this page on the gym TV.
// View only. Warm-up, Lift, Strong and Conditioning each get a column, in the order they are done.

function blockTitle(key: string, section: string): string {
  const { blockNo, part } = parseBlockKey(key);
  if (blockNo === 0) return '20 minutes';
  if (section === 'strong' && blockNo === 2 && part) return `Block 2 · ${PART_TITLE[part]}`;
  return blockNo ? `Block ${blockNo}` : '';
}

function prescription(e: WorkoutExerciseRow): string {
  const sr = [e.sets && e.reps ? `${e.sets} × ${e.reps}` : e.reps ? e.reps : e.sets ? `${e.sets} sets` : null, e.load ? `${e.load}kg` : null];
  return sr.filter(Boolean).join(' · ');
}

export default async function RunClassTvPage({ params }: { params: Promise<{ classId: string; date: string }> }) {
  const { classId, date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  const data = await getRunClassData(classId, date).catch(() => null);
  if (!data) notFound();

  const blocks = data.workout ? groupIntoBlocks(data.workout.exercises) : new Map<string, WorkoutExerciseRow[]>();
  const heading = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  return (
    <main className="min-h-screen bg-black p-6 text-white md:p-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-4xl font-black md:text-6xl">{data.workout?.dayLabel ?? data.className}</h1>
        <p className="text-xl font-semibold text-zinc-400 md:text-3xl">
          {heading} · {formatClassTime(data.startTime)}
          {data.workout ? ` · Week ${data.workout.weekNum}` : ''}
        </p>
      </header>

      {!data.workout ? (
        <p className="text-3xl text-zinc-400">No workout is set for this day in the programme.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
          {SECTIONS.map((section) => {
            const keys = [...blocks.keys()].filter((k) => k.split(':')[0] === section.key);
            if (keys.length === 0) return null;
            return (
              <section key={section.key} className="rounded-3xl bg-zinc-900 p-6">
                <h2 className="text-3xl font-black uppercase tracking-wide text-accent md:text-4xl">
                  {SECTION_TITLE[section.key]}
                  {section.hint && <span className="ml-3 text-xl font-semibold normal-case text-zinc-500">{section.hint}</span>}
                </h2>
                {keys.map((key) => {
                  const rows = blocks.get(key) ?? [];
                  const format = blockFormatOf(rows);
                  const title = blockTitle(key, section.key);
                  return (
                    <div key={key} className="mt-5">
                      {(title || format) && (
                        <p className="mb-2 text-xl font-bold text-zinc-300">
                          {title}
                          {format && <span className="ml-2 rounded-full bg-accent/20 px-3 py-0.5 text-lg text-accent">{format}</span>}
                        </p>
                      )}
                      {format && formatDescription(format) && <p className="mb-2 text-lg text-zinc-500">{formatDescription(format)}</p>}
                      <ul className="space-y-2">
                        {rows.map((e) => (
                          <li key={e.id} className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-2 text-2xl md:text-3xl">
                            <span className="font-bold">{e.name}</span>
                            <span className="shrink-0 font-semibold text-zinc-400">{prescription(e)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
