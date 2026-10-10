import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { purgeExpired } from '@/lib/maintenance';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Invoked daily by Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
export async function GET(req: NextRequest) {
  if (!authorized(req.headers.get('authorization'))) return NextResponse.json({ message: 'Not found.' }, { status: 404 });
  return NextResponse.json(await purgeExpired());
}
