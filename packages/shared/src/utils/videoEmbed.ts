// education_lessons.link_url is untyped text -- coaches can paste any URL, most commonly a
// YouTube or Vimeo link. Returns an embeddable iframe src when recognized, null otherwise (the
// caller falls back to a plain "Open link" anchor for non-video URLs like PDFs/articles).
// YouTube plays from youtube-nocookie.com, which does not set tracking cookies until the member presses play (ED1).
const YOUTUBE_EMBED = 'https://www.youtube-nocookie.com/embed/';

export function parseVideoEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1);
      return id ? `${YOUTUBE_EMBED}${id}` : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v');
        return id ? `${YOUTUBE_EMBED}${id}` : null;
      }
      if (parsed.pathname.startsWith('/embed/')) {
        const id = parsed.pathname.split('/')[2];
        return id ? `${YOUTUBE_EMBED}${id}` : null;
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.split('/')[2];
        return id ? `${YOUTUBE_EMBED}${id}` : null;
      }
      return null;
    }
    if (host === 'vimeo.com') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === 'player.vimeo.com') return url;

    return null;
  } catch {
    return null;
  }
}
