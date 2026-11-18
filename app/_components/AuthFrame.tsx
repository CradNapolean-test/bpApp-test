import type { ReactNode } from 'react';
import { LegalFooterLinks } from './LegalFooterLinks';

// The pages a person sees before they are in the app (sign in, reset password, join): a slim black band with the wordmark, then the
// heading on the light background and the form in a white card (the November 2026 mock-ups). The band stays slim because it holds
// only the name; the tall black header is for screens that put a tile in it.
export function AuthBand({ width = 'max-w-sm' }: { width?: string }) {
  return (
    <header className="rounded-b-[28px] bg-[#1d1d1b] px-6 pb-5 pt-[max(1.375rem,env(safe-area-inset-top))] text-zinc-100">
      <div className={`mx-auto flex w-full ${width} flex-col leading-none`}>
        <span className="sr-only">Ballistic Performance</span>
        <span aria-hidden className="text-xl font-black tracking-[0.08em]">BALLISTIC</span>
        <span aria-hidden className="mt-1 text-[11px] font-bold tracking-[0.22em] text-[#5fd6d6]">PERFORMANCE</span>
      </div>
    </header>
  );
}

export function AuthFrame({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <AuthBand />
      <div className="mx-auto w-full max-w-sm flex-1 space-y-4 px-5 pb-6 pt-7">
        <div className="space-y-1.5 px-1">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-black dark:text-zinc-50">{title}</h1>
          {lead && <div className="text-[15px] leading-snug text-zinc-600 dark:text-zinc-400">{lead}</div>}
        </div>
        {children}
      </div>
      <div className="pb-[max(1rem,env(safe-area-inset-bottom))]">
        <LegalFooterLinks />
      </div>
    </main>
  );
}

export const authCard = 'space-y-3 rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10';
export const authLabel = 'text-[13px] font-bold text-zinc-700 dark:text-zinc-300';
export const authInput = 'h-12 w-full rounded-xl border border-black/[.14] bg-background px-3.5 text-base dark:border-white/15';
// Signing in, resetting a password and joining: teal with dark text, as on those boards (the colours are spelt out because these pages
// sit outside the member and coach screens' colour rules).
export const authButton = 'h-12 w-full rounded-xl bg-[#19adb1] text-[15px] font-extrabold text-[#041f1f] disabled:opacity-60';
// Setting up (the steps after joining): black, as a member screen's main action.
export const setupButton =
  'h-12 w-full rounded-xl bg-[#1d1d1b] text-[15px] font-bold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-[#1d1d1b]';
export const authLink = 'flex min-h-11 w-full items-center justify-center text-sm font-bold text-[#0e6266] dark:text-[#5fd6d6]';
