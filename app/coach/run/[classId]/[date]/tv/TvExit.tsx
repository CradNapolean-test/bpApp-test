'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

// A small way back out of the TV view: the button in the corner, or the Escape key.
export function TvExit({ href }: { href: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.location.assign(href);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [href]);

  return (
    <Link
      href={href}
      aria-label="Exit TV view"
      className="fixed bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-sm font-bold text-white/70 opacity-40 transition-opacity hover:opacity-100 focus-visible:opacity-100"
    >
      <X className="h-4 w-4" /> Exit
    </Link>
  );
}
