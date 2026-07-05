"""Config + schema wiring for the AI product description generator."""
import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.descriptions import (
    DescriptionRequest,
    DescriptionResponse,
    LengthEnum,
    ToneEnum,
)


def test_description_config_defaults():
    assert settings.DESCRIPTION_MODEL == "claude-opus-4-8"
    assert settings.DESCRIPTION_MAX_VARIANTS == 3


def test_request_defaults_applied():
    req = DescriptionRequest(title="Wireless Earbuds")
    assert req.tone == ToneEnum.professional
    assert req.length == LengthEnum.medium
    assert req.key_features == []
    assert req.category is None


def test_request_rejects_unknown_tone():
    with pytest.raises(ValidationError):
        DescriptionRequest(title="X", tone="sarcastic")


def test_response_shape():
    resp = DescriptionResponse(variants=["a", "b", "c"])
    assert resp.variants == ["a", "b", "c"]
