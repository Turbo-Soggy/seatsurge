output "resource_group" {
  value = azurerm_resource_group.this.name
}

output "aks_name" {
  value = azurerm_kubernetes_cluster.this.name
}

output "get_credentials" {
  description = "Command to fetch kubeconfig"
  value       = "az aks get-credentials -g ${azurerm_resource_group.this.name} -n ${azurerm_kubernetes_cluster.this.name}"
}

output "acr_login_server" {
  value = azurerm_container_registry.this.login_server
}

output "key_vault_uri" {
  value = azurerm_key_vault.this.vault_uri
}

output "checkout_workload_identity_client_id" {
  description = "Annotate the checkout ServiceAccount with azure.workload.identity/client-id"
  value       = azurerm_user_assigned_identity.checkout.client_id
}
