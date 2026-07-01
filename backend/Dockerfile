# Stage 1: builder — install all deps
FROM python:3.11-slim AS builder

WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# Stage 2: production — lean final image
FROM python:3.11-slim

# libgomp1: OpenMP runtime required by LightGBM (fraud scoring). Without it the
# LightGBM shared lib fails to load and any real-model score raises at checkout.
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libgomp1 curl && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd -m -u 1001 appuser

WORKDIR /app
COPY --from=builder /install /usr/local
COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl --fail http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
