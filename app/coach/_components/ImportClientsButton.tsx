'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { useClickOutside } from '@/app/_components/useClickOutside';
import { useToast } from '@/app/_components/ToastProvider';
import { useActiveGymId } from './CoachGymsContext';
import { downloadTextFile, parseCsv } from '@/lib/utils/csv';
import { IMPORT_BATCH_SIZE, IMPORT_MAX, extractEmails, importResultsCsv, splitIntoBatches, type ImportRow } from '@/lib/accountCreation';

// Imports up to IMPORT_MAX addresses (CM2). They are sent 20 at a time so no single request can run out of time halfway, with progress shown.
// Nobody is shown a password: the result is a file with each address and its one-time link to choose a password, saved to the coach's
// device and not kept anywhere else.
export function ImportClientsButton() {
  const router = useRouter();
  const toast = useToast();
  const gymId = useActiveGymId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ImportRow[] | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  // Entries that were not email addresses: left out of the import, listed on the result so the coach can fix them.
  const [skipped, setSkipped] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const submitting = progress !== null;
  const ref = useClickOutside<HTMLDivElement>(() => {
    if (!submitting) setOpen(false);
  }, open);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleSubmit() {
    setProblem(null);
    const parsed = extractEmails(parseCsv(text));
    if (parsed.valid.length === 0) {
      setProblem(parsed.rejected.length > 0 ? `None of those are valid email addresses (for example: ${parsed.rejected[0]}).` : 'No email addresses found.');
      return;
    }
    if (parsed.valid.length > IMPORT_MAX) {
      setProblem(`That is ${parsed.valid.length} addresses. Import is limited to ${IMPORT_MAX} at a time: split the list and import it in parts.`);
      return;
    }
    setSkipped(parsed.rejected);

    const batches = splitIntoBatches(parsed.valid, IMPORT_BATCH_SIZE);
    const all: ImportRow[] = [];
    setStoppedAt(null);
    setProgress({ done: 0, total: parsed.valid.length });
    try {
      for (const batch of batches) {
        const res = await fetch('/api/coach/import-clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: batch, expectedGymId: gymId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error ?? 'Import stopped');
          setStoppedAt(all.length);
          break;
        }
        all.push(...(body.results as ImportRow[]));
        setProgress({ done: all.length, total: parsed.valid.length });
      }
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
      setStoppedAt(all.length);
    } finally {
      setProgress(null);
    }
    if (all.length > 0) {
      setResults(all);
      const added = all.filter((r) => r.link).length;
      toast.success(`${added} of ${parsed.valid.length} client${parsed.valid.length === 1 ? '' : 's'} added`);
      router.refresh();
    }
  }

  function reset() {
    setText('');
    setResults(null);
    setProblem(null);
    setStoppedAt(null);
    setSkipped([]);
    setOpen(false);
  }

  const added = results?.filter((r) => r.link).length ?? 0;
  const notAdded = results?.filter((r) => !r.link) ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-zinc-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5"
      >
        <Upload className="h-3.5 w-3.5" />
        Import
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Import clients"
          className="absolute right-0 z-20 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-black/[.05] bg-card p-4 shadow-xl dark:border-white/10"
        >
          {results ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-black dark:text-zinc-50">
                {added} added{notAdded.length > 0 ? `, ${notAdded.length} not added` : ''}
              </p>
              {stoppedAt !== null && (
                <p className="rounded-lg bg-warning/10 p-2 text-xs text-warning" role="alert">
                  The import stopped after {stoppedAt} address{stoppedAt === 1 ? '' : 'es'}. The rest were not sent: import them again (ones already added will say they could not be added).
                </p>
              )}
              <p className="text-xs text-zinc-500">
                Save the file now: it has each person&apos;s one-time link to choose a password. It is not kept anywhere else, so send the links before
                you close this.
              </p>
              <button
                type="button"
                onClick={() => downloadTextFile('imported-clients.csv', importResultsCsv(results), 'text/csv;charset=utf-8')}
                className="w-full rounded-full border border-black/10 py-2 text-sm font-bold dark:border-white/15"
              >
                Download file with links
              </button>
              {skipped.length > 0 && (
                <p className="rounded-lg bg-warning/10 p-2 text-xs text-warning">
                  {skipped.length} {skipped.length === 1 ? 'entry was' : 'entries were'} not an email address and left out: {skipped.slice(0, 3).join(', ')}
                  {skipped.length > 3 ? '…' : ''}
                </p>
              )}
              {notAdded.length > 0 && (
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {notAdded.map((r, i) => (
                    <div key={`${r.email}-${i}`} className="rounded-md border border-black/10 p-2 text-xs dark:border-white/10">
                      <p className="break-all font-mono">{r.email || '(blank)'}</p>
                      <p className="text-danger">{r.error}</p>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={reset} className="w-full rounded-full bg-accent py-2 text-sm font-bold text-accent-foreground hover:opacity-90">
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="import-emails" className="text-sm font-medium text-zinc-500">
                  Emails to invite
                </label>
                <textarea
                  id="import-emails"
                  rows={6}
                  placeholder={'One email per line, e.g.\nalex@example.com\njamie@example.com'}
                  className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10"
                  value={text}
                  disabled={submitting}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => fileRef.current?.click()}
                className="text-xs font-medium text-accent hover:underline"
              >
                or upload a CSV…
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              <p className="text-xs text-zinc-500">
                Up to {IMPORT_MAX} at a time. A CSV with an &quot;email&quot; column works too; names aren&apos;t imported, each client sets theirs when they
                complete Setup. You get a file of one-time links to send, not passwords.
              </p>
              {problem && (
                <p className="text-xs text-danger" role="alert">
                  {problem}
                </p>
              )}
              {progress && (
                <div aria-live="polite">
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Adding {Math.min(progress.total, progress.done + IMPORT_BATCH_SIZE)} of {progress.total}…
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="flex-1 rounded-full bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'Importing…' : 'Import'}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-medium dark:border-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
