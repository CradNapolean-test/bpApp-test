'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { Segmented } from '@/app/_components/ui';
import { AddCoachForm, BookingRulesForm, GymNameForm, ReferralLinkForm, TeamList, type TeamMember } from '@/app/coach/settings/_components/GymAdminSection';
import { RosterPane } from './RosterPane';
import { brandParts, shortGymName } from '@/lib/gymNames';
import { LOAD_FAILED } from '@/lib/ownerReport';
import type { RosterFilter } from '@/lib/ownerRoster';
import type { OwnerGym, OwnerGymSettings } from '@/lib/data/owner';

type Section = 'members' | 'team' | 'settings';

const card = 'rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10';
const h2 = 'mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300';

// What the owner can see and do for one gym. Everything on the Team and Settings tabs goes through the owner_* functions (scope "owner").
export function OwnerGymShell({
  gymId,
  gym,
  siblingNames,
  settings,
  orgName,
  email,
  ownerId,
  initialFilter,
}: {
  gymId: string;
  // null when the list of gyms could not be loaded.
  gym: OwnerGym | null;
  siblingNames: string[];
  settings: OwnerGymSettings | null;
  orgName: string | null;
  email: string;
  ownerId: string;
  initialFilter: RosterFilter | null;
}) {
  const router = useRouter();
  const [section, setSection] = useState<Section>('members');
  const brand = brandParts(orgName ?? 'Owner');
  const gymName = gym?.name ?? settings?.name ?? 'Gym';
  const title = shortGymName(gymName, { organisationName: orgName, siblings: siblingNames });
  const scope = { kind: 'owner', gymId } as const;

  const team: TeamMember[] = (gym?.coaches ?? []).map((c) => ({
    id: c.id,
    email: c.email,
    // The overview function gives the display name, or the address when there is none; only a real name is a display name.
    displayName: c.name && c.name !== c.email ? c.name : null,
    isAdmin: c.isAdmin,
    members: c.members,
  }));
  // The team list remembers who is an admin while open; new data from the server (after a move or a removal) starts it afresh.
  const teamKey = team.map((c) => `${c.id}:${c.isAdmin ? 1 : 0}:${c.members}`).join('|');

  return (
    <ClientOnly fallback={<PageSkeleton />}>
      <AppShell
        title={
          <>
            {brand.lead}
            {brand.accent && <span className="text-accent"> {brand.accent}</span>}
          </>
        }
        headerAction={
          <Link href="/owner/account" aria-label="Your account" className="rounded-xl">
            <Avatar name={email} size="md" variant="self" />
          </Link>
        }
        signOutOnMobile
        mobileHeader={
          <Link href="/owner" className="flex min-w-0 items-center gap-2.5" aria-label="Back to the overview">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
              <ArrowLeft className="h-4 w-4" />
            </span>
            <p className="truncate text-lg font-bold text-black dark:text-zinc-50">{title}</p>
          </Link>
        }
      >
        <Link href="/owner" className="mb-3 hidden items-center gap-1.5 text-sm font-semibold text-zinc-500 hover:text-black md:inline-flex dark:hover:text-zinc-200">
          <ArrowLeft className="h-4 w-4" /> Overview
        </Link>
        <h1 className="mb-1 text-2xl font-bold text-black dark:text-zinc-50">{title}</h1>
        <p className="mb-4 text-sm text-zinc-500">
          {gym ? `${gym.members} members, ${gym.coaches.length} coach${gym.coaches.length === 1 ? '' : 'es'}.` : 'Members, team and settings.'}
        </p>

        {gym === null ? (
          <div className="rounded-lg border border-dashed border-black/10 p-6 text-center dark:border-white/15" role="alert">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{LOAD_FAILED}</p>
            <button type="button" onClick={() => router.refresh()} className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">
              Try again
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <Segmented
              label="Section"
              value={section}
              onChange={setSection}
              options={[
                { value: 'members', label: 'Members' },
                { value: 'team', label: 'Team' },
                { value: 'settings', label: 'Settings' },
              ]}
            />

            {section === 'members' && <RosterPane gymId={gymId} initialFilter={initialFilter} />}

            {section === 'team' && (
              <div className="space-y-6">
                <section>
                  <h2 className={h2}>Coaches at this gym</h2>
                  <TeamList key={teamKey} team={team} currentUserId={ownerId} scope={scope} />
                </section>
                <section>
                  <h2 className={h2}>Add a coach</h2>
                  <AddCoachForm scope={scope} />
                </section>
              </div>
            )}

            {section === 'settings' &&
              (settings ? (
                <div className="space-y-6">
                  <section className={card}>
                    <h2 className={h2}>Gym name</h2>
                    <GymNameForm initialName={settings.name} scope={scope} />
                  </section>
                  <section className={card}>
                    <h2 className={h2}>Booking rules</h2>
                    <BookingRulesForm timezone={settings.timezone} blackoutStart={settings.blackoutStart} blackoutEnd={settings.blackoutEnd} scope={scope} />
                  </section>
                  <section className={card}>
                    <h2 className={h2}>Referral link</h2>
                    <ReferralLinkForm initialUrl={settings.referralUrl} scope={scope} />
                  </section>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-black/10 p-6 text-center dark:border-white/15" role="alert">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{LOAD_FAILED}</p>
                  <button type="button" onClick={() => router.refresh()} className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">
                    Try again
                  </button>
                </div>
              ))}
          </div>
        )}
      </AppShell>
    </ClientOnly>
  );
}
