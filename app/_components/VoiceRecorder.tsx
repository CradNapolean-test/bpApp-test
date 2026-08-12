'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';
import { Button } from './Button';
import { useToast } from './ToastProvider';

// No existing audio-recording precedent anywhere in this codebase -- plain MediaRecorder, no
// library. Records audio/webm (broadly supported, and what MediaRecorder defaults to on
// Chrome/Firefox/Edge without an explicit mimeType). Duration is tracked with a simple interval
// timer rather than read off the recorded Blob -- webm duration metadata from MediaRecorder is
// unreliable across browsers, but the caller only needs an approximate "how long was this" for
// display, not a frame-accurate value.
export function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (blob: Blob, durationSeconds: number) => void;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  // Interval callbacks close over stale state, so elapsed time is tracked in a ref alongside
  // the display state rather than read from `elapsed` at stop time.
  const elapsedRef = useRef(0);

  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function handleStart() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelledRef.current = false;
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!cancelledRef.current && chunksRef.current.length > 0) {
          onRecorded(new Blob(chunksRef.current, { type: 'audio/webm' }), elapsedRef.current);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setElapsed(0);
      elapsedRef.current = 0;
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }, 1000);
    } catch {
      toast.error('Could not access the microphone. Check your browser permissions.');
    }
  }

  function stopRecording(cancel: boolean) {
    cancelledRef.current = cancel;
    timerRef.current && clearInterval(timerRef.current);
    recorderRef.current?.stop();
    setRecording(false);
  }

  function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  if (!recording) {
    return (
      <Button type="button" variant="icon" aria-label="Record a voice note" disabled={disabled} onClick={handleStart}>
        <Mic className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/5 px-2 py-1">
      <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
      <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">{formatElapsed(elapsed)}</span>
      <Button type="button" variant="icon" aria-label="Stop and send" onClick={() => stopRecording(false)}>
        <Square className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="icon" aria-label="Cancel recording" onClick={() => stopRecording(true)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
