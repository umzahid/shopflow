from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    APP_NAME: str = "ShopFlow"
    APP_ENV: str = "development"
    DEBUG: bool = False

    # Database. Pool sized for concurrent load (Postgres default max_connections
    # is 100; 20 + 40 overflow = 60 leaves headroom for migrations/admin).
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Cookie
    COOKIE_SECURE: bool = False  # True in production (HTTPS only)
    COOKIE_SAMESITE: str = "lax"
    COOKIE_DOMAIN: str | None = None

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True  # disabled in the test suite (see conftest)
    RATE_LIMIT_PUBLIC: str = "100/minute"
    RATE_LIMIT_AUTHENTICATED: str = "1000/minute"

    # Payment webhook (mock Stripe). Signature = HMAC-SHA256(body, secret).
    WEBHOOK_SECRET: str = "whsec_dev_shopflow_change_me"

    # S3 (Week 5)
    AWS_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_NAME: str = "shopflow-product-images"

    # Claude API (Week 6)
    ANTHROPIC_API_KEY: str = ""
    # Merchant Copilot (Week 6)
    COPILOT_MODEL: str = "claude-opus-4-8"
    COPILOT_MAX_ITERATIONS: int = 5
    COPILOT_EFFORT: str = "medium"
    # AI product description generator (Week 6)
    DESCRIPTION_MODEL: str = "claude-opus-4-8"
    DESCRIPTION_MAX_VARIANTS: int = 3
    NARRATIVE_MODEL: str = "claude-opus-4-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
