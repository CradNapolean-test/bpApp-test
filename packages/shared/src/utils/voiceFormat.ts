// Which audio format a voice note is recorded in (M4). Every recording used to be labelled audio/webm, but Safari on iPhone records
// MP4/AAC: the bytes and the label disagreed, and older iOS cannot play WebM at all. The recorder now asks the browser what it can
// make, prefers MP4 (plays everywhere), and the real type goes with the file.

export const MAX_VOICE_SECONDS = 120;

// In order of preference; every one is accepted by the voice-notes bucket (migration 0108).
const PREFERRED_TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

// The first preferred type the browser can record, or null to let the browser choose its own default.
export function pickVoiceMimeType(isSupported: (type: string) => boolean): string | null {
  for (const type of PREFERRED_TYPES) {
    try {
      if (isSupported(type)) return type;
    } catch {
      // an unusual browser throwing for a type it does not know: try the next
    }
  }
  return null;
}

// "audio/webm;codecs=opus" -> "audio/webm": the form storage checks against its allowed types.
export function baseMimeType(type: string): string {
  return type.split(';')[0].trim().toLowerCase();
}

// The file extension for a recording's type. Unknown audio types fall back to the one the bucket will still accept.
export function voiceExtension(type: string): string {
  switch (baseMimeType(type)) {
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/aac':
      return 'aac';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    default:
      return 'webm';
  }
}

// The type to upload with: what the recorder reported, else what we asked for, else webm. Always without parameters.
export function uploadMimeType(blobType: string, requested: string | null): string {
  const base = baseMimeType(blobType || requested || '');
  return base.startsWith('audio/') ? base : 'audio/webm';
}

// "0:45 / 2:00" for the timer next to the recording indicator.
export function formatVoiceTimer(elapsedSeconds: number, maxSeconds: number = MAX_VOICE_SECONDS): string {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `${fmt(elapsedSeconds)} / ${fmt(maxSeconds)}`;
}
