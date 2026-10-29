import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ClientProfileRow } from '@ballistic/shared/data/types';
import { TARGETS_LOCKED_MESSAGE, type CustomTargetValues } from '@ballistic/shared/utils/customTargets';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// The member's own daily targets, or (null) back to the calculated ones. The database refuses the change while their coach has locked
// it (migration 0146); that comes back as words. The screens read the profile from the same cache, so they update at once.
export function useSaveCustomTargets() {
  const userId = useSession().session?.user.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: CustomTargetValues | null) => {
      if (!userId) throw new Error('Not signed in.');
      const fields = values ?? { custom_calories: null, custom_protein: null, custom_carbs: null, custom_fat: null };
      const { data, error } = await supabase.from('client_profiles').update(fields).eq('client_id', userId).select('client_id');
      if (error) throw new Error(/locked your daily targets/i.test(error.message) ? TARGETS_LOCKED_MESSAGE : 'Could not save your targets. Please try again.');
      if (!data?.length) throw new Error('Finish setting up your details first.');
      return fields;
    },
    onSuccess: (fields) => {
      qc.setQueryData<ClientProfileRow | null>(['client-profile', userId], (p) => (p ? { ...p, ...fields } : p));
      qc.invalidateQueries({ queryKey: ['client-profile', userId] });
    },
  });
}
