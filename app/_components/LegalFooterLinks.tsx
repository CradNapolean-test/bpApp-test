import Link from 'next/link';

// Small footer link row -- Privacy/Terms are currently placeholder pages (see
// app/legal/_components/LegalPageShell.tsx), linked from here so they're reachable at all
// rather than dead routes nobody can find.
export function LegalFooterLinks() {
  return (
    <div className="flex items-center justify-center gap-3 text-xs text-zinc-400 dark:text-zinc-600">
      <Link href="/legal/privacy" className="hover:text-zinc-600 dark:hover:text-zinc-300">
        Privacy Policy
      </Link>
      <span aria-hidden>·</span>
      <Link href="/legal/terms" className="hover:text-zinc-600 dark:hover:text-zinc-300">
        Terms of Service
      </Link>
    </div>
  );
}
