import type { ClubProgress } from '@/lib/clubs';

// Stage colours, in order: each club the member has reached keeps its colour, and the stage they are in is the
// last one. Teal comes after the three chart colours so a long run of clubs still looks distinct.
const STAGE_COLOURS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--accent)'];
const colour = (i: number) => STAGE_COLOURS[i % STAGE_COLOURS.length];

// One bar from 0 to the next club, split into a coloured stage per club. It never goes back to empty: passing a
// club leaves its stage full and widens the bar to the next one.
export function ClubBar({ progress }: { progress: ClubProgress }) {
  return (
    <div>
      <div className="flex gap-[3px]" role="img" aria-label={`${progress.toGo} sessions to the ${progress.next} club`}>
        {progress.segments.map((s, i) => (
          <div key={s.to} className="h-[7px] overflow-hidden rounded-full" style={{ width: `${s.widthPct}%`, backgroundColor: `color-mix(in srgb, ${colour(i)} 22%, transparent)` }}>
            <div className="h-full rounded-full" style={{ width: `${s.fill * 100}%`, backgroundColor: colour(i) }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px]">
        {progress.segments.map((s) => (
          <span key={s.to} className={`text-right text-[10px] font-semibold ${s.reached ? 'text-zinc-500' : 'text-zinc-400'}`} style={{ width: `${s.widthPct}%` }}>
            {s.to}
          </span>
        ))}
      </div>
    </div>
  );
}
