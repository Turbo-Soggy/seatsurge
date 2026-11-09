variable "subscription_id" {
  description = "Azure subscription to deploy into (null = use ARM_SUBSCRIPTION_ID / az login default)"
  type        = string
  default     = null
}

variable "prefix" {
  description = "Name prefix for every resource"
  type        = string
  default     = "seatsurge"
}

variable "environment" {
  description = "Deployment stage"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "environment must be staging or prod."
  }
}

variable "location" {
  description = "Azure region (Central India is closest to the Bengaluru venue)"
  type        = string
  default     = "centralindia"
}

variable "kubernetes_version" {
  description = "AKS Kubernetes version (null = AKS default)"
  type        = string
  default     = null
}

variable "system_node_size" {
  description = "VM size for the system node pool"
  type        = string
  default     = "Standard_B2s"
}

variable "app_node_size" {
  description = "VM size for the autoscaling application node pool"
  type        = string
  default     = "Standard_B2ms"
}

variable "app_node_min" {
  type    = number
  default = 1
}

variable "app_node_max" {
  description = "Cluster autoscaler ceiling for ticket-drop surges"
  type        = number
  default     = 5
}

variable "admin_group_object_ids" {
  description = "Entra ID groups that get cluster-admin via Azure RBAC"
  type        = list(string)
  default     = []
}

variable "tags" {
  type = map(string)
  default = {
    project    = "seatsurge"
    managed_by = "terraform"
    course     = "24DC2006-devops"
  }
}
