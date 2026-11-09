variable "cluster_name" {
  description = "Name of the kind cluster"
  type        = string
  default     = "seatsurge"
}

variable "worker_count" {
  description = "Number of kind worker nodes"
  type        = number
  default     = 2

  validation {
    condition     = var.worker_count >= 1 && var.worker_count <= 5
    error_message = "worker_count must be between 1 and 5."
  }
}

variable "app_environments" {
  description = "Application namespaces to create (one per deployment stage)"
  type        = list(string)
  default     = ["staging", "prod"]
}

variable "base_domain" {
  description = "Base domain for ingress hosts. *.localhost resolves to 127.0.0.1 in browsers."
  type        = string
  default     = "localhost"
}

variable "chart_versions" {
  description = "Pinned Helm chart versions for the platform components"
  type        = map(string)
  default = {
    traefik               = "42.3.1"
    kube_prometheus_stack = "93.1.0"
    loki                  = "7.5.0"
    alloy                 = "1.15.0"
    metrics_server        = "3.14.0"
    sealed_secrets        = "2.22.0"
  }
}
