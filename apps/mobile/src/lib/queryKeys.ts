// Query keys and names shared between the screens' hooks and the offline write queue (writeQueue.ts / queuedWrites.ts),
// kept here so neither has to import the other.

// Every queued write runs in this scope: writes of one kind or another are carried out one after another, in the order
// the member made them (a set logged, then edited; a food added, then removed).
export const WRITE_SCOPE = 'member-writes';

export const diaryKey = (userId: string, date: string) => ['diary', userId, date] as const;
export const manualKey = (userId: string, date: string) => ['manual-macros', userId, date] as const;
export const photoDiaryKey = (userId: string, date: string) => ['photo-diary', userId, date] as const;
export const workoutDayKey =(userId: string, dayId: string) => ['workout-day', userId, dayId] as const;
