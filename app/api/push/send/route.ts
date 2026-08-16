import { NextResponse } from 'next/server';
import { sendPushToClient } from '@/lib/push';

// Thin authenticated wrapper around lib/push.ts's sendPushToClient. Not called by the one
// trigger wired in this pass (app/api/cron/checkin-reminders/route.ts calls sendPushToClient
// directly, same server process, no need for a network hop) -- this exists as the extension
// point for generalizing push to every other notification-triggering RPC later (see
// GAP_ROADMAP.md), and for manual testing.
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.PUSH_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const clientId: string | undefined = body?.clientId;
  const title: string | undefined = body?.title;
  const messageBody: string | undefined = body?.body;
  if (!clientId || !title || !messageBody) {
    return NextResponse.json({ error: 'clientId, title, and body are required' }, { status: 400 });
  }

  const result = await sendPushToClient(clientId, { title, body: messageBody, url: body?.url });
  return NextResponse.json(result);
}
