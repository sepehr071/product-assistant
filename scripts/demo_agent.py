"""Scripted stand-in for the voice agent, used only to capture README screenshots.

No LLM and no API keys: it joins each new room on a local LiveKit dev server as an
agent participant, answers the kiosk's `set_product` RPC, publishes a synthetic
voice-like tone (so the visualizer moves) and streams a canned transcript whose
answers are copied from data/products/5901234123457.

    livekit-server --config lk.yaml          # port 4201, key devkey (see capture-screenshots.js)
    uv run --with livekit --with livekit-api --with numpy python scripts/demo_agent.py
"""

import asyncio
import json
import math

import numpy as np
from livekit import api, rtc

URL = "ws://127.0.0.1:4201"
HTTP = "http://127.0.0.1:4201"
KEY = "devkey"
SECRET = "secretsecretsecretsecretsecretsecret"
SR = 24000

SCRIPT = [
    ("agent", "Hi! You scanned Meadow Fresh Greek Yogurt Plain, 500 grams. Ask me about protein, sugar, allergens or diet fit."),
    ("user", "How much protein is in one serving?"),
    ("agent", "One 150 gram serving has 13.5 grams of protein and 146 kilocalories. That is high protein compared with many snack yogurts."),
    ("user", "I have a nut allergy. Is it safe for me?"),
    ("agent", "The pack says it contains milk and may contain traces of nuts from the packing line, so with a nut allergy it is safest to skip it or check with your doctor."),
]


class Voice:
    """Voice-like signal: a few harmonics shaped by a syllable envelope."""

    def __init__(self):
        self.source = rtc.AudioSource(SR, 1)
        self.speaking = False
        self.t = 0

    async def run(self):
        n = SR // 100
        while True:
            if self.speaking:
                tt = np.arange(self.t, self.t + n) / SR
                f0 = 150 + 25 * np.sin(2 * math.pi * 0.7 * tt)
                sig = sum(np.sin(2 * math.pi * f0 * k * tt) / k for k in (1, 2, 3, 4))
                env = np.clip(np.sin(2 * math.pi * 3.3 * tt) * 0.8 + np.sin(2 * math.pi * 1.1 * tt) * 0.4, 0, 1)
                data = (sig * env * 6000).astype(np.int16)
            else:
                data = np.zeros(n, dtype=np.int16)
            self.t += n
            await self.source.capture_frame(rtc.AudioFrame(data.tobytes(), SR, 1, n))


async def say(room, voice, track_sid, who, text, user_identity):
    lp = room.local_participant
    if who == "agent":
        await lp.set_attributes({"lk.agent.state": "speaking"})
        voice.speaking = True
    writer = await lp.stream_text(
        topic="lk.transcription",
        attributes={
            "lk.segment_id": f"SG_{abs(hash(text)) % 10**8}",
            "lk.transcribed_track_id": track_sid if who == "agent" else "",
            "lk.transcription_final": "true",
        },
        sender_identity=None if who == "agent" else user_identity,
    )
    for i, word in enumerate(text.split(" ")):
        await writer.write(("" if i == 0 else " ") + word)
        await asyncio.sleep(0.18)
    await writer.aclose()
    voice.speaking = False
    await lp.set_attributes({"lk.agent.state": "listening" if who == "agent" else "thinking"})
    await asyncio.sleep(1.2)


async def serve(room_name):
    token = (
        api.AccessToken(KEY, SECRET)
        .with_identity(f"agent-{room_name}")
        .with_name("Product Talk")
        .with_kind("agent")
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_publish_data=True,
                can_subscribe=True,
                can_update_own_metadata=True,
            )
        )
        .to_jwt()
    )
    room = rtc.Room()
    await room.connect(URL, token)
    voice = Voice()
    track = rtc.LocalAudioTrack.create_audio_track("agent-voice", voice.source)
    pub = await room.local_participant.publish_track(
        track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
    )
    asyncio.create_task(voice.run())
    started = asyncio.Event()

    @room.local_participant.register_rpc_method("set_product")
    async def set_product(data: rtc.RpcInvocationData):
        barcode = json.loads(data.payload).get("barcode", "")
        await room.local_participant.set_attributes({"product.barcode": barcode})
        if not started.is_set():
            started.set()

            async def convo():
                await asyncio.sleep(0.8)
                for who, text in SCRIPT:
                    await say(room, voice, pub.sid, who, text, data.caller_identity)
                # Hold a speaking state so the talking view can be captured.
                await room.local_participant.set_attributes({"lk.agent.state": "speaking"})
                voice.speaking = True

            asyncio.create_task(convo())
        return "ok"

    # Register the RPC before announcing a state: the kiosk calls set_product
    # as soon as the agent looks connected.
    await room.local_participant.set_attributes({"lk.agent.state": "listening"})
    print("joined", room_name, flush=True)


async def main():
    lk = api.LiveKitAPI(HTTP, KEY, SECRET)
    seen = set()
    while True:
        for r in (await lk.room.list_rooms(api.ListRoomsRequest())).rooms:
            if r.name not in seen and r.num_participants > 0:
                seen.add(r.name)
                asyncio.create_task(serve(r.name))
        await asyncio.sleep(0.3)


if __name__ == "__main__":
    asyncio.run(main())
