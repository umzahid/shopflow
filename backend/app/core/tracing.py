"""OpenTelemetry tracing → OTLP (Jaeger).

Opt-in via OTEL_ENABLED (set in docker-compose alongside the Jaeger service).
Must run at app-construction time (FastAPI instrumentation adds middleware,
which Starlette forbids once the app has started) — so main.py calls it in the
module body. The test suite runs in the same container (OTEL_ENABLED=true), so
we also skip when pytest is loaded: no collector traffic or span overhead in tests.

Correlation with the existing per-request traceId: the request-logging
middleware in main.py stamps the X-Request-ID onto the active span as
`shopflow.request_id`, so a log line and its Jaeger trace share an id.
"""
from __future__ import annotations

import logging
import sys

from fastapi import FastAPI

from app.core.config import settings

logger = logging.getLogger("shopflow.tracing")

_configured = False


def configure_tracing(app: FastAPI, engine=None) -> None:
    """Install a TracerProvider + OTLP/HTTP exporter and instrument FastAPI
    (and, if given, the SQLAlchemy engine). No-op when OTEL_ENABLED is false,
    under pytest, or if called twice."""
    global _configured
    if not settings.OTEL_ENABLED or "pytest" in sys.modules or _configured:
        return

    # Imported lazily so the package is only required when tracing is enabled.
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    provider = TracerProvider(resource=Resource.create({"service.name": settings.OTEL_SERVICE_NAME}))
    # OTLPSpanExporter appends /v1/traces to the base endpoint.
    exporter = OTLPSpanExporter(endpoint=f"{settings.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces")
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    # /health and /metrics are noise — every scrape/probe would be a span.
    FastAPIInstrumentor.instrument_app(app, excluded_urls="health,metrics")

    if engine is not None:
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

        # Async engine: instrument the underlying sync engine so DB queries
        # show up as child spans under each request.
        SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)

    _configured = True
    logger.info(
        "tracing enabled",
        extra={"otel_endpoint": settings.OTEL_EXPORTER_OTLP_ENDPOINT},
    )
