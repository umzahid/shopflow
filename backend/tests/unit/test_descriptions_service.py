"""Generator service — swap hook, clamp, fake output. No network."""
import pytest

from app.schemas.descriptions import DescriptionRequest, LengthEnum, ToneEnum
from app.services import descriptions
from app.services.descriptions import generate_descriptions, set_generator


@pytest.fixture(autouse=True)
def _reset():
    yield
    set_generator(None)


@pytest.mark.asyncio
async def test_fake_generate_returns_three():
    req = DescriptionRequest(title="Trail Runner", tone=ToneEnum.playful, length=LengthEnum.short)
    variants = await descriptions._fake_generate(req)
    assert len(variants) == 3
    assert all(isinstance(v, str) and v for v in variants)


@pytest.mark.asyncio
async def test_generate_uses_fake_by_default_env(monkeypatch):
    monkeypatch.setenv("SHOPFLOW_FAKE_DESCRIPTIONS", "1")
    result = await generate_descriptions(DescriptionRequest(title="Kettle"))
    assert len(result) == 3


@pytest.mark.asyncio
async def test_clamp_to_max_variants():
    async def _five(req):
        return ["a", "b", "c", "d", "e"]

    set_generator(_five)
    result = await generate_descriptions(DescriptionRequest(title="X"))
    assert len(result) == 3  # DESCRIPTION_MAX_VARIANTS


@pytest.mark.asyncio
async def test_swap_hook_overrides_generator():
    async def _custom(req):
        return [f"custom:{req.title}"]

    set_generator(_custom)
    result = await generate_descriptions(DescriptionRequest(title="Mug"))
    assert result == ["custom:Mug"]
