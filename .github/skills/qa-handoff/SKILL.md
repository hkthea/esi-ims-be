---
name: qa-handoff
description: 'Hand off every staging deploy to the QA/QC agent: qa/features.json declares which features exist, the staging workflow turns the commit diff into a GitHub issue labelled `qa`, and the agent runs the listed steps, comments `QA RESULT: PASS|FAIL`, and opens `qa:bug` + `sev:n` issues for failures. USE FOR: menambah atau mengubah fitur yang harus dites; menjawab "fitur apa saja yang perlu di-QA"; menyiapkan issue/checklist QA setelah deploy staging; memetakan perubahan file ke fitur; menyesuaikan label atau format laporan QA. Keywords: qa, qc, quality assurance, staging, test plan, checklist, regresi, regression, bug, severity, sev, manifest, features.json, issue qa, handoff.'
argument-hint: "[sha staging atau nomor issue QA]"
---

# Staging QA handoff

Setiap commit yang masuk ke branch `staging` menghasilkan satu issue QA otomatis. Agent QA membaca issue itu, menjalankan langkahnya di staging, lalu melaporkan hasil. Tidak ada daftar fitur yang diketik manual per deploy — daftarnya berasal dari manifest di repo.

```
push ke staging
  → workflow staging: lint → build (tag staging-<sha>) → deploy
  → job qa-handoff: .github/scripts/qa-request.mjs
        diff commit  ×  qa/features.json
  → issue GitHub "QA staging <sha>" (label `qa`, `qa:request`)
  → agent QA: jalankan langkah → komentar `QA RESULT:` → issue `qa:bug` per temuan
```

## Berkas yang terlibat

| Berkas | Peran |
| --- | --- |
| [`qa/features.json`](../../../qa/features.json) | Sumber kebenaran: daftar fitur + langkah uji + path sumbernya |
| [`.github/scripts/qa-request.mjs`](../scripts/qa-request.mjs) | Memetakan diff ke fitur, membuat/memperbarui issue (REST API, tanpa `gh`) |
| job `qa-handoff` di `.github/workflows/staging.yaml` | Menjalankan script setelah deploy sukses, mengisi base URL dari ingress staging |
| `.github/skills/qa-handoff/SKILL.md` | Kontrak ini |

## Kontrak agent QA (jalankan persis ini)

1. **Baca issue** berlabel `qa:request` yang masih terbuka. Ambil base URL, commit, image, dan daftar fitur dari body.
2. **Uji hanya di staging.** Jangan memakai atau mengubah data produksi.
3. **Kredensial dari secret agent**, bukan dari issue: `QA_USERNAME` / `QA_PASSWORD`. Jangan menulis kredensial atau token di komentar. Endpoint utilitas/admin yang tidak ada di daftar uji memang sengaja disembunyikan — jangan dipakai.
4. **Jalankan setiap langkah** pada bagian "Fitur yang wajib dites", lalu bagian "Regresi ringkas".
4. **Balas satu komentar** di issue itu:

   ```
   QA RESULT: PASS|FAIL
   commit: <short sha pada issue>
   fitur: <id yang gagal, atau "semua">
   catatan: <ringkas, sertakan URL/route yang diuji>
   ```

5. **Tiap kegagalan → issue terpisah** berlabel `qa:bug` dan `sev:1|2|3`, berisi: langkah reproduksi, hasil aktual vs harapan, environment (staging + short sha), screenshot/log.
6. **Semua PASS → tutup issue** dengan komentar ringkas.
7. **Jangan memperbaiki kode dari sesi QA.** Perbaikan lewat PR terpisah, lalu diuji lagi pada deploy staging berikutnya.

Severity: `sev:1` fitur utama tidak bisa dipakai / data rusak · `sev:2` mengganggu, ada workaround · `sev:3` kosmetik.

## Skema `qa/features.json`

```json
{
    "version": 1,
    "credentials": "Kredensial dari secret agent (QA_USERNAME / QA_PASSWORD).",
    "prerequisites": [
        "Login dulu dengan akun QA; login hanya pintu masuk, bukan objek uji.",
        "Uji hanya di staging."
    ],
    "features": [
        {
            "id": "airlines-crud",
            "name": "CRUD Airlines (paging, search, soft delete)",
            "area": "resource",
            "priority": "p0",
            "regression": true,
            "routes": ["GET /api/v1/airlines", "DELETE /api/v1/airlines/:id"],
            "paths": ["src/controller/airline.ts"],
            "steps": ["GET /api/v1/airlines?page=1&perPage=10: list + metadata paging."],
            "expected": ["Semua endpoint butuh header `srawungtoken`."]
        }
    ]
}
```

| Field | Wajib | Arti |
| --- | --- | --- |
| `id` | ya | Kunci stabil (kebab-case). Dipakai di judul issue dan laporan hasil. |
| `name` | ya | Nama manusiawi yang tampil di issue. |
| `area` | tidak | Kelompok (`auth`, `workspace`, `resource`, `infra`, …) untuk pengelompokan. |
| `priority` | tidak | `p0`–`p3`; fitur `p0` ditampilkan lebih dulu. Default `p2`. |
| `regression` | tidak | `true` = selalu muncul di bagian "Regresi ringkas" walau tidak tersentuh diff. **Jangan** tandai fitur yang cuma prasyarat (login) — taruh di `prerequisites`. Pakai untuk fitur bisnis yang wajib dicek ulang (mis. transaksi, CRUD utama). |
| `routes` | tidak | Route FE atau endpoint BE. Ditampilkan agar agent tahu ke mana harus pergi. |
| `paths` | ya | Path sumber. Awalan dianggap prefix; `*` = wildcard. File berubah yang cocok akan memicu fitur ini. |
| `steps` | ya | Langkah uji berupa aksi yang bisa dijalankan agent. |
| `expected` | tidak | Hasil yang diharapkan; dipakai agent sebagai kriteria PASS/FAIL. |
| `hidden` | tidak | `true` = fitur tetap memiliki `paths` (file-nya tidak jatuh ke daftar "belum ter-mapping") tetapi **tidak pernah** dirender ke issue. Dipakai untuk endpoint utilitas/admin. |
| `hiddenReason` | tidak | Alasan singkat kenapa fitur disembunyikan; dibaca manusia, tidak masuk issue. |

Top-level (di luar `features`):

| Field | Arti |
| --- | --- |
| `version` | Versi skema manifest. |
| `credentials` | Catatan **kebijakan** kredensial saja. Jangan pernah menaruh password/token di sini. |
| `prerequisites` | Daftar langkah yang dikerjakan **sekali di awal** sesi (login, buka devtools). Dirender sebagai bagian "Prasyarat" dan **tidak** dihitung sebagai fitur. |

## Membagi "pintu masuk" vs "objek uji"

Login bukan fitur yang perlu dites ulang setiap deploy — dia pintu masuk. Jadi:

- Langkah masuk sistem → `prerequisites` (dirender sekali di atas, di luar hitungan fitur).
- Fitur yang berubah → muncul otomatis dari `paths`.
- Fitur bisnis yang wajib dicek walau tidak berubah (mis. transaksi, CRUD utama) → `regression: true`.

Contoh menukar login dengan fitur bisnis sebagai regresi:

```json
{
    "id": "transaksi-create",
    "name": "Transaksi — buat transaksi baru",
    "area": "transaksi",
    "priority": "p0",
    "regression": true,
    "routes": ["/workspace/transaksi"],
    "paths": ["src/app/workspace/transaksiPage"],
    "steps": [
        "Buka /workspace/transaksi lalu klik Tambah.",
        "Isi field wajib, simpan, dan pastikan baris baru muncul di tabel."
    ],
    "expected": ["Tidak ada data ganda dan total sesuai input."]
}
```

Sementara entri `auth-login` / `auth-lifecycle` cukup `regression: false` supaya tidak ikut disebut di setiap issue — dia tetap muncul penuh kalau file auth benar-benar berubah.

## Kredensial & fitur tersembunyi

- Agent QA **tidak** mengambil kredensial dari repo, manifest, atau issue. Akun staging disediakan lewat secret milik agent itu sendiri: `QA_USERNAME` dan `QA_PASSWORD`. Untuk BE, login dulu ke `POST /auth/login` lalu pakai token sebagai header `srawungtoken`.
- Manifest hanya menyimpan catatan kebijakan di field `credentials`; jangan menaruh password, token, atau URL berisi kredensial di sana.
- Endpoint utilitas atau admin (seeder, reset data, backdoor support) **wajib** diberi `hidden: true`. Contohnya `user-seeder` di repo backend: file `src/controller/seeder.ts` tetap ter-mapping, tapi daftar uji di issue tidak pernah memuatnya.
- Kalau ada fitur baru yang bersifat admin-only, tambahkan dengan `hidden: true` — jangan dibuat manual di issue.

## Cara mapping bekerja

- Diff deploy = `github.event.before..github.sha` (fallback `HEAD^..HEAD`, mis. saat `workflow_dispatch`).
- Tiap file yang berubah dicocokkan ke semua entri `paths`. Satu file boleh memicu beberapa fitur.
- File yang tidak cocok dengan fitur mana pun masuk bagian **"Perubahan yang belum ter-mapping"**. Ini sinyal untuk memperbarui manifest, bukan untuk diabaikan.
- File `*.md`, `.github/**`, `qa/**`, lockfile, dan config lint diabaikan agar tidak jadi noise.
- Issue bersifat idempoten per SHA: re-run workflow dengan commit yang sama akan memperbarui issue itu, bukan membuat duplikat.

## Menambah atau mengubah fitur (checklist)

Wajib setiap kali ada halaman/endpoint baru, route berubah, atau perilaku berubah:

1. Tambah/ubah entri di `qa/features.json` (`id` baru kalau fitur benar-benar baru).
2. Isi `steps` dengan aksi konkret dan `expected` dengan kriteria PASS/FAIL.
3. Pastikan `paths` memuat direktori/file sumber fitur tersebut.
4. Kalau fitur itu jalur kritis, set `priority: "p0"` dan `regression: true`.
5. Verifikasi secara lokal (tidak memanggil API GitHub):

   ```powershell
   $env:QA_DRY_RUN='1'; $env:BASE_SHA='HEAD~3'; $env:HEAD_SHA=(git rev-parse HEAD)
   node .github/scripts/qa-request.mjs
   ```

   Bagian yang ingin dicek: jumlah "Fitur yang wajib dites", isi "Regresi ringkas", dan apakah daftar "belum ter-mapping" kosong.

## Label yang dipakai

| Label | Arti |
| --- | --- |
| `qa` | Semua issue yang berhubungan dengan QA |
| `qa:request` | Permintaan QA otomatis per deploy staging |
| `qa:bug` | Temuan bug dari sesi QA |
| `sev:1` / `sev:2` / `sev:3` | Severity temuan |

Label dibuat otomatis oleh script kalau belum ada di repo.

## Jangan

- Jangan membuat issue QA manual untuk deploy staging — biarkan `qa-handoff` yang membuat agar isinya selalu sinkron dengan diff.
- Jangan menaruh kredensial atau token di manifest, issue, atau komentar.
- Jangan menandai PASS tanpa benar-benar menjalankan langkahnya di staging.
