'use client';

import { useEffect, useState } from 'react';
import { FileText, Gift, HelpCircle, Lock, Mail, MessageSquare, UserCog, Wallet } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { Avatar } from '@/app/_components/Avatar';
import { Switch } from '@/app/_components/Switch';
import { Button } from '@/app/_components/Button';
import { ChangePasswordForm } from '@/app/_components/ChangePasswordForm';
import { ChangeEmailForm } from '@/app/_components/ChangeEmailForm';
import { ThemeToggle } from '@/app/_components/ThemeToggle';
import { SignOutButton } from '@/app/_components/SignOutButton';
import { Badge, Card, ListGroup, ListRow, SectionLabel } from '@/app/_components/ui';
import type { ThemePreference } from '@/app/_components/theme';
import {
  cancelAccountDeletionRequest,
  requestAccountDeletion,
  updateEmailNotificationsEnabled,
  updateNotificationsEnabled,
} from '@/lib/data/clientProfile';
import {
  disablePushNotifications,
  enablePushNotifications,
  getExistingPushSubscription,
  isPushSupported,
} from '@/app/_components/pushNotifications';
import { BigDogCard } from './BigDogTab';
import type { BigDogResultRow, ClientProfileRow } from '@/lib/data/types';
import type { Category, Screen } from './categories';

type RowKey = 'password' | 'email';

function formatDob(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function SwitchRow({ title, subtitle, checked, onChange, label }: { title: string; subtitle?: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3 last:border-b-0 dark:border-white/5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-black dark:text-zinc-50">{title}</span>
        {subtitle && <span className="block text-xs text-zinc-500">{subtitle}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

// The member's Profile tab: a list that drills into personal details, credits, Big Dog and
// rewards, with account settings below. Each drill-in is its own page with a back arrow.
export function AccountTab({
  clientId,
  name,
  email,
  notificationsEnabled,
  emailNotificationsEnabled,
  deletionRequestedAt,
  themePreference,
  profile = null,
  membershipName = null,
  bigDogResults = [],
  onNavigate,
}: {
  clientId: string;
  name: string;
  email: string;
  notificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  deletionRequestedAt: string | null;
  themePreference: ThemePreference;
  profile?: ClientProfileRow | null;
  membershipName?: string | null;
  bigDogResults?: BigDogResultRow[];
  onNavigate: (category: Category, screen?: Screen) => void;
}) {
  const { run } = useAction();
  const confirm = useConfirm();
  const [enabled, setEnabled] = useState(notificationsEnabled);
  const [emailEnabled, setEmailEnabled] = useState(emailNotificationsEnabled);
  const [deletionRequested, setDeletionRequested] = useState(deletionRequestedAt != null);
  const [openRow, setOpenRow] = useState<RowKey | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  // Reflects actual browser subscription state, not a DB flag -- unlike the other toggles
  // here, "on" only ever means a live PushSubscription exists for this browser right now.
  useEffect(() => {
    isPushSupported().then((supported) => {
      setPushSupported(supported);
      if (!supported) return;
      getExistingPushSubscription().then((sub) => setPushEnabled(sub != null));
    });
  }, []);

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    await run(() => updateNotificationsEnabled(clientId, next));
  }

  async function handlePushToggle() {
    const next = !pushEnabled;
    setPushEnabled(next);
    await run(() => (next ? enablePushNotifications(clientId) : disablePushNotifications()), {
      success: next ? 'Push notifications enabled' : 'Push notifications disabled',
    });
    // Re-check actual state rather than trust the optimistic flip, on both the success and
    // failure path -- a denied permission prompt or a subscribe failure should snap the
    // toggle back off, not leave it stuck on.
    const sub = await getExistingPushSubscription();
    setPushEnabled(sub != null);
  }

  async function handleEmailToggle() {
    const next = !emailEnabled;
    setEmailEnabled(next);
    await run(() => updateEmailNotificationsEnabled(clientId, next));
  }

  async function handleRequestDeletion() {
    if (
      !(await confirm({
        title: 'Request account deletion?',
        body: 'Your coach will be notified and will handle deleting your account and data. This isn\'t instant.',
        confirmLabel: 'Request deletion',
        destructive: true,
      }))
    )
      return;
    await run(() => requestAccountDeletion(clientId), {
      success: 'Deletion requested — your coach has been notified.',
      onDone: () => setDeletionRequested(true),
    });
  }

  async function handleCancelDeletion() {
    await run(() => cancelAccountDeletionRequest(clientId), {
      success: 'Deletion request cancelled',
      onDone: () => setDeletionRequested(false),
    });
  }

  const dob = formatDob(profile?.date_of_birth ?? null);

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-1 py-1 text-center">
        <Avatar name={name} size="lg" variant="self" />
        <p className="mt-1 text-lg font-extrabold text-black dark:text-zinc-50">{name}</p>
        <p className="text-sm text-zinc-500">{email}</p>
        {membershipName && (
          <div className="mt-1">
            <Badge>{membershipName}</Badge>
          </div>
        )}
        {(dob || profile?.phone) && (
          <p className="mt-1 text-xs text-zinc-500">{[dob, profile?.phone].filter(Boolean).join(' · ')}</p>
        )}
      </div>

      <BigDogCard results={bigDogResults} onOpen={() => onNavigate('Account Settings', 'Big Dog')} />

      <div>
        <SectionLabel>My account</SectionLabel>
        <ListGroup>
          <ListRow icon={UserCog} title="Personal details & goals" subtitle="Contact details, measurements, targets" onClick={() => onNavigate('Account Settings', 'Setup')} />
          <ListRow icon={Wallet} title="Credits & membership" subtitle="Balance, history and your plan" onClick={() => onNavigate('Account Settings', 'Credits')} />
          <ListRow icon={Gift} title="Rewards & clubs" subtitle="Milestones and loyalty gifts" onClick={() => onNavigate('Community', 'Rewards')} />
          <ListRow icon={Lock} title="Change password" onClick={() => setOpenRow(openRow === 'password' ? null : 'password')} />
          {openRow === 'password' && (
            <div className="border-b border-black/5 p-4 dark:border-white/5">
              <ChangePasswordForm />
            </div>
          )}
          <ListRow icon={Mail} title="Change email" onClick={() => setOpenRow(openRow === 'email' ? null : 'email')} />
          {openRow === 'email' && (
            <div className="p-4">
              <ChangeEmailForm currentEmail={email} />
            </div>
          )}
        </ListGroup>
      </div>

      <div>
        <SectionLabel>Notifications</SectionLabel>
        <ListGroup>
          <SwitchRow title="Check-in reminders" checked={enabled} onChange={handleToggle} label="Toggle check-in reminders" />
          {pushSupported && (
            <SwitchRow
              title="Push notifications"
              subtitle="On this device, even when the app is closed"
              checked={pushEnabled}
              onChange={handlePushToggle}
              label="Toggle push notifications"
            />
          )}
          <SwitchRow
            title="Email notifications"
            subtitle="Messages your coach sends by email"
            checked={emailEnabled}
            onChange={handleEmailToggle}
            label="Toggle email notifications"
          />
        </ListGroup>
      </div>

      <div>
        <SectionLabel>Appearance</SectionLabel>
        <ThemeToggle initial={themePreference} />
      </div>

      <div>
        <SectionLabel>Help &amp; legal</SectionLabel>
        <ListGroup>
          <ListRow icon={MessageSquare} title="Message your coach" onClick={() => onNavigate('Messages')} />
          <ListRow icon={HelpCircle} title="FAQs" subtitle="Common questions answered" onClick={() => onNavigate('Community', 'FAQs')} />
          <ListRow icon={FileText} title="Terms & conditions" subtitle="Membership & usage terms" href="/legal/terms" />
          <ListRow icon={Lock} title="Privacy policy" subtitle="How we use your data" href="/legal/privacy" />
        </ListGroup>
      </div>

      <SignOutButton variant="danger-soft" className="w-full py-3 md:hidden" />

      <Card>
        {deletionRequested ? (
          <>
            <p className="text-sm font-semibold text-black dark:text-zinc-50">Deletion requested</p>
            <p className="mt-1 text-xs text-zinc-500">
              Your coach has been notified and will handle deleting your account and data.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleCancelDeletion}>
              Cancel request
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-black dark:text-zinc-50">Delete my account</p>
            <p className="mt-1 text-xs text-zinc-500">
              Your coach will be notified and will handle deleting your account and data. This isn&apos;t instant.
            </p>
            <Button variant="danger" size="sm" className="mt-3" onClick={handleRequestDeletion}>
              Request account deletion
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
