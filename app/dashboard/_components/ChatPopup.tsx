'use client';

import { useState } from 'react';
import { ChatTab } from './ChatTab';
import type { ChatMessageRow } from '@/lib/data/types';

export function ChatPopup({
  clientId,
  initialMessages,
  currentUserId,
}: {
  clientId: string;
  initialMessages: ChatMessageRow[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-2xl text-background shadow-lg transition-transform hover:scale-105 md:bottom-6 md:right-6"
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Backdrop on small screens so the panel reads as an overlay, not a layout shift */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/20 sm:hidden"
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-30 w-full max-w-sm border-l border-black/10 bg-white shadow-xl transition-transform duration-200 ease-out dark:border-white/10 dark:bg-zinc-950 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col p-4 pt-6">
          <h2 className="mb-3 text-lg font-semibold text-black dark:text-zinc-50">Chat</h2>
          <div className="min-h-0 flex-1">
            <ChatTab clientId={clientId} initialMessages={initialMessages} currentUserId={currentUserId} />
          </div>
        </div>
      </div>
    </>
  );
}
