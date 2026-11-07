import { NextRequest, NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron-auth';
import { purgeExpired } from '@/lib/maintenance';
import { sendDueReminders } from '@/lib/platform';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Invoked daily by Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) return NextResponse.json({ message: 'Not found.' }, { status: 404 });
  // Plan reminders (14, 7 and 1 days before a plan ends) ride on the same daily job.
  return NextResponse.json({ ...(await purgeExpired()), ...(await sendDueReminders()) });
}
