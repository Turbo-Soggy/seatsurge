import time

from prometheus_client import Counter, Gauge, Histogram
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

HTTP_REQUESTS = Counter(
    "seatsurge_http_requests_total",
    "HTTP requests handled",
    ["service", "method", "route", "status"],
)
HTTP_LATENCY = Histogram(
    "seatsurge_http_request_duration_seconds",
    "HTTP request latency",
    ["service", "method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
)
HOLD_ATTEMPTS = Counter(
    "seatsurge_seat_hold_attempts_total",
    "Seat hold attempts by outcome (success / conflict)",
    ["result"],
)
SEATS_SOLD = Counter("seatsurge_seats_sold_total", "Seats sold (holds committed)")
SEATS_AVAILABLE = Gauge("seatsurge_seats_available", "Seats still available, per event", ["event"])
SEATS_HELD = Gauge("seatsurge_seats_held", "Seats currently held, per event", ["event"])

SERVICE = "inventory"


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        route = request.scope.get("route")
        path = getattr(route, "path", "unmatched")
        if path not in ("/metrics", "/healthz", "/readyz"):
            HTTP_REQUESTS.labels(SERVICE, request.method, path, str(response.status_code)).inc()
            HTTP_LATENCY.labels(SERVICE, request.method, path).observe(time.perf_counter() - start)
        return response
