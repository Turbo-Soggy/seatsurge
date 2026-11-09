"""Static venue model: an arena wrapped around a stage, split into tiers and sections.

Seat coordinates are generated here so the web client can draw the map without
knowing anything about the venue geometry.
"""

import math
from dataclasses import asdict, dataclass

EVENT = {
    "id": "neon-atlas-blr",
    "artist": "The Midnight Cartographers",
    "tour": "Neon Atlas Tour",
    "venue": "Skyline Arena, Bengaluru",
    "date": "2026-12-19T19:30:00+05:30",
    "currency": "INR",
}

VIEWBOX = {"width": 1200, "height": 680}
STAGE = {"x": 600, "y": 70, "width": 260, "height": 56}
SEAT_SPACING = 15.0
SECTION_GAP_DEG = 3.0


@dataclass(frozen=True)
class Tier:
    code: str
    name: str
    price: int
    color: str
    inner_radius: float
    rows: int
    row_gap: float
    span_deg: float
    sections: int


TIERS: list[Tier] = [
    Tier("FL", "Floor", 7999, "#ff4d8d", 150, 6, 18, 100, 3),
    Tier("LB", "Lower Bowl", 4999, "#8b5cf6", 300, 7, 18, 150, 5),
    Tier("UB", "Upper Bowl", 2499, "#22d3ee", 460, 6, 18, 164, 6),
]


@dataclass(frozen=True)
class Seat:
    id: str
    section: str
    tier: str
    row: str
    number: int
    x: float
    y: float
    price: int


def _build_seats() -> list[Seat]:
    seats: list[Seat] = []
    for tier in TIERS:
        section_span = (tier.span_deg - SECTION_GAP_DEG * (tier.sections - 1)) / tier.sections
        for s in range(tier.sections):
            start = -tier.span_deg / 2 + s * (section_span + SECTION_GAP_DEG)
            section = f"{tier.code}{s + 1}"
            for r in range(tier.rows):
                radius = tier.inner_radius + r * tier.row_gap
                arc_len = math.radians(section_span) * radius
                count = max(1, int(arc_len // SEAT_SPACING))
                step = section_span / count
                row_label = chr(ord("A") + r)
                for i in range(count):
                    theta = math.radians(start + step * (i + 0.5))
                    seats.append(
                        Seat(
                            id=f"{section}-{row_label}{i + 1}",
                            section=section,
                            tier=tier.code,
                            row=row_label,
                            number=i + 1,
                            x=round(STAGE["x"] + radius * math.sin(theta), 1),
                            y=round(STAGE["y"] + radius * math.cos(theta), 1),
                            price=tier.price,
                        )
                    )
    return seats


SEATS: list[Seat] = _build_seats()
SEAT_INDEX: dict[str, Seat] = {seat.id: seat for seat in SEATS}


def venue_payload() -> dict:
    return {
        **EVENT,
        "viewbox": VIEWBOX,
        "stage": STAGE,
        "tiers": [
            {"code": t.code, "name": t.name, "price": t.price, "color": t.color} for t in TIERS
        ],
        "seats": [asdict(s) for s in SEATS],
    }
