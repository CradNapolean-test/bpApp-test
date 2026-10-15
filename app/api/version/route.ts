import { NextResponse } from 'next/server';
import { buildId } from '@/lib/appVersion';

// Which deployment is answering (R8). The app compares this with the one it was loaded from and offers an update. Not sensitive, and
// never cached: a stale answer would defeat the point.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ version: buildId() }, { headers: { 'Cache-Control': 'no-store' } });
}
