resource "random_password" "grafana_admin" {
  length  = 20
  special = false
}

resource "kubernetes_secret" "grafana_admin" {
  metadata {
    name      = "grafana-admin"
    namespace = kubernetes_namespace.monitoring.metadata[0].name
  }
  data = {
    admin-user     = "admin"
    admin-password = random_password.grafana_admin.result
  }
}

# ---------------------------------------------------------------------------
# Prometheus + Alertmanager + Grafana (+ node-exporter, kube-state-metrics)
# ---------------------------------------------------------------------------
resource "helm_release" "kube_prometheus_stack" {
  name       = "kps"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = var.chart_versions.kube_prometheus_stack
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  timeout    = 900

  values = [yamlencode({
    fullnameOverride = "kps"

    # Control-plane components are not reachable for scraping on kind.
    kubeEtcd              = { enabled = false }
    kubeControllerManager = { enabled = false }
    kubeScheduler         = { enabled = false }
    kubeProxy             = { enabled = false }

    prometheus = {
      ingress = { enabled = true, ingressClassName = "traefik", hosts = ["prometheus.${var.base_domain}"] }
      prometheusSpec = {
        scrapeInterval                          = "15s"
        evaluationInterval                      = "15s"
        retention                               = "3d"
        serviceMonitorSelectorNilUsesHelmValues = false
        podMonitorSelectorNilUsesHelmValues     = false
        ruleSelectorNilUsesHelmValues           = false
      }
    }

    alertmanager = {
      ingress = { enabled = true, ingressClassName = "traefik", hosts = ["alertmanager.${var.base_domain}"] }
    }

    grafana = {
      admin = {
        existingSecret = kubernetes_secret.grafana_admin.metadata[0].name
        userKey        = "admin-user"
        passwordKey    = "admin-password"
      }
      ingress = { enabled = true, ingressClassName = "traefik", hosts = ["grafana.${var.base_domain}"] }
      "grafana.ini" = {
        server     = { root_url = "http://grafana.${var.base_domain}" }
        dashboards = { default_home_dashboard_path = "/tmp/dashboards/SeatSurge/seatsurge.json" }
        # Local demo convenience: read-only dashboards without login. Admin still needs the password.
        "auth.anonymous" = { enabled = true, org_role = "Viewer" }
      }
      sidecar = {
        dashboards = {
          enabled          = true
          label            = "grafana_dashboard"
          searchNamespace  = "ALL"
          folderAnnotation = "grafana_folder"
          provider         = { foldersFromFilesStructure = true }
        }
      }
      additionalDataSources = [{
        name      = "Loki"
        type      = "loki"
        uid       = "loki"
        url       = "http://loki.monitoring.svc:3100"
        access    = "proxy"
        isDefault = false
      }]
    }
  })]
}

# ---------------------------------------------------------------------------
# Loki (log storage) + Grafana Alloy (log shipping from every pod)
# ---------------------------------------------------------------------------
resource "helm_release" "loki" {
  name       = "loki"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "loki"
  version    = var.chart_versions.loki
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  timeout    = 600

  values = [yamlencode({
    deploymentMode = "SingleBinary"
    loki = {
      auth_enabled = false
      commonConfig = { replication_factor = 1 }
      storage      = { type = "filesystem" }
      schemaConfig = {
        configs = [{
          from         = "2024-04-01"
          store        = "tsdb"
          object_store = "filesystem"
          schema       = "v13"
          index        = { prefix = "index_", period = "24h" }
        }]
      }
      limits_config = { retention_period = "72h" }
    }
    singleBinary = { replicas = 1, persistence = { size = "5Gi" } }
    backend      = { replicas = 0 }
    read         = { replicas = 0 }
    write        = { replicas = 0 }
    gateway      = { enabled = false }
    chunksCache  = { enabled = false }
    resultsCache = { enabled = false }
    lokiCanary   = { enabled = false }
    test         = { enabled = false }
    minio        = { enabled = false }
  })]
}

resource "helm_release" "alloy" {
  name       = "alloy"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "alloy"
  version    = var.chart_versions.alloy
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  values = [yamlencode({
    controller = { type = "deployment", replicas = 1 }
    alloy = {
      configMap = {
        content = file("${path.module}/alloy-config.alloy")
      }
    }
  })]

  depends_on = [helm_release.loki]
}

# ---------------------------------------------------------------------------
# SeatSurge Grafana dashboard, picked up by the Grafana sidecar
# ---------------------------------------------------------------------------
resource "kubernetes_config_map" "seatsurge_dashboard" {
  metadata {
    name        = "seatsurge-dashboard"
    namespace   = kubernetes_namespace.monitoring.metadata[0].name
    labels      = { grafana_dashboard = "1" }
    annotations = { grafana_folder = "SeatSurge" }
  }
  data = {
    "seatsurge.json" = file("${path.module}/../../../monitoring/dashboards/seatsurge.json")
  }
}
