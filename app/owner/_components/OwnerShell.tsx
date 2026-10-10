'use client';

import { useState } from 'react';
import { Building2, Users } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { EmptyState } from '@/app/_components/EmptyState';
import { Logo } from '@/app/_components/Logo';
import { Segmented } from '@/app/_components/ui';
import type { OwnerGym } from '@/lib/data/owner';

// The owner's home: every gym in the organisation side by side, with a filter to look at one. This is the
// foundation; reports, the coach messages review and the team screens are added to it.

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
      <p className="text-2xl font-black text-black dark:text-zinc-50">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function GymCard({ gym }: { gym: OwnerGym }) {
  return (
    <section className="rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10">
      <div className="flex items-center gap-2.5">
        <Building2 className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">{gym.name}</h2>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Members" value={gym.members} />
        <Stat label="Coaches" value={gym.coaches.length} />
      </div>
      <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Coaches</p>
      {gym.coaches.length === 0 ? (
        <p className="text-sm text-zinc-500">No coaches in this gym yet.</p>
      ) : (
        <ul className="divide-y divide-black/[.05] dark:divide-white/10">
          {gym.coaches.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={c.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-black dark:text-zinc-50">{c.name}</p>
                <p className="truncate text-xs text-zinc-500">{c.isAdmin ? 'Gym admin' : 'Coach'}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                {c.members} <span className="font-normal text-zinc-500">{c.members === 1 ? 'member' : 'members'}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OwnerShell({ gyms, email }: { gyms: OwnerGym[] | null; email: string }) {
  const [filter, setFilter] = useState<string>('all');
  const shown = gyms ? (filter === 'all' ? gyms : gyms.filter((g) => g.id === filter)) : [];
  const totalMembers = shown.reduce((n, g) => n + g.members, 0);
  const totalCoaches = new Set(shown.flatMap((g) => g.coaches.map((c) => c.id))).size;

  return (
    <ClientOnly fallback={<div className="min-h-screen" />}>
      <AppShell
        title={
          <>
            Ballistic <span className="text-accent">Performance</span>
          </>
        }
        headerAction={<Avatar name={email} size="md" variant="self" />}
        mobileHeader={
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <div className="leading-tight">
              <p className="text-[15px] font-black text-black dark:text-zinc-50">Ballistic</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Owner</p>
            </div>
          </div>
        }
      >
        <h1 className="mb-1 text-2xl font-bold text-black dark:text-zinc-50">Overview</h1>
        <p className="mb-4 text-sm text-zinc-500">Every gym in the business, side by side.</p>

        {gyms === null ? (
          <EmptyState icon={Users} title="Owner access is not set up yet" hint="Run migrations 0102 and 0103, then npm run create-owner." />
        ) : gyms.length === 0 ? (
          <EmptyState icon={Building2} title="No gyms in your organisation yet" hint="Gyms are added to the organisation when the owner account is created." />
        ) : (
          <div className="space-y-4">
            {gyms.length > 1 && (
              <Segmented
                label="Gym"
                value={filter}
                onChange={setFilter}
                options={[{ value: 'all', label: 'All gyms' }, ...gyms.map((g) => ({ value: g.id, label: g.name.replace(/^Ballistic Performance\s*[-–]\s*/i, '') }))]}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Stat label={filter === 'all' ? 'Members, all gyms' : 'Members'} value={totalMembers} />
              <Stat label="Coaches" value={totalCoaches} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {shown.map((g) => (
                <GymCard key={g.id} gym={g} />
              ))}
            </div>
          </div>
        )}
      </AppShell>
    </ClientOnly>
  );
}
