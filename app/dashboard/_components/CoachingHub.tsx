import { useMemo } from 'react';
import { BookOpen, ChevronRight, ClipboardList, Dumbbell, LineChart, MessageCircle, NotebookPen, Trophy } from 'lucide-react';
import { TargetRings } from './NutritionSummary';
import { Badge, Card, IconChip, ListGroup, ListRow, SectionLabel } from '@/app/_components/ui';
import { weeklyTarget } from '@/lib/calculations';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { trafficLight } from '@/lib/utils/accountability';
import type { TrafficLight } from '@/lib/utils/accountability';
import { bigDogCount, TIER_TITLE, tierForCount } from '@/lib/bigDog';
import type { BigDogResultRow, ClientProfileRow, DailyLogRow, WorkoutProgramRow } from '@/lib/data/types';
import type { Category, Screen } from './categories';

// "My coaching" hub -- the destination of the Coach tab, following the owner's BP mockup
// (05-my-coaching-home): coach strip, today's nutrition rings, training, today's
// accountability numbers, progress & results, and learning material.

const LIGHT_TEXT: Record<TrafficLight, string> = { green: 'text-success', amber: 'text-warning', red: 'text-danger' };

function TrackerStat({ label, display, light }: { label: string; display: string; light: TrafficLight | null }) {
  return (
    <div className="flex-1 rounded-xl bg-card-muted px-2 py-3 text-center">
      <p className={`text-lg font-black leading-none ${light ? LIGHT_TEXT[light] : 'text-zinc-400'}`}>{display}</p>
      <p className="mt-1.5 text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  );
}

export function CoachingHub({
  profile,
  programWeek,
  weekLogs,
  programs,
  bigDogResults,
  unreadMessageCount,
  pendingForms,
  hiddenCategories,
  onNavigate,
}: {
  profile: ClientProfileRow | null;
  programWeek: number;
  weekLogs: DailyLogRow[];
  programs: WorkoutProgramRow[];
  bigDogResults: BigDogResultRow[];
  unreadMessageCount: number;
  pendingForms: number;
  // Areas the member's plan (or coach) has switched off entirely -- their rows are hidden.
  hiddenCategories: Set<Category>;
  onNavigate: (category: Category, screen?: Screen) => void;
}) {
  const todayIso = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
  const todayLog = weekLogs.find((l) => l.log_date === todayIso);

  const dayTarget = useMemo(() => {
    const engineProfile = toEngineProfile(profile);
    return engineProfile ? weeklyTarget(engineProfile, programWeek)?.dailyFlat ?? null : null;
  }, [profile, programWeek]);

  const protein = todayLog?.protein ?? 0;
  const carbs = todayLog?.carbs ?? 0;
  const fat = todayLog?.fat ?? 0;
  const calories = protein * 4 + carbs * 4 + fat * 9;

  const program = programs[0] ?? null;
  const sleep = todayLog?.sleep ?? null;
  const steps = todayLog?.steps ?? null;
  const water = todayLog?.water ?? null;

  const bdCount = bigDogCount(bigDogResults);
  const tier = tierForCount(bdCount);
  const show = (c: Category) => !hiddenCategories.has(c);

  return (
    <div className="space-y-5">
      <Card className="flex items-center justify-between !p-3.5">
        <div className="flex items-center gap-3">
          <IconChip icon={MessageCircle} size="lg" />
          <div>
            <p className="text-base font-extrabold text-black dark:text-zinc-50">Your coach</p>
            <p className="text-xs text-zinc-500">Chat, voice notes & photos</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('Messages')}
          className="relative rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground"
        >
          Message
          {unreadMessageCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
              {unreadMessageCount}
            </span>
          )}
        </button>
      </Card>

      {show('Nutrition') && (
        <div>
          <SectionLabel>Nutrition</SectionLabel>
          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-sm font-bold text-black dark:text-zinc-50">Today&apos;s targets</p>
              <p className="text-xs text-zinc-500">
                {new Date(todayIso + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
              </p>
            </div>
            <TargetRings totals={{ calories, protein, carbs, fat }} target={dayTarget} />
            <button
              type="button"
              onClick={() => onNavigate('Nutrition')}
              className="mt-4 flex w-full items-center justify-between rounded-xl bg-accent/15 px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-accent">
                <NotebookPen className="h-4 w-4" /> Log food diary
              </span>
              <ChevronRight className="h-4 w-4 text-accent" />
            </button>
          </Card>
        </div>
      )}

      {show('Training') && (
        <div>
          <SectionLabel>Training</SectionLabel>
          <ListGroup>
            <ListRow
              icon={Dumbbell}
              title="This week's program"
              subtitle={program ? program.name : 'No program assigned yet'}
              onClick={() => onNavigate('Training', 'Workout')}
            />
          </ListGroup>
        </div>
      )}

      {show('Accountability') && (
        <div>
          <SectionLabel>Daily check-in</SectionLabel>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-black dark:text-zinc-50">Today</p>
              <button
                type="button"
                onClick={() => onNavigate('Accountability', 'Weekly Log')}
                className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-accent-foreground"
              >
                Log today
              </button>
            </div>
            <div className="flex gap-2">
              <TrackerStat label="Sleep" display={sleep != null ? `${sleep}h` : '—'} light={sleep != null ? trafficLight('sleep', sleep) : null} />
              <TrackerStat label="Steps" display={steps != null ? steps.toLocaleString() : '—'} light={steps != null ? trafficLight('steps', steps) : null} />
              <TrackerStat label="Water" display={water != null ? `${water}L` : '—'} light={water != null ? trafficLight('water', water) : null} />
            </div>
          </Card>
        </div>
      )}

      <div>
        <SectionLabel>Progress &amp; results</SectionLabel>
        <ListGroup>
          {show('Progress') && (
            <ListRow
              icon={LineChart}
              title="Body composition & photos"
              subtitle="Weight, measurements, progress photos & scans"
              onClick={() => onNavigate('Progress', 'Progress & Photos')}
            />
          )}
          <ListRow
            icon={Trophy}
            title="Peak week scores"
            subtitle="Your Big Dog standards"
            badge={tier === 'none' ? undefined : <Badge>{TIER_TITLE[tier].replace(' Big Dog', '')}</Badge>}
            onClick={() => onNavigate('Account Settings', 'Big Dog')}
          />
        </ListGroup>
      </div>

      {(show('Learn') || show('Accountability')) && (
        <div>
          <SectionLabel>Learn &amp; forms</SectionLabel>
          <ListGroup>
            {show('Learn') && (
              <ListRow icon={BookOpen} title="Resources" subtitle="Video education library" onClick={() => onNavigate('Learn', 'Education')} />
            )}
            {show('Accountability') && (
              <ListRow
                icon={ClipboardList}
                title="Forms"
                subtitle="Questionnaires from your coach"
                badge={pendingForms > 0 ? <Badge tone="warning">{pendingForms} to do</Badge> : undefined}
                onClick={() => onNavigate('Accountability', 'Forms')}
              />
            )}
          </ListGroup>
        </div>
      )}
    </div>
  );
}
