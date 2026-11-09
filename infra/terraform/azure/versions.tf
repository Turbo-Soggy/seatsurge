terraform {
  required_version = ">= 1.9"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.13"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # Remote state in Azure Storage (state locking via blob leases).
  # Create once with scripts/azure-bootstrap-state.sh, then uncomment:
  # backend "azurerm" {
  #   resource_group_name  = "seatsurge-tfstate"
  #   storage_account_name = "seatsurgetfstate"
  #   container_name       = "tfstate"
  #   key                  = "seatsurge.prod.tfstate"
  # }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = false
    }
  }
  # Read from ARM_SUBSCRIPTION_ID or `az login` context.
  subscription_id = var.subscription_id
}
