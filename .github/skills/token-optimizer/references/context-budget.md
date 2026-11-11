# Context Budget

How the numbers from `npm run context:audit` are produced, and what to do with them.

## The estimate

- `tokens ≈ chars / 4` — a rough English/code ratio. Useful for comparing files and tracking direction; not a billing figure.
- `lines` is used only for skill bodies, because a 500-line `SKILL.md` is the usual sign that detail belongs in `references/`.

Real cost differs by model and tokenizer, but the relative ordering is stable: trimming a 6,000-char always-on file saves ~1,500 tokens on *every* request, while trimming an on-demand reference saves nothing until that skill loads.

## What Copilot loads when

| Group | Files | When it costs tokens |
| --- | --- | --- |
| Always-on | `AGENTS.md`, `.github/copilot-instructions.md`, instructions whose `applyTo` matches the current file | Every request (or every matching file interaction) |
| Discovery | `name` + `description` of every skill, prompt, and agent | Every request — additive across all skills |
| Frequent | `.github/CODE_MAP.md` | Whenever the agent follows the "read the map first" rule |
| On-demand | `SKILL.md` body, `references/`, `assets/`, `scripts/` output | Only when that skill triggers or a step reads it |

## Reading the report

- **`estimated floor`** — what a request costs before any work starts. Watch this number; it is the one that compounds.
- **`discovery surface`** — each description is small, but every installed skill pays for it on every turn. Ten unused skills with 400-char descriptions ≈ 1,000 tokens per request.
- **`ERROR`** — invalid customization: missing frontmatter, `name` not matching the folder, description over 1,024 chars, missing skill description. Fix before merging; these break discovery.
- **`WARN`** — over budget but functional. Treat as a cleanup queue, not a blocker.

## Trimming without losing behavior

1. **Deduplicate.** If `AGENTS.md` and a skill say the same thing, keep the shorter copy and link to the owner.
2. **Move procedures down a level.** `AGENTS.md` keeps rules and pointers; skills keep steps; `references/` keeps examples and long tables.
3. **Narrow `applyTo`.** `applyTo: "src/controller/**"` costs nothing when editing a schema; `applyTo: "**"` costs on everything.
4. **Compress prose into tables.** Same rules, roughly half the tokens, easier to scan.
5. **Keep trigger keywords.** A shorter description is only a win if discovery still works. Keep the "USE FOR" phrases and the domain keywords.
6. **Delete stale content.** Old deploy notes, resolved TODOs, and duplicated setup docs are pure tax.

## Guardrails

- Do not delete a rule just to hit a number — move it first, then delete only genuine duplicates.
- Do not push `SKILL.md` under 1,000 chars by removing steps the skill actually needs; a skill that fails and gets retried costs more than a slightly longer one.
- Re-run the audit after editing; the run must end with `Result: OK`.
- Keep this file short too — it is itself an on-demand reference with a budget.
