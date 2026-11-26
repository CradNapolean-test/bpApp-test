'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  REST_EXTRA_SECONDS,
  addRest,
  alertAtEnd,
  formatRest,
  readRestSound,
  restFraction,
  restRemaining,
  skipRest,
  startRest,
  writeRestSound,
  type RestTimerState,
} from '@/lib/restTimer';

// This device's storage, or nothing when the browser has it switched off (reading window.localStorage can itself throw).
function deviceStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// One sound player for the page. Browsers only let a page make a sound after a tap, so it is made (or woken) on one: the sound
// switch, +30s, Skip, or the Log set button (primeRestSound is called from there).
let audio: AudioContext | null = null;

export function primeRestSound(): void {
  if (typeof window === 'undefined' || !readRestSound(deviceStorage())) return;
  wakeAudio();
}

function wakeAudio(): void {
  try {
    const Player = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Player) return;
    audio ??= new Player();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch {
    audio = null;
  }
}

// Three short beeps, made in the browser (no sound file to download).
function playEndSound(): void {
  wakeAudio();
  const ctx = audio;
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const tone = ctx.createOscillator();
      const volume = ctx.createGain();
      tone.type = 'sine';
      tone.frequency.value = 880;
      const at = t + i * 0.25;
      volume.gain.setValueAtTime(0.0001, at);
      volume.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      tone.connect(volume).connect(ctx.destination);
      tone.start(at);
      tone.stop(at + 0.2);
    }
  } catch {
    // No sound this time.
  }
}

// A buzz where the browser can (Android browsers; iPhones can't from a web page).
function buzz(): void {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // Not supported.
  }
}

// Turning the sound on or off in one timer changes it in any other running at the same time (a superset rests after each exercise).
const SOUND_EVENT = 'bp-rest-timer-sound';

// The rest between sets (TR16): a big count down with +30s and Skip, and a bar that empties over it. At the end the phone buzzes where
// it can, and beeps if the member turned the sound on (off at first; remembered on this device only). Mounted fresh after each set
// (key={timerKey} in LogSetForm).
export function RestTimer({ seconds }: { seconds: number }) {
  const [state, setState] = useState<RestTimerState>(() => startRest(Date.now(), seconds));
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(() => readRestSound(deviceStorage()));
  // The ticking reads these, so a +30s tapped just before the end is never missed by a tick that started before it.
  const current = useRef(state);
  const soundOn = useRef(sound);

  function update(next: RestTimerState) {
    current.current = next;
    setState(next);
  }

  useEffect(() => {
    if (state.done) return;
    const tick = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (!current.current.done && restRemaining(current.current, t) === 0) {
        clearInterval(tick);
        const alert = alertAtEnd(current.current, t);
        current.current = { ...current.current, done: true };
        setState(current.current);
        if (alert) {
          buzz();
          if (soundOn.current) playEndSound();
        }
      }
    }, 250);
    return () => clearInterval(tick);
  }, [state.done]);

  useEffect(() => {
    const follow = (e: Event) => {
      const on = (e as CustomEvent<boolean>).detail === true;
      soundOn.current = on;
      setSound(on);
    };
    window.addEventListener(SOUND_EVENT, follow);
    return () => window.removeEventListener(SOUND_EVENT, follow);
  }, []);

  if (state.done) return null;
  const left = restRemaining(state, now);
  const full = restFraction(state, now);

  return (
    <div role="timer" aria-label="Rest between sets" className="mt-3 rounded-xl border border-accent/30 bg-accent-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent">Rest</p>
          <p className="text-[32px] font-black leading-none tabular-nums text-black dark:text-zinc-50">{formatRest(left)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              wakeAudio();
              update(addRest(current.current, Date.now()));
            }}
            className="h-11 rounded-xl border-[1.5px] border-black/20 px-3 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50"
          >
            +{REST_EXTRA_SECONDS}s
          </button>
          <button
            type="button"
            onClick={() => update(skipRest(current.current))}
            className="h-11 rounded-xl bg-[#1d1d1b] px-4 text-sm font-bold text-white dark:bg-zinc-100 dark:text-[#1d1d1b]"
          >
            Skip
          </button>
        </div>
      </div>
      <span aria-hidden className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <span
          className="block h-full origin-left rounded-full bg-accent transition-transform duration-300 ease-linear motion-reduce:transition-none"
          style={{ transform: `scaleX(${full})` }}
        />
      </span>
      <button
        type="button"
        aria-pressed={sound}
        onClick={() => {
          const next = !sound;
          writeRestSound(deviceStorage(), next);
          if (next) wakeAudio();
          window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: next }));
        }}
        // One fixed name with its on/off state in aria-pressed, so a screen reader does not hear "Sound off, not pressed".
        className={`mt-1 -mb-1.5 -ml-1 flex min-h-11 items-center gap-1.5 px-1 text-xs font-semibold ${sound ? 'text-accent' : 'text-zinc-600 dark:text-zinc-300'}`}
      >
        {sound ? <Volume2 aria-hidden className="h-4 w-4" /> : <VolumeX aria-hidden className="h-4 w-4" />}
        Sound at the end
      </button>
    </div>
  );
}
