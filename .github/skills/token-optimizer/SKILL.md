---
name: token-optimizer
description: 'Cut context cost and token spend in this backend repo. USE FOR: hemat token, optimasi token, context bengkak/bloat, instruksi atau AGENTS.md terlalu panjang, skill/prompt boros, audit context window, estimasi token, sesi lambat atau mahal, merapikan prompt & skill sebelum commit. Keywords: token, hemat, efisien, budget, bloat, context window, audit, trim, prompt, instruksi, skill, ringkas, context engineering.'
argument-hint: "[file atau folder yang mau dihemat]"
---

# Token Optimizer

Two jobs:

1. **Spend less per task** — the frugal contract below, applied to every request in this repo.
2. **Make the repo cheaper to work in** — audit and trim what Copilot loads (`AGENTS.md`, instructions, prompts, skills, `CODE_MAP.md`).

## When to Use

- User says "hemat token", "optimize token", "context kegedean", or "kok mahal/lambat".
- Before and after editing any agent customization file.
- A session is reading whole files, re-reading after edits, or dumping thousands of lines of command output.
- A new project from this template needs a sane context budget.

Do **not** use it to shorten user-facing docs or code comments — those are read by humans, not by the model.

## The Frugal Contract

Apply these by default; they change behavior, not scope.

| Wasteful habit | Do this instead |
| --- | --- |
| Grepping `src/` to find a symbol | Open [CODE_MAP.md](../../CODE_MAP.md) first; grep only what it does not index |
| `view` on a long controller or schema | `view` with `view_range` around the handler being changed |
| Reading a file again after editing it | Trust the edit result; re-read only if a later step depends on exact text |
| Pasting a whole file as the answer | Name the symbol + file link + one sentence on what changed |
| Dumping full `tsc`/ESLint/nodemon output | Keep the tail (`Select-Object -Last 40`) or the failing lines only |
| Streaming a whole server log | Read the request/response envelope lines and any stack trace |
| Re-running the same curl twice "to be safe" | Run once, check the JSON envelope (`error`, `message`), then move on |
| One tool call per probe, one message each | Batch independent probes in a single message |
| Loading a reference doc "just in case" | Load it when the step needs it |
| Handing a single trace to a subagent | Do it directly; delegate only self-contained, multi-file work |
| Restating the request before answering | Lead with the change or the answer |

Output budget: aim for ≤ ~150 words plus the diff, unless the user asks for depth.

## Audit the Repo

```powershell
npm run context:audit            # human report, exit 1 only on ERROR
npm run context:audit -- --json  # machine-readable
```

The report separates:

- **Always-on** — paid on *every* request (`AGENTS.md`, `copilot-instructions.md`, instructions whose `applyTo` matches everything).
- **Discovery surface** — names + descriptions of skills, prompts, and agents. Cheap each, but additive.
- **Frequent** — `CODE_MAP.md`, read by convention on most tasks.
- **On-demand** — skill bodies and references, paid only when that skill loads.
- **Estimated floor** — always-on + discovery; the tokens you pay before any work starts.

## Budgets

| Artifact | Target | Why |
| --- | --- | --- |
| `AGENTS.md` / `copilot-instructions.md` | ≤ 12,000 chars (~3k tokens) | Paid every request |
| Instruction file with `applyTo: "**"` | ≤ 4,000 chars | Paid on every file interaction |
| `SKILL.md` body | ≤ 500 lines, ≤ 16,000 chars | Loaded whole when the skill triggers |
| Skill `references/` file | ≤ 24,000 chars | Loaded on demand; split if bigger |
| Skill/prompt/agent `description` | ≤ 1,024 chars | Discovery surface, always visible |
| Always-on total | ≤ 24,000 chars (~6k tokens) | Leaves room for the actual task |

## Fix Procedure

1. Run the audit and read **always-on first** — a token saved there is saved on every request.
2. Fix in this order:
   - Delete rules duplicated across files (keep one copy; link the rest).
   - Move long procedures out of `AGENTS.md` into a skill or `references/`.
   - Narrow `applyTo` globs so file instructions stop loading for unrelated edits.
   - Shorten descriptions while keeping the trigger keywords that make discovery work.
3. Re-run `npm run context:audit`; the run must end with no `ERROR`.
4. Report before/after: chars, ~tokens, and which file changed.

## Backend-Specific Savings

- `CODE_MAP.md` indexes controllers, routers, middlewares, models, and library helpers — use it before opening `src/controller/*.ts`.
- Prefer `rg "<symbol>" src` over opening a directory listing when the map has no entry.
- When verifying endpoints, one curl per case and summarize the envelope, do not paste raw JSON bodies longer than a few fields.
- `npm run build` output is long; capture the tail only, ESLint warnings are already known and noisy.
- Schema/model files are read-heavy but stable: cite the map entry plus the line range instead of pasting the file.

## Quick Wins

- Replace repeated "how to" prose with a one-line pointer to the skill that owns it.
- Prefer tables and checklists over paragraphs — same rules, fewer tokens.
- Delete stale sections (old deploy notes, resolved TODOs) instead of archiving them in place.
- Merge two tiny skills that always load together; split a skill that needs only one of its references at a time.
- Never put a long example in `SKILL.md`; put it in `references/` and link it.

## References

- [audit-context.mjs](./scripts/audit-context.mjs) — the audit used by `npm run context:audit`.
- [context-budget.md](./references/context-budget.md) — how the estimate works and what the numbers mean.
- [AGENTS.md](../../../AGENTS.md) — repository rules that already encode part of this contract.
