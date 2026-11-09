EVENT = "neon-atlas-blr"


def hold(client, seats, session="fan-1"):
    return client.post(
        "/api/inventory/holds",
        json={"event_id": EVENT, "seat_ids": seats, "session_id": session},
    )


def test_health_and_version(client):
    assert client.get("/healthz").json() == {"status": "ok"}
    resp = client.get("/readyz")
    assert resp.status_code == 200
    assert client.get("/api/inventory/version").json()["version"] == "test"


def test_event_publishes_hold_policy(client):
    body = client.get("/api/inventory/events/neon-atlas-blr").json()
    assert body["hold_policy"] == {"ttl_seconds": 60, "max_seats": 4}
    assert len(body["seats"]) == 1004


def test_unknown_event_is_404(client):
    resp = client.get("/api/inventory/events/nope")
    assert resp.status_code == 404


def test_hold_reserves_seats_and_reports_total(client):
    res = hold(client, ["FL1-A1", "FL1-A2"])
    assert res.status_code == 201
    body = res.json()
    assert body["total"] == 2 * 7999
    avail = client.get(f"/api/inventory/events/{EVENT}/availability").json()
    assert set(avail["held"]) == {"FL1-A1", "FL1-A2"}
    assert avail["counts"]["held"] == 2


def test_second_fan_gets_409_for_the_same_seat(client):
    resp = hold(client, ["FL2-B3"], "fan-1")
    assert resp.status_code == 201
    res = hold(client, ["FL2-B3", "FL2-B4"], "fan-2")
    assert res.status_code == 409
    assert res.json()["detail"]["seat_ids"] == ["FL2-B3"]


def test_failed_multi_seat_hold_is_all_or_nothing(client):
    hold(client, ["LB1-A1"], "fan-1")
    resp = hold(client, ["LB1-A2", "LB1-A1"], "fan-2")
    assert resp.status_code == 409
    # LB1-A2 must have been released again, so a third fan can take it.
    resp = hold(client, ["LB1-A2"], "fan-3")
    assert resp.status_code == 201


def test_release_frees_seats(client):
    hold_id = hold(client, ["UB1-A1"]).json()["hold_id"]
    resp = client.delete(f"/api/inventory/holds/{hold_id}")
    assert resp.status_code == 204
    resp = hold(client, ["UB1-A1"], "fan-2")
    assert resp.status_code == 201


def test_commit_marks_sold_and_blocks_rehold(client):
    hold_id = hold(client, ["FL3-A1"]).json()["hold_id"]
    res = client.post(f"/api/inventory/holds/{hold_id}/commit")
    assert res.status_code == 200
    avail = client.get(f"/api/inventory/events/{EVENT}/availability").json()
    assert "FL3-A1" in avail["sold"]
    assert "FL3-A1" not in avail["held"]
    resp = hold(client, ["FL3-A1"], "fan-2")
    assert resp.status_code == 409


def test_commit_of_unknown_hold_is_410(client):
    resp = client.post("/api/inventory/holds/missing/commit")
    assert resp.status_code == 410


def test_limits_and_validation(client):
    resp = hold(client, ["FL1-A1", "FL1-A2", "FL1-A3", "FL1-A4", "FL1-A5"])
    assert resp.status_code == 422
    resp = hold(client, ["ZZ-Z9"])
    assert resp.status_code == 422


def test_reset_clears_state(client):
    hold_id = hold(client, ["LB2-A1"]).json()["hold_id"]
    client.post(f"/api/inventory/holds/{hold_id}/commit")
    resp = client.post(f"/api/inventory/events/{EVENT}/reset")
    assert resp.status_code == 204
    counts = client.get(f"/api/inventory/events/{EVENT}/availability").json()["counts"]
    assert counts["sold"] == 0 and counts["held"] == 0


def test_metrics_exposes_hold_counters(client):
    hold(client, ["UB2-A1"])
    text = client.get("/metrics").text
    assert "seatsurge_seat_hold_attempts_total" in text
    assert "seatsurge_http_requests_total" in text
