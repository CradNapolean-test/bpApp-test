import { redirect } from 'next/navigation';

// Forms folded into Library (see LibraryHubShell) -- keep old bookmarks/links working.
export default function CoachFormsPage() {
  redirect('/coach/library?tab=forms');
}
