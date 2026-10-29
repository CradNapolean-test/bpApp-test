import { View } from 'react-native';

import type { CreditsLedgerRow } from '@ballistic/shared/data/types';
import { isoDateInTz } from '@ballistic/shared/utils/dates';

import { AppText, Button, Card, ScrollScreen } from '@/components/ui';
import { useCreditBuckets, useCreditLedger } from '@/lib/classes';
import { timezoneOf, useClientProfile, useCredits, useNow } from '@/lib/today';
import { spacing, useTheme } from '@/theme';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function LedgerRow({ row }: { row: CreditsLedgerRow }) {
  const t = useTheme();
  const positive = row.delta > 0;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.border }}>
      <View style={{ flexShrink: 1 }}>
        <AppText numberOfLines={2}>{row.reason}</AppText>
        <AppText variant="small" color="muted">
          {shortDate(row.created_at)} · {row.bucket === 'membership' ? 'weekly allowance' : 'bonus'}
          {row.expires_at && positive && !row.expired_at ? ` · expires ${shortDate(row.expires_at)}` : ''}
        </AppText>
      </View>
      <AppText style={{ fontWeight: '800', color: positive ? t.success : t.foreground }}>{positive ? `+${row.delta}` : row.delta}</AppText>
    </View>
  );
}

export default function Credits() {
  const t = useTheme();
  const now = useNow(60_000);
  const profile = useClientProfile().data;
  const todayIso = isoDateInTz(now, timezoneOf(profile));
  const credits = useCredits();
  const buckets = useCreditBuckets();
  const ledger = useCreditLedger();
  const membership = credits.data?.membership ?? null;
  const pkg = membership?.package ?? null;
  const balance = credits.data?.balance ?? 0;
  const rows = ledger.data?.pages.flat() ?? [];

  return (
    <ScrollScreen refreshing={ledger.isRefetching} onRefresh={() => { credits.refetch(); buckets.refetch(); ledger.refetch(); }}>
      <View style={{ backgroundColor: t.accent, borderRadius: 16, padding: spacing.md, gap: 2 }}>
        <AppText variant="small" style={{ color: t.accentForeground, opacity: 0.85 }}>Credits available</AppText>
        <AppText style={{ color: t.accentForeground, fontSize: 32, fontWeight: '800' }}>{plural(balance, 'credit')}</AppText>
        {buckets.data ? <AppText variant="small" style={{ color: t.accentForeground, opacity: 0.8 }}>{buckets.data.membership} from your weekly allowance · {buckets.data.bonus} bonus</AppText> : null}
        {pkg ? <AppText variant="small" style={{ color: t.accentForeground, opacity: 0.8 }}>Your weekly allowance resets every Saturday.</AppText> : null}
      </View>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="small" color="muted" style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Your membership</AppText>
        {pkg ? (
          <>
            <AppText variant="heading">{pkg.name}</AppText>
            {pkg.description ? <AppText color="muted">{pkg.description}</AppText> : null}
            <View>
              {[
                ['Weekly allowance', `${plural(pkg.credits_per_week, 'credit')}, reset Saturdays`],
                ...(pkg.advance_booking_days != null ? [['Book up to', `${pkg.advance_booking_days} days ahead`]] : []),
                ...(membership?.started_at && membership.started_at > todayIso ? [['Starts', longDate(membership.started_at)]] : []),
                ...(membership?.scheduled_end ? [['Ends', longDate(membership.scheduled_end)]] : []),
                ...(membership?.started_at ? [['Member since', longDate(membership.started_at)]] : []),
              ].map(([label, value]) => (
                <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: t.border }}>
                  <AppText color="muted">{label}</AppText>
                  <AppText style={{ fontWeight: '700' }}>{value}</AppText>
                </View>
              ))}
            </View>
          </>
        ) : (
          <AppText color="muted">No membership plan is set up on your account yet. Ask your coach.</AppText>
        )}
      </Card>

      <Card style={{ gap: 0 }}>
        <AppText variant="heading" style={{ marginBottom: spacing.xs }}>History</AppText>
        {ledger.isPending ? <AppText color="muted">Loading…</AppText> : null}
        {ledger.isError ? <AppText color="danger">Could not load your history.</AppText> : null}
        {ledger.isSuccess && rows.length === 0 ? <AppText color="muted">Nothing yet.</AppText> : null}
        {rows.map((r) => <LedgerRow key={r.id} row={r} />)}
        {ledger.hasNextPage ? <View style={{ marginTop: spacing.sm }}><Button title="Load more" variant="secondary" loading={ledger.isFetchingNextPage} onPress={() => ledger.fetchNextPage()} /></View> : null}
      </Card>
    </ScrollScreen>
  );
}
