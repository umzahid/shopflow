import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from opentelemetry import trace
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from app.api import (
    admin,
    auth,
    cart,
    categories,
    merchant,
    orders,
    products,
    reviews,
    users,
    webhooks,
)
from app.core.config import settings
from app.core.database import engine
from app.core.logging import configure_logging, trace_id_var
from app.core.metrics import instrument_engine, refresh_active_orders_loop
from app.core.redis import close_redis, get_redis
from app.core.security import decode_access_token
from app.core.tracing import configure_tracing

configure_logging()
instrument_engine(engine)
_access_logger = logging.getLogger("shopflow.access")


RATE_LIMIT_WINDOW_SECONDS = 60


def _parse_limit(value: str) -> int:
    """'100/minute' -> 100."""
    return int(value.split("/", 1)[0])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "127.0.0.1"


def _rate_limit_for(request: Request) -> tuple[str, int]:
    """(bucket key, max requests/window). Authenticated → per-user + the higher
    tier; anonymous → per-IP + the public tier."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            payload = decode_access_token(auth.split(" ", 1)[1])
            return f"user:{payload['sub']}", _parse_limit(settings.RATE_LIMIT_AUTHENTICATED)
        except Exception:  # noqa: BLE001 - any decode failure falls back to IP tier
            pass
    return f"ip:{_client_ip(request)}", _parse_limit(settings.RATE_LIMIT_PUBLIC)


class _RateLimiter:
    """Enable toggle for the rate-limit middleware. An instance attribute so the
    test suite (and conftest) can flip `.enabled` at runtime."""

    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled


limiter = _RateLimiter(settings.RATE_LIMIT_ENABLED)


async def _rate_limit_retry_after(bucket: str, max_requests: int) -> int | None:
    """Redis-backed fixed window, shared across replicas (INCR + EXPIRE). Returns
    the seconds to wait if `bucket` is over its per-window limit, else None. Fails
    open on any Redis error so a cache blip can't take the whole API down."""
    key = f"ratelimit:{bucket}"
    try:
        redis = await get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS)
        if count > max_requests:
            ttl = await redis.ttl(key)
            return ttl if ttl and ttl > 0 else RATE_LIMIT_WINDOW_SECONDS
        return None
    except Exception:  # noqa: BLE001 - fail open on Redis errors
        return None


def _too_many_requests(path: str, retry_after: int) -> JSONResponse:
    """429 as RFC 7807 + Retry-After header (PRD security checklist)."""
    response = JSONResponse(
        status_code=429,
        content={
            "type": "https://shopflow.io/errors/rate-limit-exceeded",
            "title": "Too Many Requests",
            "status": 429,
            "detail": "Rate limit exceeded. Slow down and retry after the window resets.",
            "instance": path,
        },
    )
    response.headers["Retry-After"] = str(retry_after)
    return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(refresh_active_orders_loop())
    try:
        yield
    finally:
        task.cancel()
        await close_redis()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


# Rate limiting — enforced by the custom middleware below (Redis-backed
# fixed-window, tiered per-IP / per-user).
@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if not limiter.enabled:
        return await call_next(request)
    bucket, max_requests = _rate_limit_for(request)
    retry_after = await _rate_limit_retry_after(bucket, max_requests)
    if retry_after is not None:
        return _too_many_requests(request.url.path, retry_after)
    return await call_next(request)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Security headers middleware
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # API responses are consumed by our own origin's fetch() only; same-origin
    # CORP blocks other sites from embedding them as no-cors resources.
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    if "server" in response.headers:
        del response.headers["server"]
    return response


# Structured request logging: assign a traceId, time the request, emit one JSON
# access line with durationMs, and echo the id back as X-Request-ID.
@app.middleware("http")
async def request_logging(request: Request, call_next):
    trace_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    token = trace_id_var.set(trace_id)
    # Propagate our per-request id onto the OTel span so a log line and its
    # Jaeger trace share an id (no-op when tracing is disabled — the current
    # span is then non-recording).
    trace.get_current_span().set_attribute("shopflow.request_id", trace_id)
    start = time.perf_counter()
    try:
        response = await call_next(request)
    finally:
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
    response.headers["X-Request-ID"] = trace_id
    _access_logger.info(
        "request",
        extra={
            "duration_ms": duration_ms,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "client_ip": request.client.host if request.client else None,
        },
    )
    trace_id_var.reset(token)
    return response


# HTTPException → RFC 7807 (overrides FastAPI's default {"detail": ...} wrapper)
@app.exception_handler(FastAPIHTTPException)
async def http_exception_handler(request: Request, exc: FastAPIHTTPException):
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"type": "about:blank", "title": "Error", "status": exc.status_code,
                 "detail": str(exc.detail), "instance": str(request.url.path)},
    )


# Catch-all for unexpected errors → RFC 7807 500
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if hasattr(exc, "detail") and isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=500,
        content={
            "type": "https://shopflow.io/errors/internal-server-error",
            "title": "Internal Server Error",
            "status": 500,
            "detail": "An unexpected error occurred",
            "instance": str(request.url.path),
        },
    )


# Health check
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": settings.APP_NAME}


# Prometheus /metrics endpoint — scraped by prometheus.yml every 15s.
# Exposes http_requests_total, http_request_duration_seconds_*, and the
# process_* defaults that the Grafana dashboard queries.
Instrumentator().instrument(app).expose(app, endpoint="/metrics", tags=["health"])


# Routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(cart.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(reviews.router, prefix="/api/v1")
app.include_router(merchant.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(webhooks.router, prefix="/api/v1")


# OpenTelemetry tracing → Jaeger (opt-in via OTEL_ENABLED). Done last, at
# import time, so the OTel middleware wraps the full request and is installed
# before the app starts serving. No-op under pytest / when disabled.
configure_tracing(app, engine=engine)
