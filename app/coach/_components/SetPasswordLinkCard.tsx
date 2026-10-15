'use client';

import { useToast } from '@/app/_components/ToastProvider';

// What a coach sees after adding a member or a coach (CM2). There is no password to pass on: they get a one-time link that opens the page
// where the person chooses their own. Nothing is kept on this screen after it is closed.
export function SetPasswordLinkCard({
  title,
  email,
  link,
  warning,
  who,
  note,
  existingAccount = false,
  onAnother,
}: {
  title: string;
  email: string;
  // null when the account was made but the link could not be.
  link: string | null;
  warning?: string | null;
  who: 'member' | 'coach';
  // Extra line under the details, e.g. "an existing account was used".
  note?: string;
  // The address already had a login that was reused: there is no link to give, and that is not a problem.
  existingAccount?: boolean;
  onAnother: () => void;
}) {
  const toast = useToast();

  function copy(text: string, done: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(done),
      () => toast.error('Could not copy. Select the text and copy it by hand.')
    );
  }

  return (
    <div className="rounded-md border border-emerald-600/30 bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30">
      <p className="font-medium text-emerald-800 dark:text-emerald-300">{title}</p>
      <p className="mt-1 break-all text-zinc-700 dark:text-zinc-300">
        Email: <span className="font-mono">{email}</span>
      </p>
      {note && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{note}</p>}
      {link ? (
        <>
          <p className="mt-2 break-all rounded-lg bg-white/70 p-2 font-mono text-[11px] text-zinc-700 dark:bg-black/30 dark:text-zinc-300">{link}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Send this to the {who}. They open it once to choose their own password. It stops working when it has been used, and after about an
            hour; if it runs out, make a new one with &quot;Send password reset link&quot; on their page.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => copy(link, 'Link copied')}
              className="rounded-full border border-emerald-700/30 px-4 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => copy(`Hi, your Ballistic login is ready. Open this link to choose your password: ${link}`, 'Message copied')}
              className="rounded-full border border-emerald-700/30 px-4 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300"
            >
              Copy message
            </button>
            <button type="button" onClick={onAnother} className="px-2 py-2 text-sm font-semibold text-emerald-700 underline dark:text-emerald-400">
              Add another
            </button>
          </div>
        </>
      ) : existingAccount ? (
        <button type="button" onClick={onAnother} className="mt-3 px-2 py-2 text-sm font-semibold text-emerald-700 underline dark:text-emerald-400">
          Add another
        </button>
      ) : (
        <>
          <p className="mt-2 text-xs text-danger">{warning ?? 'The account was made but the sign-in link could not be.'}</p>
          <button type="button" onClick={onAnother} className="mt-3 px-2 py-2 text-sm font-semibold text-emerald-700 underline dark:text-emerald-400">
            Add another
          </button>
        </>
      )}
    </div>
  );
}
