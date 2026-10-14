'use client';

import { useState } from 'react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { emailMyCoach } from '@/lib/data/coachEmail';

const inputCls =
  'w-full rounded-xl border border-black/10 bg-card px-3 py-2.5 text-sm text-black dark:border-white/15 dark:text-zinc-50';

// "Email" on the Your coach card: a short form that emails the member's coach. Replies come back to the
// member's own email address, not through the app.
export function EmailCoachSheet({ onClose }: { onClose: () => void }) {
  const { run, busy } = useAction();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  return (
    <BottomSheet title="Email your coach" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => emailMyCoach(subject, message), { success: 'Email sent to your coach', onDone: onClose });
        }}
      >
        <p className="text-xs text-zinc-500">Your coach will reply to your email address. For quick questions, the chat is faster.</p>
        <input className={inputCls} placeholder="Subject (optional)" maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea
          className={`${inputCls} min-h-32`}
          placeholder="Your message"
          required
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Button type="submit" disabled={busy || message.trim().length === 0} className="w-full">
          {busy ? 'Sending...' : 'Send email'}
        </Button>
      </form>
    </BottomSheet>
  );
}
