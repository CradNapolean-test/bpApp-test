import Link from 'next/link';
import { AuthBand, authLink } from '@/app/_components/AuthFrame';
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
  if (block.type === 'h2') return <h2 className="pt-4 text-base font-extrabold text-black first:pt-0 dark:text-zinc-50">{block.text}</h2>;
  if (block.type === 'h3') return <h3 className="pt-1 text-[15px] font-bold text-black dark:text-zinc-50">{block.text}</h3>;
  if (block.type === 'ul') {
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        {block.items.map((item, i) => (
          <li key={i}>
            <Inline text={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
      <Inline text={block.text} />
    </p>
  );
}

// Drawn like the sign-in pages (AuthFrame): the slim black band with the wordmark, the heading on the light background, the text in a
// white card.
export function LegalPageShell({ doc }: { doc: LegalDoc }) {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <AuthBand width="max-w-2xl" />
      <article className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7">
        <div className="space-y-1.5 px-1">
          {(doc.updated || doc.version) && (
            <p className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
              {doc.updated && <>Last updated {doc.updated}</>}
              {doc.updated && doc.version && ' · '}
              {doc.version && <>Version {doc.version}</>}
            </p>
          )}
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-black dark:text-zinc-50">{doc.title}</h1>
        </div>
        {doc.draft && (
          <p className="rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-[13px] font-semibold text-warning" role="note">
            DRAFT: this text is not final and is not legal advice.
          </p>
        )}
        <div className="space-y-3 rounded-[20px] border border-black/[.08] bg-card p-5 sm:p-6 dark:border-white/10">
          {doc.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>
        <Link href="/login" className={authLink}>
          &larr; Back to sign in
        </Link>
      </article>
    </main>
  );
}
