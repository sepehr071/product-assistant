import { NextResponse } from 'next/server';
import {
  AccessToken,
  type AccessTokenOptions,
  RoomAgentDispatch,
  RoomConfiguration,
  type VideoGrant,
} from 'livekit-server-sdk';

const AGENT_NAME = process.env.AGENT_NAME || 'product-kiosk';

type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// don't cache the results
export const revalidate = 0;

export async function POST(req: Request) {
  const allowKiosk = process.env.ALLOW_KIOSK_TOKEN === '1';
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.IS_VERCEL_PREVIEW !== 'true' &&
    !allowKiosk
  ) {
    throw new Error(
      'THIS API ROUTE IS INSECURE. DO NOT USE THIS ROUTE IN PRODUCTION WITHOUT AN AUTHENTICATION LAYER.'
    );
  }

  try {
    if (LIVEKIT_URL === undefined) {
      throw new Error('LIVEKIT_URL is not defined');
    }
    if (API_KEY === undefined) {
      throw new Error('LIVEKIT_API_KEY is not defined');
    }
    if (API_SECRET === undefined) {
      throw new Error('LIVEKIT_API_SECRET is not defined');
    }

    const body = await req.json().catch(() => ({}));
    const roomConfig = buildRoomConfig(body);
    const participantName = body.participant_name || 'user';
    const participantIdentity =
      body.participant_identity || `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = body.room_name || `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName },
      roomName,
      roomConfig
    );
    const data = {
      serverUrl: LIVEKIT_URL,
      server_url: LIVEKIT_URL,
      roomName,
      room_name: roomName,
      participantName,
      participant_name: participantName,
      participantToken,
      participant_token: participantToken,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

function buildRoomConfig(body: { room_config?: unknown }): RoomConfiguration {
  let cfg: RoomConfiguration;
  try {
    cfg =
      body?.room_config && typeof body.room_config === 'object'
        ? RoomConfiguration.fromJson(body.room_config as never, { ignoreUnknownFields: true })
        : new RoomConfiguration();
  } catch {
    cfg = new RoomConfiguration();
  }
  // TokenSource POSTs proto JSON (`agent_name`). fromJson can drop it, which
  // dispatches an unnamed agent and product-kiosk never joins.
  const agents = cfg.agents ?? [];
  if (!agents.some((a) => a.agentName === AGENT_NAME)) {
    cfg.agents = [new RoomAgentDispatch({ agentName: AGENT_NAME })];
  }
  return cfg;
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  roomConfig: RoomConfiguration | undefined
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  if (roomConfig) {
    at.roomConfig = roomConfig;
  }

  return at.toJwt();
}
