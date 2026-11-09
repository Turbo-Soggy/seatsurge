"""Dashboard as code: generates monitoring/dashboards/seatsurge.json.

    python monitoring/dashboards/generate.py monitoring/dashboards/seatsurge.json

Edit this file, regenerate, and commit both. Terraform ships the JSON to Grafana as a
ConfigMap that the Grafana sidecar loads.
"""
import json
import sys

PROM = {"type": "prometheus", "uid": "prometheus"}
LOKI = {"type": "loki", "uid": "loki"}
NS = 'namespace="$namespace"'

PINK, VIOLET, CYAN, AMBER, GREEN, RED = "#ff4d8d", "#8b5cf6", "#22d3ee", "#fbbf24", "#34d399", "#f87171"

panels = []
_id = 0


def pid():
    global _id
    _id += 1
    return _id


def stat(title, expr, x, y, w=4, h=4, unit="short", color=VIOLET, decimals=0, desc=""):
    panels.append({
        "id": pid(), "type": "stat", "title": title, "description": desc, "datasource": PROM,
        "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "targets": [{"refId": "A", "expr": expr, "datasource": PROM}],
        "fieldConfig": {"defaults": {
            "unit": unit, "decimals": decimals,
            "color": {"mode": "fixed", "fixedColor": color},
            "thresholds": {"mode": "absolute", "steps": [{"color": color, "value": None}]},
        }, "overrides": []},
        "options": {"colorMode": "value", "graphMode": "area", "justifyMode": "center",
                    "textMode": "value", "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}},
    })


def ts(title, targets, x, y, w=12, h=8, unit="short", stack=False, overrides=None, desc=""):
    panels.append({
        "id": pid(), "type": "timeseries", "title": title, "description": desc, "datasource": PROM,
        "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "targets": [{"refId": chr(65 + i), "expr": e, "legendFormat": l, "datasource": PROM}
                    for i, (e, l) in enumerate(targets)],
        "fieldConfig": {"defaults": {
            "unit": unit,
            "custom": {"drawStyle": "line", "lineWidth": 2, "fillOpacity": 18, "gradientMode": "opacity",
                       "showPoints": "never", "stacking": {"mode": "normal" if stack else "none"}},
            "color": {"mode": "palette-classic"},
        }, "overrides": overrides or []},
        "options": {"legend": {"displayMode": "list", "placement": "bottom"}, "tooltip": {"mode": "multi"}},
    })


def color_override(name, color):
    return {"matcher": {"id": "byName", "options": name},
            "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": color}}]}


def row(title, y):
    panels.append({"id": pid(), "type": "row", "title": title, "collapsed": False,
                   "gridPos": {"x": 0, "y": y, "w": 24, "h": 1}, "panels": []})


# ---- Headline numbers ----
row("Ticket drop — live", 0)
stat("Seats left", f"max(seatsurge_seats_available{{{NS}}})", 0, 1, color=CYAN)
stat("Held right now", f"max(seatsurge_seats_held{{{NS}}})", 4, 1, color=AMBER)
stat("Box office (₹)", f"max(seatsurge_box_office_inr{{{NS}}})", 8, 1, unit="locale", color=GREEN,
     desc="Confirmed revenue read from Postgres at scrape time. Every checkout pod reports the same value, hence max().")
stat("Requests / sec", f"sum(rate(seatsurge_http_requests_total{{{NS}}}[1m]))", 12, 1, unit="reqps", color=PINK, decimals=1)
stat("p95 latency", f"histogram_quantile(0.95, sum by (le) (rate(seatsurge_http_request_duration_seconds_bucket{{{NS}}}[2m])))",
     16, 1, unit="s", color=VIOLET, decimals=3)
stat("Firing alerts", f'count(ALERTS{{alertstate="firing", {NS}}}) or vector(0)', 20, 1, color=RED,
     desc="Prometheus alerts currently firing for this namespace")

# ---- Traffic ----
row("Traffic & latency", 5)
ts("Requests / sec by service & status",
   [(f'sum by (service, status) (rate(seatsurge_http_requests_total{{{NS}}}[1m]))', "{{service}} {{status}}")],
   0, 6, unit="reqps", stack=True)
ts("Latency percentiles",
   [(f"histogram_quantile(0.50, sum by (le) (rate(seatsurge_http_request_duration_seconds_bucket{{{NS}}}[2m])))", "p50"),
    (f"histogram_quantile(0.95, sum by (le) (rate(seatsurge_http_request_duration_seconds_bucket{{{NS}}}[2m])))", "p95"),
    (f"histogram_quantile(0.99, sum by (le) (rate(seatsurge_http_request_duration_seconds_bucket{{{NS}}}[2m])))", "p99")],
   12, 6, unit="s", overrides=[color_override("p50", GREEN), color_override("p95", AMBER), color_override("p99", RED)])

# ---- Business ----
row("The fight for seats", 14)
ts("Seat hold attempts / sec",
   [(f'sum by (result) (rate(seatsurge_seat_hold_attempts_total{{{NS}}}[1m]))', "{{result}}")],
   0, 15, unit="ops", stack=True,
   overrides=[color_override("success", GREEN), color_override("conflict", RED)],
   desc="conflict = a fan tried to hold a seat someone else already had (HTTP 409)")
ts("Checkout outcomes / sec",
   [(f'sum by (result) (rate(seatsurge_orders_total{{{NS}}}[1m]))', "{{result}}")],
   12, 15, unit="ops", stack=True,
   overrides=[color_override("confirmed", GREEN), color_override("expired", AMBER),
              color_override("payment_declined", RED), color_override("conflict", VIOLET)])

# ---- Kubernetes ----
row("Kubernetes — autoscaling", 23)
ts("Pod replicas (HPA)",
   [(f'kube_horizontalpodautoscaler_status_current_replicas{{{NS}}}', "{{horizontalpodautoscaler}} current"),
    (f'kube_horizontalpodautoscaler_status_desired_replicas{{{NS}}}', "{{horizontalpodautoscaler}} desired")],
   0, 24, desc="Watch the HorizontalPodAutoscaler add pods as the ticket drop heats up")
ts("CPU per pod (cores)",
   [(f'sum by (pod) (rate(container_cpu_usage_seconds_total{{{NS}, container!="", container!="POD"}}[1m]))', "{{pod}}")],
   12, 24, unit="short")

# ---- Logs ----
row("Logs (Loki)", 32)
panels.append({
    "id": pid(), "type": "logs", "title": "Application logs", "datasource": LOKI,
    "gridPos": {"x": 0, "y": 33, "w": 24, "h": 10},
    "targets": [{"refId": "A", "datasource": LOKI,
                 "expr": '{namespace="$namespace", container=~"inventory|checkout"}'}],
    "options": {"showTime": True, "wrapLogMessage": True, "sortOrder": "Descending", "enableLogDetails": True},
})

dashboard = {
    "uid": "seatsurge-main",
    "title": "SeatSurge — Ticket Drop",
    "tags": ["seatsurge"],
    "timezone": "browser",
    "refresh": "5s",
    "time": {"from": "now-15m", "to": "now"},
    "schemaVersion": 39,
    "graphTooltip": 1,
    "templating": {"list": [{
        "name": "namespace", "label": "Environment", "type": "query", "datasource": PROM,
        "query": {"query": "label_values(seatsurge_http_requests_total, namespace)", "refId": "ns"},
        "definition": "label_values(seatsurge_http_requests_total, namespace)",
        "current": {"text": "seatsurge-prod", "value": "seatsurge-prod"},
        "refresh": 2, "includeAll": False, "multi": False,
    }]},
    "annotations": {"list": [{
        "name": "Deployments", "datasource": PROM, "enable": True, "iconColor": CYAN,
        # A rollout creates a new ReplicaSet; HPA scaling only changes replicas, so it no longer
        # shows up here (observed_generation changed on every scale event).
        "expr": 'max by (replicaset) (time() - kube_replicaset_created{namespace="$namespace"}) < 60',
        "step": "30s", "titleFormat": "Rollout: {{replicaset}}",
    }]},
    "panels": panels,
}

with open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump(dashboard, f, indent=2, ensure_ascii=False)
print(f"wrote {len(panels)} panels")
