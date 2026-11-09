EVENT = "neon-atlas-blr"


def hold(client, seats, session="fan-1"):
    return client.post(
        "/api/inventory/holds",
        json={"event_id": EVENT, "seat_ids": seats, "session_id": session},
    )


def test_health_and_version(client):
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/readyz").status_code == 200
    assert client.get("/api/inventory/version").json()["version"] == "test"


def test_event_publishes_hold_policy(client):
    body = client.get("/api/inventory/events/neon-atlas-blr").json()
    assert body["hold_policy"] == {"ttl_seconds": 60, "max_seats": 4}
    assert len(body["seats"]) == 1004


def test_unknown_event_is_404(client):
    assert client.get("/api/inventory/events/nope").status_code == 404


def test_hold_reserves_seats_and_reports_total(client):
    res = hold(client, ["FL1-A1", "FL1-A2"])
    assert res.status_code == 201
    body = res.json()
    assert body["total"] == 2 * 7999
    avail = client.get(f"/api/inventory/events/{EVENT}/availability").json()
    assert set(avail["held"]) == {"FL1-A1", "FL1-A2"}
    assert avail["counts"]["held"] == 2


def test_second_fan_gets_409_for_the_same_seat(client):
    assert hold(client, ["FL2-B3"], "fan-1").status_code == 201
    res = hold(client, ["FL2-B3", "FL2-B4"], "fan-2")
    assert res.status_code == 409
    assert res.json()["detail"]["seat_ids"] == ["FL2-B3"]


def test_failed_multi_seat_hold_is_all_or_nothing(client):
    hold(client, ["LB1-A1"], "fan-1")
    assert hold(client, ["LB1-A2", "LB1-A1"], "fan-2").status_code == 409
    # LB1-A2 must have been released again, so a third fan can take it.
    assert hold(client, ["LB1-A2"], "fan-3").status_code == 201


def test_release_frees_seats(client):
    hold_id = hold(client, ["UB1-A1"]).json()["hold_id"]
    assert client.delete(f"/api/inventory/holds/{hold_id}").status_code == 204
    assert hold(client, ["UB1-A1"], "fan-2").status_code == 201


def test_commit_marks_sold_and_blocks_rehold(client):
    hold_id = hold(client, ["FL3-A1"]).json()["hold_id"]
    res = client.post(f"/api/inventory/holds/{hold_id}/commit")
    assert res.status_code == 200
    avail = client.get(f"/api/inventory/events/{EVENT}/availability").json()
    assert "FL3-A1" in avail["sold"]
    assert "FL3-A1" not in avail["held"]
    assert hold(client, ["FL3-A1"], "fan-2").status_code == 409


def test_commit_of_unknown_hold_is_410(client):
    assert client.post("/api/inventory/holds/missing/commit").status_code == 410


def test_limits_and_validation(client):
    assert hold(client, ["FL1-A1", "FL1-A2", "FL1-A3", "FL1-A4", "FL1-A5"]).status_code == 422
    assert hold(client, ["ZZ-Z9"]).status_code == 422


def test_reset_clears_state(client):
    hold_id = hold(client, ["LB2-A1"]).json()["hold_id"]
    client.post(f"/api/inventory/holds/{hold_id}/commit")
    assert client.post(f"/api/inventory/events/{EVENT}/reset").status_code == 204
    counts = client.get(f"/api/inventory/events/{EVENT}/availability").json()["counts"]
    assert counts["sold"] == 0 and counts["held"] == 0


def test_metrics_exposes_hold_counters(client):
    hold(client, ["UB2-A1"])
    text = client.get("/metrics").text
    assert "seatsurge_seat_hold_attempts_total" in text
    assert "seatsurge_http_requests_total" in text
