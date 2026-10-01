import { NextResponse } from 'next/server';

export const revalidate = 0;

export async function GET() {
  const livekit = Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET
  );
  return NextResponse.json({ livekit });
}
