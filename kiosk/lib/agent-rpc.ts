import { ParticipantKind, type Room } from 'livekit-client';

export function findAgentIdentity(room: Room | undefined): string | undefined {
  if (!room) {
    return undefined;
  }
  for (const participant of room.remoteParticipants.values()) {
    if (participant.kind === ParticipantKind.AGENT) {
      return participant.identity;
    }
  }
  const first = room.remoteParticipants.values().next();
  return first.done ? undefined : first.value.identity;
}

export async function setProduct(room: Room, barcode: string, identity?: string): Promise<void> {
  const dest = identity || findAgentIdentity(room);
  if (!dest) {
    throw new Error('agent not in room');
  }
  await room.localParticipant.performRpc({
    destinationIdentity: dest,
    method: 'set_product',
    payload: JSON.stringify({ barcode }),
  });
}
