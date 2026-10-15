// What a signed-in page shows in the server's HTML while its JavaScript loads (R13/M1). The screens behind ClientOnly format dates and
// greetings from the viewer's locale, so they cannot be drawn on the server; the fallback used to be an empty div, which left the phone
// blank until the whole bundle had arrived. This gives the page a header and a few cards at once, in the theme's own colours.
export function PageSkeleton() {
  const block = 'rounded-2xl bg-black/[.06] dark:bg-white/10 motion-safe:animate-pulse';
  return (
    <div className="min-h-screen" role="status" aria-busy="true" aria-label="Loading">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))] md:pt-8">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 shrink-0 rounded-xl ${block}`} />
          <div className={`h-5 w-40 rounded-md ${block}`} />
        </div>
        <div className={`mt-2 h-28 rounded-3xl ${block}`} />
        <div className={`h-16 ${block}`} />
        <div className={`h-16 ${block}`} />
        <div className={`h-16 ${block}`} />
      </div>
    </div>
  );
}
