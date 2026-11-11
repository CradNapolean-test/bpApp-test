'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/ToastProvider';
import { deleteBlockResult, saveBlockResult } from '@/lib/data/blockResults';
import type { WorkoutBlockResultRow } from '@/lib/data/types';
import {
  canHitCap,
  capLabel,
  inputsFromResult,
  isBlankResult,
  readResultInputs,
  resultFields,
  resultLabel,
  resultSummary,
  type BlockConfig,
  type ResultField,
  type ResultInputs,
} from '@/lib/blockScoring';

const boxCls = 'h-11 w-full min-w-0 rounded-xl border border-black/10 bg-card px-2 text-center text-base font-semibold dark:border-white/10';

// What the member scored on a block (rounds and reps, a finish time, a score, or a tick), saved once for the block. Shown under the
// block's exercises. Nothing is shown for a block with no result to record.
export function BlockResultForm({
  programDayId,
  blockKey,
  format,
  config,
  result,
}: {
  programDayId: string;
  blockKey: string;
  format: string | null;
  config: BlockConfig;
  result: WorkoutBlockResultRow | undefined;
}) {
  const { run, busy } = useAction();
  const toast = useToast();
  const confirm = useConfirm();
  const [inputs, setInputs] = useState<ResultInputs>(() => inputsFromResult(result));
  if (config.scoring === 'none') return null;
  const scoring = config.scoring;
  // A "for time" block the cap stopped: the reps done instead of a finish time (TR25).
  const cappable = canHitCap(config);
  const capped = cappable && inputs.capped;
  const fields = capped ? (['reps'] as ResultField[]) : resultFields(scoring);

  async function save() {
    const read = readResultInputs(scoring, inputs, config);
    if (!read.ok) {
      toast.error(read.error);
      return;
    }
    if (isBlankResult(scoring, read.values)) {
      toast.error('Add your result before saving it.');
      return;
    }
    await run(() => saveBlockResult(programDayId, blockKey, { format, scoring: scoring as WorkoutBlockResultRow['scoring'], ...read.values }), {
      success: 'Result saved',
    });
  }

  const box = (f: ResultField) =>
    f === 'done' ? (
      <label key={f} className="flex min-h-11 items-center gap-3 rounded-xl border border-black/10 px-3 dark:border-white/10">
        <input
          type="checkbox"
          checked={inputs.done}
          onChange={(e) => setInputs((p) => ({ ...p, done: e.target.checked }))}
          className="h-6 w-6 shrink-0 accent-[var(--accent)]"
        />
        <span className="text-sm font-semibold text-black dark:text-zinc-50">{resultLabel('done', config)}</span>
      </label>
    ) : (
      <label key={f} className="block">
        <span className="mb-1 block text-center text-[11px] font-medium text-zinc-500">{capped && f === 'reps' ? 'Reps done (optional)' : resultLabel(f, config)}</span>
        <input
          type="text"
          inputMode={f === 'time' ? 'text' : 'decimal'}
          placeholder={f === 'time' ? 'm:ss' : undefined}
          className={boxCls}
          value={f === 'time' ? inputs.time : inputs[f]}
          onChange={(e) => setInputs((p) => ({ ...p, [f]: e.target.value }))}
        />
      </label>
    );

  return (
    <div className="mt-3 rounded-2xl bg-black/[.03] p-3 dark:bg-white/[.04]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-black dark:text-zinc-50">Block result</span>
        {result && (
          <span className="whitespace-nowrap rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
            ✓ {resultSummary(config, result)}
          </span>
        )}
      </div>
      <div className={`grid gap-2 ${fields.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>{fields.map(box)}</div>
      {cappable && (
        <label className="mt-2 flex min-h-11 items-center gap-3 text-sm font-semibold text-black dark:text-zinc-50">
          <input
            type="checkbox"
            checked={inputs.capped}
            onChange={(e) => setInputs((p) => ({ ...p, capped: e.target.checked }))}
            className="h-5 w-5 shrink-0 accent-[var(--accent)]"
          />
          {capLabel(config)}
        </label>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="mt-2.5 h-11 w-full rounded-full bg-accent text-sm font-extrabold text-accent-foreground disabled:opacity-50"
      >
        {busy ? 'Saving…' : result ? 'Update result' : 'Save result'}
      </button>
      {result && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            // It went on one tap, with no undo (TR25).
            const ok = await confirm({ title: 'Remove this result?', body: `Your ${resultSummary(config, result)} for this block is deleted.`, confirmLabel: 'Remove', destructive: true });
            if (!ok) return;
            await run(() => deleteBlockResult(programDayId, blockKey), { success: 'Result removed', onDone: () => setInputs(inputsFromResult(undefined)) });
          }}
          className="mt-1 block w-full py-1 text-sm font-semibold text-danger disabled:opacity-50"
        >
          Remove result
        </button>
      )}
    </div>
  );
}
