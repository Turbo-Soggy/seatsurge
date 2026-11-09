# syntax=docker/dockerfile:1.7
# ---- Stage 1: build a self-contained virtualenv with only runtime deps ----
FROM python:3.13-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install -r requirements.txt

# ---- Stage 2: test stage (used by CI with --target test) ----
FROM builder AS test
COPY requirements-dev.txt pyproject.toml ./
RUN pip install -r requirements-dev.txt
COPY app ./app
COPY tests ./tests
RUN ruff check . && pytest -q

# ---- Stage 3: minimal runtime image, non-root ----
FROM python:3.13-slim AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="seatsurge-inventory" \
      org.opencontainers.image.description="SeatSurge seat inventory & hold service" \
      org.opencontainers.image.source="https://github.com/seatsurge/seatsurge" \
      org.opencontainers.image.version="${APP_VERSION}"
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_VERSION=${APP_VERSION}
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app app
WORKDIR /srv
COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app app ./app
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz').status==200 else 1)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
