from enum import Enum

from pydantic import BaseModel, Field


class ToneEnum(str, Enum):
    professional = "professional"
    playful = "playful"
    luxury = "luxury"
    minimal = "minimal"


class LengthEnum(str, Enum):
    short = "short"
    medium = "medium"
    long = "long"


class DescriptionRequest(BaseModel):
    title: str = Field(max_length=255)
    category: str | None = Field(default=None, max_length=100)
    key_features: list[str] = Field(default_factory=list, max_length=20)
    tone: ToneEnum = ToneEnum.professional
    length: LengthEnum = LengthEnum.medium


class DescriptionResponse(BaseModel):
    variants: list[str]
