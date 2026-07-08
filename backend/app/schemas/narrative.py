from datetime import datetime

from pydantic import BaseModel


class WeeklyNarrativeResponse(BaseModel):
    narrative: str
    highlights: list[str]
    generated_at: datetime
    cached: bool
