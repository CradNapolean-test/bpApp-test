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
import { Card, ListGroup, ListRow, SectionLabel, Segmented } from '@/app/_components/ui';
import type { ThemePreference } from '@/app/_components/theme';
import { updateEmailNotificationsEnabled, updateNotificationsEnabled, updateWeightUnit } from '@/lib/data/clientProfile';
import { WEIGHT_UNIT_OPTIONS, weightUnitOf, type WeightUnit } from '@/lib/utils/weightUnits';
import { deleteMyAccount } from '@/lib/data/deleteAccount';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { browserLocalStorage, clearMemberLocalData } from '@/lib/utils/localData';
import {
  disablePushNotifications,
  enablePushNotifications,
  getExistingPushSubscription,
  isPushSupported,
} from '@/app/_components/pushNotifications';
import { BigDogCard } from './BigDogTab';
import { DownloadMyData } from './DownloadMyData';
import type { BigDogResultRow, ClientProfileRow } from '@/lib/data/types';
import type { Category, Screen } from './categories';
import { MemberHeader } from './MemberHeader';
import type { HeaderActions } from './MemberHeader';
import AnimatedContent from '@/app/_components/motion/AnimatedContent';

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
  themePreference,
  profile = null,
  membershipName = null,
  bigDogResults = [],
  onNavigate,
  header,
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
  // The message bubble and the bell in the header.
  header?: HeaderActions;
}) {
  const { run } = useAction();
  const confirm = useConfirm();
  const [enabled, setEnabled] = useState(notificationsEnabled);
  const [emailEnabled, setEmailEnabled] = useState(emailNotificationsEnabled);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
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
    // If saving fails the switch goes back to what is really stored; it used to stay flipped while nothing was saved (L3).
    const saved = await run(() => updateNotificationsEnabled(clientId, next));
    if (!saved) setEnabled(!next);
  }

  async function handlePushToggle() {
    const next = !pushEnabled;
    setPushEnabled(next);
    await run(() => (next ? enablePushNotifications() : disablePushNotifications()), {
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
    const saved = await run(() => updateEmailNotificationsEnabled(clientId, next));
    if (!saved) setEmailEnabled(!next);
  }

  // Kilograms or stones and pounds for bodyweight and goal weight everywhere (D16). The page reloads after, so every screen switches.
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(weightUnitOf(profile?.weight_unit));
  async function handleWeightUnit(next: WeightUnit) {
    if (next === weightUnit) return;
    const before = weightUnit;
    setWeightUnit(next);
    const saved = await run(() => updateWeightUnit(clientId, next), {
      success: next === 'st_lb' ? 'Weights now in stones and pounds' : 'Weights now in kilograms',
    });
    if (!saved) setWeightUnit(before);
  }

  async function handleDeleteAccount() {
    if (deleteText.trim().toUpperCase() !== 'DELETE') return;
    if (
      !(await confirm({
        title: 'Delete your account for good?',
        body: 'Your profile, logs, photos, messages and booking history are deleted now. This cannot be undone.',
        confirmLabel: 'Delete everything',
        destructive: true,
      }))
    )
      return;
    const done = await run(() => deleteMyAccount(deleteText));
    if (!done) return;
    clearMemberLocalData(browserLocalStorage());
    await createBrowserClient().auth.signOut().catch(() => {});
    window.location.replace('/login');
  }

  const dob = formatDob(profile?.date_of_birth ?? null);

  return (
    <div className="space-y-5">
      <MemberHeader lead={<Avatar name={name} size="lg" variant="self" />} title={name} subtitle={email} actions={header}>
        {(membershipName || dob || profile?.phone) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-400">
            {membershipName && <span className="flex h-6 items-center rounded-full bg-accent/20 px-2.5 font-extrabold text-[#5fd6d6]">{membershipName}</span>}
            {(dob || profile?.phone) && <span>{[dob, profile?.phone].filter(Boolean).join(' · ')}</span>}
          </div>
        )}
      </MemberHeader>

      {/* Under the header, each group rises into place in turn when Profile opens. */}
      <AnimatedContent className="space-y-5" distance={18} duration={0.5} stagger={0.05} delay={0.05}>

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
          {/* client_profiles.notifications_enabled: the check-in reminders, the reminder before a booked session and the birthday push
              follow it; what a coach does for the member (plan ready, a programme, credits) and chat do not. */}
          <SwitchRow
            title="Reminders"
            subtitle="Check-ins, booked classes and birthday wishes"
            checked={enabled}
            onChange={handleToggle}
            label="Toggle reminders"
          />
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
        <SectionLabel>Units</SectionLabel>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-black dark:text-zinc-50">Bodyweight</p>
              <p className="text-xs text-zinc-500">Your check-ins, goal weight and charts</p>
            </div>
            <Segmented<WeightUnit> label="Bodyweight units" size="md" value={weightUnit} onChange={handleWeightUnit} options={WEIGHT_UNIT_OPTIONS} />
          </div>
        </Card>
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

      <DownloadMyData />

      <Card>
        <p className="text-sm font-semibold text-black dark:text-zinc-50">Delete my account</p>
        <p className="mt-1 text-xs text-zinc-500">
          This permanently deletes your profile, check-ins, food and training logs, photos, messages and booking history. It does not cancel your
          membership: call the gym to do that.
        </p>
        {!deleteOpen ? (
          <Button variant="danger" size="sm" className="mt-3" onClick={() => setDeleteOpen(true)}>
            Delete my account
          </Button>
        ) : (
          <div className="mt-3 space-y-2">
            <label className="block text-xs font-semibold text-zinc-500" htmlFor="delete-confirm">
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirm"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
            <div className="flex gap-2">
              <Button variant="danger-solid" size="sm" disabled={deleteText.trim().toUpperCase() !== 'DELETE'} onClick={handleDeleteAccount}>
                Delete everything
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setDeleteOpen(false); setDeleteText(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
      </AnimatedContent>
    </div>
  );
}
