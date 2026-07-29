import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClientHealthStatuses, getMyClients } from '@/lib/data/coach';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from './_components/CoachNav';
import { AddClientForm } from './_components/AddClientForm';
import { ProgramHealth } from './_components/ProgramHealth';

export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  const [clients, healthStatuses] = await Promise.all([
    getMyClients(supabase, user.id),
    getClientHealthStatuses(supabase, user.id),
  ]);

  return (
    <AppShell
      title="Clients"
      topBar={<CoachNav />}
      sidebar={
        <nav className="space-y-1">
          {clients.length === 0 && <p className="px-3 py-1.5 text-sm text-zinc-500">No clients yet.</p>}
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/coach/clients/${client.id}`}
              className="block rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300"
            >
              {client.name ?? client.email}
            </Link>
          ))}
        </nav>
      }
    >
      <div className="space-y-4">
        <ProgramHealth statuses={healthStatuses} />
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <AddClientForm />
        </div>
      </div>
      {clients.length === 0 && (
        <p className="mt-4 text-sm text-zinc-500">
          No clients yet — add one above, or select a client from the sidebar once you have.
        </p>
      )}
    </AppShell>
  );
}
