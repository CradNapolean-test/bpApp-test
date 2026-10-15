import Link from 'next/link';
import { Logo } from '@/app/_components/Logo';
import { splitBold, type LegalBlock, type LegalDoc } from '@/lib/legalDoc';

// Shared shell for /legal/privacy and /legal/terms. The words live in content/legal/*.md (the owner or their lawyer writes them); this only
// draws them. Nothing from the file is inserted as HTML. While a document is marked as a draft the page says so, and it never tells a
// member that their coach has not published something (H3).

function Inline({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-black dark:text-zinc-100">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (block.type === 'h2') return <h2 className="pt-3 text-base font-bold text-black dark:text-zinc-50">{block.text}</h2>;
  if (block.type === 'h3') return <h3 className="pt-1 text-sm font-bold text-black dark:text-zinc-50">{block.text}</h3>;
  if (block.type === 'ul') {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
        {block.items.map((item, i) => (
          <li key={i}>
            <Inline text={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
      <Inline text={block.text} />
    </p>
  );
}

export function LegalPageShell({ doc }: { doc: LegalDoc }) {
  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-8 dark:bg-black">
      <article className="w-full max-w-2xl space-y-3 rounded-lg border border-black/10 bg-white p-6 sm:p-8 dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo variant="full" size={64} />
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">{doc.title}</h1>
          {(doc.updated || doc.version) && (
            <p className="text-xs text-zinc-500">
              {doc.updated && <>Last updated {doc.updated}</>}
              {doc.updated && doc.version && ' · '}
              {doc.version && <>Version {doc.version}</>}
            </p>
          )}
        </div>
        {doc.draft && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning" role="note">
            DRAFT: this text is not final and is not legal advice.
          </p>
        )}
        {doc.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
        <Link
          href="/login"
          className="block pt-3 text-center text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          &larr; Back to sign in
        </Link>
      </article>
    </div>
  );
}
