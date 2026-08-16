'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { useClickOutside } from '@/app/_components/useClickOutside';
import { useToast } from '@/app/_components/ToastProvider';
import { parseCsv, headerIndex } from '@/lib/utils/csv';

interface ImportResult {
  email: string;
  password?: string;
  error?: string;
}

// Extracts a flat, deduped email list from either pasted text (one per line, or
// comma-separated) or an uploaded CSV. If the first row looks like a header (has a cell
// literally "email"), only that column is used and the header row skipped -- so other columns
// (name, notes, ...) can't accidentally be mistaken for emails. Otherwise every cell from
// every row is a candidate, which covers both a plain one-per-line paste and a headerless CSV.
function extractEmails(text: string): string[] {
  const parsed = parseCsv(text);
  if (parsed.length === 0) return [];
  const emailCol = headerIndex(parsed[0])('email');
  const cells = emailCol >= 0 ? parsed.slice(1).map((r) => r[emailCol] ?? '') : parsed.flat();
  return Array.from(new Set(cells.map((c) => c.trim()).filter((c) => c.includes('@'))));
}

export function ImportClientsButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
    const emails = extractEmails(text);
    if (emails.length === 0) {
      toast.error('No valid email addresses found');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/coach/import-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? 'Import failed');
        return;
      }
      setResults(body.results);
      const created = (body.results as ImportResult[]).filter((r) => r.password).length;
      toast.success(`${created} of ${emails.length} client${emails.length === 1 ? '' : 's'} created`);
      router.refresh();
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setText('');
    setResults(null);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-black/10 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
      >
        <Upload className="h-3.5 w-3.5" />
        Import clients
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Import clients"
          className="absolute right-0 z-20 mt-2 w-96 rounded-2xl border border-black/[.05] bg-[var(--background)] p-4 shadow-xl dark:border-white/10"
        >
          {results ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-black dark:text-zinc-50">Import results</p>
              <p className="text-xs text-zinc-500">
                Passwords are shown once — pass them to each client now; they can&apos;t be retrieved later.
              </p>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {results.map((r) => (
                  <div key={r.email} className="rounded-md border border-black/10 p-2 text-xs dark:border-white/10">
                    <p className="font-mono">{r.email}</p>
                    {r.password ? (
                      <p className="text-emerald-600 dark:text-emerald-400">
                        Temp password: <span className="font-mono">{r.password}</span>
                      </p>
                    ) : (
                      <p className="text-danger">{r.error}</p>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={reset}
                className="w-full rounded-full bg-accent py-2 text-sm font-bold text-accent-foreground hover:opacity-90"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-500">Emails to invite</label>
                <textarea
                  rows={6}
                  placeholder={'One email per line, e.g.\nalex@example.com\njamie@example.com'}
                  className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-xs font-medium text-accent hover:underline"
              >
                or upload a CSV…
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              <p className="text-xs text-zinc-500">
                A CSV with an &quot;email&quot; column works too — names aren&apos;t imported;
                each client sets theirs when they complete Setup.
              </p>
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
