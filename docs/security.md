# Security & secrets management (DevSecOps)

Security is checked at every stage of the pipeline: *shift left*.

| Stage | Control | Tool | Where |
|---|---|---|---|
| Commit | Secret scanning of the full git history | **gitleaks** | `security.yml` |
| Commit | SAST for Python, TypeScript and workflow files | **CodeQL** (`security-and-quality`) | `codeql.yml` |
| Commit | Lint rules incl. security rules (`S` = bandit) | **ruff**, eslint | `ci.yml` |
| Commit | IaC misconfiguration: Terraform, Helm, Dockerfiles, Actions | **Checkov** | `security.yml` |
| Commit | Vulnerable dependencies (pip, npm lockfiles) | **Trivy fs** + **Dependabot** | `security.yml`, `dependabot.yml` |
| Build | Dockerfile best practices | **hadolint** | `ci.yml` |
| Build | Image CVE scan; **build fails on any fixable CRITICAL** | **Trivy image** | `ci.yml` |
| Build | Software bill of materials (SPDX) | **Syft** (`anchore/sbom-action`) | `ci.yml` artifacts |
| Deploy | Production deploy needs human approval | GitHub Environments | `cd.yml` |
| Runtime | Non-root, read-only root FS, all Linux capabilities dropped, seccomp `RuntimeDefault`, no service-account token | Pod `securityContext` | Helm chart |
| Runtime | Encrypted secrets in git | **Sealed Secrets** | `values-prod.yaml` |
| Cloud | Secrets in Key Vault, pods read them via workload identity (no passwords) | Azure Key Vault + Entra workload ID | `infra/terraform/azure` |

All SARIF results (CodeQL, Trivy, gitleaks, Checkov) land in the repository's **Security → Code scanning** tab.

## Real example: the gate caught critical CVEs

While building v1.0.0, the Trivy gate found fixable **CRITICAL** CVEs in two base images:
`brotli` in `nginx-unprivileged:alpine` and `libssl3` in `distroless/nodejs24-debian12`.
Fixes: `apk upgrade` in the web runtime stage, and moving checkout to `distroless/nodejs24-debian13`.
After the change, all three images scan clean for fixable CRITICAL issues.

## Secrets management

Secrets never live in git as plaintext. There are three layers:

1. **CI/CD secrets**: GitHub Actions uses the short-lived, automatically scoped `GITHUB_TOKEN`
   to push to GHCR. No long-lived registry passwords exist.
2. **Kubernetes secrets (local cluster)**: the prod Postgres password is a **SealedSecret**.
   `kubeseal` encrypts it with the in-cluster controller's public key; only the controller can
   decrypt it, and only for the `seatsurge-postgres` Secret in the `seatsurge-prod` namespace
   (strict scope), so the ciphertext is safe to commit. Rotate with
   `./scripts/seal-secret.ps1 -Environment prod`.
   Staging uses a Helm-generated random password that is created once and preserved across
   upgrades (`lookup` + `helm.sh/resource-policy: keep`).
3. **Cloud (Azure)**: Terraform creates the password in **Key Vault**; the checkout pod reads it
   through the Secrets Store CSI driver using an Entra **workload identity** federated to its
   Kubernetes service account. AKS pulls images from ACR through its managed identity.

### Accepted risks (Checkov skips)

| Check | Why accepted |
|---|---|
| `CKV_K8S_43` image digests | Images use immutable `sha-<commit>` tags produced by CI |
| `CKV_K8S_35` secrets as env vars | The DB URL is assembled from the Secret at runtime; no secret is in the manifest |
| `CKV_TF_1` module commit hash | No external Terraform modules are used |
