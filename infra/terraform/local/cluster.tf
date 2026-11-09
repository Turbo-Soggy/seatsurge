# A multi-node Kubernetes cluster running in Docker (kind).
# The control-plane node publishes host ports 80/443 so the ingress controller
# is reachable at http://*.localhost from the Windows host.
resource "kind_cluster" "this" {
  name           = var.cluster_name
  wait_for_ready = true

  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    node {
      role = "control-plane"
      labels = {
        "ingress-ready" = "true"
      }
      extra_port_mappings {
        container_port = 80
        host_port      = 80
        protocol       = "TCP"
      }
      extra_port_mappings {
        container_port = 443
        host_port      = 443
        protocol       = "TCP"
      }
    }

    dynamic "node" {
      for_each = range(var.worker_count)
      content {
        role = "worker"
      }
    }
  }
}

resource "kubernetes_namespace" "monitoring" {
  metadata {
    name   = "monitoring"
    labels = { "app.kubernetes.io/part-of" = "platform" }
  }
}

resource "kubernetes_namespace" "app" {
  for_each = toset(var.app_environments)

  metadata {
    name = "seatsurge-${each.key}"
    labels = {
      "app.kubernetes.io/part-of" = "seatsurge"
      "seatsurge.io/environment"  = each.key
    }
  }
}
