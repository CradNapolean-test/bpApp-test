import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { initialsOf, THEME_OPTIONS, validateNewEmail, validateNewPassword, type ThemePreference } from '@ballistic/shared/utils/account';

import { AppText, Button, Card, ConfirmSheet, ListGroup, ListRow, SectionLabel, Segmented, TextField } from '@/components/ui';
import { useChangeEmail, useChangePassword, useSaveTheme } from '@/lib/account';
import { spacing, useTheme } from '@/theme';

// The top of the profile: a teal-ringed circle with the member's initials, their name, email and a small pill (plan and site).
export function ProfileHeader({ name, email, pill }: { name: string; email: string; pill: string | null }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 4, paddingVertical: spacing.sm }}>
      <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: t.accentSoft, borderWidth: 2, borderColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
        <AppText style={{ color: t.accentText, fontSize: 26, fontWeight: '900' }}>{initialsOf(name)}</AppText>
      </View>
      <AppText style={{ fontSize: 20, fontWeight: '800', marginTop: spacing.sm }}>{name}</AppText>
      {name !== email ? <AppText variant="small" color="muted">{email}</AppText> : null}
      {pill ? (
        <View style={{ marginTop: spacing.xs, backgroundColor: t.accentSoft, borderColor: 'rgba(42,191,191,0.28)', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 }}>
          <AppText style={{ color: t.accentText, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>{pill}</AppText>
        </View>
      ) : null}
    </View>
  );
}

// A section heading with a small teal action pill on the right (the mockup's "Edit").
export function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <SectionLabel>{title}</SectionLabel>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          style={({ pressed }) => ({ marginBottom: 6, backgroundColor: t.accentSoft, borderColor: 'rgba(42,191,191,0.28)', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, opacity: pressed ? 0.65 : 1 })}>
          <AppText variant="small" style={{ color: t.accentText, fontWeight: '800' }}>{action.label}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

// Read-only facts about the member: a small grey label over the value, one fact per row.
export function InfoCard({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <ListGroup>
      {rows.map((r) => (
        <View key={r.label} style={{ paddingHorizontal: spacing.md, paddingVertical: 12, gap: 2 }}>
          <AppText variant="small" color="muted">{r.label}</AppText>
          <AppText style={{ fontWeight: '600' }}>{r.value}</AppText>
        </View>
      ))}
    </ListGroup>
  );
}

// A white knob in both states, as on the web. The browser build draws the "on" knob from `activeThumbColor` (a dark teal by
// default); that prop only exists in react-native-web, so it is passed through an untyped spread.
const WEB_KNOB = { activeThumbColor: '#ffffff' } as object;

export function SwitchRow({ title, subtitle, value, onChange }: { title: string; subtitle?: string; value: boolean; onChange: (next: boolean) => void }) {
  const t = useTheme();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      right={<Switch value={value} onValueChange={onChange} accessibilityLabel={title} trackColor={{ true: t.accent, false: t.cardMuted }} thumbColor="#ffffff" {...WEB_KNOB} />}
    />
  );
}

export function ThemeChoice({ value }: { value: ThemePreference }) {
  const save = useSaveTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Segmented value={value} onChange={(v) => save.mutate(v)} options={THEME_OPTIONS} />
      {save.isError ? <AppText variant="small" color="danger">Your choice is applied on this phone, but could not be saved to your profile yet.</AppText> : null}
    </View>
  );
}

export function ChangePasswordForm() {
  const change = useChangePassword();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const submit = () => {
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setMessage({ text: problem, ok: false });
      return;
    }
    setMessage(null);
    change.mutate(password, {
      onSuccess: () => {
        setPassword('');
        setConfirm('');
        setMessage({ text: 'Password updated.', ok: true });
      },
      onError: (e) => setMessage({ text: e instanceof Error ? e.message : 'Could not update your password.', ok: false }),
    });
  };

  return (
    <View style={{ gap: spacing.md, padding: spacing.md }}>
      <TextField label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
      <TextField label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
      {message ? <AppText variant="small" color={message.ok ? 'success' : 'danger'}>{message.text}</AppText> : null}
      <Button title={change.isPending ? 'Updating…' : 'Update password'} variant="secondary" onPress={submit} loading={change.isPending} disabled={!password || !confirm} />
    </View>
  );
}

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const change = useChangeEmail();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const submit = () => {
    const problem = validateNewEmail(email, currentEmail);
    if (problem) {
      setMessage({ text: problem, ok: false });
      return;
    }
    setMessage(null);
    change.mutate(email, {
      onSuccess: () => {
        setEmail('');
        setMessage({ text: 'Check both your old and new inbox: the change only takes effect once you confirm it with the link sent to the new address.', ok: true });
      },
      onError: (e) => setMessage({ text: e instanceof Error ? e.message : 'Could not update your email.', ok: false }),
    });
  };

  return (
    <View style={{ gap: spacing.md, padding: spacing.md }}>
      <AppText variant="small" color="muted">Currently: {currentEmail}</AppText>
      <TextField label="New email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" autoCorrect={false} />
      {message ? <AppText variant="small" color={message.ok ? 'success' : 'danger'}>{message.text}</AppText> : null}
      <Button title={change.isPending ? 'Sending…' : 'Update email'} variant="secondary" onPress={submit} loading={change.isPending} disabled={!email} />
    </View>
  );
}

// "Your coach will be notified and will handle deleting your account and data." The request is a flag on the profile; the
// coach sees it on their side. It is not instant, and the card says so.
export function DeletionCard({ requested, busy, error, onRequest, onCancel }: { requested: boolean; busy: boolean; error: string | null; onRequest: () => void; onCancel: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Card style={{ gap: spacing.sm }}>
      {requested ? (
        <>
          <AppText style={{ fontWeight: '700' }}>Deletion requested</AppText>
          <AppText variant="small" color="muted">Your coach has been notified and will handle deleting your account and data.</AppText>
          <View style={{ flexDirection: 'row' }}>
            <Button title="Cancel request" variant="secondary" onPress={onCancel} loading={busy} />
          </View>
        </>
      ) : (
        <>
          <AppText style={{ fontWeight: '700' }}>Delete my account</AppText>
          <AppText variant="small" color="muted">Your coach will be notified and will handle deleting your account and data. This isn&apos;t instant.</AppText>
          <Button title="Request account deletion" variant="secondary" onPress={() => setConfirming(true)} loading={busy} />
        </>
      )}
      {error ? <AppText variant="small" color="danger">{error}</AppText> : null}
      {confirming ? (
        <ConfirmSheet
          title="Request account deletion?"
          body="Your coach will be notified and will handle deleting your account and data. This isn't instant."
          confirmLabel="Request deletion"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onRequest();
          }}
        />
      ) : null}
    </Card>
  );
}
