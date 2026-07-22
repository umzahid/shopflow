"""configure_tracing is a safe no-op when disabled (the default in tests).

Functional verification — a request producing a visible trace — is done against
the running Jaeger stack; see docs/observability-tracing.md.
"""
from fastapi import FastAPI

from app.core import tracing


def test_configure_tracing_noop_when_disabled(monkeypatch):
    monkeypatch.setattr(tracing.settings, "OTEL_ENABLED", False)
    monkeypatch.setattr(tracing, "_configured", False)
    app = FastAPI()

    # Must not raise and must not instrument the app when tracing is off.
    tracing.configure_tracing(app, engine=None)

    assert tracing._configured is False
