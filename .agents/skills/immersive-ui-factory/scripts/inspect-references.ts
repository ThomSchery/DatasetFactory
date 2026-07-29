import { readdir, readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const directory = process.argv[2]
if (!directory) throw new Error('Usage: bun inspect-references.ts <directory>')

function pngSize(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!signature.every((value, index) => bytes[index] === value)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20), bitDepth: bytes[24], colorType: bytes[25] }
}

const root = resolve(directory)
const entries = await readdir(root, { withFileTypes: true })
const files = []
for (const entry of entries) {
  if (!entry.isFile()) continue
  const path = join(root, entry.name)
  const extension = extname(entry.name).toLowerCase()
  const record: Record<string, unknown> = { name: entry.name, extension }
  if (extension === '.png') record.png = pngSize(await readFile(path))
  files.push(record)
}
console.log(JSON.stringify({ root, count: files.length, files }, null, 2))
