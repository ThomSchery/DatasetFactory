import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}
const imageArg = arg('image')
const metaArg = arg('meta')
if (!imageArg || !metaArg) throw new Error('Usage: bun validate-nine-slice.ts --image <png> --meta <json>')

const image = new Uint8Array(await readFile(resolve(imageArg)))
const signature = [137, 80, 78, 71, 13, 10, 26, 10]
const errors: string[] = []
if (!signature.every((value, index) => image[index] === value)) errors.push('image is not a PNG')
const view = new DataView(image.buffer, image.byteOffset, image.byteLength)
const width = image.length >= 26 ? view.getUint32(16) : 0
const height = image.length >= 26 ? view.getUint32(20) : 0
const colorType = image[25]
const meta = JSON.parse(await readFile(resolve(metaArg), 'utf8'))
for (const key of ['top', 'right', 'bottom', 'left']) {
  if (!Number.isInteger(meta.slice?.[key]) || meta.slice[key] < 0) errors.push(`slice.${key} must be a non-negative integer`)
}
if ((meta.slice?.left ?? 0) + (meta.slice?.right ?? 0) >= width) errors.push('left + right slices must be smaller than image width')
if ((meta.slice?.top ?? 0) + (meta.slice?.bottom ?? 0) >= height) errors.push('top + bottom slices must be smaller than image height')
if ((meta.minimumSize?.width ?? 0) < (meta.slice?.left ?? 0) + (meta.slice?.right ?? 0)) errors.push('minimum width cannot preserve fixed horizontal slices')
if ((meta.minimumSize?.height ?? 0) < (meta.slice?.top ?? 0) + (meta.slice?.bottom ?? 0)) errors.push('minimum height cannot preserve fixed vertical slices')
if (meta.requiresAlpha && ![4, 6].includes(colorType)) errors.push('PNG has no alpha channel but requiresAlpha is true')
if (!['stretch', 'repeat', 'transparent'].includes(meta.center)) errors.push('center mode is invalid')
if (!['stretch', 'repeat'].includes(meta.edge)) errors.push('edge mode is invalid')

console.log(JSON.stringify({ ok: errors.length === 0, image: { width, height, colorType }, errors }, null, 2))
if (errors.length) process.exitCode = 1
