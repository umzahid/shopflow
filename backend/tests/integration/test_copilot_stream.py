"""POST /merchant/copilot/stream — SSE streaming with a scripted fake LLM."""
import json

import pytest

from app.services.copilot import LLMBlock, LLMResponse, set_llm_stream

from tests.integration.helpers import bearer, register_customer, register_merchant


def _stream_script(*turns):
    """Build a streaming turn fn. Each turn is (list_of_deltas, LLMResponse):
    the fn yields ('delta', text) for each delta then ('final', response)."""
    calls = {"i": 0}

    async def _turn(messages, tools):
        deltas, final = turns[calls["i"]]
        calls["i"] += 1
        for d in deltas:
            yield ("delta", d)
        yield ("final", final)

    return _turn


def _parse_sse(text: str) -> list[dict]:
    events = []
    for block in text.strip().split("\n\n"):
        line = block.strip()
        if line.startswith("data:"):
            events.append(json.loads(line[len("data:"):].strip()))
    return events


@pytest.mark.asyncio
async def test_copilot_stream_requires_merchant_role(client):
    ctoken, _ = await register_customer(client, "c-cps-role@e.com")
    res = await client.post(
        "/api/v1/merchant/copilot/stream", json={"question": "hi"}, headers=bearer(ctoken)
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_copilot_stream_emits_deltas_and_done(client):
    mtoken, _ = await register_merchant(client, "m-cps-happy@e.com")
    # One text turn that streams "Hello" + " world" then ends.
    set_llm_stream(_stream_script(
        (["Hello", " world"], LLMResponse("end_turn", [LLMBlock(type="text", text="Hello world")])),
    ))
    res = await client.post(
        "/api/v1/merchant/copilot/stream", json={"question": "hi"}, headers=bearer(mtoken)
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(res.text)
    deltas = [e["text"] for e in events if e["type"] == "delta"]
    assert "".join(deltas) == "Hello world"
    assert events[-1]["type"] == "done"


@pytest.mark.asyncio
async def test_copilot_stream_reports_tool_calls(client):
    mtoken, _ = await register_merchant(client, "m-cps-tool@e.com")
    set_llm_stream(_stream_script(
        ([], LLMResponse("tool_use", [
            LLMBlock(type="tool_use", id="t1", name="get_order_stats", input={})
        ])),
        (["All ", "done."], LLMResponse("end_turn", [LLMBlock(type="text", text="All done.")])),
    ))
    res = await client.post(
        "/api/v1/merchant/copilot/stream", json={"question": "order stats?"}, headers=bearer(mtoken)
    )
    assert res.status_code == 200
    events = _parse_sse(res.text)
    assert any(e["type"] == "tool" and e["tool"] == "get_order_stats" for e in events)
    done = events[-1]
    assert done["type"] == "done"
    assert done["tool_calls"] == ["get_order_stats"]
    assert "".join(e["text"] for e in events if e["type"] == "delta") == "All done."
