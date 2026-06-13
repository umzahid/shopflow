"""Settings loading."""
from app.core.config import Settings, get_settings, settings


def test_settings_loads_required_fields():
    s = get_settings()
    assert s.DATABASE_URL  # truthy — set via .env
    assert s.JWT_SECRET_KEY


def test_settings_singleton_via_lru_cache():
    assert get_settings() is get_settings()
    assert get_settings() is settings


def test_settings_defaults_for_jwt_expiry():
    s = Settings()
    assert s.JWT_ALGORITHM == "HS256"
    assert s.JWT_ACCESS_TOKEN_EXPIRE_MINUTES == 15
    assert s.JWT_REFRESH_TOKEN_EXPIRE_DAYS == 7


def test_settings_cookie_defaults_safe_for_dev():
    s = Settings()
    assert s.COOKIE_SAMESITE == "lax"
    # COOKIE_SECURE must be False locally so cookies work over HTTP
    assert s.COOKIE_SECURE is False
