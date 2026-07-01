"""Config + schema wiring for the Merchant Copilot."""
from app.core.config import settings
from app.schemas.copilot import CopilotRequest, CopilotResponse, ToolCallTrace


def test_copilot_config_defaults():
    assert settings.COPILOT_MODEL == "claude-opus-4-8"
    assert settings.COPILOT_MAX_ITERATIONS == 5
    assert settings.COPILOT_EFFORT == "medium"


def test_copilot_request_accepts_question():
    req = CopilotRequest(question="What was my revenue last month?")
    assert req.question == "What was my revenue last month?"


def test_copilot_response_shape():
    resp = CopilotResponse(
        answer="You made $100.",
        tool_calls=[ToolCallTrace(tool="get_revenue_summary", input={"period_days": 30}, result={"revenue": "100.00"})],
    )
    assert resp.answer == "You made $100."
    assert resp.tool_calls[0].tool == "get_revenue_summary"
