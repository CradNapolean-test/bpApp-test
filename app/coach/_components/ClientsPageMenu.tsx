'use client';

import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/ToastProvider';
import { requestDetailsUpdateForAll } from '@/lib/data/onboarding';

// The "⋯" menu on the Clients page. "Ask all my clients to confirm their details" lives here, away from the Add client popover where a
// stray tap could send it (CH3). It sets a request the member sees as a banner on Home; nobody is locked out of the app.
export function ClientsPageMenu() {
  const confirm = useConfirm();
  const toast = useToast();

  async function askAll() {
    const ok = await confirm({
      title: 'Ask all your clients to confirm their details?',
      body: 'Each of your clients sees a banner on their Home screen: "Your coach asked you to check your details". It takes about a minute and they can choose Later. They can keep using the app either way.',
      confirmLabel: 'Ask them',
    });
    if (!ok) return;
    try {
      const res = await requestDetailsUpdateForAll();
      if (res.ok) {
        toast.success(
          res.count === 0
            ? 'No one to ask: every client has already been asked, or has not finished setting up'
            : `Asked ${res.count} client${res.count === 1 ? '' : 's'} to confirm their details`
        );
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error('Could not send the request. Check your connection and try again.');
    }
  }

  return <DropdownMenu variant="header" triggerLabel="More client actions" items={[{ label: 'Ask clients to confirm details…', onSelect: () => void askAll() }]} />;
}
