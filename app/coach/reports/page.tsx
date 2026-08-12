import { redirect } from 'next/navigation';

// Reports folded into Classes (see ClassesHubShell) -- keep old bookmarks/links working.
export default function CoachReportsPage() {
  redirect('/coach/classes?tab=reports');
}
