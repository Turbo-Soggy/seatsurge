# SeatSurge on-call runbook

Every alert in `deploy/helm/seatsurge/templates/monitoring.yaml` links here.
Dashboards: **Grafana → SeatSurge → SeatSurge — Ticket Drop** (`http://grafana.localhost`).

## High error rate

`SeatSurgeHighErrorRate`: more than 5% of requests return 5xx for 2 minutes.

1. Dashboard → *Requests / sec by service & status*: which service is failing?
2. Dashboard → *Application logs* (Loki), or Grafana Explore:
   `{namespace="seatsurge-prod", container="checkout"} |= "error"`
3. `kubectl -n seatsurge-prod get pods`: are pods crash-looping or not Ready?
4. If it started right after a deploy, roll back:
   ```bash
   helm history seatsurge -n seatsurge-prod
   helm rollback seatsurge <previous-revision> -n seatsurge-prod --wait
   ```

## High latency

`SeatSurgeHighLatencyP95`: p95 above 500 ms for 2 minutes.

1. Dashboard → *Pod replicas (HPA)*: is the HPA at its ceiling? If so, see **HPA maxed out**.
2. Dashboard → *CPU per pod*: are pods CPU-throttled at their 500m limit?
3. Check Redis / Postgres pods: `kubectl -n seatsurge-prod top pods`.

## HPA maxed out

`SeatSurgeHPAMaxedOut`: a deployment has been at `maxReplicas` for 3 minutes.

- Short term: raise the ceiling: `helm upgrade … --set components.inventory.autoscaling.maxReplicas=15`.
- On AKS the cluster autoscaler adds nodes to the `apps` pool automatically (max 5, see `infra/terraform/azure`).

## Ticket frenzy (informational)

`SeatSurgeTicketFrenzy`: more than 30% of seat-hold attempts collide. This is the
business signal that a drop is hot; no action needed unless latency or errors follow.

## Sold out (informational)

`SeatSurgeSoldOut`: no seats left. Marketing may want to announce it.

## Target down

`SeatSurgeTargetDown`: Prometheus cannot scrape a pod. Usually a pod is restarting:
`kubectl -n seatsurge-prod describe pod <pod>`.

## Pod crash-looping

`SeatSurgePodCrashLooping`: `kubectl -n <ns> logs <pod> --previous` shows the last crash.
Common cause: Postgres password Secret missing after a cluster rebuild. Re-seal it with
`./scripts/seal-secret.ps1 -Environment prod`.
