#!/usr/bin/env node
/**
 * Initialize this backend template as a concrete project.
 *
 * Renames every project identity: npm name/version/description and lockfile,
 * app name in config + PM2 ecosystem, .env.example, version.json, Docker image,
 * Kubernetes namespace/deployment, CI trigger branch, ingress host/path,
 * deployer action defaults, and the README/AGENTS docs.
 *
 * Usage:
 *   node .github/skills/init-project/scripts/init-project.mjs \
 *     --project=myapp --display="My App" [--image=registry.edifly-dev.com/esi-dev/myapp-be]
 *
 * Options:
 *   --project       required, npm/app slug (lowercase, digits, hyphen)
 *   --display       human title (default: project)
 *   --image         full docker image without tag (default: registry.edifly-dev.com/esi-dev/<project>-be)
 *   --namespace     k8s namespace (default: dev-<project>)
 *   --deployment    k8s deployment name (default: <project>-backend)
 *   --staging-namespace  k8s namespace for the staging workflow (default: staging-<project>)
 *   --staging-deployment k8s deployment for the staging workflow (default: <deployment>-staging)
 *   --branch        CI deploy branch (default: master)
 *   --node          Node major version for CI (default: 18)
 *   --version       package version (default: 0.1.0)
 *   --host          ingress host (default: <project>.com)
 *   --ingress-path  ingress path prefix (default: /service)
 *   --dry-run       print the plan without writing
 *   --status        print whether this repo is still a template, then exit
 *   --force         run even if the repo looks already initialized
 */
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const TMP_SUFFIX = '.init-tmp'

const TEMPLATE_PACKAGE_NAME = 'template-be-ts'
const WORKFLOW = '.github/workflows/main.yaml'
const STAGING_WORKFLOW = '.github/workflows/staging.yaml'
const DEPLOYMENT_TEMPLATE = 'templates/deployment.yaml.template'
const ACTION = '.github/actions/deployer/action.yml'
const README = 'README.md'
const AGENTS = 'AGENTS.md'
const CONFIG = 'src/library/config.ts'
const ECOSYSTEM = 'ecosystem.config.js'
const ENV_EXAMPLE = '.env.example'
const CHANGELOG = 'version.json'

const TEMPLATE_MARKER = '<!-- template-status: not-initialized -->'
const INITIALIZED_MARKER = '<!-- template-status: initialized -->'

const die = (message) => {
    console.error(`\n✖ ${message}\n`)
    process.exit(1)
}

const parseArgs = (argv) => {
    const values = {}
    const flags = new Set(['dry-run', 'force', 'status'])
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        if (!arg.startsWith('--')) die(`Unexpected argument: ${arg}`)
        const body = arg.slice(2)
        const eq = body.indexOf('=')
        if (eq >= 0) {
            values[body.slice(0, eq)] = body.slice(eq + 1)
            continue
        }
        if (flags.has(body)) {
            values[body] = 'true'
            continue
        }
        const next = argv[i + 1]
        if (next === undefined || next.startsWith('--')) die(`Missing value for --${body}`)
        values[body] = next
        i += 1
    }
    return values
}

const readWorkflowEnv = (file = WORKFLOW) => {
    const path = join(ROOT, file)
    if (!existsSync(path)) return {}
    const text = readFileSync(path, 'utf8')
    const value = (key) => text.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'))?.[1].trim()
    return {
        registry: value('REGISTRY'),
        image: value('IMAGE_NAME'),
        namespace: value('NAMESPACE'),
        deployment: value('DEPLOYMENT'),
        node: value('NODE_VERSION'),
        branch: text.match(/^\s*branches:\s*\[([^\]]+)\]/m)?.[1].trim(),
    }
}

const args = parseArgs(process.argv.slice(2))

if (args.status === 'true') {
    const packageJsonPath = join(ROOT, 'package.json')
    if (!existsSync(packageJsonPath)) die('Cannot find package.json. Run this from the repository root.')
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    const agentsPath = join(ROOT, AGENTS)
    const agentsText = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : ''
    const workflowEnv = readWorkflowEnv()
    const markerSaysTemplate = agentsText.includes(TEMPLATE_MARKER)
    const initialized = pkg.name !== TEMPLATE_PACKAGE_NAME && !markerSaysTemplate

    console.log(`\nTemplate status: ${initialized ? 'INITIALIZED' : 'NOT INITIALIZED'}\n`)
    console.log(`  package name  ${pkg.name}`)
    console.log(`  package ver   ${pkg.version}`)
    console.log(`  AGENTS marker ${markerSaysTemplate ? 'not-initialized' : agentsText.includes(INITIALIZED_MARKER) ? 'initialized' : 'missing'}`)
    console.log(`  CI branch     ${workflowEnv.branch ?? 'unknown'}`)
    console.log(`  docker image  ${workflowEnv.image ?? 'unknown'}`)
    console.log(`  namespace     ${workflowEnv.namespace ?? 'unknown'}`)
    console.log(`  deployment    ${workflowEnv.deployment ?? 'unknown'}`)
    const stagingEnv = readWorkflowEnv(STAGING_WORKFLOW)
    console.log(
        `  staging       ${stagingEnv.namespace ?? 'missing'} / ${stagingEnv.deployment ?? 'missing'} ` +
            `(branch ${stagingEnv.branch ?? 'unknown'})`
    )
    console.log(
        initialized
            ? '\n✔ This repo is a concrete project.\n'
            : '\n→ Still a template. To initialize: npm run project:init -- --project=<slug> --display="<Name>" --dry-run\n'
    )
    process.exit(initialized ? 0 : 2)
}

const slug = (args.project ?? '').trim()
if (!slug) die('--project is required, e.g. --project=myapp')
if (!/^[a-z][a-z0-9-]{1,30}$/.test(slug)) {
    die(`--project must be lowercase alphanumeric with hyphens (got "${slug}")`)
}

const display = (args.display ?? slug).trim()
const image = (args.image ?? `registry.edifly-dev.com/esi-dev/${slug}-be`).trim()
const namespace = (args.namespace ?? `dev-${slug}`).trim()
const deployment = (args.deployment ?? args.service ?? `${slug}-backend`).trim()
const stagingNamespace = (args['staging-namespace'] ?? `staging-${slug}`).trim()
const stagingDeployment = (args['staging-deployment'] ?? `${deployment}-staging`).trim()
const branch = (args.branch ?? 'master').trim()
const nodeVersion = (args.node ?? '18').trim()
const version = (args.version ?? '0.1.0').replace(/^v/, '')
const host = (args.host ?? `${slug}.com`).trim()
const ingressPath = (args['ingress-path'] ?? '/service').trim()
const dryRun = args['dry-run'] === 'true'
const force = args.force === 'true'

if (!/^[^/\s]+\/[^/\s]+\/[^/\s]+$/.test(image)) {
    die(`--image must look like registry.example.com/project/image (got "${image}")`)
}
if (!/^[a-z0-9.-]+$/.test(host)) die(`--host must be a bare hostname (got "${host}")`)
if (!ingressPath.startsWith('/')) die(`--ingress-path must start with "/" (got "${ingressPath}")`)
if (!existsSync(join(ROOT, WORKFLOW))) die(`Cannot find ${WORKFLOW}. Run this from the repository root.`)

const packageJsonPath = join(ROOT, 'package.json')
const currentPackage = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
if (currentPackage.name !== TEMPLATE_PACKAGE_NAME && !force) {
    die(
        `This repo already looks initialized (package name "${currentPackage.name}"). ` +
            'Re-run with --force only if you really want to rename it again.'
    )
}

const quote = (value) => `"${value.replace(/"/g, "'")}"`
const yamlScalar = (value) => `"${value.replace(/"/g, "'")}"`
// MongoDB database names cannot contain "-"; derive a safe default from the slug.
const dbName = slug.replace(/-/g, '_')

const edits = [
    {
        file: 'package.json',
        label: 'npm package name',
        find: `"name": "${currentPackage.name}",`,
        replace: `"name": ${quote(slug)},`,
    },
    {
        file: 'package.json',
        label: 'npm package version',
        find: `"version": "${currentPackage.version}",`,
        replace: `"version": ${quote(version)},`,
    },
    {
        file: 'package.json',
        label: 'npm package description',
        find: '"description": "Template backend TypeScript + Express + MongoDB",',
        replace: `"description": ${quote(`${display} backend (TypeScript + Express + MongoDB)`)},`,
    },
    {
        file: 'package-lock.json',
        label: 'lockfile root name+version',
        find:
            '{\n' +
            `  "name": "${currentPackage.name}",\n` +
            `  "version": "${currentPackage.version}",\n` +
            '  "lockfileVersion": 3,',
        replace:
            '{\n' +
            `  "name": ${quote(slug)},\n` +
            `  "version": ${quote(version)},\n` +
            '  "lockfileVersion": 3,',
    },
    {
        file: 'package-lock.json',
        label: 'lockfile workspace name+version',
        find:
            '    "": {\n' +
            `      "name": "${currentPackage.name}",\n` +
            `      "version": "${currentPackage.version}",`,
        replace:
            '    "": {\n' +
            `      "name": ${quote(slug)},\n` +
            `      "version": ${quote(version)},`,
    },
    {
        file: CONFIG,
        label: 'default config app name',
        find: "        appName: 'appname',",
        replace: `        appName: '${slug}',`,
    },
    {
        file: CONFIG,
        label: 'env app name fallback',
        find: "    const appName = process.env.NAME || 'appname';",
        replace: `    const appName = process.env.NAME || '${slug}';`,
    },
    {
        file: ENV_EXAMPLE,
        label: '.env.example app name',
        find: 'NAME=template-be',
        replace: `NAME=${slug}`,
    },
    {
        file: ENV_EXAMPLE,
        label: '.env.example database name',
        find: 'DATABASE_CONNECTION=mongodb://127.0.0.1:27017/template_be',
        replace: `DATABASE_CONNECTION=mongodb://127.0.0.1:27017/${dbName}`,
    },
    {
        file: ECOSYSTEM,
        label: 'PM2 app name',
        find: '      name   : "template-backend",',
        replace: `      name   : "${deployment}",`,
    },
    {
        file: WORKFLOW,
        label: 'workflow name',
        find: 'name: Template-Backend',
        replace: `name: ${yamlScalar(display)}`,
    },
    {
        file: WORKFLOW,
        label: 'workflow trigger branch',
        find: 'branches: [nobranch]',
        replace: `branches: [${branch}]`,
    },
    {
        file: WORKFLOW,
        label: 'workflow trigger comment',
        find:
            '  # Template repo: "nobranch" is a placeholder so pushing never runs the pipeline.\n' +
            '  # Change to the real branch (e.g. master/main) when this template becomes a project.\n',
        replace: '  # Runs on every push to the deploy branch; manual runs via workflow_dispatch.\n',
    },
    {
        file: WORKFLOW,
        label: 'workflow env comment',
        find:
            '# Values below are template defaults. When copying this repo for a real project,\n' +
            '# change IMAGE_NAME / NAMESPACE / DEPLOYMENT to match the target.\n',
        replace: '# Deployment target for this project.\n',
    },
    {
        file: WORKFLOW,
        label: 'docker image',
        find: 'IMAGE_NAME: registry.edifly-dev.com/esi-dev/template-be',
        replace: `IMAGE_NAME: ${image}`,
    },
    {
        file: WORKFLOW,
        label: 'k8s namespace',
        find: 'NAMESPACE: dev-template',
        replace: `NAMESPACE: ${namespace}`,
    },
    {
        file: WORKFLOW,
        label: 'k8s deployment',
        find: 'DEPLOYMENT: template-backend',
        replace: `DEPLOYMENT: ${deployment}`,
    },
    {
        file: WORKFLOW,
        label: 'Node version',
        find: 'NODE_VERSION: "18"',
        replace: `NODE_VERSION: "${nodeVersion}"`,
    },
    {
        file: STAGING_WORKFLOW,
        label: 'staging workflow name',
        find: 'name: Template-Backend Staging',
        replace: `name: ${yamlScalar(display)} Staging`,
    },
    {
        file: STAGING_WORKFLOW,
        label: 'staging docker image',
        find: 'IMAGE_NAME: registry.edifly-dev.com/esi-dev/template-be',
        replace: `IMAGE_NAME: ${image}`,
    },
    {
        file: STAGING_WORKFLOW,
        label: 'staging k8s namespace',
        find: 'NAMESPACE: staging-template',
        replace: `NAMESPACE: ${stagingNamespace}`,
    },
    {
        file: STAGING_WORKFLOW,
        label: 'staging k8s deployment',
        find: 'DEPLOYMENT: template-backend-staging',
        replace: `DEPLOYMENT: ${stagingDeployment}`,
    },
    {
        file: STAGING_WORKFLOW,
        label: 'staging Node version',
        find: 'NODE_VERSION: "18"',
        replace: `NODE_VERSION: "${nodeVersion}"`,
    },
    {
        file: ACTION,
        label: 'deployer action default deployment',
        find: '    default: "template-backend"',
        replace: `    default: "${deployment}"`,
    },
    {
        file: ACTION,
        label: 'deployer action default image',
        find: '    default: "registry.edifly-dev.com/esi-dev/template-be"',
        replace: `    default: "${image}"`,
    },
    {
        file: DEPLOYMENT_TEMPLATE,
        label: 'ingress tls host',
        find: '        - template.com',
        replace: `        - ${host}`,
    },
    {
        file: DEPLOYMENT_TEMPLATE,
        label: 'ingress tls secret',
        find: '      secretName: template.com',
        replace: `      secretName: ${host}`,
    },
    {
        file: DEPLOYMENT_TEMPLATE,
        label: 'ingress host',
        find: '    - host: template.com',
        replace: `    - host: ${host}`,
    },
    {
        file: DEPLOYMENT_TEMPLATE,
        label: 'ingress path',
        find: '            path: /service',
        replace: `            path: ${ingressPath}`,
    },
    {
        file: README,
        label: 'README title',
        find: '# Template Backend (TypeScript + Express)',
        replace: `# ${display} Backend (TypeScript + Express)`,
    },
    {
        file: README,
        label: 'README summary',
        find:
            'Starter template untuk aplikasi backend berbasis TypeScript, Express, dan MongoDB. ' +
            'Cocok untuk bootstrap proyek baru dengan struktur modular, dukungan env, dan tooling dev yang siap pakai.',
        replace: `Backend ${display} berbasis TypeScript, Express, dan MongoDB dengan struktur modular, dukungan env, dan tooling dev yang siap pakai.`,
    },
    {
        file: README,
        label: 'README docker build example',
        find: 'docker build -t template-be .',
        replace: `docker build -t ${deployment} .`,
    },
    {
        file: README,
        label: 'README docker run example',
        find: 'docker run --rm -p 11611:11611 --env-file .env template-be',
        replace: `docker run --rm -p 11611:11611 --env-file .env ${deployment}`,
    },
    {
        file: README,
        label: 'README trigger paragraph',
        find:
            'Selama masih berupa template, trigger `push` sengaja diarahkan ke branch placeholder `nobranch` supaya ' +
            'push tidak menjalankan apa pun; pipeline hanya jalan lewat manual (`workflow_dispatch`). ' +
            '`npm run project:init` mengganti branch dan identitas deploy.',
        replace:
            'Workflow berjalan otomatis pada `push` ke ' +
            `\`${branch}\`, juga bisa dijalankan manual lewat \`workflow_dispatch\`.`,
    },
    {
        file: README,
        label: 'README env block',
        find:
            '**Saat menyalin template ini untuk proyek baru**, ubah blok `env:` paling atas workflow:\n' +
            '```yaml\n' +
            'REGISTRY: registry.edifly-dev.com\n' +
            'IMAGE_NAME: registry.edifly-dev.com/esi-dev/template-be\n' +
            'NAMESPACE: dev-template\n' +
            'DEPLOYMENT: template-backend\n' +
            'NODE_VERSION: "18"\n' +
            '```',
        replace:
            'Target deploy didefinisikan di blok `env:` paling atas workflow:\n' +
            '```yaml\n' +
            'REGISTRY: registry.edifly-dev.com\n' +
            `IMAGE_NAME: ${image}\n` +
            `NAMESPACE: ${namespace}\n` +
            `DEPLOYMENT: ${deployment}\n` +
            `NODE_VERSION: "${nodeVersion}"\n` +
            '```',
    },
    {
        file: README,
        label: 'README ingress identity',
        find: 'Host ingress dan path (`template.com`, `/service`) adalah nilai literal yang diganti oleh `init-project`.',
        replace: `Host ingress \`${host}\` dan path \`${ingressPath}\`.`,
    },
    {
        file: README,
        label: 'README runtime secret name',
        find: '- Runtime (secret Kubernetes `template-backend-env`):',
        replace: `- Runtime (secret Kubernetes \`${deployment}-env\`):`,
    },
    {
        file: AGENTS,
        label: 'AGENTS template-status marker',
        find: TEMPLATE_MARKER,
        replace: INITIALIZED_MARKER,
    },
    {
        file: AGENTS,
        label: 'AGENTS CI trigger note',
        find:
            '- During template status the push trigger is pinned to the placeholder branch `nobranch` so pushing never deploys; ' +
            'pipeline runs via `workflow_dispatch`. Change `branches` to the real branch when turning it into a project.',
        replace: `- The workflow runs on every push to \`${branch}\` and on \`workflow_dispatch\`.`,
    },
    {
        file: AGENTS,
        label: 'AGENTS template values note',
        find:
            '- Template values live in the top-level `env:` block of the workflow (`REGISTRY`, `IMAGE_NAME`, `NAMESPACE`, ' +
            '`DEPLOYMENT`, `NODE_VERSION`) — change them when copying this template to a new project. ' +
            '`Dockerfile` is multi-stage and builds TypeScript inside the image, so CI only needs Docker.',
        replace:
            `- Deployment target lives in the top-level \`env:\` block of the workflow: \`${image}\`, ` +
            `namespace \`${namespace}\`, deployment \`${deployment}\`, Node ${nodeVersion}. ` +
            '`Dockerfile` is multi-stage and builds TypeScript inside the image, so CI only needs Docker.',
    },
    {
        file: AGENTS,
        label: 'AGENTS ingress identity',
        find: 'Ingress host `template.com` and path `/service` are literals replaced by `init-project`.',
        replace: `Ingress host \`${host}\` and path \`${ingressPath}\`.`,
    },
    {
        file: AGENTS,
        label: 'AGENTS runtime secret note',
        find:
            '- The runtime secret `${DEPLOYMENT}-env` must exist in the namespace with `DATABASE_CONNECTION`, ' +
            '`AUTHHEADER`, `SALT`, `PRIVATE_KEY`, and `PUBLIC_KEY`.',
        replace:
            `- The runtime secret \`${deployment}-env\` must exist in the namespace with \`DATABASE_CONNECTION\`, ` +
            '`AUTHHEADER`, `SALT`, `PRIVATE_KEY`, and `PUBLIC_KEY`.',
    },
]

// Line-level edits: replace the whole line that starts with a stable prefix.
const lineEdits = [
    {
        file: AGENTS,
        label: 'AGENTS template-status blockquote',
        startsWith: '> **Status: TEMPLATE',
        replace:
            `> **Status: INITIALIZED** sebagai **${display}** (\`${slug}\`). CI deploy \`${deployment}\` ke ` +
            `namespace \`${namespace}\` pada push ke \`${branch}\`. Image: \`${image}\`. Cek status dengan ` +
            '`npm run project:status`.',
    },
    {
        file: README,
        label: 'README template-status line',
        startsWith: '> **Status: masih template',
        replace:
            `> **Status: project** — diinisialisasi dari template backend sebagai **${display}** (\`${slug}\`). ` +
            'Cek dengan `npm run project:status`.',
    },
]

// Section-level edits: replace a "## Heading" block up to the next "## " heading.
const sectionEdits = [
    {
        file: AGENTS,
        label: 'AGENTS template-intro section',
        heading: '## Starting a new project from this template',
        replace:
            '## Project\n' +
            `- Initialized from the backend template as **${display}** (\`${slug}\`). CI deploys \`${deployment}\` to ` +
            `namespace \`${namespace}\` on push to \`${branch}\`.\n` +
            '- The `init-project` skill (`npm run project:init`) is still available for later renames of the Docker ' +
            'image, namespace, deployment, ingress host, or CI branch.\n' +
            '- Status check: `npm run project:status`.',
    },
]

const changelog = {
    file: CHANGELOG,
    label: 'first version entry',
    content: `${JSON.stringify(
        [
            {
                version,
                description: 'Inisialisasi project dari template',
            },
        ],
        null,
        2
    )}\n`,
}

const countOccurrences = (text, needle) => text.split(needle).length - 1

// Read once per file, normalizing CRLF so the edit patterns stay line-ending agnostic.
const readSource = (file) => {
    const path = join(ROOT, file)
    if (!existsSync(path)) return null
    const raw = readFileSync(path, 'utf8')
    const crlf = raw.includes('\r\n')
    return { text: crlf ? raw.replace(/\r\n/g, '\n') : raw, crlf }
}

const writeSource = (file, text, crlf) => {
    writeFileSync(join(ROOT, file), crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8')
}

const replaceSection = (text, heading, replacement) => {
    const lines = text.split('\n')
    const start = lines.findIndex((line) => line.trim() === heading)
    if (start < 0) return null
    let end = lines.length
    for (let i = start + 1; i < lines.length; i += 1) {
        if (/^##\s/.test(lines[i])) {
            end = i
            break
        }
    }
    return [...lines.slice(0, start), replacement, ...lines.slice(end)].join('\n')
}

// ---- validate everything before touching the disk ----
const files = new Map()
const problems = []
const touchedFiles = [...new Set([...edits, ...lineEdits, ...sectionEdits].map((item) => item.file))]

for (const file of touchedFiles) {
    const source = readSource(file)
    if (!source) {
        problems.push(`${file}: file not found`)
        continue
    }
    files.set(file, source)
}

for (const edit of edits) {
    if (!files.has(edit.file)) continue
    const found = countOccurrences(files.get(edit.file).text, edit.find)
    const expected = edit.count ?? 1
    if (found !== expected) {
        problems.push(`${edit.file}: expected ${expected} match for "${edit.label}", found ${found}`)
    }
}

for (const edit of lineEdits) {
    if (!files.has(edit.file)) continue
    const found = files
        .get(edit.file)
        .text.split('\n')
        .filter((line) => line.startsWith(edit.startsWith)).length
    if (found !== 1) {
        problems.push(`${edit.file}: expected 1 line starting with "${edit.startsWith}" for "${edit.label}", found ${found}`)
    }
}

for (const edit of sectionEdits) {
    if (!files.has(edit.file)) continue
    const found = files
        .get(edit.file)
        .text.split('\n')
        .filter((line) => line.trim() === edit.heading).length
    if (found !== 1) {
        problems.push(`${edit.file}: expected 1 "${edit.heading}" section for "${edit.label}", found ${found}`)
    }
}

if (problems.length) {
    console.error('\n✖ Cannot initialize: the repository does not look like a pristine template.\n')
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error('\nNothing was written. Fix the mismatches above or run against a fresh copy.\n')
    process.exit(1)
}

// ---- apply replacements per file ----
const changed = []
for (const [file, source] of files) {
    const before = source.text
    let text = before

    for (const edit of sectionEdits.filter((item) => item.file === file)) {
        const next = replaceSection(text, edit.heading, edit.replace)
        // Presence is validated above, so falling back to the current text is safe.
        if (next !== null) text = next
    }

    for (const edit of lineEdits.filter((item) => item.file === file)) {
        text = text
            .split('\n')
            .map((line) => (line.startsWith(edit.startsWith) ? edit.replace : line))
            .join('\n')
    }

    for (const edit of edits.filter((item) => item.file === file)) {
        text = text.split(edit.find).join(edit.replace)
    }

    changed.push({ file, before, after: text, crlf: source.crlf })
}

const remaining = []
const forbidden = [
    TEMPLATE_MARKER,
    '> **Status: TEMPLATE',
    '# Template Backend (TypeScript + Express)',
    'masih template, belum di-init',
    '## Starting a new project from this template',
    'name: Template-Backend',
    'registry.edifly-dev.com/esi-dev/template-be',
    'NAMESPACE: dev-template',
    'DEPLOYMENT: template-backend',
    'branches: [nobranch]',
    '"template-be-ts"',
    'NAME=template-be',
    '27017/template_be',
    'template.com',
    'name   : "template-backend"',
]
for (const { file, after } of changed) {
    for (const marker of forbidden) {
        if (after.includes(marker)) remaining.push(`${file}: ${marker}`)
    }
}
if (remaining.length) {
    console.error('\n✖ Aborting, these template markers would survive:\n')
    for (const item of remaining) console.error(`  - ${item}`)
    console.error('\nNothing was written. Extend the edit list in this script first.\n')
    process.exit(1)
}

const rows = changed.map(({ file }) => {
    const total =
        edits.filter((item) => item.file === file).length +
        lineEdits.filter((item) => item.file === file).length +
        sectionEdits.filter((item) => item.file === file).length
    return { file, edits: total }
})
rows.push({ file: changelog.file, edits: 1 })

const printSummary = (title) => {
    console.log(`\n${title}\n`)
    console.log(`  project     ${slug}`)
    console.log(`  display     ${display}`)
    console.log(`  image       ${image}`)
    console.log(`  namespace   ${namespace}`)
    console.log(`  deployment  ${deployment}`)
    console.log(`  staging     ${stagingNamespace} / ${stagingDeployment}`)
    console.log(`  branch      ${branch}`)
    console.log(`  ingress     ${host}${ingressPath}`)
    console.log(`  node        ${nodeVersion}`)
    console.log(`  version     ${version}  (version.json ${version})\n`)
    for (const row of rows) {
        console.log(`  ${row.file}  (${row.edits} change${row.edits === 1 ? '' : 's'})`)
    }
}

if (dryRun) {
    printSummary('Planned changes (dry run)')
    console.log('\nDry run: nothing written. Re-run without --dry-run to apply.\n')
    process.exit(0)
}

// Stage every file, then rename in one pass so an interruption cannot leave a
// half-renamed project. Any failure restores the originals from memory.
const staged = [
    ...changed.map(({ file, after, crlf }) => ({ file, content: crlf ? after.replace(/\n/g, '\r\n') : after })),
    { file: changelog.file, content: changelog.content },
]
const backups = staged.map(({ file }) => {
    const source = readSource(file)
    return { file, text: source?.text, crlf: source?.crlf }
})

try {
    for (const { file, content } of staged) writeFileSync(join(ROOT, `${file}${TMP_SUFFIX}`), content, 'utf8')
    for (const { file } of staged) renameSync(join(ROOT, `${file}${TMP_SUFFIX}`), join(ROOT, file))
} catch (error) {
    for (const backup of backups) {
        const tmp = join(ROOT, `${backup.file}${TMP_SUFFIX}`)
        if (existsSync(tmp)) unlinkSync(tmp)
        if (backup.text !== undefined) writeSource(backup.file, backup.text, backup.crlf)
    }
    die(`Write failed: ${error.message}. Original files were restored.`)
}

printSummary('Applied changes')

console.log(`
Next steps
  1. npm run code-map:check   # map must stay in sync
  2. npm run lint
  3. npm run build
  4. git remote set-url origin <new-repo-url>   # or start a fresh git history
  5. Set GitHub secrets: DOCKER_USERNAME, DOCKER_PASSWORD, BOT_TOKEN, CHAT_ID
  6. Create the runtime secret ${deployment}-env in namespace ${namespace}
     (DATABASE_CONNECTION, AUTHHEADER, SALT, PRIVATE_KEY, PUBLIC_KEY)
  7. Bootstrap the cluster once with ${DEPLOYMENT_TEMPLATE} if the deployment does not exist yet

Done. The workflow now deploys ${deployment} to ${namespace} on push to ${branch}.
`)
