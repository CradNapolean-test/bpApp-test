import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyClients } from '@/lib/data/coach';
import { SignOutButton } from '@/app/_components/SignOutButton';
import { CoachNav } from './_components/CoachNav';
import { AddClientForm } from './_components/AddClientForm';

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

  const clients = await getMyClients(supabase, user.id);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Clients</h1>
        <SignOutButton />
      </div>

      <div className="mt-4">
        <CoachNav />
      </div>

      <div className="mt-6 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <AddClientForm />
      </div>

      <ul className="mt-6 divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {clients.length === 0 && (
          <li className="p-4 text-sm text-zinc-500">No clients yet — add one above.</li>
        )}
        {clients.map((client) => (
          <li key={client.id} className="flex items-center justify-between p-4">
            <div>
              <Link
                href={`/coach/clients/${client.id}`}
                className="font-medium text-black hover:underline dark:text-zinc-50"
              >
                {client.name ?? client.email}
              </Link>
              <p className="text-sm text-zinc-500">
                {client.email}
                {client.start_weight != null && client.goal_weight != null
                  ? ` · ${client.start_weight}kg → ${client.goal_weight}kg`
                  : ' · Setup not completed'}
              </p>
            </div>
            <span className="text-sm text-zinc-500">{client.balance} credits</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
