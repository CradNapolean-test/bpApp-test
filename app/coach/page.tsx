import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClientHealthStatuses, getMyClients } from '@/lib/data/coach';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from './_components/CoachNav';
import { AddClientForm } from './_components/AddClientForm';
import { ProgramHealth } from './_components/ProgramHealth';
import { ClientSidebar } from './_components/ClientSidebar';
import { ClientTable } from './_components/ClientTable';

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
      sidebar={<ClientSidebar clients={clients} statuses={healthStatuses} />}
    >
      <div className="space-y-4">
        <ProgramHealth statuses={healthStatuses} />
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <AddClientForm />
        </div>
        <ClientTable clients={clients} statuses={healthStatuses} />
      </div>
    </AppShell>
  );
}
