'use client';

import { useState } from 'react';
import { parseVideoEmbedUrl } from '@/lib/utils/videoEmbed';

// Same in-app embed treatment as Education's lesson videos (EducationTab.tsx) -- an iframe for
// recognized YouTube/Vimeo URLs, falling back to an external link for anything else.
// `alwaysOpen` skips the click-to-expand toggle. A member's workout day used it, which made every demo a full-width player between the
// set boxes (TR6); it now opens on "Watch demo" like the Library, so viewing one demo doesn't mean loading every video at once.
export function VideoDemo({ videoUrl, title, alwaysOpen = false }: { videoUrl: string; title: string; alwaysOpen?: boolean }) {
  const [open, setOpen] = useState(alwaysOpen);
  const embedUrl = parseVideoEmbedUrl(videoUrl);

  if (!embedUrl) {
    return (
      <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-9 items-center text-xs text-accent hover:underline">
        Open link ↗
      </a>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 inline-flex min-h-9 items-center text-xs text-accent hover:underline">
        ▶ Watch demo
      </button>
    );
  }

  return (
    // Capped at a phone-ish width: full width on a laptop the player was 1286 × 723 px (TR6).
    <div className="mt-1.5 max-w-xl space-y-1">
      <div className="aspect-video w-full overflow-hidden rounded-md">
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
      {!alwaysOpen && (
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:underline">
          Hide video
        </button>
      )}
    </div>
  );
}
