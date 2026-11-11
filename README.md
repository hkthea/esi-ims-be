# Template Backend (TypeScript + Express)

> **Status: masih template, belum di-init.** Jalankan `npm run project:init -- --project=<slug> --display="<Name>"` (dry-run dulu) untuk menjadikannya project nyata.

Starter template untuk aplikasi backend berbasis TypeScript, Express, dan MongoDB. Cocok untuk bootstrap proyek baru dengan struktur modular, dukungan env, dan tooling dev yang siap pakai.

## Fitur
- TypeScript dengan build ke folder `dist`
- Express + routing modular
- MongoDB via Mongoose
- Hot reload saat development (nodemon / ts-node-dev)
- Env configuration via `.env`
- Linting via ESLint

## Prasyarat
- Node.js 18+ (disarankan)
- npm
- MongoDB (lokal atau remote)

## Quick Start
```bash
npm install
bash generateKey.sh   # membuat key/private.pem dan key/public.pem
cp .env.example .env  # sesuaikan DATABASE_CONNECTION
npm run dev
```

Server berjalan di `http://localhost:11611`. Jika belum punya `.env`, buat manual sesuai bagian konfigurasi di bawah sebelum menjalankan `npm run dev`.

## Scripts
- `npm run dev` - Jalankan aplikasi dengan nodemon (auto reload saat save)
- `npm run build` - Compile TypeScript ke folder `dist/`
- `npm start` - Jalankan hasil build (`node dist/index.js`)
- `npm run debug` - Jalankan dengan `ts-node-dev`
- `npm run lint` - Jalankan ESLint
- `npm run code-map:check` - Verifikasi `.github/CODE_MAP.md` masih sinkron dengan `src/`
- `npm run project:status` - Cek status inisialisasi project (template vs initialized)
- `npm run context:audit` - Audit biaya token/context dari file AI customization (`AGENTS.md`, skill, prompt, instructions)
- `npm run project:init -- --help`-style usage: lihat skill `.github/skills/init-project/`

## Skills & Code Map
Repo ini punya agent skills di `.github/skills/`:

| Skill | Kegunaan |
| --- | --- |
| `agent-customization` | Membuat/memperbaiki instructions, prompts, agents, hooks, dan skills VS Code |
| `maintain-code-map` | Menjaga `.github/CODE_MAP.md` tetap sinkron; jalankan `npm run code-map:check` |
| `init-project` | Rename identitas template (package, image, namespace, deployment, ingress, branch CI, docs) dalam satu run |
| `add-crud-resource` | Checklist menambah resource CRUD baru dengan `createCrudController` + auth + soft delete |
| `token-optimizer` | Aturan hemat token/context + audit `npm run context:audit` untuk `AGENTS.md`, skill, prompt, instructions |

Baca [`.github/CODE_MAP.md`](.github/CODE_MAP.md) sebelum mencari kode; file itu mengindeks semua export di `src/`.

## Konfigurasi Environment
File `.env` digunakan untuk mengatur konfigurasi runtime. Variabel yang umum dipakai:

```
DATABASE_CONNECTION=mongodb://localhost:27017/default
NAME=smart-pax-gateway
SALT=your-random-salt
POD_NAME=local
VERSION=0.0.0
BUILD_TIME=2024-01-01T00:00:00.000Z
DEV=true
AUTHHEADER=srawungtoken
```

Catatan:
- `DEV=true` akan mengaktifkan CORS sederhana (termasuk `DELETE` untuk CRUD).
- Port dan bind default di `src/library/config.ts` adalah `11611` dan `0.0.0.0`.
- `AUTHHEADER` adalah nama header token. Frontend mengirim header `srawungtoken`, jadi biarkan default kecuali memang ingin menggantinya. Header `Authorization: Bearer <token>` juga didukung.
- Kunci JWT dibaca dari `PRIVATE_KEY`/`PUBLIC_KEY` (base64 atau PEM) bila diisi; jika kosong, fallback ke `key/private.pem` dan `key/public.pem` hasil `generateKey.sh`.

## Membuat User Pertama
Seeder default membuat user `admin`:
```bash
curl http://localhost:11611/seeder/user/rahasia123
```
Login untuk mendapatkan token:
```bash
curl -X POST http://localhost:11611/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"rahasia123"}'
```

## Struktur Folder
```
src/
  controller/   # Handler request
  library/      # Helper dan utilitas
  model/        # Model Mongoose
  schema/       # Validasi / schema
  seeder/       # Seeder data
  router.ts     # Routing utama
  index.ts      # Entry point aplikasi
.github/
  skills/       # Agent skills (code map, init-project, CRUD, customization)
  workflows/    # CI/CD
  actions/      # Composite action bootstrap deploy
templates/
  deployment.yaml.template  # Manifest bootstrap K8s
```

## Build dan Run (Production)
```bash
npm run build
npm start
```

Output build ada di folder `dist/`. Image produksi dibuat lewat `Dockerfile` (multi-stage: build di dalam image, runtime hanya bawa `dist` + `version.json`):

```bash
docker build -t template-be .
docker run --rm -p 11611:11611 --env-file .env template-be
```

## CI/CD (GitHub Actions)
Workflow ada di [`.github/workflows/main.yaml`](.github/workflows/main.yaml), mengikuti pola `broadcaster-be`:

| Job | Runner | Isi |
| --- | --- | --- |
| `lint` | `[amd64, k3s]` | `npm ci`, `npm run lint -- --cache`, `npm run code-map:check`, notifikasi mulai |
| `build` | `[self-hosted, k3s]` | `docker build` + push tag `<short-sha>` dan `latest` |
| `deploy` | `[self-hosted, deployer]` | `kubectl set env BUILD_VERSION/BUILD_DATE` + `set image` + `rollout status` |

Selama masih berupa template, trigger `push` sengaja diarahkan ke branch placeholder `nobranch` supaya push tidak menjalankan apa pun; pipeline hanya jalan lewat manual (`workflow_dispatch`). `npm run project:init` mengganti branch dan identitas deploy.

**Saat menyalin template ini untuk proyek baru**, ubah blok `env:` paling atas workflow:
```yaml
REGISTRY: registry.edifly-dev.com
IMAGE_NAME: registry.edifly-dev.com/esi-dev/template-be
NAMESPACE: dev-template
DEPLOYMENT: template-backend
NODE_VERSION: "18"
```

`templates/deployment.yaml.template` dipakai sekali saat bootstrap cluster (Deployment/Service/Ingress) lewat composite action [`.github/actions/deployer`](.github/actions/deployer/action.yml); placeholder `${IMAGE}`, `${NAMESPACE}`, `${DEPLOYMENT}`, `${VERSION}`, `${INSTANCE}` diisi oleh action tersebut. Host ingress dan path (`template.com`, `/service`) adalah nilai literal yang diganti oleh `init-project`.

### Staging

[`.github/workflows/staging.yaml`](.github/workflows/staging.yaml) menjalankan pipeline yang sama untuk branch `staging` (otomatis saat `push`, atau manual lewat `workflow_dispatch`). Bedanya:

- Image diberi tag `staging` dan `staging-<short-sha>` — `latest` tidak disentuh, jadi aman dipakai bersama workflow produksi.
- Deploy diarahkan ke `NAMESPACE`/`DEPLOYMENT` staging sendiri, lihat blok `env:` di file tersebut.
- Semua job (`lint`, `build`, `deploy`) berjalan di runner group `home-lab-pdl` dengan label `homelab-pdl`, sehingga runner itu perlu akses registry dan kubeconfig.
- Deployment staging harus sudah ada di cluster (job `deploy` hanya `set env`/`set image`/`rollout status`, tidak membuat resource baru); bootstrap sekali lewat `templates/deployment.yaml.template` + composite action [`.github/actions/deployer`](.github/actions/deployer/action.yml).

Secret yang dibutuhkan:
- Registry: `DOCKER_USERNAME`, `DOCKER_PASSWORD`.
- Telegram: `BOT_TOKEN`, `CHAT_ID` (notifikasi `continue-on-error`, jadi repo baru tanpa secret tetap jalan).
- Runtime (secret Kubernetes `template-backend-env`): `DATABASE_CONNECTION`, `AUTHHEADER`, `SALT`, `PRIVATE_KEY`, `PUBLIC_KEY`.
- Runner: `amd64`/`k3s` untuk lint dan build, `deployer` untuk deploy (kubeconfig sudah terpasang di runner).

## Endpoint
- `GET /version` mengembalikan daftar histori versi dari `version.json` dalam bentuk array. Setiap item berisi `version` dan `description`. Entri diupdate manual saat ada perubahan.
- `GET /seeder/user/:pass` membuat user default `admin` (jalankan sekali saja).
- `POST /auth/login` menerima `{ username, password }` dan mengembalikan token JWT sebagai `data`.
- `GET /auth/me`, `GET /auth/logout`, `POST /auth/profile`, `POST /auth/changePassword` membutuhkan token.

### CRUD Airlines (contoh resource)
Semua endpoint CRUD membutuhkan header `srawungtoken: <jwt>`.

| Method | Path | Keterangan |
| --- | --- | --- |
| `GET` | `/api/v1/airlines?page=1&perPage=10&search2={"name":"garuda"}` | List dengan paging + filter regex per kolom |
| `POST` | `/api/v1/airlines` | Tambah data (tanpa `_id` di body) |
| `POST` | `/api/v1/airlines` | Update data (sertakan `_id` di body) |
| `GET` | `/api/v1/airlines/detail/:id` | Detail satu data |
| `DELETE` | `/api/v1/airlines/:id` | Soft delete: mengisi `deletedAt`, data tidak lagi muncul di list/detail/cache |
| `GET` | `/api/v1/airlines/cache` | List ringan tanpa paging untuk dropdown |

`createCrudController` otomatis menyembunyikan dokumen dengan `deletedAt` terisi pada endpoint list, pagination, inquiry, dan detail. Schema yang tidak punya field `deletedAt` tetap memakai hard delete. Ini juga berlaku untuk user (`/auth/login` menolak user yang sudah di-soft-delete).

Contoh membuat resource CRUD baru:
1. Buat schema Mongoose di `src/schema/<nama>.ts`.
2. Buat controller:
   ```ts
   import { createCrudController } from './utils';
   import Model from '../schema/<nama>';
   const Ctrl = createCrudController(Model, 0, ['field1', 'field2']);
   export default Ctrl;
   ```
3. Daftarkan di `src/router.ts`:
   ```ts
   router.use('/api/v1/<nama>', AuthMiddleware(decode), Ctrl);
   ```

Format response selalu HTTP 200 dengan envelope:
```json
{ "error": 0, "data": {}, "message": "" }
```
Kegagalan memakai `error` non-zero (mis. `403`, `401`, `500`) beserta `message`.

## Integrasi Frontend
Template ini dipakai oleh `template-fe` (Vite + React) yang ada di workspace yang sama:

- Frontend dev berjalan di `http://localhost:5173`, backend di `http://localhost:11611`.
- Frontend mengirim JWT lewat header `srawungtoken` (bisa diubah lewat `AUTHHEADER`).
- Login: `POST /auth/login` → `data` berisi token; frontend menyimpannya di `localStorage` dengan key `<apps>_token`.
- CRUD contoh yang sudah tersambung: halaman **Master Data Block** memanggil `/api/v1/airlines` (list + paging + filter, create/update lewat `POST`, delete lewat `DELETE`).
- Semua response memakai envelope `{ error, data, message }`; HTTP status tetap 200 kecuali error jaringan.

Urutan menjalankan dari nol:
```bash
# terminal 1 — backend
bash generateKey.sh
cp .env.example .env      # sesuaikan DATABASE_CONNECTION
npm install
npm run dev
curl http://localhost:11611/seeder/user/rahasia123   # sekali saja

# terminal 2 — frontend
cd ../template-fe
npm install
npm run dev
```
Login di `http://localhost:5173` dengan `admin` / `rahasia123`.

## Catatan
- Static files dilayani dari `/public` (lihat `src/index.ts`).
- Silakan modifikasi router dan controller sesuai kebutuhan aplikasi.
