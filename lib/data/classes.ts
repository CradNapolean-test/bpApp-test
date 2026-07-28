'use server';

import { createClient } from '@/lib/supabase/server';
import type { BookingRow, ClassRow, CreditsLedgerRow } from './types';

export async function getClasses(): Promise<ClassRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .order('day_of_week')
    .order('start_time');
  if (error) throw error;
  return data ?? [];
}

export async function createClass(fields: Omit<ClassRow, 'id' | 'coach_id'>): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('classes').insert({ ...fields, coach_id: user.id });
  if (error) throw error;
}

export async function deleteClass(classId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('classes').delete().eq('id', classId);
  if (error) throw error;
}

export async function getUpcomingBookings(clientId: string): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('*, class:classes(*)')
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .order('booking_date');
  if (error) throw error;
  return (data ?? []) as unknown as BookingRow[];
}

export async function bookClass(classId: string, bookingDate: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('book_class', {
    p_class_id: classId,
    p_booking_date: bookingDate,
  });
  if (error) throw error;
}

export async function cancelBooking(bookingId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
  if (error) throw error;
}

export async function getCreditsBalance(clientId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits_balance')
    .select('balance')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data?.balance ?? 0;
}

export async function getCreditsLedger(clientId: string): Promise<CreditsLedgerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function grantCredits(clientId: string, delta: number, reason: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('credits_ledger')
    .insert({ client_id: clientId, delta, reason, granted_by: user.id });
  if (error) throw error;
}
