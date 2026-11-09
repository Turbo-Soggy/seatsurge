# Contributing to SeatSurge

1. Read the [branching strategy](docs/branching-strategy.md).
2. Branch from `develop`: `git switch -c feature/<name> develop`.
3. Run the service's checks before pushing:

   | Service | Commands |
   |---|---|
   | inventory | `pip install -r requirements-dev.txt && ruff check . && pytest` |
   | checkout | `npm ci && npm run lint && npm run typecheck && npm test` |
   | web | `npm ci && npm run lint && npm test` |
   | Helm | `helm lint deploy/helm/seatsurge -f deploy/helm/seatsurge/values-prod.yaml` |
   | Terraform | `terraform fmt -check -recursive infra/terraform` |

4. Try it end to end with `docker compose up --build` → http://localhost:8080.
5. Open a PR into `develop` and fill in the template. CI must be green before merge.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat(inventory): …`, `fix(checkout): …`, `ci: …`, `docs: …`, `chore: …`.
