'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { useAction } from '@/app/_components/useAction';
import { getMessageTemplates, saveMessageTemplate } from '@/lib/data/messageTemplates';
import { STARTER_MESSAGES, personaliseForChat } from '@/lib/broadcastMessages';
import type { MessageTemplateRow } from '@/lib/data/types';

// Saved replies in a 1:1 chat (MS20). The coach's reply box opens this to drop in one of the gym's saved messages (message_templates, the
// same list as the Broadcasts templates) or a starting point, with "{first name}" already filled in for this member. What the coach has
// typed can be saved as a new one. Deleting stays on the Broadcasts screen, so a shared message is not removed from inside a chat by mistake.
export function SavedRepliesSheet({
  memberName,
  currentText,
  onUse,
  onClose,
}: {
  // The member's name as the chat shows it; only its first word goes into the reply.
  memberName: string;
  // What is in the reply box now, offered for saving.
  currentText: string;
  onUse: (text: string) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<MessageTemplateRow[] | null>(null);
  const [title, setTitle] = useState('');
  const [reload, setReload] = useState(0);
  const { run, busy } = useAction();

  useEffect(() => {
    let cancelled = false;
    getMessageTemplates()
      .then((rows) => {
        if (!cancelled) setTemplates(rows);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const draft = currentText.trim();
  const row = 'rounded-xl border border-black/[.06] p-3 dark:border-white/10';
  const use = (body: string) => {
    onUse(personaliseForChat(body, memberName));
    onClose();
  };

  const item = (key: string, name: string, body: string) => (
    <li key={key} className={row}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-bold text-black dark:text-zinc-50">{name}</p>
        <button
          type="button"
          onClick={() => use(body)}
          aria-label={`Use ${name}`}
          className="inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-accent hover:bg-accent/10"
        >
          Use
        </button>
      </div>
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-zinc-500 dark:text-zinc-400">{body}</p>
    </li>
  );

  return (
    <BottomSheet title="Saved replies" onClose={onClose}>
      <div className="space-y-5">
        <section className="space-y-2" aria-label="Your gym's saved replies">
          <p className="text-xs font-medium text-zinc-500">Your gym&apos;s saved replies</p>
          {templates === null ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-zinc-500">None yet. Save what you have written below, or start from one of these.</p>
          ) : (
            <ul className="space-y-2">{templates.map((t) => item(t.id, t.title, t.body))}</ul>
          )}
        </section>

        <section className="space-y-2" aria-label="Starting points">
          <p className="text-xs font-medium text-zinc-500">Starting points</p>
          <ul className="space-y-2">{STARTER_MESSAGES.map((m) => item(m.title, m.title, m.body))}</ul>
        </section>

        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              void run(() => saveMessageTemplate(title.trim(), draft), {
                success: 'Saved',
                refresh: false,
                onDone: () => {
                  setTitle('');
                  setReload((n) => n + 1);
                },
              });
            }}
            className="space-y-2"
          >
            <label htmlFor="saved-reply-name" className="block text-xs font-medium text-zinc-500">
              Save what you&apos;ve written as a saved reply
            </label>
            <div className="flex gap-2">
              <input
                id="saved-reply-name"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-base dark:border-white/10"
                placeholder="Name it"
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
              />
              <button
                type="submit"
                disabled={busy || !title.trim()}
                className="inline-flex h-11 shrink-0 items-center rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-zinc-500">Type {'{first name}'} where the member&apos;s name should go. Every coach at the gym can use it.</p>
          </form>
        )}
      </div>
    </BottomSheet>
  );
}
