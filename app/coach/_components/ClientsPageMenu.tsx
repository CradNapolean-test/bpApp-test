'use client';

import { useState } from 'react';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/ToastProvider';
import { requestDetailsUpdateForAll } from '@/lib/data/onboarding';
import { ImportMembersSheet } from './ImportMembersSheet';
import { useMembersListActions } from './MembersPageActions';

// The Members page's one "⋯" menu (CL1: the list had a second one with the same name, and both could be open at once). It holds Import
// (CL4: a one-off setup job, moved out of the header), the list's Manage groups and Export CSV, and "Ask all my members to confirm their
// details", which lives here, away from the Add member popover where a stray tap could send it (CH3). That request is a banner the member
// sees on Home; nobody is locked out of the app.
export function ClientsPageMenu() {
  const confirm = useConfirm();
  const toast = useToast();
  const list = useMembersListActions();
  const [importing, setImporting] = useState(false);

  async function askAll() {
    const ok = await confirm({
      title: 'Ask all your members to confirm their details?',
      body: 'Each of your members sees a banner on their Home screen: "Your coach asked you to check your details". It takes about a minute and they can choose Later. They can keep using the app either way.',
      confirmLabel: 'Ask them',
    });
    if (!ok) return;
    try {
      const res = await requestDetailsUpdateForAll();
      if (res.ok) {
        toast.success(
          res.count === 0
            ? 'No one to ask: every member has already been asked, or has not finished setting up'
            : `Asked ${res.count} member${res.count === 1 ? '' : 's'} to confirm their details`
        );
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error('Could not send the request. Check your connection and try again.');
    }
  }

  return (
    <>
      <DropdownMenu
        variant="header"
        triggerLabel="More member actions"
        items={[
          { label: 'Import members…', onSelect: () => setImporting(true) },
          { label: 'Manage groups', onSelect: () => list?.current?.manageGroups() },
          { label: 'Export CSV', onSelect: () => list?.current?.exportCsv() },
          { label: 'Ask members to confirm details…', onSelect: () => void askAll() },
        ]}
      />
      {importing && <ImportMembersSheet onClose={() => setImporting(false)} />}
    </>
  );
}
