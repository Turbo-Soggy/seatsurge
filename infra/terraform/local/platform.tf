# ---------------------------------------------------------------------------
# Ingress: Traefik (ingress-nginx was retired upstream in March 2026)
# ---------------------------------------------------------------------------
resource "helm_release" "traefik" {
  name             = "traefik"
  repository       = "https://traefik.github.io/charts"
  chart            = "traefik"
  version          = var.chart_versions.traefik
  namespace        = "traefik"
  create_namespace = true
  wait             = true

  values = [yamlencode({
    deployment   = { replicas = 1 }
    nodeSelector = { "ingress-ready" = "true" }
    tolerations = [{
      key      = "node-role.kubernetes.io/control-plane"
      operator = "Exists"
      effect   = "NoSchedule"
    }]
    ports = {
      web       = { hostPort = 80 }
      websecure = { hostPort = 443 }
    }
    service      = { spec = { type = "ClusterIP" } }
    ingressClass = { enabled = true, isDefaultClass = true }
    metrics = {
      prometheus = {
        service        = { enabled = true }
        serviceMonitor = { enabled = true }
      }
    }
  })]

  depends_on = [helm_release.kube_prometheus_stack]
}

# ---------------------------------------------------------------------------
# metrics-server: feeds CPU/memory to the HorizontalPodAutoscaler
# ---------------------------------------------------------------------------
resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = var.chart_versions.metrics_server
  namespace  = "kube-system"

  values = [yamlencode({
    # kind kubelets use self-signed serving certs
    args = ["--kubelet-insecure-tls", "--metric-resolution=15s"]
  })]

  depends_on = [kind_cluster.this]
}

# ---------------------------------------------------------------------------
# Sealed Secrets: lets us commit encrypted secrets to git safely
# ---------------------------------------------------------------------------
resource "helm_release" "sealed_secrets" {
  name       = "sealed-secrets"
  repository = "https://bitnami.github.io/sealed-secrets"
  chart      = "sealed-secrets"
  version    = var.chart_versions.sealed_secrets
  namespace  = "kube-system"

  values = [yamlencode({
    fullnameOverride = "sealed-secrets-controller"
  })]

  depends_on = [kind_cluster.this]
}
