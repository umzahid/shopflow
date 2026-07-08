import pytest

from app.services import narrative as nsvc


@pytest.fixture(autouse=True)
def _restore_narrator():
    yield
    nsvc.set_narrator(None)


def _stats(**over):
    base = {
        "revenue_this_week": "4320.00",
        "revenue_prior_week": "3857.00",
        "delta_pct": 12.0,
        "orders_this_week": 41,
        "orders_by_status": {"delivered": 30, "shipped": 8, "pending_review": 3},
        "top_products": [{"title": "Ceramic Mug", "units_sold": 48, "revenue": "888.00"}],
        "restock_alerts": [{"title": "Ceramic Mug", "stock_qty": 4}],
    }
    base.update(over)
    return base


@pytest.mark.asyncio
async def test_fake_narrate_uses_stats():
    narrative, highlights = await nsvc._fake_narrate(_stats())
    assert "4320.00" in narrative
    assert "Ceramic Mug" in narrative
    assert any("12" in h for h in highlights)
    assert any("stock" in h.lower() for h in highlights)


@pytest.mark.asyncio
async def test_fake_narrate_quiet_week():
    narrative, highlights = await nsvc._fake_narrate(
        _stats(revenue_this_week="0.00", delta_pct=None, top_products=[], restock_alerts=[], orders_this_week=0)
    )
    assert narrative  # non-empty, coherent quiet-week text
    assert isinstance(highlights, list)


@pytest.mark.asyncio
async def test_fake_narrate_zero_revenue_with_products():
    """Zero revenue but non-empty top_products should use normal branch, not quiet-week."""
    narrative, highlights = await nsvc._fake_narrate(
        _stats(revenue_this_week="0.00", delta_pct=None, top_products=[{"title": "Ceramic Mug", "units_sold": 5, "revenue": "50.00"}])
    )
    assert narrative  # non-empty
    assert "Ceramic Mug" in narrative  # should mention the top product
    assert "quiet week" not in narrative.lower()  # should NOT trigger quiet-week branch
    assert isinstance(highlights, list)


@pytest.mark.asyncio
async def test_set_narrator_override_is_used():
    async def fake(stats):
        return "OVERRIDE", ["h1"]

    nsvc.set_narrator(fake)
    assert await nsvc.narrate(_stats()) == ("OVERRIDE", ["h1"])
