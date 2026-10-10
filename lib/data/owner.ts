'use server';

import { createClient } from '@/lib/supabase/server';
import { raise } from './errors';

// Owner side: the organisation's gyms and who coaches in each. Needs migrations 0102 and 0103.

export interface OwnerCoach {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  // Members assigned to this coach at this gym.
  members: number;
}

export interface OwnerGym {
  id: string;
  name: string;
  members: number;
  coaches: OwnerCoach[];
}

// Every gym in the signed-in owner's organisation. Throws for anyone who is not an owner.
export async function getOwnerGyms(): Promise<OwnerGym[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_gyms_overview');
  if (error) raise(error);
  return (data ?? []) as OwnerGym[];
}
