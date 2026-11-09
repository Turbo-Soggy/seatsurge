from app.venue import SEAT_INDEX, SEATS, TIERS, VIEWBOX, venue_payload


def test_seat_ids_are_unique():
    assert len(SEAT_INDEX) == len(SEATS)


def test_every_tier_has_seats_and_sections():
    for tier in TIERS:
        sections = {s.section for s in SEATS if s.tier == tier.code}
        assert len(sections) == tier.sections


def test_seats_fit_inside_the_viewbox():
    for seat in SEATS:
        assert 0 <= seat.x <= VIEWBOX["width"]
        assert 0 <= seat.y <= VIEWBOX["height"]


def test_floor_is_most_expensive():
    prices = {t.code: t.price for t in TIERS}
    assert prices["FL"] > prices["LB"] > prices["UB"]


def test_payload_contains_layout():
    payload = venue_payload()
    assert payload["id"] == "neon-atlas-blr"
    assert len(payload["seats"]) == len(SEATS) > 500
