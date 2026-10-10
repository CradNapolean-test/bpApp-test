import { notFound, redirect } from 'next/navigation';
import { Montserrat } from 'next/font/google';
import { createClient } from '@/lib/supabase/server';
import { getRunClassData } from '@/lib/data/runClass';
import { blockFormatOf, groupIntoBlocks, parseBlockKey, type WorkoutSection } from '@/lib/workoutSections';
import { TvExit } from './TvExit';
import type { WorkoutExerciseRow } from '@/lib/data/types';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['500', '700', '800', '900'], style: ['italic'] });

// The workout for a class, laid out like the gym's printed workout card, to be read from across the room.
// View only: Warm up, Lift, Strong and Conditioning in a 2 x 2 grid, each a white title bar over a black panel.

const TIMED = ['AMRAP', 'EMOM', 'Partner AMRAP'];

function formatLabel(format: string | null, blockNo: 0 | 1 | 2 | null): string {
  if (!format) return '';
  const minutes = blockNo === 0 ? 20 : 10;
  return TIMED.includes(format) ? `${format.toUpperCase()} ${minutes}'` : format.toUpperCase();
}

// What goes in the right-hand column: the reps, or the load, or the note for rows with neither.
function amount(e: WorkoutExerciseRow): string {
  return (e.reps ?? '') || (e.load ? `${e.load}kg` : '') || (e.notes ?? '');
}

function Panel({ title, emoji, children }: { title: string; emoji?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden border-[3px] border-white bg-black">
      <h2 className="bg-white py-2 text-center text-4xl font-black uppercase tracking-tight text-black md:text-6xl">
        {title}
        {emoji && <span className="ml-3 not-italic">{emoji}</span>}
      </h2>
      <div className="p-4 md:p-6">{children}</div>
    </section>
  );
}

// One block: numbered rows with the format on the left and the amount on the right. `label` is the small
// sideways text (Upper / Lower) beside the rows.
function Block({ rows, label, blockNo, showSets }: { rows: WorkoutExerciseRow[]; label?: string; blockNo: 0 | 1 | 2 | null; showSets?: boolean }) {
  const format = formatLabel(blockFormatOf(rows), blockNo);
  return (
    <div className="flex gap-3 py-2">
      {label && (
        <span className="w-6 shrink-0 text-center text-sm font-bold uppercase tracking-widest text-white/80 md:text-base [writing-mode:vertical-rl] rotate-180">{label}</span>
      )}
      <div className="min-w-0 flex-1">
        {format && <p className="mb-1 text-center text-xl font-bold text-white md:text-3xl">{format}</p>}
        <ol className="space-y-1">
          {rows.map((e, i) => (
            <li key={e.id} className="grid grid-cols-[2rem_1fr_auto_auto] items-baseline gap-x-4 text-xl font-bold uppercase text-white md:grid-cols-[2.5rem_1fr_5rem_9rem] md:text-3xl">
              <span className="text-white/70">{label ? '' : i + 1}</span>
              <span className="truncate">{e.name}</span>
              <span className="text-center">{showSets && e.sets ? `x${e.sets}` : ''}</span>
              <span className="text-right md:text-center">{amount(e)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
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

  const exitHref = `/coach/run/${classId}/${date}`;
  const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const blocks = data.workout ? groupIntoBlocks(data.workout.exercises) : new Map<string, WorkoutExerciseRow[]>();
  const keysOf = (section: WorkoutSection) => [...blocks.keys()].filter((k) => k.split(':')[0] === section);
  const rest = data.workout?.exercises.find((e) => e.section === 'lift' && e.rest_seconds)?.rest_seconds ?? null;

  return (
    <main className={`${montserrat.className} min-h-screen bg-black p-4 text-white md:p-10`}>
      <TvExit href={exitHref} />
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-5xl font-black uppercase italic leading-none text-[#1aadb5] md:text-8xl">{weekday}</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-badge.png" alt="" className="h-12 w-auto md:h-24" />
      </header>

      {!data.workout ? (
        <p className="text-3xl text-zinc-400">No workout is set for this day in the programme.</p>
      ) : (
        <div className="flex gap-3 md:gap-5">
          <div className="hidden w-14 shrink-0 items-center justify-center bg-white md:flex">
            <span className="text-5xl font-black uppercase text-black [writing-mode:vertical-rl] rotate-180">Week {data.workout.weekNum}</span>
          </div>
          <div className="grid flex-1 gap-3 md:grid-cols-2 md:gap-5">
            <Panel title="Warm up">
              {keysOf('warmup').map((k) => (
                <Block key={k} rows={blocks.get(k) ?? []} blockNo={null} />
              ))}
            </Panel>

            <Panel title="Lift">
              {keysOf('lift').map((k) => (
                <Block key={k} rows={blocks.get(k) ?? []} blockNo={null} showSets />
              ))}
              {rest && <p className="mt-2 text-right text-xl font-bold uppercase md:text-3xl">Rest {rest}s</p>}
            </Panel>

            <Panel title="Strong" emoji="💪">
              {keysOf('strong').map((k) => {
                const { blockNo, part } = parseBlockKey(k);
                return <Block key={k} rows={blocks.get(k) ?? []} blockNo={blockNo} label={part ?? undefined} />;
              })}
            </Panel>

            <Panel title="Conditioning" emoji="🔥">
              {keysOf('conditioning').map((k) => (
                <Block key={k} rows={blocks.get(k) ?? []} blockNo={parseBlockKey(k).blockNo} />
              ))}
            </Panel>
          </div>
        </div>
      )}
    </main>
  );
}
