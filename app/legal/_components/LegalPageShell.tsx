import Link from 'next/link';
import { Logo } from '@/app/_components/Logo';

// Shared shell for /legal/privacy and /legal/terms -- both are currently just an honest
// placeholder ("not published yet") rather than any drafted legal text, since that's not
// something to auto-generate for a production app handling real health data. Swap the
// placeholder paragraph for real, reviewed copy when it exists; the shell/link stays as-is.
export function LegalPageShell({ title }: { title: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-lg space-y-4 rounded-lg border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo variant="full" size={64} />
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">{title}</h1>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your coach hasn&apos;t published a {title.toLowerCase()} yet.
        </p>
        <Link
          href="/login"
          className="block text-center text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          &larr; Back to sign in
        </Link>
      </div>
    </div>
  );
}
