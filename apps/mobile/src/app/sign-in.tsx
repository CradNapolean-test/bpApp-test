import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Pressable } from '@/components/press';
import { BrandMark } from '@/components/brand';
import { AppText, Button, Screen, TextField } from '@/components/ui';
import { useSession } from '@/lib/session';
import { spacing } from '@/theme';

export default function SignIn() {
  const { signIn } = useSession();
  // The sign-up page's "Open the app" button passes the email they just registered with (ballistic://sign-in?email=...).
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(() => (typeof params.email === 'string' ? params.email.trim() : ''));
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const message = await signIn(email, password);
    // On success the route guard in the root layout swaps to the app by itself.
    if (message) setError(message);
    setBusy(false);
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs, marginBottom: spacing.md, alignItems: 'flex-start' }}>
            <BrandMark height={72} />
            <AppText variant="title" style={{ marginTop: spacing.sm }}>Ballistic Performance</AppText>
            <AppText color="muted">Sign in to your member account</AppText>
          </View>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={submit}
          />
          {error ? <AppText color="danger">{error}</AppText> : null}
          <Button title="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/reset-password', params: email.trim() ? { email: email.trim() } : {} })}
            style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
            <AppText color="accent" style={{ fontWeight: '600' }}>Forgot your password?</AppText>
          </Pressable>
          <AppText variant="small" color="muted" style={{ textAlign: 'center' }}>New here? Use the sign-up link your coach sent you.</AppText>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
