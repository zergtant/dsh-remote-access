/**
 * Build the browser half into the dsh client-bundle format: a CJS bundle
 * (react + react/jsx-runtime externalized to the platform seed table) wrapped
 * in window.__ModuleLoader__.load({id, factory}).
 *
 * esbuild is used through its JavaScript API so the platform binary is located
 * by the package itself — a bare `.bin/esbuild` shim is a shell script on
 * Windows and cannot be executed directly.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

/** Load the local devDependency, with a diagnostic that names the fix. */
async function loadEsbuild() {
  // esbuild's Node API has no per-call binary option; this is its supported
  // override for an offline or vendored setup.
  const override = process.env.DSH_ESBUILD
  if (override !== undefined && override !== '') process.env.ESBUILD_BINARY_PATH = override
  try {
    return await import('esbuild')
  } catch (error) {
    throw new Error(
      'esbuild is not installed. Run `npm install` (or `pnpm install`) in this package first, '
      + `or set DSH_ESBUILD to an esbuild binary path. (${error.message})`,
    )
  }
}

const esbuild = await loadEsbuild()
const tmp = join(root, 'lib', 'client.raw.cjs')
mkdirSync(join(root, 'lib'), { recursive: true })
rmSync(tmp, { force: true })

await esbuild.build({
  entryPoints: [join(here, 'client.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  outfile: tmp,
  logLevel: 'info',
})

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
