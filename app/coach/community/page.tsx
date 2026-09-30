import { redirect } from 'next/navigation';

// Community moved into Business (events, rewards, feedback) -- keep old links working.
export default function CoachCommunityPage() {
  redirect('/coach/business?tab=events');
}
