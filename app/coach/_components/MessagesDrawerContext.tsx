'use client';

import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { MessagesDrawer } from './MessagesDrawer';

interface MessagesDrawerApi {
  open: () => void;
}

const MessagesDrawerContext = createContext<MessagesDrawerApi | null>(null);

// Mirrors ToastProvider/ConfirmProvider's pattern (app/_components/ToastProvider.tsx,
// app/_components/ConfirmDialog.tsx) -- mounted once in app/coach/layout.tsx, so every coach
// page's CoachMessagesButton can open the same overlay without prop-threading through each page.
export function useMessagesDrawer(): MessagesDrawerApi {
  const ctx = useContext(MessagesDrawerContext);
  if (!ctx) throw new Error('useMessagesDrawer must be used inside <MessagesDrawerProvider>');
  return ctx;
}

export function MessagesDrawerProvider({ currentUserId, children }: { currentUserId: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  // Stable identity so consumers can safely put this in effect dependency arrays.
  const [api] = useState<MessagesDrawerApi>(() => ({ open: () => setIsOpen(true) }));

  return (
    <MessagesDrawerContext.Provider value={api}>
      {children}
      {isOpen && <MessagesDrawer currentUserId={currentUserId} onClose={() => setIsOpen(false)} />}
    </MessagesDrawerContext.Provider>
  );
}
