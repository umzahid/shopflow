"""Settings loading."""
import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings, settings

# Minimal required fields so Settings can be built without reading .env
# (_env_file=None keeps these unit tests hermetic in CI, where .env carries the
# escape-hatch flag we're asserting the default of).
_REQUIRED = dict(
    DATABASE_URL="postgresql+asyncpg://u:p@h:5432/db",
    JWT_SECRET_KEY="x" * 40,
)


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


def test_admin_self_registration_defaults_false():
    # Privileged self-registration is off unless a non-prod env explicitly opts in.
    assert Settings.model_fields["ALLOW_ADMIN_SELF_REGISTRATION"].default is False


@pytest.mark.parametrize(
    "env",
    ["development", "dev", "local", "test", "testing", "ci", "e2e", "localstack", "CI", " ci "],
)
def test_admin_self_registration_allowed_in_known_nonprod(env):
    s = Settings(_env_file=None, APP_ENV=env, ALLOW_ADMIN_SELF_REGISTRATION=True, **_REQUIRED)
    assert s.ALLOW_ADMIN_SELF_REGISTRATION is True


@pytest.mark.parametrize(
    "env",
    # production, staging, and ANY unrecognized/misspelled/blank label are all
    # treated as production-like — the guard is fail-closed, not a prod denylist.
    ["production", "prod", "staging", "prod-us", "production-us", "live", "PRODUCTION", " production ", "", "wat"],
)
def test_admin_self_registration_forbidden_outside_known_nonprod(env):
    # The app refuses to construct its settings (i.e. refuses to start) rather
    # than expose anonymous admin registration in a production-like environment.
    with pytest.raises(ValidationError):
        Settings(_env_file=None, APP_ENV=env, ALLOW_ADMIN_SELF_REGISTRATION=True, **_REQUIRED)
