---
name: init-project
description: 'Turn this backend template into a concrete project: rename every project identity (npm name/version, lockfile, app name in config + PM2, .env.example, version.json, Docker registry image, Kubernetes namespace/deployment, ingress host/path, CI branch and job env, deployer action defaults, README/AGENTS docs) in one safe run. USE FOR: starting a new backend project from this template, rebranding, renaming the app, changing the docker image/registry, namespace, deployment target, ingress host, re-enabling the CI push trigger. Keywords: init project, inisialisasi project, template backend baru, rename project, rebrand, ganti nama aplikasi, docker registry, IMAGE_NAME, NAMESPACE, DEPLOYMENT, nobranch, branch CI, setup awal.'
argument-hint: "[nama-project]"
---

# Initialize Backend Template → Project

This repo is a template. The moment it becomes a real project, every identity string inside it is wrong: the npm name, the app name baked into the config, the PM2 app name, the local MongoDB name, the Docker image, the Kubernetes namespace and deployment, the ingress host/path, and — most importantly — the CI trigger is pinned to the placeholder branch `nobranch` so nothing ever deploys.

This skill does that conversion once, deterministically, and refuses to run on a repo that is already initialized.

## When to Use

- "Buat project backend baru dari template ini", "ganti nama project", "rename app".
- Changing the Docker image/registry, Kubernetes namespace, deployment name, or ingress host.
- Re-enabling automatic deploys after copying the template (branch `nobranch` → real branch).

Do **not** use it to bump the app version or changelog later — edit [version.json](../../../version.json) directly for that.

## Check the status first

```powershell
npm run project:status
```

- `NOT INITIALIZED` (exit code 2): still the template. Safe to run `project:init`.
- `INITIALIZED` (exit code 0): a concrete project already. Do not re-initialize with a new slug unless the user explicitly asks and understands the consequences.

The status comes from two durable markers, so it survives across sessions:

| Marker | Where | Template value | After init |
| --- | --- | --- | --- |
| HTML comment | first line of `AGENTS.md` | `<!-- template-status: not-initialized -->` | `<!-- template-status: initialized -->` |
| Status line | top of `AGENTS.md` and `README.md` | "TEMPLATE — belum di-init" | "INITIALIZED … sebagai X" |

`AGENTS.md` is loaded as repository instructions on every task, so an agent acting in this repo always sees whether the project has been initialized — treat that status line as authoritative when the user talks about "this project", the registry, the namespace, or the deployment name.

## Before you start

Ask the user for these values (only `--project` is mandatory; everything else has a sensible default):

| Value | Flag | Default |
| --- | --- | --- |
| project slug (npm name, app name fallback, local DB name) | `--project` | — |
| human title (workflow name, README, docs) | `--display` | slug |
| docker image without tag | `--image` | `registry.edifly-dev.com/esi-dev/<project>-be` |
| k8s namespace | `--namespace` | `dev-<project>` |
| k8s deployment name | `--deployment` (alias `--service`) | `<project>-backend` |
| CI deploy branch | `--branch` | `master` |
| Node major version for CI | `--node` | `18` |
| package version | `--version` | `0.1.0` |
| ingress host | `--host` | `<project>.com` |
| ingress path prefix | `--ingress-path` | `/service` |

Confirm the slug with the user before writing — it becomes the npm package name, the config app-name fallback, and the local MongoDB database name (`-` becomes `_`).

## Procedure

### 1. Dry run first

```powershell
node .github/skills/init-project/scripts/init-project.mjs --project=myapp --display="My App" --dry-run
```

Reports every file that will change plus the resolved image/namespace/deployment/branch. Nothing is written. If it lists an unexpected file or errors that the repo "does not look like a pristine template", stop and inspect before continuing.

### 2. Apply

```powershell
node .github/skills/init-project/scripts/init-project.mjs `
  --project=myapp `
  --display="My App" `
  --image=registry.edifly-dev.com/esi-dev/myapp-be `
  --namespace=dev-myapp `
  --deployment=myapp-backend `
  --branch=master `
  --host=api.myapp.com `
  --ingress-path=/service
```

What it rewrites:

| Area | Files |
| --- | --- |
| npm identity | `package.json` (name, version, description), `package-lock.json` (root + workspace name/version) |
| App name fallback | `src/library/config.ts` (`appName` + `process.env.NAME` fallback) |
| Local env | `.env.example` (`NAME`, database name in `DATABASE_CONNECTION`) |
| Process manager | `ecosystem.config.js` (`apps[0].name`) |
| Version history | `version.json` reset to one `{ version, description }` entry |
| CI identity | `.github/workflows/main.yaml` (name, trigger branch + comment, `REGISTRY`/`IMAGE_NAME`, `NAMESPACE`, `DEPLOYMENT`, `NODE_VERSION`) and `.github/workflows/staging.yaml` (name, `IMAGE_NAME`, staging `NAMESPACE`/`DEPLOYMENT`, `NODE_VERSION`) |
| Bootstrap action | `.github/actions/deployer/action.yml` (default image + deployment) |
| Ingress identity | `templates/deployment.yaml.template` (TLS host, secret name, host, path) |
| Docs | `README.md` title/summary/status/trigger paragraph/env block/ingress sentence/secret name, `AGENTS.md` status + template section + CI notes |
| Status | `AGENTS.md` + `README.md` status line and the `<!-- template-status: … -->` marker flipped to `initialized` |

**What it must NOT touch:** the `${IMAGE}`, `${NAMESPACE}`, `${DEPLOYMENT}`, `${VERSION}`, `${INSTANCE}` placeholders in the deployment template (the composite action fills them per deploy), the `agent-customization` / `maintain-code-map` / `add-crud-resource` skill docs, or source code behavior.

### 3. Verify

```powershell
npm run code-map:check
npm run build
npm run lint
```

All three must pass before reporting done. Renamed strings do not change symbols, so the map should stay in sync — if `code-map:check` complains, the rename touched code and the map needs the matching update.

### 4. Remaining manual steps

The script prints these; do them with the user:

1. `git remote set-url origin <new-repo-url>` (or start a fresh history).
2. Set GitHub secrets: `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `BOT_TOKEN`, `CHAT_ID`.
3. Create the runtime secret `<deployment>-env` in namespace `<namespace>` with `DATABASE_CONNECTION`, `AUTHHEADER`, `SALT`, `PRIVATE_KEY`, `PUBLIC_KEY`.
4. Confirm the runner labels exist (`amd64`/`k3s` for lint + build, `deployer` for deploy); adjust `runs-on` when the target cluster differs.
5. Bootstrap the cluster once with `templates/deployment.yaml.template` (composite action) if the deployment does not exist yet; after that, the workflow deploys via `kubectl set image`.
6. Add a real `/version` entry to `version.json` when you ship.

## Safety Rules

- Never hand-edit the template sentinels after running the script; use `--force` only when you intentionally rename an already-initialized project.
- The script validates every match (and its expected count) before writing; on any mismatch it aborts with nothing written. If it fails after you changed the template, fix the script's `edits` list rather than hand-patching files.
- One-way operation for a repo: it refuses to run when `package.json` no longer says `template-be-ts` unless `--force` is passed.
- Keep deployment credentials out of the repo; they belong in GitHub/Kubernetes secrets.

## References

- [init-project.mjs](./scripts/init-project.mjs) — the rename script (`--help`-style usage in the header comment).
- [AGENTS.md](../../../AGENTS.md) — repo conventions the script keeps in sync.
- [.github/CODE_MAP.md](../../CODE_MAP.md) — verify after the rename with `npm run code-map:check`.
