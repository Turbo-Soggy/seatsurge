output "kube_context" {
  description = "kubectl context for the cluster"
  value       = "kind-${kind_cluster.this.name}"
}

output "urls" {
  description = "Where to find everything"
  value = {
    app_prod     = "http://seatsurge.${var.base_domain}"
    app_staging  = "http://staging.seatsurge.${var.base_domain}"
    grafana      = "http://grafana.${var.base_domain}"
    prometheus   = "http://prometheus.${var.base_domain}"
    alertmanager = "http://alertmanager.${var.base_domain}"
  }
}

output "grafana_admin_password" {
  description = "Grafana admin password (user: admin)"
  value       = random_password.grafana_admin.result
  sensitive   = true
}
