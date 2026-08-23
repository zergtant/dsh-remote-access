/**
 * Build the browser half into the dsh client-bundle format:
 * a CJS bundle (react + react/jsx-runtime externalized to the platform seed
 * table) wrapped in window.__ModuleLoader__.load({id, factory}).
 *
 * esbuild resolution order:
 *   1. local node_modules/.bin/esbuild (after `npm install`)
 *   2. a DSH_EBUILD env override (absolute path to a binary)
 *   3. the deepseek-harness monorepo esbuild (development fallback)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

function findEsbuild() {
  const candidates = [
    join(root, 'node_modules', '.bin', 'esbuild'),
    process.env.DSH_ESBUILD,
    '/home/user/deepseek-harness/node_modules/.pnpm/node_modules/.bin/esbuild',
  ].filter(Boolean)
  const hit = candidates.find((p) => existsSync(p))
  if (!hit) {
    throw new Error(
      'esbuild not found. Run `npm install` first (adds esbuild as a devDependency), ' +
        'or set DSH_ESBUILD to an esbuild binary path.',
    )
  }
  return hit
}

const esbuild = findEsbuild()
const tmp = join(root, 'lib', 'client.raw.cjs')
mkdirSync(join(root, 'lib'), { recursive: true })
rmSync(tmp, { force: true })

execFileSync(esbuild, [
  join(here, 'client.tsx'),
  '--bundle',
  '--format=cjs',
  '--platform=browser',
  '--target=es2020',
  '--jsx=automatic',
  '--external:react',
  '--external:react/jsx-runtime',
  '--external:react-dom',
  '--external:react-dom/client',
  `--outfile=${tmp}`,
], { stdio: 'inherit' })

const body = readFileSync(tmp, 'utf8')
rmSync(tmp)

const bundle = `window.__ModuleLoader__.load({
  id: "dsh-remote-access",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${body}
    return module.exports;
  }
});
`
writeFileSync(join(root, 'lib', 'client.js'), bundle)
console.log('wrote lib/client.js', bundle.length, 'bytes')
