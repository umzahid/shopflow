"""Structured JSON logging.

Every log line is one JSON object with the fields the observability stack
expects: timestamp, level, service, traceId, message, durationMs. The traceId
is per-request (see the request-logging middleware in main.py) and propagated
via a ContextVar so any log emitted while handling a request carries it.
"""
from __future__ import annotations

import json
import logging
from contextvars import ContextVar
from datetime import datetime, timezone

from app.core.config import settings

# Set per request by the logging middleware; empty outside a request.
trace_id_var: ContextVar[str] = ContextVar("trace_id", default="")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "service": settings.APP_NAME,
            "traceId": trace_id_var.get() or getattr(record, "trace_id", ""),
            "message": record.getMessage(),
        }
        # durationMs is attached via `extra={"duration_ms": ...}` on request logs.
        duration = getattr(record, "duration_ms", None)
        if duration is not None:
            payload["durationMs"] = duration
        # Any other structured extras (method, path, status…) pass through.
        for key in ("method", "path", "status", "client_ip"):
            val = getattr(record, key, None)
            if val is not None:
                payload[key] = val
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging() -> None:
    """Install the JSON formatter on the root logger and uvicorn loggers."""
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    # uvicorn keeps its own handlers — route them through ours for uniform JSON.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers = [handler]
        lg.propagate = False
