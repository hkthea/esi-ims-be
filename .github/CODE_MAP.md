# Code Map

Index of every exported symbol in `src/` — what it is, where it lives, and what it does. Agents read this before coding instead of grepping blindly.

- **Read this first** when you need to find or change behavior.
- **Update it in the same change** whenever a symbol is added, renamed, moved, or deleted. Deleting a function means deleting its line here too.
- **Verify with `npm run code-map:check`** — it reports `MISSING`, `STALE`, and `UNKNOWN FILE`. It must pass before work is considered done.
- Full procedure: [.github/skills/maintain-code-map/SKILL.md](./skills/maintain-code-map/SKILL.md).

Format: a `###` heading containing the file path in backticks, then one bullet per symbol as `symbolName` (kind) — purpose. No line numbers (they rot). Modules with only an anonymous default export use a single italic note line.

## App bootstrap & routing

### `src/index.ts`
Entry point: loads `.env`, connects Mongoose, enables permissive CORS when `DEV=true`, mounts the router, serves `/public`, and returns the `{ error: 404 }` envelope for unknown routes. No exports.

### `src/router.ts`
- `router` (router) — Root Express router: `/`, `/version`, `/auth/*`, `/seeder/*`, and the auth-protected `/api/v1/airlines`.

### `src/controller/airline.ts`
- `AirlineCtrl` (router) — Airline resource: `/cache` plus CRUD (paged list, create/update, soft delete) for name/prefix/code/iata/icao/country.

### `src/controller/auth.ts`
- `AuthCtrl` (router) — Login, logout, refresh, profile, change-password, and `/me` routes backed by the user model.

### `src/controller/seeder.ts`
- `SeederCtrl` (router) — `GET /user/:pass` creates the default `admin` user.

## Controllers & CRUD helper

### `src/controller/utils.ts`
- `AuthMiddleware` (middleware) — Reads `srawungtoken`, `Bearer`, or `?token`, verifies the JWT, and stores `{ udata, token }` in `res.locals`.
- `RestApiMiddleware` (middleware) — Pass-through placeholder for custom REST checks.
- `CtrlHandler` (function) — Runs a callback and wraps the result or error in the `{ error, data, message, errorName }` envelope.
- `tCrudFunctionCallback` (type) — Optional hooks (`beforeSaveData`, `beforeRead`, `afterSave`, `beforeInq`, `afterInquiry`, `beforeDetailResponse`, `addAuthQry`) for `createCrudController`.
- `createCrudController` (function) — Builds a Router with paged list (`search`/`search2`), create/update, soft delete, `/pagination`, `/inquiry`, and `/detail` endpoints; hides `deletedAt` rows automatically.
- `generateUniqueName` (function) — Timestamp + random suffix used for uploaded filenames.
- `createFile` (function) — Moves an uploaded file into the configured image path and returns the generated filename.
- `tColumn` (type) — Report column definition (`title`, `name`, `field`, `type`, `align`, `format`).
- `createReportCtrl` (function) — Builds daily/monthly report routes from a column list and report callback.
- `createAuthController` (function) — Builds login/logout/refresh/profile/changePassword routes around a user model and signer.
- `escapeRegex` (internal) — Escapes user input before it is used in a `RegExp` filter.
- `toPositiveInt` (internal) — Parses a query-string number, falling back when it is missing or invalid.
- `parseJsonBody` (internal) — Safely parses `search`/`search2` JSON and throws a readable error when invalid.

## Libraries

### `src/library/base_signer.ts`
JWT helper factory: verifies with the public key, signs with the private key, and strips `aud/exp/iat/sub` on refresh. Default export is anonymous, so only its types are indexed.
- `DecodeFunction` (type) — `(token) => payload | false`.
- `SignerFunction` (type) — `(payload) => jwt`.
- `RefreshTokenFunction` (type) — `(token) => new jwt`.
- `VerifyTokenFunction` (type) — `(token) => boolean`.

### `src/library/config.ts`
- `tdatabase` (type) — `{ connection }` shape used by the config.
- `getOsPlatform` (function) — Returns the current OS platform string.
- `getCPU` (function) — Returns `systeminformation` CPU info for diagnostics.
- `getConfigFile` (function) — Merges defaults with `.env` (`DATABASE_CONNECTION`, `NAME`, `SALT`, `POD_NAME`, `VERSION`, `BUILD_TIME`).

### `src/library/signer.ts`
- `decode` (function) — Verifies and decodes a JWT; returns `false` when invalid or expired.
- `refreshToken` (function) — Re-signs a decoded payload without the standard JWT claims.
- `signer` (function) — Signs a user payload with RS256 and an 8h expiry.
- `verifyToken` (function) — Verifies a token against the configured public key.

### `src/library/utils.ts`
- `CreateRandomString` (function) — Generates a random string from a custom dictionary.
- `getIpAddr` (function) — Resolves the client IP from `x-forwarded-for`, `req.ips`, `req.ip`, or hostname.
- `createLog` (function) — Writes an activity log entry (`user_id`, `ip_address`, `log`).

### `src/library/version.ts`
- `VersionItem` (type) — `{ version, description }` entry returned by `/version`.
- `getVersionHistory` (function) — Reads `version.json` from the working directory; returns `[]` when missing or invalid.

## Models & schemas

### `src/model/base_users.ts`
User factory: hashes passwords with `HMAC-SHA256(salt)`, signs JWTs on login, and applies soft-delete filtering to login/update/paging. Default export is anonymous.
- `tUserIntf` (type) — Contract of the user model (`Login`, `insert`, `update`, `updateProfile`, `changePassword`, `createUser`, `createDefaultUser`, `paging`, `updateLastLogin`).

### `src/model/users.ts`
- `Login` (function) — Finds a non-deleted user by username + hashed password, rejects blocked users, and returns `[token, user]`.
- `changePassword` (function) — Verifies the current password, then stores the new hash.
- `createDefaultUser` (function) — Creates the `admin` super user once; throws when it already exists.
- `createUser` (function) — Creates a user from plain credentials and returns it without the password.
- `insert` (function) — Creates a user from request data with `createdBy` and a password hash.
- `paging` (function) — Paged user list filtered by level/search, excluding soft-deleted users and the password field.
- `update` (function) — Updates a non-deleted user, optionally rehashing a new password; throws when not found.
- `updateProfile` (function) — Updates name/email/phone for the current user and returns a fresh token.
- `userModel` (model) — Default export: `BaseUser(USERSCH, 'SALT', signer)`.

### `src/model/utils.ts`
- `reqPaging` (function) — Shared paged query with sane defaults and a filter-aware total count.
- `createModel` (function) — Generic insert/update/remove helpers; strips immutable fields, excludes soft-deleted rows, and soft-deletes when the schema has `deletedAt`.
- `pagination` (function) — Ad-hoc paged search across `defSearch` fields.

### `src/schema/activity_log.ts`
Mongoose model `activity_log`: `user_id`, `ip_address`, `log`, `createdAt`, `deletedAt`. Anonymous default export.

### `src/schema/airline.ts`
Mongoose model `airline`: `name`, `prefix`, `code`, `iata`, `icao`, `country`, `deletedAt`, `createdBy`, timestamps. Anonymous default export.

### `src/schema/users.ts`
Mongoose model `user`: `username` (unique), `password`, `name`, `level` (number bitmask), contact fields, `last_login`, `deletedAt`, `createdBy`. Anonymous default export.

## Seeder

### `src/seeder/user.ts`
- `createDefUser` (seeder) — Creates the default user with the password passed from the seeder route.
