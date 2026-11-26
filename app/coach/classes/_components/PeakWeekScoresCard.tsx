'use client';

import { useAction } from '@/app/_components/useAction';
import { getScoresExport } from '@/lib/data/bigDog';
import { peakWeekScoresFile, type ScoresLayout } from '@/lib/peakWeekScoresFile';

const softBtn = 'inline-flex h-11 shrink-0 items-center rounded-xl bg-accent-soft px-4 text-sm font-bold text-accent disabled:opacity-50';
const ghostBtn =
  'inline-flex h-11 items-center rounded-xl border-[1.5px] border-black/20 px-4 text-sm font-bold text-black disabled:opacity-50 dark:border-white/25 dark:text-zinc-50';

// The Peak Week score downloads, on Classes → Reports (moved from Business → Rewards, BO9). Exactly as they were there: the same two CSVs,
// for every coach who can open the page, with the scores the database lets this coach read (getScoresExport, row level security on
// big_dog_results), not limited to the period picked above.
export function PeakWeekScoresCard() {
  const { run, busy } = useAction();
  const save = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const download = (layout: ScoresLayout) =>
    run(async () => {
      const { raw, members } = await getScoresExport();
      const file = peakWeekScoresFile(layout, raw, members, new Date().toISOString().slice(0, 10));
      save(file.name, file.text);
    });
  return (
    <div className="rounded-[20px] border border-black/[.08] bg-card px-5 py-4 sm:px-6 dark:border-white/10">
      <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">Peak Week scores</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Download every verified score for your sheet, not just this period. Opens in Excel or Google Sheets. A newer score a member logged
        themselves is listed with Verified = No.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => download('scores')} className={softBtn}>
          One row per score (CSV)
        </button>
        <button type="button" disabled={busy} onClick={() => download('grid')} className={ghostBtn}>
          One row per member (CSV)
        </button>
      </div>
    </div>
  );
}
