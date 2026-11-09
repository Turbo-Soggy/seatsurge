# Architecture

## Application

```mermaid
flowchart LR
  fan([Fan's browser]) -->|http://seatsurge.localhost| ing[Traefik Ingress]
  ing -->|/| web[web<br/>React SPA on nginx]
  ing -->|/api/inventory| inv[inventory<br/>Python FastAPI]
  ing -->|/api/checkout| chk[checkout<br/>Node.js Express]
  chk -->|get / commit hold| inv
  inv -->|SET NX EX seat locks| redis[(Redis)]
  chk -->|orders, UNIQUE seat| pg[(PostgreSQL)]
  subgraph obs [Observability]
    prom[Prometheus] -.scrapes /metrics.-> inv
    prom -.scrapes /metrics.-> chk
    alloy[Grafana Alloy] -.pod logs.-> loki[(Loki)]
    graf[Grafana] --> prom
    graf --> loki
    prom --> am[Alertmanager]
  end
```

| Service | Language | Responsibility | Scales on |
|---|---|---|---|
| **web** | React 19 + TypeScript, served by unprivileged nginx | Seat map, hold countdown, checkout form, ticket stub, live version chips | CPU (2–4 pods) |
| **inventory** | Python 3.13, FastAPI | Venue layout, live availability, **seat holds** | CPU (2–10 pods) |
| **checkout** | Node 24, Express 5, TypeScript | Turns a hold into a paid order (mock payment gateway) | CPU (2–8 pods) |
| Redis | 7.4 | Seat locks with TTL, sold-seat set | single pod |
| PostgreSQL | 17 | Orders; `PRIMARY KEY (event_id, seat_id)` guarantees no double-selling | StatefulSet + PVC |

### How a seat is booked without double-selling

1. **Hold**: inventory runs `SET hold:<event>:<seat> <hold-id> NX EX 90` for every requested
   seat. `NX` means only the first fan wins, so a second fan gets **HTTP 409**. If any seat in a
   multi-seat request fails, the seats already grabbed are released (all-or-nothing, using a
   `WATCH`/`MULTI` compare-and-delete so we never delete someone else's lock).
2. **Pay**: checkout re-reads the hold, charges the (mock) card, then inserts the order inside a
   Postgres transaction. The composite primary key on `order_seats` is the final safety net.
3. **Commit**: checkout tells inventory to move the seats into the `sold` set. If the hold lapsed
   during payment, the order is deleted and the fan sees "you were not charged".
4. Locks that are never paid for simply **expire** after the TTL and the seats return to sale.

The services are stateless; all state lives in Redis and Postgres. That is what lets the
HorizontalPodAutoscaler add and remove pods freely during a surge.

## Platform (local, provisioned by Terraform)

```mermaid
flowchart TB
  tf[[terraform apply<br/>infra/terraform/local]] --> kind
  subgraph kind [kind cluster: 1 control-plane + 2 workers]
    direction LR
    subgraph ns1 [traefik]
      traefik[Traefik<br/>hostPort 80/443]
    end
    subgraph ns2 [monitoring]
      kps[kube-prometheus-stack<br/>Prometheus · Alertmanager · Grafana]
      loki2[Loki] --- alloy2[Alloy]
    end
    subgraph ns3 [kube-system]
      ms[metrics-server] --- ss[Sealed Secrets controller]
    end
    subgraph ns4 [seatsurge-staging]
      s1[SeatSurge release]
    end
    subgraph ns5 [seatsurge-prod]
      p1[SeatSurge release]
    end
  end
```

Ingress is **Traefik**: the community ingress-nginx controller was retired upstream in
March 2026. Every platform chart version is pinned in `infra/terraform/local/variables.tf`.

## Cloud (Azure, `infra/terraform/azure`)

The same Helm chart targets AKS. The Azure module provisions:

- **VNet** + subnet, **AKS** with Azure CNI Overlay + Cilium network policy, Entra ID RBAC,
  workload identity, three availability zones, a system pool and an **autoscaling app pool (1–5 nodes)**
- **ACR**: AKS pulls through its kubelet managed identity (`AcrPull`), so there are no registry passwords
- **Key Vault**: holds the Postgres password; the checkout pod reads it via the CSI driver and a federated workload identity
- **Log Analytics** + Container Insights, managed Prometheus metrics

`terraform validate` runs in CI. `terraform plan` needs an Azure subscription (`az login`).
