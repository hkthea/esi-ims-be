<!-- template-status: not-initialized -->
# Repository Guidelines

> **Status: TEMPLATE — belum di-init.** `package.json` masih bernama `template-be-ts`, CI masih di branch placeholder `nobranch`, dan image/namespace/service masih nilai template. Perlakukan repo ini sebagai template: jangan deploy sebelum di-init, dan kalau user minta "bikin project baru", "rename", atau "ganti registry", jalankan skill `init-project` (`npm run project:init`). Cek status dengan `npm run project:status`.

## Starting a new project from this template
- This repo is a template. To turn it into a real project, use the `init-project` skill (script: `.github/skills/init-project/scripts/init-project.mjs`, npm alias `npm run project:init`).
- It rewrites every project identity in one run: `package.json` name/version/description, `package-lock.json`, `src/library/config.ts` app name, `.env.example`, `ecosystem.config.js` app name, `version.json`, the CI `env:` block and trigger branch, `templates/deployment.yaml.template` host/ingress path, the deployer action defaults, the README/AGENTS docs, and the status markers.
- Always dry-run first: `npm run project:init -- --project=<slug> --display="<Name>" --dry-run`, then apply without `--dry-run`, then verify with `npm run code-map:check`, `npm run build`, and `npm run lint`.- Check the status any time with `npm run project:status` (exit 2 = still a template). The `<!-- template-status: … -->` marker on the first line of this file is flipped by the script, so the status stays accurate across sessions.
- The script matches exact template strings; extend its edit list rather than hand-patching files.

## Code Map (read it first, keep it current)
- **Always read [`.github/CODE_MAP.md`](.github/CODE_MAP.md) before searching or changing code.** It indexes every exported controller, router, middleware, model factory, library helper, type, and seeder with its file path and purpose.
- Every change that **adds, renames, moves, or deletes** a symbol must update the map in the same change: add the new entry, fix the description on rename, move the entry when the code moves, and **delete the index line when a function is deleted** (delete the whole `###` section for that file if nothing is left).
- Verify with `npm run code-map:check` before reporting work as done — it must print `Code map is in sync.` The check reports `MISSING` (export without an entry), `STALE` (entry whose symbol no longer exists), and `UNKNOWN FILE`.
- Entry format, kinds, deletion/rename checklists: [.github/skills/maintain-code-map/SKILL.md](.github/skills/maintain-code-map/SKILL.md).

## Token & Context Budget
- Follow the frugal contract in [.github/skills/token-optimizer/SKILL.md](.github/skills/token-optimizer/SKILL.md): open the code map before grepping `src/`, use `view_range` on long controllers, do not re-read after your own edits, batch independent tool calls, one curl per case, and keep `tsc`/ESLint/log output to the tail.
- `npm run context:audit` reports what this repo's own Copilot files cost: always-on files, the discovery surface (skill descriptions), on-demand references, and an estimated token floor per request. Add `-- --json` for machine-readable output; exit 1 means a customization file is invalid.
- Budgets: `AGENTS.md` ≤ 12k chars, instructions whose `applyTo` matches every file ≤ 4k chars, `SKILL.md` ≤ 500 lines, references ≤ 24k chars, descriptions ≤ 1,024 chars, always-on total ≤ 24k chars (~6k tokens).
- After adding or editing instructions, prompts, or skills, run the audit and keep it at `Result: OK`.

## Security Audit Skill (Cloudflare, vendored)
- [`.github/skills/security-audit/`](.github/skills/security-audit/SKILL.md) is copied unchanged from [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) (MIT, `LICENSE` sits next to `SKILL.md`). Do not hand-edit it; update by re-copying that repo's `skills/security-audit/`.
- **Run it only on explicit command.** Nothing in this file authorizes an automatic or "helpful" security review. Act only when the user explicitly asks for a security audit, vulnerability review, or pen-test in the current message. Never start one on your own initiative — not while implementing a feature, reviewing a diff, fixing a bug, or as an unsolicited extra check. If you think an audit is warranted, say so in one sentence and wait; the user decides whether, when, and how far it runs, including mode (guidance vs full audit) and output location.
- It activates on "security audit this codebase", "find vulnerabilities", or "pen-test". Full audit mode writes `architecture.md`, `coverage-ledger.json`, `findings.json`, `REPORT.md` outside the repo, under `~/security-audit-skill/<repo>/run-<N>`.
- Windows caveat: `validate-findings.cjs` and `validate-coverage-ledger.cjs` hard-require `O_NOFOLLOW`/`O_NONBLOCK`, so every CLI validation fails here with "OS no-follow and nonblocking input protection is unavailable". Guidance mode works; run full audit mode on Linux/macOS. No OS-enforced sandbox exists here either, so target-controlled builds/tests must stay unexecuted and leads stay `needs_validation`.

## Project Structure and Module Organization
- `src/index.ts`: bootstrap — dotenv, Mongo connection, CORS for `DEV=true`, static `/public`, listen on `11611`, 404 envelope.
- `src/router.ts`: root router; mounts `/version`, `/auth`, `/seeder`, and auth-protected resource routers.
- `src/controller`: route handlers and the generic CRUD/auth factories in `utils.ts`.
- `src/library`: config, JWT signer, version reader, random-string/log helpers.
- `src/model`: business logic (`base_users.ts` factory, `users.ts` instance, generic `utils.ts`).
- `src/schema`: Mongoose schemas/models (`user`, `airline`, `activity_log`).
- `src/seeder`: one-off data seeders.
- `templates/deployment.yaml.template`: Kubernetes Deployment/Service/Ingress with `${...}` placeholders.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start with nodemon + ts-node (`src/index.ts`).
- `npm run build`: compile TypeScript to `dist/`.
- `npm start`: run the compiled app (`node dist/index.js`).
- `npm run debug`: run with `ts-node-dev`.
- `npm run lint`: run ESLint.
- `npm run code-map:check`: verify `.github/CODE_MAP.md` is in sync with `src/`.
- `npm run project:status`: report whether this repo is still a template or an initialized project.
- `npm run project:init -- ...`: initialize the template into a project (see the section above).

## Coding Style and Naming Conventions
- TypeScript + CommonJS, 2/4-space indentation as in the surrounding file, single quotes, semicolons.
- All responses use the `{ error, data, message }` envelope; throw inside `CtrlHandler` callbacks instead of writing error responses by hand.
- Authenticated routes go behind `AuthMiddleware(decode)`; the token header is `srawungtoken` (or `Authorization: Bearer`).
- New CRUD resources: schema with `deletedAt`, controller built with `createCrudController`, mounted in `router.ts`. Follow the `add-crud-resource` skill.
- Soft delete is automatic when the schema declares `deletedAt`; never hard-delete user-facing data unless the schema intentionally omits the field.
- `createModel` strips `_id`/`createdBy`/`createdAt` from `$set` — do not send them yourself.

## Testing Guidelines
No automated test framework is configured. Before reporting done, run `npm run build` and `npm run lint`, then exercise changed endpoints manually:

```bash
curl -X POST http://localhost:11611/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"rahasia123"}'
curl http://localhost:11611/api/v1/airlines?page=1&perPage=10 -H "srawungtoken: <jwt>"
```

Add new curl examples to the README when you add endpoints.

## Commit and Pull Request Guidelines
Recent history follows Conventional Commits (e.g. `feat:`, `fix:`). Keep commits small and scoped.
Pull requests should include:
- A short summary of changes and impact.
- Verify steps (`npm run build`, `npm run lint`, `npm run code-map:check`, curl output).
- Linked issues or tickets when applicable.

## CI and Deployment Notes
- `.github/workflows/main.yaml` follows the `broadcaster-be` pattern: `lint` (`npm ci` + `npm run lint -- --cache` + `npm run code-map:check`) → `build` (Docker image pushed as `<short-sha>` and `latest`) → `deploy` (`kubectl set env` + `set image` + `rollout status` on the `deployer` runner).
- `.github/workflows/staging.yaml` mirrors the pipeline for the `staging` branch: `push` to `staging` (or `workflow_dispatch`) runs the same `lint` → `build` → `deploy`, but the image is tagged `staging` and `staging-<sha>` and deployed to the staging `NAMESPACE`/`DEPLOYMENT`. Every staging job targets the runner group `home-lab-pdl` with label `homelab-pdl`, so that runner group needs registry and kubeconfig access.
- During template status the push trigger is pinned to the placeholder branch `nobranch` so pushing never deploys; pipeline runs via `workflow_dispatch`. Change `branches` to the real branch when turning it into a project.
- Template values live in the top-level `env:` block of the workflow (`REGISTRY`, `IMAGE_NAME`, `NAMESPACE`, `DEPLOYMENT`, `NODE_VERSION`) — change them when copying this template to a new project. `Dockerfile` is multi-stage and builds TypeScript inside the image, so CI only needs Docker.
- `templates/deployment.yaml.template`: Kubernetes Deployment/Service/Ingress with `${...}` placeholders, used for the one-time cluster bootstrap. Ingress host `template.com` and path `/service` are literals replaced by `init-project`.
- `.github/skills`: agent skills — `agent-customization`, `maintain-code-map`, `init-project`, `add-crud-resource`, `qa-handoff`.
- The runtime secret `${DEPLOYMENT}-env` must exist in the namespace with `DATABASE_CONNECTION`, `AUTHHEADER`, `SALT`, `PRIVATE_KEY`, and `PUBLIC_KEY`.
- Registry credentials: `DOCKER_USERNAME`, `DOCKER_PASSWORD`. Telegram notifications use `BOT_TOKEN`/`CHAT_ID` via `.github/scripts/notify-telegram.sh` and are `continue-on-error`.
- `eslint.config.mjs` keeps `@typescript-eslint/no-explicit-any` and `no-unused-vars` at `warn` so `npm run lint` exits 0 and CI stays green; tighten once the API surface settles.

## QA handoff (staging)

- Every staging deploy opens or updates a GitHub issue labelled `qa` + `qa:request` listing the endpoints touched by that commit. The feature list comes from [`qa/features.json`](qa/features.json) (feature → `paths` → `steps`/`expected`), mapped against the deploy diff by [`.github/scripts/qa-request.mjs`](.github/scripts/qa-request.mjs) in the `qa-handoff` job.
- The QA/QC agent contract is [`.github/skills/qa-handoff/SKILL.md`](.github/skills/qa-handoff/SKILL.md): test only on staging, post one `QA RESULT: PASS|FAIL` comment, open a `qa:bug` + `sev:1|2|3` issue per failure, and never fix code from the QA session.
- Adding an endpoint or changing its contract means updating `qa/features.json` in the same change. If the generated issue lists files under "belum ter-mapping", the manifest is stale.
- QA credentials never live in the repo or the issue: the QA agent holds `QA_USERNAME` / `QA_PASSWORD` as its own secrets and logs in via `POST /auth/login`. Features marked `hidden: true` — currently the `user-seeder` entry — keep their `paths` mapped (so seeder files never leak into "belum ter-mapping") but are never rendered into the issue. Use `hidden` for admin/utility endpoints.
- Preview the issue locally without touching GitHub: `$env:QA_DRY_RUN='1'; $env:BASE_SHA='HEAD~3'; node .github/scripts/qa-request.mjs`.
