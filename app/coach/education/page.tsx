import { redirect } from 'next/navigation';

// Education folded into Library (see LibraryHubShell) -- keep old bookmarks/links working.
export default function CoachEducationPage() {
  redirect('/coach/library?tab=education');
}
