#!/usr/bin/env node
/**
 * Staging QA handoff.
 *
 * Maps the files changed by a staging deploy onto the features declared in
 * qa/features.json, then creates (or updates) the GitHub issue the QA agent
 * picks up. Pure Node + REST API so it also runs on a bare self-hosted runner
 * without gh/curl.
 *
 * Env:
 *   GITHUB_TOKEN       token with issues:write (Actions: ${{ secrets.GITHUB_TOKEN }})
 *   GITHUB_REPOSITORY  owner/name (fallback: parsed from the origin remote)
 *   BASE_SHA, HEAD_SHA deploy range (fallback: HEAD^..HEAD)
 *   BRANCH             branch shown in the issue (default: staging)
 *   IMAGE_TAG          image reference that was deployed (optional)
 *   STAGING_URL        URL the QA agent must test (optional)
 *   RUN_URL            link to the workflow run (optional)
 *   QA_DRY_RUN=1       print the issue body instead of calling the API
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const MANIFEST = join(ROOT, 'qa/features.json')
const env = (key, fallback = '') => (process.env[key] ?? fallback).trim()
const API = env('GITHUB_API_URL', 'https://api.github.com').replace(/\/+$/, '')
const PRIORITY_ORDER = { p0: 0, p1: 1, p2: 2, p3: 3 }
const IGNORED_FILE = [/\.md$/i, /^\.github\//, /^qa\//, /^\.git/, /^package-lock\.json$/, /^eslint\.config\./, /^eslintrc\./]
const LABELS = [
    { name: 'qa', color: '0e8a16', description: 'Handoff QA dari deploy staging' },
    { name: 'qa:request', color: '1d76db', description: 'Permintaan QA otomatis per deploy staging' },
    { name: 'qa:bug', color: 'd93f0b', description: 'Temuan bug dari sesi QA' },
    { name: 'sev:1', color: 'b60205', description: 'Severity 1 - fitur utama tidak bisa dipakai' },
    { name: 'sev:2', color: 'd93f0b', description: 'Severity 2 - mengganggu, ada workaround' },
    { name: 'sev:3', color: 'fbca04', description: 'Severity 3 - kosmetik / minor' },
]

const DRY_RUN = ['1', 'true'].includes((process.env.QA_DRY_RUN ?? '').trim().toLowerCase())

const fail = (message) => {
    console.error(`::error::${message}`)
    process.exit(1)
}
const warn = (message) => console.warn(`::warning::${message}`)

const git = (args) => {
    try {
        return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    } catch {
        return ''
    }
}

const isZeroSha = (sha) => !sha || /^0+$/.test(sha)
const shortSha = (sha) => (isZeroSha(sha) ? 'unknown' : sha.slice(0, 7))
const unique = (items) => [...new Set(items.filter(Boolean))]
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pathMatches = (pattern, file) => new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*')).test(file)

const resolveRepo = () => {
    if (env('GITHUB_REPOSITORY')) return env('GITHUB_REPOSITORY')
    const remote = git(['remote', 'get-url', 'origin'])
    const match = remote.match(/[/:]([^/:]+\/[^/:]+?)(?:\.git)?$/)
    return match ? match[1] : ''
}

const readManifest = () => {
    if (!existsSync(MANIFEST)) fail('qa/features.json tidak ditemukan. Jalankan script dari root repo.')
    let parsed
    try {
        parsed = JSON.parse(readFileSync(MANIFEST, 'utf8'))
    } catch (error) {
        fail(`qa/features.json bukan JSON valid: ${error.message}`)
    }
    if (!Array.isArray(parsed.features) || parsed.features.length === 0) {
        fail('qa/features.json harus punya array `features` yang tidak kosong.')
    }
    return parsed
}

const changedFiles = (base, head) => {
    const output = isZeroSha(base)
        ? git(['show', '--pretty=format:', '--name-only', head])
        : git(['diff', '--name-only', `${base}..${head}`])
    return unique(output.split('\n').map((line) => line.trim()))
}

const commitSubjects = (base, head) => {
    const output = isZeroSha(base)
        ? git(['log', '-1', '--format=%h %s', head])
        : git(['log', '--format=%h %s', `${base}..${head}`])
    return output.split('\n').map((line) => line.trim()).filter(Boolean)
}

const routeList = (feature) => (feature.routes ?? []).map((route) => `\`${route}\``).join(' · ')

const featureBlock = (feature, index, files) => {
    const routes = routeList(feature)
    const lines = [
        `#### ${index + 1}. ${feature.name} — \`${feature.id}\` · ${feature.priority ?? 'p2'}${routes ? ` · ${routes}` : ''}`,
        '',
    ]
    if (files.length > 0) {
        const shown = files.slice(0, 5).map((file) => `\`${file}\``).join(', ')
        const rest = files.length > 5 ? ` (+${files.length - 5} file lain)` : ''
        lines.push(`Dipicu oleh perubahan: ${shown}${rest}`, '')
    }
    for (const step of feature.steps ?? []) lines.push(`- [ ] ${step}`)
    if ((feature.expected ?? []).length > 0) {
        lines.push('', '**Expected**')
        for (const item of feature.expected) lines.push(`- ${item}`)
    }
    lines.push('')
    return lines
}

const renderBody = ({ repo, branch, head, base, image, stagingUrl, runUrl, manifest, affected, regression, unmapped, commits }) => {
    const prerequisites = (manifest.prerequisites ?? []).filter(Boolean)
    const lines = [
        `<!-- qa-request:${head} -->`,
        `## QA request — staging \`${shortSha(head)}\``,
        '',
        '| Info | Nilai |',
        '| --- | --- |',
        `| Repo | \`${repo}\` |`,
        `| Branch | \`${branch}\` |`,
        `| Commit | \`${shortSha(head)}\`${commits[0] ? ` — ${commits[0].replace(/^\S+\s/, '')}` : ''} |`,
        `| Deploy | ${new Date().toISOString()}${runUrl ? ` · [workflow run](${runUrl})` : ''} |`,
        `| Image | ${image ? `\`${image}\`` : '_tidak diketahui_'} |`,
        `| Base URL | ${stagingUrl || '_belum terdeteksi — isi manual dari ingress staging_'} |`,
        `| Diff | \`${shortSha(base)}..${shortSha(head)}\` (${commits.length} commit) |`,
        '',
    ]

    if (prerequisites.length > 0) {
        lines.push('### Prasyarat (sekali di awal, bukan fitur uji)', '')
        for (const item of prerequisites) lines.push(`- ${item}`)
        lines.push('')
    }

    lines.push(`### Fitur yang wajib dites (${affected.length})`, '')

    affected.forEach(({ feature, files }, index) => lines.push(...featureBlock(feature, index, files)))

    lines.push('### Regresi ringkas', '')
    if (regression.length === 0) lines.push('_Semua fitur regresi ikut tersentuh diff deploy ini._')
    else for (const feature of regression) lines.push(`- [ ] ${feature.name} (\`${feature.id}\`)${routeList(feature) ? ` — ${routeList(feature)}` : ''}`)
    lines.push('')

    lines.push('### Perubahan yang belum ter-mapping ke fitur', '')
    if (unmapped.length === 0) lines.push('_Tidak ada._')
    else {
        lines.push('File ini berubah tetapi tidak cocok dengan `paths` fitur mana pun. Periksa manual, lalu tambahkan ke `qa/features.json` supaya deploy berikutnya otomatis tercakup:', '')
        for (const file of unmapped.slice(0, 20)) lines.push(`- \`${file}\``)
        if (unmapped.length > 20) lines.push(`- … dan ${unmapped.length - 20} file lain`)
    }
    lines.push('')

    if (commits.length > 0) {
        lines.push('### Commit dalam deploy ini', '')
        for (const commit of commits.slice(0, 15)) lines.push(`- ${commit}`)
        if (commits.length > 15) lines.push(`- … dan ${commits.length - 15} commit lain`)
        lines.push('')
    }

    lines.push(
        '### Aturan akses',
        '',
        '- Pakai akun QA dari secret agent ini (`QA_USERNAME` / `QA_PASSWORD`). Jangan menulis kredensial, token, atau password di issue maupun komentar.',
        '- Jangan memakai atau menyebut endpoint utilitas/admin yang tidak ada di daftar uji ini.',
        '',
        '### Kontrak hasil QA',
        '',
        '1. Uji di staging saja — jangan menyentuh data atau environment produksi.',
        '2. Jalankan setiap langkah, lalu laporkan lewat **satu komentar** di issue ini dengan format:',
        '',
        '   ```',
        `   QA RESULT: PASS|FAIL`,
        `   commit: ${shortSha(head)}`,
        '   fitur: <id yang gagal, atau "semua">',
        '   catatan: <ringkas>',
        '   ```',
        '',
        '3. Tiap kegagalan dibuatkan issue terpisah berlabel `qa:bug` + `sev:1|2|3`, berisi langkah reproduksi, hasil vs harapan, dan screenshot/log.',
        '4. Kalau semua langkah PASS: tutup issue ini dengan komentar ringkas.',
        '5. Jangan mengubah kode produksi dari sesi QA; perbaikan dilakukan lewat PR terpisah.',
        '',
        `_Dibuat otomatis oleh \`.github/scripts/qa-request.mjs\` dari \`qa/features.json\` (v${manifest.version ?? 1}) pada setiap deploy staging. Jangan edit manual — isi issue ini dibuat ulang saat deploy yang sama dijalankan lagi._`,
    )
    return lines.join('\n')
}

const buildHeaders = () => {
    const token = env('GITHUB_TOKEN') || env('GH_TOKEN')
    if (!token) fail('GITHUB_TOKEN (atau GH_TOKEN) wajib diisi untuk membuat issue QA.')
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'qa-request-script',
    }
}

const ensureLabels = async (repo, headers) => {
    for (const label of LABELS) {
        const existing = await fetch(`${API}/repos/${repo}/labels/${encodeURIComponent(label.name)}`, { headers })
        if (existing.ok) continue
        if (existing.status !== 404) {
            warn(`Tidak bisa memeriksa label "${label.name}" (HTTP ${existing.status}).`)
            continue
        }
        const created = await fetch(`${API}/repos/${repo}/labels`, { method: 'POST', headers, body: JSON.stringify(label) })
        if (!created.ok) warn(`Gagal membuat label "${label.name}" (HTTP ${created.status}).`)
    }
}

const findOpenRequest = async (repo, headers, marker) => {
    const response = await fetch(`${API}/repos/${repo}/issues?state=open&labels=${encodeURIComponent('qa:request')}&per_page=100`, { headers })
    if (!response.ok) throw new Error(`Gagal membaca issue (HTTP ${response.status}).`)
    const issues = await response.json()
    return issues.find((issue) => !issue.pull_request && (issue.body ?? '').includes(marker)) ?? null
}

const upsertIssue = async (repo, headers, { marker, title, body }) => {
    const existing = await findOpenRequest(repo, headers, marker)
    if (existing) {
        const response = await fetch(`${API}/repos/${repo}/issues/${existing.number}`, { method: 'PATCH', headers, body: JSON.stringify({ title, body }) })
        if (!response.ok) throw new Error(`Gagal memperbarui issue #${existing.number} (HTTP ${response.status}).`)
        return { ...(await response.json()), created: false }
    }
    const response = await fetch(`${API}/repos/${repo}/issues`, { method: 'POST', headers, body: JSON.stringify({ title, body, labels: ['qa', 'qa:request'] }) })
    if (!response.ok) throw new Error(`Gagal membuat issue QA (HTTP ${response.status}).`)
    return { ...(await response.json()), created: true }
}

const titleFor = (head, affected) => {
    const names = affected.slice(0, 3).map(({ feature }) => feature.name).join(', ')
    const rest = affected.length > 3 ? ` +${affected.length - 3}` : ''
    const raw = `QA staging ${shortSha(head)}: ${names}${rest}`
    return raw.length > 250 ? `${raw.slice(0, 247)}…` : raw
}

const main = async () => {
    const base = env('BASE_SHA')
    const head = env('HEAD_SHA') || git(['rev-parse', 'HEAD'])
    if (!head) fail('HEAD_SHA tidak diketahui dan git HEAD tidak bisa dibaca.')

    const files = changedFiles(base, head)
    if (files.length === 0) {
        console.log('Tidak ada file berubah pada rentang deploy ini — handoff QA dilewati.')
        return
    }

    const manifest = readManifest()
    const visibleFeatures = manifest.features.filter((feature) => !feature.hidden)
    const mapped = new Map()
    const unmapped = []
    for (const file of files) {
        // Hidden features still claim their paths so admin-only files never leak
        // into the "belum ter-mapping" list, but they are never rendered.
        const hits = manifest.features.filter((feature) => (feature.paths ?? []).some((pattern) => pathMatches(pattern, file)))
        if (hits.length === 0) {
            if (!IGNORED_FILE.some((pattern) => pattern.test(file))) unmapped.push(file)
            continue
        }
        for (const feature of hits) {
            if (feature.hidden) continue
            if (!mapped.has(feature.id)) mapped.set(feature.id, { feature, files: [] })
            mapped.get(feature.id).files.push(file)
        }
    }

    const affected = [...mapped.values()].sort((a, b) => (PRIORITY_ORDER[a.feature.priority] ?? 9) - (PRIORITY_ORDER[b.feature.priority] ?? 9))
    const regression = visibleFeatures.filter((feature) => feature.regression && !mapped.has(feature.id))
    const commits = commitSubjects(base, head)

    if (affected.length === 0) warn('Tidak ada fitur yang cocok dengan file yang berubah — cek `paths` di qa/features.json.')

    const body = renderBody({
        repo: resolveRepo(),
        branch: env('BRANCH', 'staging'),
        head,
        base,
        image: env('IMAGE_TAG'),
        stagingUrl: env('STAGING_URL'),
        runUrl: env('RUN_URL'),
        manifest,
        affected,
        regression,
        unmapped,
        commits,
    })
    const marker = `<!-- qa-request:${head} -->`
    const title = titleFor(head, affected)

    if (DRY_RUN) {
        console.log(`\nDRY RUN — title: ${title}\n`)
        console.log(body)
        return
    }

    const repo = resolveRepo()
    if (!repo) fail('Repo tidak diketahui. Set GITHUB_REPOSITORY atau tambahkan remote origin.')
    const headers = buildHeaders()

    await ensureLabels(repo, headers)
    const issue = await upsertIssue(repo, headers, { marker, title, body })

    const summary = [
        '## QA handoff',
        '',
        `- Issue: ${issue.html_url} (${issue.created ? 'baru' : 'diperbarui'})`,
        `- Commit: \`${shortSha(head)}\``,
        `- Fitur wajib dites: ${affected.length}`,
        `- Regresi: ${regression.length} · file belum ter-mapping: ${unmapped.length}`,
    ].join('\n')
    console.log(summary)
    console.log(`::notice::QA issue ${issue.created ? 'dibuat' : 'diperbarui'}: ${issue.html_url}`)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
}

main().catch((error) => fail(error.message))
