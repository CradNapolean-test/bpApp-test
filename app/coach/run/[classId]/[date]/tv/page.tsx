import { notFound, redirect } from 'next/navigation';
import { Montserrat } from 'next/font/google';
import { createClient } from '@/lib/supabase/server';
import { getRunClassData } from '@/lib/data/runClass';
import { blockFormatOf, groupIntoBlocks, parseBlockKey, type WorkoutSection } from '@/lib/workoutSections';
import { blockConfigOf } from '@/lib/blockScoring';
import { tvBlockLabel } from '@/lib/tvBlockLabel';
import { TvExit } from './TvExit';
import { TvFit } from './TvFit';
import type { WorkoutExerciseRow } from '@/lib/data/types';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['500', '700', '800', '900'], style: ['italic'] });

// The workout for a class, laid out like the gym's printed workout card, to be read from across the room.
// View only: Warm up, Lift, Strong and Conditioning in a 2 x 2 grid, each a white title bar over a black panel. On a screen 768px wide or
// more it fills the window without scrolling at any size (1366×768 laptops mirrored to the gym TV and 1920×1080 alike, D25): sizes inside
// the grid are in em and TvFit picks the font size that fits; names wrap instead of being cut off.

// What goes in the right-hand column: the reps, or the load, or the note for rows with neither.
function amount(e: WorkoutExerciseRow): string {
  return (e.reps ?? '') || (e.load ? `${e.load}kg` : '') || (e.notes ?? '');
}

function Panel({ title, emoji, children }: { title: string; emoji?: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden border-[3px] border-white bg-black">
      <h2 className="shrink-0 bg-white py-[0.2em] text-center text-[1.8em] font-black uppercase leading-tight tracking-tight text-black md:text-[1.9em]">
        {title}
        {emoji && <span className="ml-3 not-italic">{emoji}</span>}
      </h2>
      <div data-tv-fit className="min-h-0 flex-1 overflow-hidden p-[0.6em]">
        {children}
      </div>
    </section>
  );
}

// One block: numbered rows with the format on the left and the amount on the right. `label` is the small
// sideways text (Upper / Lower) beside the rows.
function Block({ rows, label, blockNo, showSets }: { rows: WorkoutExerciseRow[]; label?: string; blockNo: 0 | 1 | 2 | null; showSets?: boolean }) {
  // The block's own time cap, rounds and work/rest (CS17); a whole-session block fills 20 minutes, the others 10.
  const format = tvBlockLabel(blockFormatOf(rows), blockConfigOf(rows), blockNo === 0 ? 20 : 10);
  return (
    <div className="flex gap-[0.4em] py-[0.2em]">
      {label && (
        <span className="w-[1.1em] shrink-0 text-center text-[0.55em] font-bold uppercase tracking-widest text-white/80 [writing-mode:vertical-rl] rotate-180">{label}</span>
      )}
      <div className="min-w-0 flex-1">
        {format && <p className="mb-[0.15em] text-center font-bold leading-tight text-white">{format}</p>}
        <ol className="space-y-[0.15em]">
          {rows.map((e, i) => (
            <li key={e.id} className="grid grid-cols-[1.3em_minmax(0,1fr)_auto_auto] items-baseline gap-x-[0.5em] font-bold uppercase leading-tight text-white">
              <span className="text-white/70">{label ? '' : i + 1}</span>
              {/* Wraps onto a second line rather than being cut off ("BENCH PRE…" at 1366×768, CS27). */}
              <span className="[overflow-wrap:anywhere]">{e.name}</span>
              <span className="text-center">{showSets && e.sets ? `x${e.sets}` : ''}</span>
              <span className="max-w-[8em] text-right [overflow-wrap:anywhere]">{amount(e)}</span>
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
    <main className={`${montserrat.className} min-h-screen bg-black p-4 text-white md:flex md:h-dvh md:min-h-0 md:flex-col md:overflow-hidden md:px-[2.5vw] md:py-[2.5vh]`}>
      <TvExit href={exitHref} />
      <header className="mb-6 flex shrink-0 items-center justify-between gap-4 md:mb-[2vh]">
        <h1 className="text-5xl font-black uppercase italic leading-none text-[#1aadb5] md:text-[8vh]">{weekday}</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-badge.png" alt="" className="h-12 w-auto md:h-[9vh]" />
      </header>

      {!data.workout ? (
        <p className="text-3xl text-zinc-400">No workout is set for this day in the programme.</p>
      ) : (
        <TvFit>
        <div className="flex gap-3 md:h-full md:gap-[1.5vh]">
          <div className="hidden w-[7vh] shrink-0 items-center justify-center bg-white md:flex">
            <span className="text-[5vh] font-black uppercase text-black [writing-mode:vertical-rl] rotate-180">Week {data.workout.weekNum}</span>
          </div>
          <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 md:grid-rows-2 md:gap-[1.5vh]">
            <Panel title="Warm up">
              {keysOf('warmup').map((k) => (
                <Block key={k} rows={blocks.get(k) ?? []} blockNo={null} />
              ))}
            </Panel>

            <Panel title="Lift">
              {keysOf('lift').map((k) => (
                <Block key={k} rows={blocks.get(k) ?? []} blockNo={null} showSets />
              ))}
              {rest && <p className="mt-[0.3em] text-right font-bold uppercase">Rest {rest}s</p>}
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
        </TvFit>
      )}
    </main>
  );
}
