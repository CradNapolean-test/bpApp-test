import { LegalPageShell } from '../_components/LegalPageShell';
import { loadLegalDocument } from '@/lib/legalContent';

export const metadata = { title: 'Terms of Service' };

// The text is in content/legal/terms.md (H3).
export default async function TermsPage() {
  return <LegalPageShell doc={await loadLegalDocument('terms')} />;
}
