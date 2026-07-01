from pydantic import BaseModel, Field


class CopilotRequest(BaseModel):
    question: str = Field(max_length=1000)


class ToolCallTrace(BaseModel):
    tool: str
    input: dict
    result: dict


class CopilotResponse(BaseModel):
    answer: str
    tool_calls: list[ToolCallTrace]
