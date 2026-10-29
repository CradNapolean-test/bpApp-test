import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { validateNewPassword } from '@ballistic/shared/utils/account';
import { cleanResetCode, recoveryTokenFrom, resendWait, validateResetCode, validateResetEmail } from '@ballistic/shared/utils/passwordReset';

import { Pressable } from '@/components/press';
import { AppText, Button, ScrollScreen, TextField } from '@/components/ui';
import { requestResetCode, setNewPassword, verifyResetCode, verifyResetLink } from '@/lib/passwordReset';
import { useSession } from '@/lib/session';
import { spacing } from '@/theme';

type Step = 'email' | 'code' | 'password' | 'link' | 'done';

// Forgot password: email -> the code from the email -> a new password. A ballistic://reset-password?token_hash=... link
// skips the first two steps. This route sits outside the signed-in / signed-out guards on purpose: checking the code
// signs the member in, and they must stay on this screen until the new password is saved.
export default function ResetPassword() {
  const params = useLocalSearchParams<{ email?: string; token_hash?: string; type?: string }>();
  const linkToken = recoveryTokenFrom(params);
  const { session } = useSession();

  const [step, setStep] = useState<Step>(linkToken ? 'link' : 'email');
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Ticks only while a "send a new code" countdown is running.
  const wait = resendWait(sentAt, now);
  const counting = wait > 0;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [counting]);

  async function run(task: () => Promise<string | null>, onOk: () => void) {
    setBusy(true);
    setError(null);
    const message = await task();
    setBusy(false);
    if (message) setError(message);
    else onOk();
  }

  function sendCode() {
    const problem = validateResetEmail(email);
    if (problem) return setError(problem);
    run(() => requestResetCode(email), () => {
      setSentAt(Date.now());
      setNow(Date.now());
      setCode('');
      setStep('code');
    });
  }

  function checkCode() {
    const problem = validateResetCode(code);
    if (problem) return setError(problem);
    run(() => verifyResetCode(email, cleanResetCode(code)), () => setStep('password'));
  }

  function continueFromLink() {
    if (!linkToken) return;
    run(() => verifyResetLink(linkToken), () => setStep('password'));
  }

  function savePassword() {
    const problem = validateNewPassword(password, confirm);
    if (problem) return setError(problem);
    run(() => setNewPassword(password), () => setStep('done'));
  }

  function backToSignIn() {
    if (router.canGoBack()) router.back();
    else router.replace('/sign-in');
  }

  return (
    <ScrollScreen>
      <View style={{ gap: spacing.md, paddingTop: spacing.lg }}>
        <AppText variant="title">{step === 'done' ? 'Password changed' : 'Reset your password'}</AppText>

        {step === 'email' ? (
          <>
            <AppText color="muted">Enter the email you sign in with and we will email you a code.</AppText>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              onSubmitEditing={sendCode}
            />
            <Button title="Send code" onPress={sendCode} loading={busy} disabled={!email.trim()} />
          </>
        ) : null}

        {step === 'code' ? (
          <>
            <AppText color="muted">
              If an account uses {email.trim()}, we have sent it a code. It can take a few minutes, and it may land in spam.
            </AppText>
            <TextField
              label="Code from the email"
              value={code}
              onChangeText={(v) => setCode(cleanResetCode(v))}
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={12}
              onSubmitEditing={checkCode}
            />
            <Button title="Check code" onPress={checkCode} loading={busy} disabled={code.length === 0} />
            <LinkButton title={wait > 0 ? `Send a new code (${wait}s)` : 'Send a new code'} disabled={wait > 0 || busy} onPress={sendCode} />
            <LinkButton title="Use a different email" onPress={() => { setError(null); setStep('email'); }} />
          </>
        ) : null}

        {step === 'link' ? (
          <>
            <AppText color="muted">
              {session
                ? 'You are signed in on this phone. Continuing signs you out first, then lets you choose a new password for the account this link belongs to.'
                : 'This link lets you choose a new password.'}
            </AppText>
            <Button title="Continue" onPress={continueFromLink} loading={busy} />
          </>
        ) : null}

        {step === 'password' ? (
          <>
            <AppText color="muted">Choose a new password, at least 8 characters.</AppText>
            <TextField
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
            />
            <TextField
              label="Repeat new password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={savePassword}
            />
            <Button title="Save new password" onPress={savePassword} loading={busy} disabled={!password || !confirm} />
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <AppText color="muted">Your password has been changed and you are signed in.</AppText>
            <Button title="Continue" onPress={() => router.replace('/')} />
          </>
        ) : null}

        {error ? <AppText color="danger">{error}</AppText> : null}

        {step === 'email' || step === 'code' || step === 'link' ? <LinkButton title="Back to sign in" onPress={backToSignIn} /> : null}
      </View>
    </ScrollScreen>
  );
}

function LinkButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={{ alignItems: 'center', paddingVertical: spacing.sm, opacity: disabled ? 0.5 : 1 }}>
      <AppText color="accent" style={{ fontWeight: '600' }}>{title}</AppText>
    </Pressable>
  );
}
