---
name: maintain-code-map
description: 'Keep .github/CODE_MAP.md in sync with the backend source tree after every change. USE FOR: adding or renaming a controller, router, model, schema, middleware, library helper, type, or seeder; deleting a function or method (remove its index entry too); moving code between files; refactoring exports; answering "where is X defined?"; verifying the code map. Keywords: code map, peta kode, index fungsi, symbol index, CODE_MAP, tambah fungsi, hapus fungsi, rename, refactor, dokumentasi fungsi.'
argument-hint: "[file atau simbol yang baru diubah]"
---

# Maintain the Code Map

`.github/CODE_MAP.md` is the index of this API: every exported router, controller, middleware, model factory, library helper, type, and seeder with its file path and one-line purpose. Agents read it before touching code instead of grepping blindly, so it must never drift from reality.

**Rule: the map is part of the definition of done.** A change that adds, renames, moves, or deletes a symbol is not finished until the map matches it.

## When to Use

- After implementing, refactoring, renaming, moving, or deleting any controller, router, middleware, model, schema, library function, or exported type.
- When you cannot find a symbol and the map is the fastest route.
- When `npm run code-map:check` reports `MISSING`, `STALE`, or `UNKNOWN FILE`.
- Before opening a PR that touches `src/`.

Do **not** use it to document implementation details, private helpers that nobody will look up, or `dist/` build output. Internal helpers may be listed as `(internal)` when they matter.

## Workflow

### 1. Read first
Open [CODE_MAP.md](../../CODE_MAP.md) and locate the file(s) you will touch. Follow the listed symbols instead of re-scanning the whole repo.

### 2. Do the work
Edit code as usual.

### 3. Inventory the impact
From the repository root:

```powershell
git --no-pager diff --stat
git --no-pager diff -U0 -- src | Select-String -Pattern '^[+-](export|function|const|class|interface|type)'
```

Or simply run the checker — it lists exactly what the map is missing or still claims to have:

```powershell
npm run code-map:check
```

### 4. Update the map
For every **added** symbol, add one line under its file section:

```md
### `src/controller/airline.ts`
- `AirlineCtrl` (router) — Airline CRUD mounted at `/api/v1/airlines`, backed by `createCrudController`.
```

For every **renamed** symbol, change the entry's name; keep the description accurate.
For every **moved** symbol, delete the entry from the old file and add it under the new file.
For every **deleted** symbol, delete the entry. If the file section becomes empty, delete the whole `### \`path\`` section.

### 5. Verify
```powershell
npm run code-map:check
```
Must print `Code map is in sync.` and exit 0. Do not report the task as done while it fails.

### 6. Report
Mention in your summary which entries were added, renamed, moved, or removed.

## Entry Format

```md
### `src/path/to/file.ts`
- `symbolName` (kind) — What it does, phrased as behavior, not a restatement of the name.
```

| Kind | Use for |
| --- | --- |
| `entry` | Application bootstrap (`src/index.ts`) |
| `router` | Express router or mounted router module |
| `controller` | Controller factory / route handler module |
| `middleware` | Express middleware (`(req, res, next)`) |
| `model` | Mongoose model factory / business-logic layer |
| `schema` | Mongoose schema/model definition |
| `seeder` | Seeder routine |
| `function` | Plain utility function |
| `type` | Type alias or interface |
| `const` | Exported constant, config object, or static data |
| `data` | JSON/static data module |

Rules:
- One line per symbol, ≤ ~120 characters. English, sentence case, no trailing period needed but be consistent inside an entry.
- **No line numbers.** They rot on the next edit; the path is the locator.
- Describe the contract (what it returns, when it throws, what it is for) — not `"function for user"`.
- Order file sections by folder (`index.ts` → `router.ts` → `controller/` → `library/` → `model/` → `schema/` → `seeder/`), and by path inside a folder.
- Methods live inside their owner's entry — describe what the method does in the factory line instead of adding a separate entry, unless the method is exported on its own.
- Modules with only an anonymous default export (e.g. `export default m.model('airline', sch)`) get a section with a single italic note line instead of entries.
- Internal helpers may be indexed as `(internal)` when they matter (long files, non-obvious logic). The checker verifies they still exist but does not require them.

## Deletion Checklist

Deleting code is the case that rots maps fastest. Always:

1. `rg "\b<symbolName>\b" src` — confirm no callers remain.
2. Delete the entry from `CODE_MAP.md`, including any `(internal)` line.
3. If the file or module is deleted, delete its whole `### \`path\`` section.
4. Run `npm run code-map:check` — it must not report `STALE` or `UNKNOWN FILE`.

## Rename / Move Checklist

1. Rename the symbol in code and in every caller.
2. Update the entry name; do not leave the old name behind.
3. Moved symbol → move the entry to the new file's section.
4. Run `npm run code-map:check`.

## Troubleshooting

| Checker output | Meaning | Fix |
| --- | --- | --- |
| `MISSING` | Export exists in code, absent from map | Add the entry |
| `STALE` | Entry name no longer appears in the file | Rename or delete the entry |
| `UNKNOWN FILE` | `### \`path\`` section points to a gone file | Delete the section |

If a symbol is legitimately not worth indexing (generated files, type-only shims), do not silence the checker by hand — add the file or folder to a new ignored list in [check-code-map.mjs](./scripts/check-code-map.mjs) with a short comment explaining why.

## References

- [CODE_MAP.md](../../CODE_MAP.md) — the map itself.
- [check-code-map.mjs](./scripts/check-code-map.mjs) — sync checker used by `npm run code-map:check`.
- [AGENTS.md](../../../AGENTS.md) — repository rules that require reading the map first.
