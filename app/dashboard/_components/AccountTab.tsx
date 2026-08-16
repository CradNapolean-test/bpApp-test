'use client';

import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { Avatar } from '@/app/_components/Avatar';
import { Switch } from '@/app/_components/Switch';
import { Button } from '@/app/_components/Button';
import { ChangePasswordForm } from '@/app/_components/ChangePasswordForm';
import { ChangeEmailForm } from '@/app/_components/ChangeEmailForm';
import { ThemeToggle } from '@/app/_components/ThemeToggle';
import { SignOutButton } from '@/app/_components/SignOutButton';
import { LegalFooterLinks } from '@/app/_components/LegalFooterLinks';
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
import type { Category, Screen } from './categories';

const cardCls = 'rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';

type RowKey = 'password' | 'email';

export function AccountTab({
  clientId,
  name,
  email,
  notificationsEnabled,
  emailNotificationsEnabled,
  deletionRequestedAt,
  themePreference,
  onNavigate,
}: {
  clientId: string;
  name: string;
  email: string;
  notificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  deletionRequestedAt: string | null;
  themePreference: ThemePreference;
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

  const rowCls =
    'flex w-full items-center justify-between border-b border-black/5 px-4 py-3.5 text-left last:border-b-0 dark:border-white/5';

  return (
    <div className="space-y-4">
      <div className={`${cardCls} flex items-center gap-3`}>
        <Avatar name={name} size="lg" variant="self" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-black dark:text-zinc-50">{name}</p>
          <p className="truncate text-xs text-zinc-500">{email}</p>
        </div>
      </div>

      <div className={`${cardCls} !p-0`}>
        <button type="button" onClick={() => setOpenRow(openRow === 'password' ? null : 'password')} className={rowCls}>
          <span className="font-semibold text-black dark:text-zinc-50">Change password</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
        <button type="button" onClick={() => setOpenRow(openRow === 'email' ? null : 'email')} className={rowCls}>
          <span className="font-semibold text-black dark:text-zinc-50">Change email</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
        <button type="button" onClick={() => onNavigate('Account Settings', 'Setup')} className={rowCls}>
          <span className="font-semibold text-black dark:text-zinc-50">Setup / Profile details</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
        <button type="button" onClick={() => onNavigate('Account Settings', 'Credits')} className={rowCls}>
          <span className="font-semibold text-black dark:text-zinc-50">Credits &amp; Membership</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
      </div>

      {openRow === 'password' && (
        <div className={cardCls}>
          <ChangePasswordForm />
        </div>
      )}

      {openRow === 'email' && (
        <div className={cardCls}>
          <ChangeEmailForm currentEmail={email} />
        </div>
      )}

      <div className={`${cardCls} flex items-center justify-between gap-3`}>
        <span className="font-semibold text-black dark:text-zinc-50">Check-in reminders</span>
        <Switch checked={enabled} onChange={handleToggle} label="Toggle check-in reminders" />
      </div>

      {pushSupported && (
        <div className={`${cardCls} flex items-center justify-between gap-3`}>
          <div>
            <span className="font-semibold text-black dark:text-zinc-50">Push notifications</span>
            <p className="text-xs text-zinc-500">Get notified on this device, even when the app&apos;s closed.</p>
          </div>
          <Switch checked={pushEnabled} onChange={handlePushToggle} label="Toggle push notifications" />
        </div>
      )}

      <div className={`${cardCls} flex items-center justify-between gap-3`}>
        <div>
          <span className="font-semibold text-black dark:text-zinc-50">Email notifications</span>
          <p className="text-xs text-zinc-500">Messages your coach broadcasts by email.</p>
        </div>
        <Switch checked={emailEnabled} onChange={handleEmailToggle} label="Toggle email notifications" />
      </div>

      <ThemeToggle initial={themePreference} />

      <div className={cardCls}>
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
      </div>

      <SignOutButton variant="danger-soft" className="w-full py-3 md:hidden" />

      <div className="space-y-2 text-center">
        <button
          type="button"
          onClick={() => onNavigate('Messages')}
          className="text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Need help? Message your coach
        </button>
        <LegalFooterLinks />
      </div>
    </div>
  );
}
