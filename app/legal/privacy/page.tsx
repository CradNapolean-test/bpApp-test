import { LegalPageShell } from '../_components/LegalPageShell';
import { loadLegalDocument } from '@/lib/legalContent';

export const metadata = { title: 'Privacy Policy' };

// The text is in content/legal/privacy.md (H3).
export default async function PrivacyPolicyPage() {
  return <LegalPageShell doc={await loadLegalDocument('privacy')} />;
}
