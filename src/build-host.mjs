/**
 * Copy the host half into lib/ — the artifact the package entry points at.
 * A node script rather than `cp` so the build works on every shell.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
mkdirSync(join(root, 'lib'), { recursive: true })
copyFileSync(join(here, 'index.js'), join(root, 'lib', 'index.js'))
console.log('wrote lib/index.js')
