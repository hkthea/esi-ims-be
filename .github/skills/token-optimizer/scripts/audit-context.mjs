#!/usr/bin/env node
/**
 * Estimates the context cost of this repo's Copilot customizations and flags
 * files over budget. No dependencies, no network, read-only.
 *
 * Usage:
 *   node .github/skills/token-optimizer/scripts/audit-context.mjs
 *   node .github/skills/token-optimizer/scripts/audit-context.mjs --json
 *   node .github/skills/token-optimizer/scripts/audit-context.mjs --help
 *
 * Exit codes: 0 = OK or warnings only, 1 = at least one ERROR.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')

// Rough English/code estimate. Good for comparing files, not for billing.
const CHARS_PER_TOKEN = 4

const BUDGETS = {
    alwaysOnFile: 12000,
    alwaysOnTotal: 24000,
    instructionAlwaysOn: 4000,
    skillBodyChars: 16000,
    skillBodyLines: 500,
    reference: 24000,
    description: 1024,
}

const GROUP_ORDER = ['always-on', 'frequent', 'on-demand']
const GROUP_TITLES = {
    'always-on': 'ALWAYS-ON — paid on every request',
    frequent: 'FREQUENT — read by convention on most tasks',
    'on-demand': 'ON-DEMAND — paid only when that skill or prompt loads',
}

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
    console.log(
        [
            "Estimate the token cost of this repo's Copilot customization files.",
            '',
            'Usage: node .github/skills/token-optimizer/scripts/audit-context.mjs [--json]',
            '',
            '  --json   Print the report as JSON.',
            '  --help   Show this help.',
            '',
            'Exit 0 when there are no errors, 1 when a customization file is invalid.',
        ].join('\n')
    )
    process.exit(0)
}

const asJson = args.includes('--json')
const unknown = args.filter((arg) => arg !== '--json')
if (unknown.length > 0) {
    console.error(`Unknown option: ${unknown.join(' ')} (try --help)`)
    process.exit(1)
}

const toPosix = (path) => path.split('\\').join('/')
const displayPath = (absolute) => toPosix(relative(ROOT, absolute))
const estimateTokens = (chars) => Math.ceil(chars / CHARS_PER_TOKEN)

const readStats = (absolute) => {
    const text = readFileSync(absolute, 'utf8').replace(/^\uFEFF/, '')
    return {
        text,
        chars: text.length,
        lines: text.split('\n').length,
        tokens: estimateTokens(text.length),
    }
}

/** Minimal YAML frontmatter reader: flat `key: value` pairs only. */
const parseFrontmatter = (text) => {
    if (!text.startsWith('---')) return null
    const end = text.indexOf('\n---', 3)
    if (end < 0) return null
    const fields = {}
    for (const line of text.slice(3, end).replace(/\r/g, '').split('\n')) {
        const match = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
        if (!match) continue
        let value = match[2].trim()
        const quoted =
            (value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))
        if (quoted) value = value.slice(1, -1)
        fields[match[1]] = value
    }
    return fields
}

const matchesEverything = (applyTo) =>
    applyTo
        .split(',')
        .map((part) => part.trim().replace(/^["']|["']$/g, ''))
        .some((glob) => glob === '**' || glob === '**/*' || glob === '*')

const listFiles = (directory, suffix) => {
    if (!existsSync(directory)) return []
    return readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
        .map((entry) => join(directory, entry.name))
        .sort()
}

const listDirectories = (directory) => {
    if (!existsSync(directory)) return []
    return readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(directory, entry.name))
        .sort()
}

const entries = []
const findings = []

const addEntry = (absolute, group, kind, extra = {}) => {
    const stats = readStats(absolute)
    const entry = {
        path: displayPath(absolute),
        group,
        kind,
        chars: stats.chars,
        lines: stats.lines,
        tokens: stats.tokens,
        status: 'OK',
        note: '',
        text: stats.text,
        ...extra,
    }
    entries.push(entry)
    return entry
}

const flag = (level, file, message) => {
    findings.push({ level, file, message })
}

const mark = (entry, level, message) => {
    if (level === 'ERROR' || entry.status === 'OK') entry.status = level
    flag(level, entry.path, message)
}

const checkDescription = (entry, fields, { required = false } = {}) => {
    const description = fields?.description ?? ''
    entry.description = description
    if (!description) {
        if (required) mark(entry, 'ERROR', 'Missing description — the skill cannot be discovered.')
        else flag('WARN', entry.path, 'No description; discovery relies on the file name alone.')
        return
    }
    if (description.length > BUDGETS.description) {
        mark(
            entry,
            'ERROR',
            `Description is ${description.length} chars (max ${BUDGETS.description}) — trim it, keep the trigger keywords.`
        )
    }
}

const checkSkill = (directory) => {
    const folderName = basename(directory)
    const skillFile = join(directory, 'SKILL.md')
    if (!existsSync(skillFile)) {
        flag('ERROR', displayPath(join(directory, 'SKILL.md')), 'Missing SKILL.md — this folder is not a skill.')
        return folderName
    }

    const entry = addEntry(skillFile, 'on-demand', 'skill', { discoveryName: folderName })
    if (entry.chars > BUDGETS.skillBodyChars || entry.lines > BUDGETS.skillBodyLines) {
        mark(
            entry,
            'WARN',
            `Skill body is ${entry.lines} lines / ${entry.chars} chars — move detail into references/.`
        )
    }

    const fields = parseFrontmatter(entry.text)
    if (!fields) {
        mark(entry, 'ERROR', 'Missing YAML frontmatter.')
    } else {
        if (fields.name !== folderName) {
            mark(entry, 'ERROR', `Frontmatter name "${fields.name ?? ''}" does not match folder "${folderName}".`)
        }
        checkDescription(entry, fields, { required: true })
        entry.discovery = true
    }

    for (const absolute of listFiles(join(directory, 'references'), '.md')) {
        const reference = addEntry(absolute, 'on-demand', 'reference')
        if (reference.chars > BUDGETS.reference) {
            mark(
                reference,
                'WARN',
                `${reference.chars} chars (~${reference.tokens} tokens) — split into smaller reference files.`
            )
        }
    }

    return folderName
}

const collectSkills = () => {
    for (const directory of listDirectories(join(ROOT, '.github/skills'))) checkSkill(directory)
}

const collectAlwaysOnFile = (relativePath, kind) => {
    const absolute = join(ROOT, relativePath)
    if (!existsSync(absolute)) return
    const entry = addEntry(absolute, 'always-on', kind)
    if (entry.chars > BUDGETS.alwaysOnFile) {
        mark(
            entry,
            'WARN',
            `${entry.chars} chars (~${entry.tokens} tokens) exceeds ${BUDGETS.alwaysOnFile} — move procedures into a skill.`
        )
    }
}

const collectInstructions = () => {
    for (const absolute of listFiles(join(ROOT, '.github/instructions'), '.instructions.md')) {
        const entry = addEntry(absolute, 'always-on', 'instruction')
        const fields = parseFrontmatter(entry.text)
        if (!fields) {
            mark(entry, 'ERROR', 'Missing YAML frontmatter (need at least applyTo or description).')
            continue
        }
        const applyTo = fields.applyTo ?? ''
        if (!applyTo) {
            entry.group = 'on-demand'
            entry.note = 'loads on demand (no applyTo)'
            checkDescription(entry, fields)
            continue
        }
        if (!matchesEverything(applyTo)) {
            entry.group = 'on-demand'
            entry.note = `scoped: ${applyTo}`
            continue
        }
        entry.note = 'applyTo matches every file'
        if (entry.chars > BUDGETS.instructionAlwaysOn) {
            mark(
                entry,
                'WARN',
                `applyTo matches every file and the body is ${entry.chars} chars — narrow the glob or trim below ${BUDGETS.instructionAlwaysOn}.`
            )
        }
    }
}

const collectCustomizations = (directoryRelative, suffix, kind) => {
    for (const absolute of listFiles(join(ROOT, directoryRelative), suffix)) {
        const entry = addEntry(absolute, 'on-demand', kind, { discoveryName: basename(absolute, suffix) })
        checkDescription(entry, parseFrontmatter(entry.text))
        entry.discovery = true
    }
}

collectSkills()
collectAlwaysOnFile('AGENTS.md', 'agent instructions')
collectAlwaysOnFile('.github/copilot-instructions.md', 'agent instructions')
collectInstructions()
collectCustomizations('.github/prompts', '.prompt.md', 'prompt')
collectCustomizations('.github/agents', '.agent.md', 'agent')

const codeMap = join(ROOT, '.github/CODE_MAP.md')
if (existsSync(codeMap)) addEntry(codeMap, 'frequent', 'index')

const alwaysOn = entries.filter((entry) => entry.group === 'always-on')
const alwaysOnChars = alwaysOn.reduce((sum, entry) => sum + entry.chars, 0)
const alwaysOnTokens = estimateTokens(alwaysOnChars)
if (alwaysOnChars > BUDGETS.alwaysOnTotal) {
    flag(
        'WARN',
        'always-on total',
        `${alwaysOnChars} chars (~${alwaysOnTokens} tokens) exceeds ${BUDGETS.alwaysOnTotal} — trim before adding more.`
    )
}

const discovery = entries
    .filter((entry) => entry.discovery && entry.description)
    .map((entry) => ({
        name: entry.discoveryName,
        path: entry.path,
        descriptionChars: entry.description.length,
        tokens: estimateTokens(entry.description.length),
    }))
    .sort((a, b) => b.tokens - a.tokens)

const discoveryTokens = discovery.reduce((sum, item) => sum + item.tokens, 0)
const estimatedFloor = alwaysOnTokens + discoveryTokens
const hasError = findings.some((finding) => finding.level === 'ERROR')

const publicEntries = entries.map(({ text, ...rest }) => rest)

if (asJson) {
    console.log(
        JSON.stringify(
            {
                root: toPosix(ROOT),
                generatedAt: new Date().toISOString(),
                charsPerToken: CHARS_PER_TOKEN,
                budgets: BUDGETS,
                totals: {
                    alwaysOnChars,
                    alwaysOnTokens,
                    discoveryTokens,
                    estimatedFloorTokens: estimatedFloor,
                },
                entries: publicEntries,
                discovery,
                findings,
                ok: !hasError,
            },
            null,
            2
        )
    )
    process.exit(hasError ? 1 : 0)
}

const formatNumber = (value) => value.toLocaleString('en-US')
const padRight = (value, width) => String(value).padEnd(width)
const padLeft = (value, width) => String(value).padStart(width)
const pathWidth = Math.min(
    72,
    Math.max(34, ...entries.map((entry) => entry.path.length), ...discovery.map((item) => item.name.length))
)
const nameWidth = Math.min(
    44,
    Math.max(24, ...entries.map((entry) => entry.path.length), ...discovery.map((item) => item.name.length))
)
const shorten = (value, width = pathWidth) => (value.length <= width ? value : `…${value.slice(-(width - 1))}`)

console.log(`\nContext audit — ${toPosix(ROOT)}\n`)

for (const group of GROUP_ORDER) {
    const rows = entries
        .filter((entry) => entry.group === group)
        .sort((a, b) => b.tokens - a.tokens)
    if (rows.length === 0) continue
    console.log(GROUP_TITLES[group])
    console.log(`  ${padRight('file', pathWidth)}  ${padLeft('chars', 8)}  ${padLeft('~tokens', 8)}  status`)
    for (const entry of rows) {
        const note = entry.note ? `  (${entry.note})` : ''
        console.log(
            `  ${padRight(shorten(entry.path), pathWidth)}  ${padLeft(formatNumber(entry.chars), 8)}  ` +
                `${padLeft(formatNumber(entry.tokens), 8)}  ${entry.status}${note}`
        )
    }
    console.log('')
}

console.log('DISCOVERY SURFACE — description cost, paid on every request')
if (discovery.length === 0) {
    console.log('  (no skills, prompts, or agents installed)\n')
} else {
    console.log(`  ${padRight('name', nameWidth)}  ${padLeft('~tokens', 8)}  description chars`)
    for (const item of discovery) {
        console.log(
            `  ${padRight(shorten(item.name, nameWidth), nameWidth)}  ${padLeft(formatNumber(item.tokens), 8)}  ` +
                formatNumber(item.descriptionChars)
        )
    }
    console.log('')
}

console.log('TOTALS')
console.log(
    `  always-on          ${formatNumber(alwaysOnChars)} chars  (~${formatNumber(alwaysOnTokens)} tokens)`
)
console.log(
    `  discovery surface  ~${formatNumber(discoveryTokens)} tokens across ${discovery.length} entries`
)
console.log(
    `  estimated floor    ~${formatNumber(estimatedFloor)} tokens per request ` +
        '(always-on + discovery; excludes on-demand files)'
)
console.log('')

if (findings.length === 0) {
    console.log('FINDINGS\n  none — every file is inside its budget.\n')
} else {
    console.log('FINDINGS')
    for (const finding of findings) {
        console.log(`  ${finding.level === 'ERROR' ? 'ERROR' : 'WARN '}  ${finding.file}: ${finding.message}`)
    }
    console.log('')
}

console.log(hasError ? 'Result: ERROR — fix the invalid files above.\n' : 'Result: OK\n')
process.exit(hasError ? 1 : 0)
