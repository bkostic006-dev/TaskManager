import { NextResponse } from 'next/server';

// A healthcheck must answer from the running server, not from a build-time
// snapshot, so this route opts out of static generation.
export const dynamic = 'force-dynamic';

/** Liveness probe for the container healthcheck: 200 means this server is serving. */
export function GET() {
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
