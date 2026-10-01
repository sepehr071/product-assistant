from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    cli,
    function_tool,
)
from livekit.plugins import silero
from livekit.plugins.openai.realtime import GPTLiveModel

from catalog import FolderCatalog, normalize_barcode
from product import Product

logger = logging.getLogger("product-kiosk")

_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env.local")
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")

VOICE_INSTRUCTIONS = """
You are the voice of a grocery product on a store kiosk.
Customers just scanned a barcode. Speak in short sentences. One or two sentences per turn.
No lists, markdown, or emoji.

Delegate any question about nutrition, ingredients, allergens, protein, sugar, carbs, or diet
(including diabetes) to the backend, and say you are checking the pack while you wait.
Answer greetings and "what is this?" from the scanned product name yourself.

Never invent numbers. If the pack does not list something, say so.
You are not a doctor. For diabetes or medical diet questions, read the pack facts and tell
the customer to follow their clinician. Do not say a food is safe or unsafe as treatment.
""".strip()

BACKEND_INSTRUCTIONS = """
You handle work the voice model delegates. Use tools. Answer only from tool results.
Keep the result to a few short spoken sentences the voice model can read out.
If a fact is missing from the pack files, say the pack does not list it.
For diabetes questions, report sugar, carbohydrate, fibre, and protein from the files,
then add that this is not medical advice.
""".strip()


@dataclass
class KioskState:
    barcode: str | None = None
    product: Product | None = None
    catalog: FolderCatalog = field(default_factory=FolderCatalog)


class ProductAgent(Agent):
    def __init__(self, catalog: FolderCatalog | None = None) -> None:
        super().__init__(instructions=VOICE_INSTRUCTIONS)
        self.catalog = catalog or FolderCatalog()

    @function_tool()
    async def get_scanned_product(self, context: RunContext[KioskState]) -> str:
        """Return facts for the product the customer just scanned.

        Call this for nutrition, ingredients, allergens, protein, sugar, carbs, or diet questions
        about the current item.
        """
        product = context.userdata.product
        if product is None:
            return "No product is scanned yet. Ask the customer to scan a barcode."
        return product.compact_card()

    @function_tool()
    async def lookup_barcode(self, context: RunContext[KioskState], barcode: str) -> str:
        """Look up a product by barcode digits if the customer reads a code aloud."""
        product = self.catalog.get(barcode)
        if product is None:
            return f"No product is on file for barcode {barcode}."
        context.userdata.barcode = product.barcode
        context.userdata.product = product
        return product.compact_card()

    @function_tool()
    async def search_product_text(
        self, context: RunContext[KioskState], query: str
    ) -> str:
        """Search the scanned product's pack files for a topic such as protein, sugar, or gluten."""
        barcode = context.userdata.barcode
        if not barcode:
            return "No product is scanned yet."
        return self.catalog.search(barcode, query)


def apply_scan(state: KioskState, barcode: str) -> Product | None:
    code = normalize_barcode(barcode)
    if code is None:
        state.barcode = None
        state.product = None
        return None
    product = state.catalog.get(code)
    state.barcode = code
    state.product = product
    return product


def _announce_scan(agent: ProductAgent, session: AgentSession[KioskState], product: Product | None, barcode: str) -> None:
    duplex = getattr(agent, "duplex_session", None)
    if product is None:
        line = f"Barcode {barcode} is not in the store catalog. Ask the customer to try another item."
        card = line
    else:
        line = (
            f"The customer just scanned {product.name}. Greet them, name the product, "
            "and wait for a question."
        )
        card = product.compact_card()
    if duplex is not None:
        duplex.append_thinking(card)
        duplex.append_commentary(line)
        return
    session.generate_reply(instructions=line)


AGENT_NAME = "product-kiosk"

server = AgentServer(
    port=int(os.environ.get("WORKER_PORT", "8082")),
    num_idle_processes=1,
)


def prewarm(proc) -> None:
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name=AGENT_NAME)
async def product_kiosk(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}
    logger.info("job start room=%s", ctx.room.name)
    # Join immediately so the kiosk does not time out while GPT-Live opens.
    await ctx.connect()

    catalog = FolderCatalog()
    state = KioskState(catalog=catalog)
    agent = ProductAgent(catalog=catalog)
    vad = ctx.proc.userdata.get("vad") or silero.VAD.load()

    session = AgentSession[KioskState](
        llm=GPTLiveModel(
            voice=os.getenv("OPENAI_LIVE_VOICE", "marin"),
            responses_options={
                "model": "gpt-5.6-luna",
                "instructions": BACKEND_INSTRUCTIONS,
                "reasoning": {"effort": "low"},
                "max_output_tokens": 400,
            },
        ),
        vad=vad,
        userdata=state,
    )

    @session.on("error")
    def _on_session_error(ev: object) -> None:
        logger.error("session error: %s", ev)

    await session.start(agent=agent, room=ctx.room)

    @ctx.room.local_participant.register_rpc_method("set_product")
    async def handle_set_product(data: rtc.RpcInvocationData) -> str:
        try:
            payload = json.loads(data.payload or "{}")
        except json.JSONDecodeError:
            payload = {"barcode": data.payload}
        barcode = str(payload.get("barcode", "")).strip()
        logger.info("set_product barcode=%s", barcode)
        product = apply_scan(session.userdata, barcode)
        attrs = {
            "product.ean": product.barcode if product else barcode,
            "product.name": product.name if product else "",
            "product.found": "true" if product else "false",
        }
        await ctx.room.local_participant.set_attributes(attrs)
        _announce_scan(agent, session, product, barcode)
        if product is None:
            return json.dumps({"ok": False, "barcode": barcode, "error": "not_found"})
        return json.dumps(
            {
                "ok": True,
                "barcode": product.barcode,
                "name": product.name,
                "brand": product.brand,
                "category": product.category,
            }
        )

    await session.generate_reply(
        instructions="If a product is already scanned, greet the customer with its name. "
        "Otherwise ask them to scan a product."
    )


if __name__ == "__main__":
    cli.run_app(server)
