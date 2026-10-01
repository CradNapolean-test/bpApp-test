'use client';

import { useState } from 'react';
import { FileText, Plus, ScanLine, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { EmptyState } from '@/app/_components/EmptyState';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useBackHandler } from '@/app/_components/useBackHandler';
import { createClient } from '@/lib/supabase/client';
import { addBodyScan, deleteBodyScan } from '@/lib/data/bodyScans';
import { shrinkImage } from '@/lib/utils/shrinkImage';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { TrendChart } from './OverviewTab';
import type { BodyScan, ClientProfileRow } from '@/lib/data/types';

type MetricKey = 'weight_kg' | 'skeletal_muscle_kg' | 'body_fat_pct';

const CHART_METRICS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', color: 'var(--chart-1)' },
  { key: 'skeletal_muscle_kg', label: 'Muscle', unit: 'kg', color: '#2ecc71' },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%', color: '#e8a020' },
];

// good: which direction is an improvement (null = neutral, e.g. bodyweight on its own).
const STATS: { key: keyof BodyScan; label: string; unit: string; good: 'up' | 'down' | null; digits: number }[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', good: null, digits: 1 },
  { key: 'skeletal_muscle_kg', label: 'Skeletal muscle', unit: 'kg', good: 'up', digits: 1 },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%', good: 'down', digits: 1 },
  { key: 'body_fat_kg', label: 'Body fat mass', unit: 'kg', good: 'down', digits: 1 },
  { key: 'visceral_fat_level', label: 'Visceral fat', unit: 'level', good: 'down', digits: 0 },
  { key: 'bmr_kcal', label: 'BMR', unit: 'kcal', good: null, digits: 0 },
  { key: 'inbody_score', label: 'InBody score', unit: '', good: 'up', digits: 0 },
];

const longDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-base dark:border-white/10';
const labelCls = 'text-xs font-semibold text-zinc-500';

function isPdf(path: string | null) {
  return !!path && path.toLowerCase().endsWith('.pdf');
}

export function BodyScansTab({
  clientId,
  scans,
  profile,
  readOnly,
}: {
  clientId: string;
  scans: BodyScan[];
  profile: ClientProfileRow | null;
  readOnly: boolean;
}) {
  const confirm = useConfirm();
  const { run: runDelete } = useAction();
  const [adding, setAdding] = useState(false);
  const [metric, setMetric] = useState<MetricKey>('body_fat_pct');
  const [viewing, setViewing] = useState<string | null>(null);
  useBackHandler(viewing != null, () => setViewing(null));

  const latest = scans[0] ?? null;
  const previous = scans[1] ?? null;
  const chartMeta = CHART_METRICS.find((m) => m.key === metric)!;
  // Oldest first for the chart.
  const chartScans = [...scans].reverse().filter((s) => s[metric] != null);

  async function handleDelete(scan: BodyScan) {
    const ok = await confirm({ title: `Delete the scan from ${longDate(scan.scan_date)}?`, body: 'This cannot be undone.', destructive: true });
    if (!ok) return;
    await runDelete(() => deleteBodyScan(scan.id), { success: 'Scan deleted' });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {latest ? `Last scan ${longDate(latest.scan_date)}` : 'InBody body composition scans'}
        </p>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground"
          >
            <Plus className="h-4 w-4" /> Add scan
          </button>
        )}
      </div>

      {scans.length === 0 ? (
        <EmptyState
          icon={ScanLine}
          title="No scans yet"
          hint={readOnly ? 'Nothing logged yet.' : 'Add your InBody results from the printout and track muscle and body fat over time.'}
        />
      ) : (
        <>
          <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
            <div className="flex gap-1.5">
              {CHART_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMetric(m.key)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
                    metric === m.key ? 'bg-accent text-accent-foreground' : 'bg-black/5 text-zinc-500 dark:bg-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-black dark:text-zinc-50">
                {latest?.[metric] != null ? `${Number(latest[metric]).toFixed(1)}${chartMeta.unit}` : '—'}
              </p>
              <TrendChart
                values={chartScans.map((s) => Number(s[metric]))}
                labels={chartScans.map((s) => shortDate(s.scan_date))}
                color={chartMeta.color}
                formatter={(v) => v.toFixed(1)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {STATS.filter((s) => latest?.[s.key] != null).map((s) => {
              const value = Number(latest![s.key]);
              const prev = previous?.[s.key] != null ? Number(previous[s.key]) : null;
              const delta = prev != null ? value - prev : null;
              const shown = delta != null && Math.abs(delta) >= Math.pow(10, -s.digits) / 2;
              const favourable = s.good == null || delta == null ? null : s.good === 'up' ? delta > 0 : delta < 0;
              return (
                <div key={s.key} className="rounded-2xl border border-black/[.05] bg-card p-3.5 dark:border-white/10">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{s.label}</p>
                  <p className="mt-0.5 text-xl font-extrabold text-black dark:text-zinc-50">
                    {value.toFixed(s.digits)}
                    {s.unit && <span className="ml-0.5 text-xs font-bold text-zinc-500">{s.unit}</span>}
                  </p>
                  {shown && (
                    <p className={`text-[11px] font-semibold ${favourable == null ? 'text-zinc-500' : favourable ? 'text-success' : 'text-danger'}`}>
                      {delta! > 0 ? '+' : ''}
                      {delta!.toFixed(s.digits)} since last scan
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-black/[.05] bg-card dark:border-white/10">
            <p className="px-4 pt-3.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Scan history</p>
            <ul className="mt-1 divide-y divide-black/[.05] dark:divide-white/10">
              {scans.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-black dark:text-zinc-50">{longDate(s.scan_date)}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {[
                        s.weight_kg != null && `${s.weight_kg}kg`,
                        s.skeletal_muscle_kg != null && `${s.skeletal_muscle_kg}kg muscle`,
                        s.body_fat_pct != null && `${s.body_fat_pct}% fat`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Printout only'}
                    </p>
                    {s.notes && <p className="mt-0.5 text-xs text-zinc-400">{s.notes}</p>}
                  </div>
                  {s.signedPrintoutUrl &&
                    (isPdf(s.printout_path) ? (
                      <a
                        href={s.signedPrintoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open printout"
                        className="rounded-full bg-black/5 p-2 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
                      >
                        <FileText className="h-4 w-4" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        aria-label="View printout"
                        onClick={() => setViewing(s.signedPrintoutUrl)}
                        className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black/5"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.signedPrintoutUrl} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  {!readOnly && (
                    <button type="button" aria-label="Delete scan" onClick={() => handleDelete(s)} className="rounded-full p-2 text-zinc-400 hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {adding && <AddScanSheet clientId={clientId} timezone={profile?.timezone} onClose={() => setAdding(false)} />}

      {viewing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={() => setViewing(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing} alt="InBody printout" className="max-h-[88vh] max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}

function AddScanSheet({ clientId, timezone, onClose }: { clientId: string; timezone?: string | null; onClose: () => void }) {
  const { run, busy } = useAction();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayIsoInTz(timezone ?? DEFAULT_TIMEZONE));
  const [f, setF] = useState({ weight: '', muscle: '', fatPct: '', fatKg: '', visceral: '', bmr: '', score: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const field = (key: keyof typeof f, label: string, placeholder: string, step = '0.1') => (
    <div className="space-y-1">
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        className={inputCls}
        placeholder={placeholder}
        value={f[key]}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
      />
    </div>
  );

  async function save() {
    setError(null);
    let printoutPath: string | null = null;
    if (file) {
      if (file.size > 12 * 1024 * 1024) {
        setError('That file is too big (12MB max).');
        return;
      }
      setUploading(true);
      try {
        const isPdfFile = file.type === 'application/pdf';
        const body = isPdfFile ? file : await shrinkImage(file);
        const path = `${clientId}/${crypto.randomUUID()}.${isPdfFile ? 'pdf' : 'jpg'}`;
        const { error: uploadError } = await createClient()
          .storage.from('inbody-scans')
          .upload(path, body, { contentType: isPdfFile ? 'application/pdf' : 'image/jpeg' });
        if (uploadError) throw uploadError;
        printoutPath = path;
      } catch {
        setError('Could not upload the printout. Please try again.');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const ok = await run(
      () =>
        addBodyScan(
          clientId,
          {
            scanDate: date,
            weightKg: num(f.weight),
            skeletalMuscleKg: num(f.muscle),
            bodyFatPct: num(f.fatPct),
            bodyFatKg: num(f.fatKg),
            visceralFatLevel: num(f.visceral),
            bmrKcal: num(f.bmr),
            inbodyScore: num(f.score),
            notes: f.notes,
          },
          printoutPath
        ),
      { success: 'Scan saved' }
    );
    if (ok) onClose();
  }

  return (
    <BottomSheet title="Add InBody scan" onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className={labelCls}>Scan date</label>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field('weight', 'Weight (kg)', 'e.g. 82.4')}
          {field('muscle', 'Skeletal muscle mass (kg)', 'e.g. 34.1')}
          {field('fatPct', 'Body fat %', 'e.g. 24.5')}
          {field('fatKg', 'Body fat mass (kg)', 'e.g. 20.2')}
          {field('visceral', 'Visceral fat level', 'e.g. 8', '1')}
          {field('bmr', 'BMR (kcal)', 'e.g. 1780', '1')}
          {field('score', 'InBody score', 'e.g. 74', '1')}
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Printout (photo or PDF, optional)</label>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-500 file:mr-3 file:rounded-full file:border-0 file:bg-black/5 file:px-3.5 file:py-2 file:text-sm file:font-semibold dark:file:bg-white/10"
          />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Notes (optional)</label>
          <input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. Fasted, morning" />
        </div>
        {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          disabled={busy || uploading}
          onClick={save}
          className="w-full rounded-full bg-accent py-3 text-sm font-bold text-accent-foreground disabled:opacity-50"
        >
          {uploading ? 'Uploading printout…' : busy ? 'Saving…' : 'Save scan'}
        </button>
      </div>
    </BottomSheet>
  );
}
