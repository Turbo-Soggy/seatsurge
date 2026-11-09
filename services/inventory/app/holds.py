"""Seat holds backed by Redis.

Each seat being held is a key ``hold:<event>:<seat>`` whose value is the hold id,
created with ``SET NX EX`` so exactly one fan can grab a seat and the lock
expires on its own if they never check out. A hold over several seats is
all-or-nothing: if any seat is taken we release the ones we grabbed.
"""

import json
import secrets
import time

from redis.asyncio import Redis
from redis.exceptions import WatchError


class SeatUnavailableError(Exception):
    def __init__(self, seat_ids: list[str]):
        super().__init__(f"seats unavailable: {', '.join(seat_ids)}")
        self.seat_ids = seat_ids


class HoldExpiredError(Exception):
    pass


def seat_key(event_id: str, seat_id: str) -> str:
    return f"hold:{event_id}:{seat_id}"


def hold_key(hold_id: str) -> str:
    return f"holdinfo:{hold_id}"


def sold_key(event_id: str) -> str:
    return f"sold:{event_id}"


class HoldStore:
    def __init__(self, redis: Redis, ttl_seconds: int):
        self.redis = redis
        self.ttl = ttl_seconds

    async def create(self, event_id: str, seat_ids: list[str], session_id: str) -> dict:
        hold_id = secrets.token_urlsafe(12)
        acquired: list[str] = []
        conflicts: list[str] = []
        for sid in seat_ids:
            if await self.redis.set(seat_key(event_id, sid), hold_id, nx=True, ex=self.ttl):
                acquired.append(sid)
            else:
                conflicts.append(sid)

        if not conflicts:
            # A seat whose hold was committed is in the sold set, never re-holdable.
            async with self.redis.pipeline(transaction=False) as pipe:
                for sid in acquired:
                    pipe.sismember(sold_key(event_id), sid)
                sold_flags = await pipe.execute()
            conflicts = [sid for sid, sold in zip(acquired, sold_flags, strict=True) if sold]

        if conflicts:
            await self._release_seats(event_id, acquired, hold_id)
            raise SeatUnavailableError(conflicts)

        info = {
            "hold_id": hold_id,
            "event_id": event_id,
            "seat_ids": seat_ids,
            "session_id": session_id,
            "expires_at": time.time() + self.ttl,
        }
        await self.redis.set(hold_key(hold_id), json.dumps(info), ex=self.ttl)
        return info

    async def get(self, hold_id: str) -> dict | None:
        raw = await self.redis.get(hold_key(hold_id))
        return json.loads(raw) if raw else None

    async def release(self, hold_id: str) -> bool:
        info = await self.get(hold_id)
        if info is None:
            return False
        await self._release_seats(info["event_id"], info["seat_ids"], hold_id)
        await self.redis.delete(hold_key(hold_id))
        return True

    async def commit(self, hold_id: str) -> dict:
        """Mark every seat in the hold as sold. Fails if the hold has lapsed."""
        info = await self.get(hold_id)
        if info is None:
            raise HoldExpiredError(hold_id)
        event_id = info["event_id"]
        owners = await self.redis.mget([seat_key(event_id, s) for s in info["seat_ids"]])
        if any(owner != hold_id for owner in owners):
            raise HoldExpiredError(hold_id)
        await self.redis.sadd(sold_key(event_id), *info["seat_ids"])
        await self._release_seats(event_id, info["seat_ids"], hold_id)
        await self.redis.delete(hold_key(hold_id))
        return info

    async def availability(self, event_id: str, seat_ids: list[str]) -> tuple[list[str], list[str]]:
        """Return (held, sold) seat ids."""
        owners = await self.redis.mget([seat_key(event_id, s) for s in seat_ids])
        sold = await self.redis.smembers(sold_key(event_id))
        held = [
            sid for sid, owner in zip(seat_ids, owners, strict=True) if owner and sid not in sold
        ]
        return held, sorted(sold)

    async def reset(self, event_id: str) -> None:
        await self.redis.delete(sold_key(event_id))
        async for key in self.redis.scan_iter(match=f"hold:{event_id}:*"):
            await self.redis.delete(key)

    async def _release_seats(self, event_id: str, seat_ids: list[str], hold_id: str) -> None:
        """Delete seat locks, but only those still owned by this hold (compare-and-delete)."""
        for sid in seat_ids:
            key = seat_key(event_id, sid)
            async with self.redis.pipeline(transaction=True) as pipe:
                try:
                    await pipe.watch(key)
                    if await pipe.get(key) == hold_id:
                        pipe.multi()
                        pipe.delete(key)
                        await pipe.execute()
                    else:
                        await pipe.unwatch()
                except WatchError:
                    # Someone else touched the key in between, so it is no longer ours.
                    pass
