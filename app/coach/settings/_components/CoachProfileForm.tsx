'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from '@/app/_components/useAction';
import { Button } from '@/app/_components/Button';
import { removeCoachLogo, setDisplayName, uploadCoachLogo } from '@/lib/data/coachSettings';
import { inputCls } from '@/app/_components/ui';


export function CoachProfileForm({ initialName, logoUrl }: { initialName: string | null; logoUrl?: string | null }) {
  const { run, busy } = useAction();
  const { run: runLogo, busy: logoBusy } = useAction();
  const router = useRouter();
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
    await runLogo(() => uploadCoachLogo(formData), { success: 'Logo updated', onDone: () => router.refresh() });
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
        <div className="flex flex-wrap items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- small settings-page preview, not worth Image's overhead here
            <img src={logoUrl} alt="Your logo" className="h-14 w-14 rounded-xl border border-black/10 object-cover dark:border-white/10" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-black/20 text-[10px] font-semibold text-zinc-400 dark:border-white/20">None</span>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" disabled={logoBusy} onChange={handleLogoChange} className="hidden" />
          <Button type="button" variant="outline" disabled={logoBusy} onClick={() => fileInputRef.current?.click()}>
            {logoBusy ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
          </Button>
          {logoUrl && (
            <button
              type="button"
              disabled={logoBusy}
              onClick={() => runLogo(() => removeCoachLogo(), { success: 'Logo removed', onDone: () => router.refresh() })}
              className="px-2 py-2 text-sm font-semibold text-danger disabled:opacity-50"
            >
              Remove logo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
