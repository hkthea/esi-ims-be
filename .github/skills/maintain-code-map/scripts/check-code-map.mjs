#!/usr/bin/env node
/**
 * Verifies .github/CODE_MAP.md against the backend source tree.
 *
 * MISSING = an exported symbol has no entry in the map.
 * STALE   = a map entry no longer exists in its file (deleted/renamed symbol).
 * UNKNOWN = a map section points to a file that does not exist.
 *
 * Exit code 0 when the map is in sync, 1 otherwise.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const MAP_PATH = '.github/CODE_MAP.md'
const SCAN_DIR = 'src'
const EXTENSIONS = ['.ts']

const toPosix = (path) => path.split(sep).join('/')

const walk = (dir) => {
    const files = []
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        const rel = toPosix(relative(process.cwd(), full))
        if (statSync(full).isDirectory()) {
            files.push(...walk(full))
        } else if (EXTENSIONS.some((ext) => entry.endsWith(ext)) && !entry.endsWith('.d.ts')) {
            files.push(rel)
        }
    }
    return files
}

const unique = (values) => [...new Set(values)]

const matchAll = (text, regex) => {
    const names = []
    let match
    while ((match = regex.exec(text)) !== null) names.push(match[1])
    return names
}

const readExports = (text) => {
    const names = [
        ...matchAll(text, /^export\s+default\s+function\s+([A-Za-z0-9_$]+)/gm),
        ...matchAll(text, /^export\s+default\s+(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/gm),
        ...matchAll(text, /^export\s+default\s+([A-Za-z0-9_$]+)\s*;?\s*$/gm),
        ...matchAll(text, /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm),
        ...matchAll(text, /^export\s+class\s+([A-Za-z0-9_$]+)/gm),
        ...matchAll(text, /^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm),
        ...matchAll(text, /^export\s+interface\s+([A-Za-z0-9_$]+)/gm),
        ...matchAll(text, /^export\s+type\s+([A-Za-z0-9_$]+)/gm),
        ...matchAll(text, /^export\s+enum\s+([A-Za-z0-9_$]+)/gm),
    ]

    // export const { a, b: alias } = something
    for (const block of matchAll(text, /export\s+const\s*\{([^}]*)\}\s*=/g)) {
        for (const part of block.split(',')) {
            const name = part.trim().replace(/^type\s+/, '').split(':')[0].trim()
            if (name) names.push(name)
        }
    }

    // export { a, b as c }
    for (const block of matchAll(text, /export\s*\{([^}]*)\}(?!\s*from)/g)) {
        for (const part of block.split(',')) {
            const cleaned = part.trim().replace(/^type\s+/, '')
            if (!cleaned) continue
            const alias = cleaned.split(/\s+as\s+/)
            names.push((alias[1] ?? alias[0]).trim())
        }
    }

    return unique(names)
}

const readMap = (markdown) => {
    const files = new Map()
    let current = null
    for (const line of markdown.split(/\r?\n/)) {
        const fileMatch = line.match(/^### `([^`]+)`\s*$/)
        if (fileMatch) {
            current = fileMatch[1]
            if (!files.has(current)) files.set(current, [])
            continue
        }
        const entryMatch = line.match(/^- `([^`]+)`/)
        if (entryMatch && current) files.get(current).push(entryMatch[1])
    }
    return files
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const main = () => {
    let mapText
    try {
        mapText = readFileSync(MAP_PATH, 'utf8')
    } catch {
        console.error(`Cannot read ${MAP_PATH}. Create it before running the check.`)
        process.exit(1)
    }

    const map = readMap(mapText)
    const sourceFiles = walk(SCAN_DIR)
    const sourceSet = new Set(sourceFiles)

    const missing = []
    const stale = []
    const unknownFiles = []

    for (const file of sourceFiles) {
        const text = readFileSync(file, 'utf8')
        const entries = new Set(map.get(file) ?? [])
        for (const name of readExports(text)) {
            if (!entries.has(name)) missing.push({ file, name })
        }
    }

    for (const [file, names] of map) {
        if (!sourceSet.has(file)) {
            unknownFiles.push(file)
            continue
        }
        const text = readFileSync(file, 'utf8')
        for (const name of names) {
            const present = new RegExp(`\\b${escapeRegex(name)}\\b`).test(text)
            if (!present) stale.push({ file, name })
        }
    }

    const totalEntries = [...map.values()].reduce((sum, names) => sum + names.length, 0)
    console.log(`Code map: ${MAP_PATH}`)
    console.log(`Scanned ${sourceFiles.length} files, ${totalEntries} indexed symbols.\n`)

    const report = (label, items, format) => {
        if (!items.length) return
        console.log(`${label} (${items.length}):`)
        for (const item of items) console.log(`  ${format(item)}`)
        console.log('')
    }

    report('MISSING', missing, ({ file, name }) => `${file} -> \`${name}\``)
    report('STALE', stale, ({ file, name }) => `${file} -> \`${name}\``)
    report('UNKNOWN FILE', unknownFiles, (file) => file)

    if (missing.length || stale.length || unknownFiles.length) {
        const count = missing.length + stale.length + unknownFiles.length
        console.error(`${count} problem(s). Update ${MAP_PATH} (see .github/skills/maintain-code-map/SKILL.md).`)
        process.exit(1)
    }

    console.log('Code map is in sync.')
}

main()
