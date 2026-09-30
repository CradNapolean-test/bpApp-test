import { Logo } from '@/app/_components/Logo';

// Phone header for coach pages: the brand mark and wordmark, matching the member Home header.
// (Every coach page also has its own <h1> below, so this just anchors "where am I".)
export function CoachMobileBrand() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={32} />
      <div className="leading-tight">
        <p className="text-[15px] font-black text-black dark:text-zinc-50">Ballistic</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Performance</p>
      </div>
    </div>
  );
}
