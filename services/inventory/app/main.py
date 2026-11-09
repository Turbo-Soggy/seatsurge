import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, Field
from redis.asyncio import Redis

from .config import Settings, load_settings
from .holds import HoldExpiredError, HoldStore, SeatUnavailableError
from .metrics import (
    HOLD_ATTEMPTS,
    SEATS_AVAILABLE,
    SEATS_HELD,
    SEATS_SOLD,
    MetricsMiddleware,
)
from .venue import EVENT, SEAT_INDEX, SEATS, venue_payload

log = logging.getLogger("inventory")
logging.basicConfig(level=logging.INFO, format='{"level":"%(levelname)s","msg":"%(message)s"}')

ALL_SEAT_IDS = [s.id for s in SEATS]


class HoldRequest(BaseModel):
    event_id: str
    seat_ids: list[str] = Field(min_length=1)
    session_id: str = Field(min_length=1, max_length=64)


def _hold_view(info: dict) -> dict:
    seats = [SEAT_INDEX[sid] for sid in info["seat_ids"]]
    return {
        **info,
        "seats": [
            {"id": s.id, "section": s.section, "row": s.row, "number": s.number, "price": s.price}
            for s in seats
        ],
        "total": sum(s.price for s in seats),
    }


def create_app(settings: Settings | None = None, redis: Redis | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        client = redis or Redis.from_url(settings.redis_url, decode_responses=True)
        app.state.redis = client
        app.state.holds = HoldStore(client, settings.hold_ttl_seconds)
        log.info(f"inventory {settings.app_version} up, hold ttl={settings.hold_ttl_seconds}s")
        yield
        if redis is None:
            await client.aclose()

    app = FastAPI(title="SeatSurge Inventory", version=settings.app_version, lifespan=lifespan)
    app.add_middleware(MetricsMiddleware)

    def holds(request: Request) -> HoldStore:
        return request.app.state.holds

    def require_event(event_id: str) -> None:
        if event_id != EVENT["id"]:
            raise HTTPException(404, "event not found")

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok"}

    @app.get("/readyz")
    async def readyz(request: Request):
        try:
            await request.app.state.redis.ping()
        except Exception as exc:  # noqa: BLE001 - any Redis failure means not ready
            raise HTTPException(503, f"redis unavailable: {exc}") from exc
        return {"status": "ready"}

    @app.get("/metrics")
    async def metrics():
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    @app.get("/api/inventory/version")
    async def version():
        return {"service": "inventory", "version": settings.app_version}

    @app.get("/api/inventory/events")
    async def list_events():
        return [{**EVENT, "total_seats": len(SEATS)}]

    @app.get("/api/inventory/events/{event_id}")
    async def get_event(event_id: str):
        require_event(event_id)
        return {
            **venue_payload(),
            "hold_policy": {
                "ttl_seconds": settings.hold_ttl_seconds,
                "max_seats": settings.max_seats_per_hold,
            },
        }

    @app.get("/api/inventory/events/{event_id}/availability")
    async def availability(event_id: str, request: Request):
        require_event(event_id)
        held, sold = await holds(request).availability(event_id, ALL_SEAT_IDS)
        available = len(SEATS) - len(held) - len(sold)
        SEATS_AVAILABLE.labels(event_id).set(available)
        SEATS_HELD.labels(event_id).set(len(held))
        return {
            "held": held,
            "sold": sold,
            "counts": {
                "total": len(SEATS),
                "available": available,
                "held": len(held),
                "sold": len(sold),
            },
        }

    @app.post("/api/inventory/holds", status_code=201)
    async def create_hold(body: HoldRequest, request: Request):
        require_event(body.event_id)
        seat_ids = list(dict.fromkeys(body.seat_ids))
        if len(seat_ids) > settings.max_seats_per_hold:
            raise HTTPException(422, f"at most {settings.max_seats_per_hold} seats per hold")
        unknown = [s for s in seat_ids if s not in SEAT_INDEX]
        if unknown:
            raise HTTPException(422, f"unknown seats: {', '.join(unknown)}")
        try:
            info = await holds(request).create(body.event_id, seat_ids, body.session_id)
        except SeatUnavailableError as exc:
            HOLD_ATTEMPTS.labels("conflict").inc()
            raise HTTPException(
                409, {"message": "Someone beat you to it", "seat_ids": exc.seat_ids}
            ) from exc
        HOLD_ATTEMPTS.labels("success").inc()
        return _hold_view(info)

    @app.get("/api/inventory/holds/{hold_id}")
    async def get_hold(hold_id: str, request: Request):
        info = await holds(request).get(hold_id)
        if info is None:
            raise HTTPException(404, "hold not found or expired")
        return _hold_view(info)

    @app.delete("/api/inventory/holds/{hold_id}", status_code=204)
    async def release_hold(hold_id: str, request: Request):
        if not await holds(request).release(hold_id):
            raise HTTPException(404, "hold not found or expired")
        return Response(status_code=204)

    @app.post("/api/inventory/holds/{hold_id}/commit")
    async def commit_hold(hold_id: str, request: Request):
        try:
            info = await holds(request).commit(hold_id)
        except HoldExpiredError as exc:
            raise HTTPException(410, "hold expired") from exc
        SEATS_SOLD.inc(len(info["seat_ids"]))
        # Log the server-generated id from Redis, never the raw path parameter (log injection).
        log.info("sold %d seats hold=%s", len(info["seat_ids"]), info["hold_id"])
        return _hold_view(info)

    @app.post("/api/inventory/events/{event_id}/reset", status_code=204)
    async def reset(event_id: str, request: Request):
        if not settings.allow_reset:
            raise HTTPException(403, "reset disabled")
        require_event(event_id)
        await holds(request).reset(event_id)
        return Response(status_code=204)

    return app


app = create_app()
