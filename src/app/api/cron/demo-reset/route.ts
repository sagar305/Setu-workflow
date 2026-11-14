import { NextRequest, NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron-auth';
import { isDemo } from '@/lib/demo';
import { resetDemo } from '@/lib/demo-reset';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Reseeding makes a few thousand queries; give it room on a cold database.
export const maxDuration = 300;
// Called every 12 hours by .github/workflows/demo-reset.yml. Only exists on a DEMO_MODE deployment.
async function handle(req: NextRequest) {
  if (!isDemo() || !cronAuthorized(req.headers.get('authorization')))
    return NextResponse.json({ message: 'Not found.' }, { status: 404 });
  try {
    return NextResponse.json(await resetDemo());
  } catch (error) {
    console.error('Demo reset failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ message: 'Demo reset failed.' }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
