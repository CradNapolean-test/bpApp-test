import { useState } from 'react';
import { View } from 'react-native';

import { FEEDBACK_COMMENT_MAX } from '@ballistic/shared/utils/community';

import { StarRating } from '@/components/community';
import { Input } from '@/components/fields';
import { AppText, Button, Card, ScrollScreen } from '@/components/ui';
import { useSubmitFeedback } from '@/lib/community';
import { spacing } from '@/theme';

// "How are we doing?": a star rating and an optional comment for the gym.
export default function Feedback() {
  const send = useSubmitFeedback();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  function submit() {
    send.mutate(
      { rating, comment },
      {
        onSuccess: () => {
          setSent(true);
          setRating(0);
          setComment('');
        },
      },
    );
  }

  return (
    <ScrollScreen>
      <Card style={{ gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <AppText style={{ fontWeight: '800', fontSize: 17 }}>How are we doing?</AppText>
          <AppText variant="small" color="muted">Rate your experience at Ballistic Performance and tell us what we can do better.</AppText>
        </View>
        <StarRating value={rating} onChange={(n) => { setRating(n); setSent(false); }} />
        <Input
          accessibilityLabel="Your comment (optional)"
          multiline
          style={{ minHeight: 110 }}
          maxLength={FEEDBACK_COMMENT_MAX}
          value={comment}
          onChangeText={(v) => { setComment(v); setSent(false); }}
          placeholder="Anything you'd like to add? (optional)"
        />
        {send.isError ? <AppText color="danger">{send.error.message}</AppText> : null}
        {sent ? <AppText color="success" style={{ fontWeight: '700' }}>Thanks for your feedback!</AppText> : null}
        <Button title={send.isPending ? 'Sending…' : sent ? 'Sent ✓' : 'Send feedback'} onPress={submit} loading={send.isPending} disabled={rating === 0 || sent} />
      </Card>
    </ScrollScreen>
  );
}
