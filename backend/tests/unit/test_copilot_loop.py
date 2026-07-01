"""Agentic loop behaviour — scripted fake LLM, monkeypatched handlers, no DB."""
import pytest

from app.services import copilot
from app.services.copilot import LLMBlock, LLMResponse, set_llm


@pytest.fixture(autouse=True)
def _reset():
    yield
    set_llm(None)


def _scripted(*responses):
    """Return an async llm-turn fn that yields the given responses in order."""
    calls = {"i": 0}

    async def _turn(messages, tools):
        r = responses[calls["i"]]
        calls["i"] += 1
        return r

    return _turn


@pytest.mark.asyncio
async def test_text_only_answer_terminates():
    set_llm(_scripted(LLMResponse("end_turn", [LLMBlock(type="text", text="Hello merchant.")])))
    result = await copilot.answer_question(None, None, "hi")
    assert result.answer == "Hello merchant."
    assert result.tool_calls == []


@pytest.mark.asyncio
async def test_tool_call_round_then_answer(monkeypatch):
    async def _echo(db, merchant, args):
        return {"echoed": args}

    monkeypatch.setitem(copilot.TOOL_HANDLERS, "echo", _echo)
    set_llm(_scripted(
        LLMResponse("tool_use", [LLMBlock(type="tool_use", id="t1", name="echo", input={"x": 1})]),
        LLMResponse("end_turn", [LLMBlock(type="text", text="Done.")]),
    ))
    result = await copilot.answer_question(None, None, "call echo")
    assert result.answer == "Done."
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].tool == "echo"
    assert result.tool_calls[0].result == {"echoed": {"x": 1}}


@pytest.mark.asyncio
async def test_unknown_tool_returns_error_result_and_recovers(monkeypatch):
    set_llm(_scripted(
        LLMResponse("tool_use", [LLMBlock(type="tool_use", id="t1", name="does_not_exist", input={})]),
        LLMResponse("end_turn", [LLMBlock(type="text", text="Recovered.")]),
    ))
    result = await copilot.answer_question(None, None, "call missing")
    assert result.answer == "Recovered."
    assert "error" in result.tool_calls[0].result


@pytest.mark.asyncio
async def test_refusal_is_handled_gracefully():
    set_llm(_scripted(LLMResponse("refusal", [])))
    result = await copilot.answer_question(None, None, "bad")
    assert result.answer  # non-empty graceful message
    assert result.tool_calls == []


@pytest.mark.asyncio
async def test_iteration_cap_terminates(monkeypatch):
    async def _echo(db, merchant, args):
        return {"ok": True}

    monkeypatch.setitem(copilot.TOOL_HANDLERS, "echo", _echo)
    # Always ask for a tool → loop must stop at COPILOT_MAX_ITERATIONS.
    always_tool = LLMResponse("tool_use", [LLMBlock(type="tool_use", id="t", name="echo", input={})])

    async def _turn(messages, tools):
        return always_tool

    set_llm(_turn)
    result = await copilot.answer_question(None, None, "loop forever")
    assert result.answer  # fallback message, no hang
