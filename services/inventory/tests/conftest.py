import pytest
from fakeredis import FakeAsyncRedis
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings() -> Settings:
    return Settings(
        redis_url="redis://unused",
        hold_ttl_seconds=60,
        max_seats_per_hold=4,
        app_version="test",
        allow_reset=True,
    )


@pytest.fixture
def client(settings):
    redis = FakeAsyncRedis(decode_responses=True)
    with TestClient(create_app(settings, redis=redis)) as c:
        yield c
