import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    redis_url: str
    hold_ttl_seconds: int
    max_seats_per_hold: int
    app_version: str
    allow_reset: bool


def load_settings() -> Settings:
    """Read configuration from the environment (12-factor style)."""
    return Settings(
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        hold_ttl_seconds=int(os.getenv("HOLD_TTL_SECONDS", "90")),
        max_seats_per_hold=int(os.getenv("MAX_SEATS_PER_HOLD", "6")),
        app_version=os.getenv("APP_VERSION", "dev"),
        allow_reset=os.getenv("ALLOW_RESET", "false").lower() == "true",
    )
