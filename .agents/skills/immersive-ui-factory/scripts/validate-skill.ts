import { access, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skill = await readFile(join(root, 'SKILL.md'), 'utf8')
const errors: string[] = []
if (!skill.startsWith('---\n')) errors.push('SKILL.md must start with YAML frontmatter')
if (!/\nname: immersive-ui-factory\n/.test(skill)) errors.push('name is missing or invalid')
if (!/\ndescription: .+\n---\n/s.test(skill)) errors.push('description frontmatter is missing')
for (const match of skill.matchAll(/\]\((references\/[^)]+)\)/g)) {
  try { await access(join(root, match[1])) } catch { errors.push(`missing reference: ${match[1]}`) }
}
for (const path of ['agents/openai.yaml', 'assets/run.template.json', 'assets/nine-slice.template.json']) {
  try { await access(join(root, path)) } catch { errors.push(`missing required file: ${path}`) }
}
console.log(JSON.stringify({ ok: errors.length === 0, root, errors }, null, 2))
if (errors.length) process.exitCode = 1
