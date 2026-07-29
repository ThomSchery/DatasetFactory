import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const rootArg = arg('root')
const goal = arg('goal')
if (!rootArg || !goal) throw new Error('Usage: bun init-design-run.ts --root <directory> --goal <goal> [--target <target>]')

const root = resolve(rootArg)
const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const template = JSON.parse(await readFile(join(skillRoot, 'assets', 'run.template.json'), 'utf8'))
const id = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`
const folders = ['inputs', 'analysis', 'artifacts', 'rejected', 'previews', 'reports']
for (const folder of folders) await mkdir(join(root, folder), { recursive: true })

const manifest = {
  ...template,
  id,
  goal,
  target: arg('target') ?? null,
  createdAt: new Date().toISOString(),
}
await writeFile(join(root, 'run.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
console.log(JSON.stringify({ ok: true, root, manifest: join(root, 'run.json'), folders }, null, 2))
