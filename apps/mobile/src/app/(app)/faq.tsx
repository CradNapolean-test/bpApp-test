import { FAQS } from '@ballistic/shared/utils/community';

import { FaqList } from '@/components/community';
import { ScrollScreen } from '@/components/ui';

// Frequently asked questions. (The Terms and Privacy links come once the app has a web address to point them at.)
export default function Faq() {
  return (
    <ScrollScreen>
      <FaqList items={FAQS} />
    </ScrollScreen>
  );
}
