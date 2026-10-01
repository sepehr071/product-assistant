import os
from dataclasses import dataclass
from pathlib import Path

import pytest

from agent import KioskState, ProductAgent, apply_scan
from catalog import FolderCatalog

ROOT = Path(__file__).resolve().parents[2] / "data" / "products"
YOGURT = "5901234123457"


def test_apply_scan_sets_userdata() -> None:
    state = KioskState(catalog=FolderCatalog(ROOT))
    product = apply_scan(state, YOGURT)
    assert product is not None
    assert state.product is product
    assert state.barcode == YOGURT


def test_apply_scan_unknown() -> None:
    state = KioskState(catalog=FolderCatalog(ROOT))
    product = apply_scan(state, "0000000000000")
    assert product is None
    assert state.product is None
    assert state.barcode == "0000000000000"


@pytest.mark.asyncio
async def test_get_scanned_product_tool_reads_state() -> None:
    agent = ProductAgent(FolderCatalog(ROOT))
    state = KioskState(catalog=agent.catalog)
    apply_scan(state, YOGURT)

    @dataclass
    class _Ctx:
        userdata: KioskState

    text = await agent.get_scanned_product(_Ctx(userdata=state))  # type: ignore[arg-type]
    assert "Greek Yogurt" in text
    assert "protein" in text.lower()


@pytest.mark.asyncio
async def test_search_tool_without_scan() -> None:
    agent = ProductAgent(FolderCatalog(ROOT))
    state = KioskState(catalog=agent.catalog)

    @dataclass
    class _Ctx:
        userdata: KioskState

    text = await agent.search_product_text(_Ctx(userdata=state), "protein")  # type: ignore[arg-type]
    assert "No product" in text


@pytest.mark.skipif(
    not os.environ.get("LIVEKIT_URL") or not os.environ.get("LIVEKIT_API_KEY"),
    reason="LiveKit credentials required for AgentSession evals",
)
@pytest.mark.asyncio
async def test_agent_calls_product_tool_for_protein() -> None:
    from livekit.agents import AgentSession, inference

    catalog = FolderCatalog(ROOT)
    agent = ProductAgent(catalog)
    state = KioskState(catalog=catalog)
    apply_scan(state, YOGURT)

    async with (
        inference.LLM(model="openai/gpt-4.1-mini") as llm,
        AgentSession(llm=llm, userdata=state) as session,
    ):
        await session.start(agent)
        result = await session.run(
            user_input="How much protein does this yogurt have per 100 grams?"
        )
        result.expect.contains_function_call(name="get_scanned_product")
        await (
            result.expect.next_event(type="message")
            .judge(
                llm,
                intent="States protein around 9 grams per 100 grams from the pack, not a guess.",
            )
        )
