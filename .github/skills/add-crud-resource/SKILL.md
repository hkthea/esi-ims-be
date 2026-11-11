---
name: add-crud-resource
description: 'Add or modify a CRUD resource in this Express + Mongoose backend using the existing createCrudController helper: schema, controller, auth-protected route, soft delete, paging/search contract, code map entry, and curl verification. USE FOR: new master data endpoint, new collection, tambah resource CRUD, bikin API baru, list/paging/filter endpoint, soft delete, resource airlines/users, wiring backend to the frontend table. Keywords: crud, resource baru, endpoint baru, controller, schema, mongoose, createCrudController, soft delete, paging, search2, API backend.'
argument-hint: "[nama-resource]"
---

# Add a CRUD Resource

This backend ships a generic CRUD factory in [`src/controller/utils.ts`](../../../src/controller/utils.ts). A new resource is a schema + a controller + one mount line — not a hand-written list of routes.

**Reference implementation:** [`src/controller/airline.ts`](../../../src/controller/airline.ts) and [`src/schema/airline.ts`](../../../src/schema/airline.ts). Mirror it.

## When to Use

- A new master-data collection that the frontend needs to list, create, edit, and delete.
- Adding paging/search/filter to an existing collection.
- Replacing hand-written `router.get`/`router.post` handlers with the shared helper.

Do **not** use it for auth/user-specific flows (use `createAuthController`) or file uploads (use `createFile` inside a callback).

## Contract the Frontend Expects

All responses are HTTP 200 with the envelope `{ error, data, message, errorName }` produced by `CtrlHandler`. `error: 0` means success.

| Method | Path | Body / query | Result |
| --- | --- | --- | --- |
| `GET` | `/api/v1/<resource>?page=1&perPage=10&search2={"field":"value"}` | paging + per-column regex filters | `{ data: [...], total }` |
| `POST` | `/api/v1/<resource>` | record without `_id` | created document |
| `POST` | `/api/v1/<resource>` | record **with** `_id` | updated document |
| `DELETE` | `/api/v1/<resource>/:id` | — | `{ _id }`, sets `deletedAt` |
| `GET` | `/api/v1/<resource>/detail/:id` | — | document or `null` |
| `GET` | `/api/v1/<resource>/cache` (optional) | — | light array for dropdowns |

`search2` values become case-insensitive regex filters (input is escaped by the helper). `total` is the filtered count, so pagination stays correct.

## Procedure

### 1. Schema — always include `deletedAt`

```ts
// src/schema/example.ts
import m from 'mongoose';
import populate from 'mongoose-autopopulate';

const Schema = m.Schema;
const sch = new Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, default: '', trim: true, uppercase: true },
    deletedAt: { type: Date, default: null },
    createdBy: {
        type: Schema.Types.ObjectId,
        autopopulate: { select: 'username name email' },
        ref: 'user',
    },
}, { timestamps: true });

sch.index({ name: 1 });
sch.plugin(populate);

export default m.model('example', sch);
```

- `deletedAt` opts the resource into soft delete. Without it, `DELETE` is a hard delete.
- `createdBy` is filled by `createModel.insert` from the JWT (`res.locals.udata._id`), so the route must be authenticated.
- Add indexes for columns the table filters on (`search2`).

### 2. Controller — use the helper

```ts
// src/controller/example.ts
import { Router } from 'express';
import { CtrlHandler, createCrudController } from './utils';
import ExampleModel from '../schema/example';

const ExampleCtrl = Router();

// Optional: light list for dropdowns.
ExampleCtrl.get('/cache', (req, res) => {
    CtrlHandler(req, res, async () => {
        return await ExampleModel.find({ deletedAt: null }, 'name code', { sort: { name: 1 } });
    });
});

ExampleCtrl.use(
    '/',
    createCrudController(ExampleModel, 0, ['name', 'code'])
);

export default ExampleCtrl;
```

- Third argument = fields scanned by `?search=` (global search). Per-column filters use `search2`.
- Register `/cache` **before** the CRUD router; the CRUD router mounts `/`.
- Need extra behavior? Pass `crudCallback` (7th argument): `beforeSaveData`, `beforeRead`, `afterSave`, `beforeInq`, `beforeDetailResponse`, `addAuthQry`, `afterInq`.

### 3. Mount it behind auth

```ts
// src/router.ts
import ExampleCtrl from './controller/example';
import { AuthMiddleware } from './controller/utils';
import { decode } from './library/signer';

router.use('/api/v1/examples', AuthMiddleware(decode), ExampleCtrl);
```

Without `AuthMiddleware`, `res.locals.udata` is missing and `insert`/`update` fail (or worse, endpoints become public).

### 4. Update the code map

Add the schema note and controller entry to [`.github/CODE_MAP.md`](../../CODE_MAP.md), then run:

```powershell
npm run code-map:check
```

The checker requires an entry for every named export (`ExampleCtrl`). Anonymous default exports (schemas) get an italic note line.

### 5. Verify with curl

```bash
# login
TOKEN=$(curl -s -X POST http://localhost:11611/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"rahasia123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data')

# create
curl -s -X POST http://localhost:11611/api/v1/examples \
  -H "Content-Type: application/json" -H "srawungtoken: $TOKEN" \
  -d '{"name":"Contoh","code":"CNT"}'

# list + filter
curl -s "http://localhost:11611/api/v1/examples?page=1&perPage=10&search2=%7B%22name%22%3A%22contoh%22%7D" \
  -H "srawungtoken: $TOKEN"

# update (send _id)
curl -s -X POST http://localhost:11611/api/v1/examples \
  -H "Content-Type: application/json" -H "srawungtoken: $TOKEN" \
  -d '{"_id":"<id>","name":"Contoh Baru","code":"CNT"}'

# soft delete, then confirm it disappears from the list
curl -s -X DELETE http://localhost:11611/api/v1/examples/<id> -H "srawungtoken: $TOKEN"
```

Also run `npm run build` and `npm run lint` before reporting done.

### 6. Wire the frontend (optional)

The sibling `template-fe` expects `api/v1/<resource>` and `{ data, total }` from the list. Reuse `AppTable` + `PostAPI`/`DeleteAPI`; see `src/app/workspace/masterDataBlockPage/index.tsx` there.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Performing an update on the path '_id' would modify the immutable field` | Sending `_id` inside `$set` | Already handled by `createModel.update`; don't bypass it |
| List keeps deleted rows | Schema has no `deletedAt` | Add the field (or expect hard delete) |
| `Cannot read properties of undefined (_id)` on create/update | Route not behind `AuthMiddleware` | Mount with `AuthMiddleware(decode)` |
| `total` never changes with filters | Bypassing `reqPaging` | Use `reqPaging`/`createCrudController` |
| Invalid regex crashes list | Unescaped `search2` | Helper escapes input; don't build regex yourself |
| `/cache` returns 404/misroutes | CRUD router mounted before `/cache` | Register `/cache` first |

## References

- [`src/controller/utils.ts`](../../../src/controller/utils.ts) — `CtrlHandler`, `AuthMiddleware`, `createCrudController`.
- [`src/model/utils.ts`](../../../src/model/utils.ts) — `createModel` (insert/update/soft delete) and `reqPaging`.
- [`src/controller/airline.ts`](../../../src/controller/airline.ts) — working example.
- [`.github/CODE_MAP.md`](../../CODE_MAP.md) — keep it in sync.
