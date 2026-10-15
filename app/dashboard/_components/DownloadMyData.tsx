'use client';

import { useState } from 'react';
import { Button } from '@/app/_components/Button';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/ToastProvider';
import { exportMyData } from '@/lib/data/exportMyData';
import { downloadTextFile } from '@/lib/utils/csv';

// "Download my data" (H3, D13): the member's own information as a file they keep. Asks first, because the file holds health information and
// lands on whatever device they are using.
export function DownloadMyData() {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    const ok = await confirm({
      title: 'Download a copy of your data?',
      body: 'The file includes your profile, health notes, logs, bookings, credits and messages. Only save it on a device you trust.',
      confirmLabel: 'Download',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await exportMyData();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      downloadTextFile(result.filename, result.json, 'application/json');
      toast.success('Your data was downloaded');
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10">
      <p className="text-sm font-semibold text-black dark:text-zinc-50">Download my data</p>
      <p className="mt-1 text-xs text-zinc-500">
        Get a copy of the information the app holds about you, as a file. Photos and voice notes are listed by name, not copied in.
      </p>
      <Button variant="outline" size="sm" className="mt-3" disabled={busy} onClick={() => void download()}>
        {busy ? 'Preparing…' : 'Download my data'}
      </Button>
    </div>
  );
}
