import { rosterMarkerChips } from '@/lib/rosterMarkers';
import type { RosterEntry } from '@/lib/data/types';

// What the coach should know about a member on the day (CS4), under their name in the Sessions pop-up and on Run this class: a first
// class or a new member, a plan on hold, too few credits for their next session, and their health and injury notes. Never on the TV.

const chip = 'rounded-full px-2 py-0.5 text-[11px] font-bold';
const clip = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const TONE = { accent: 'bg-accent/15 text-accent', warning: 'bg-warning/15 text-warning', danger: 'bg-danger/10 text-danger' } as const;

export function RosterMarkers({ entry, creditCost }: { entry: RosterEntry; creditCost: number }) {
  const chips = rosterMarkerChips(entry, creditCost);
  const injuries = entry.injuryNotes ?? [];
  if (chips.length === 0 && !entry.healthNotes) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c.label} className={`${chip} ${TONE[c.tone]}`}>
              {c.label}
            </span>
          ))}
        </div>
      )}
      {injuries.map((note, i) => (
        <p key={i} title={note} className="text-xs text-zinc-600 dark:text-zinc-300">
          <b className="text-danger">Injury:</b> {clip(note)}
        </p>
      ))}
      {entry.healthNotes && (
        <p title={entry.healthNotes} className="text-xs text-zinc-600 dark:text-zinc-300">
          <b className="text-black dark:text-zinc-50">Health:</b> {clip(entry.healthNotes)}
        </p>
      )}
    </div>
  );
}

// The session's coach note (typed on the Timetable), shown at the top of the class list on the day.
export function SessionCoachNote({ note }: { note: string | null | undefined }) {
  if (!note?.trim()) return null;
  return (
    <p className="rounded-xl bg-accent/[.08] px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200">
      <b className="text-black dark:text-zinc-50">Coach note:</b> {note.trim()}
    </p>
  );
}
