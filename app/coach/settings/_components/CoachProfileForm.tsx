'use client';

import { useRef, useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { Button } from '@/app/_components/Button';
import { setDisplayName, uploadCoachLogo } from '@/lib/data/coachSettings';

const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

export function CoachProfileForm({ initialName, logoUrl }: { initialName: string | null; logoUrl?: string | null }) {
  const { run, busy } = useAction();
  const { run: runLogo, busy: logoBusy } = useAction();
  const [name, setName] = useState(initialName ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run(() => setDisplayName(name), { success: 'Name saved' });
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    await runLogo(() => uploadCoachLogo(formData), { success: 'Logo updated' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Coach profile</h3>
        <p className="text-xs text-zinc-500">
          Shown to your clients in place of &quot;Your coach&quot;.
        </p>
        <input
          type="text"
          placeholder="Display name"
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
        <Button type="submit" variant="outline" disabled={busy || name.trim() === (initialName ?? '')}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </form>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Logo</h3>
        <p className="text-xs text-zinc-500">Shown in place of the wordmark in your header.</p>
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- small settings-page preview, not worth Image's overhead here
            <img src={logoUrl} alt="" className="h-10 w-10 rounded object-cover" />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            disabled={logoBusy}
            onChange={handleLogoChange}
            className="text-xs"
          />
        </div>
      </div>
    </div>
  );
}
