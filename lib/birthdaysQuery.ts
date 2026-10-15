import { fetchAllPages, type PageResult } from '@/lib/paging';

// Everyone with a date of birth, read page by page (CM6). The database returns at most 1,000 rows per request and says nothing when it
// stops there, so a single query silently dropped every member past row 1,000 and they never got a birthday message. `page` must read
// in a stable order (the route orders by client_id) so pages do not overlap or skip.

export interface BirthdayCandidate {
  client_id: string;
  name: string | null;
  date_of_birth: string;
  timezone: string | null;
  email_notifications_enabled: boolean | null;
  notifications_enabled: boolean | null;
}

export function loadBirthdayCandidates(page: (from: number, to: number) => PromiseLike<PageResult<BirthdayCandidate>>) {
  return fetchAllPages<BirthdayCandidate>(page);
}
