import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

interface PngChunk {
  data: Buffer;
  type: string;
}

function chunks(input: Buffer): PngChunk[] {
  if (!input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("Screenshot is not a PNG file");
  }
  const result: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("ascii", offset + 4, offset + 8);
    result.push({ data: input.subarray(offset + 8, offset + 8 + length), type });
    offset += length + 12;
  }
  return result;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function unfilterScanlines(
  compressed: Buffer,
  width: number,
  height: number,
  bytesPerPixel: number,
): Buffer {
  const rowLength = width * bytesPerPixel;
  const filtered = inflateSync(compressed);
  if (filtered.length !== height * (rowLength + 1)) {
    throw new Error("Screenshot PNG has an unexpected scanline size");
  }
  const normalized = Buffer.alloc(filtered.length);
  let previous = Buffer.alloc(rowLength);
  let inputOffset = 0;
  let outputOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = filtered[inputOffset]!;
    inputOffset += 1;
    normalized[outputOffset] = 0;
    outputOffset += 1;
    const current = Buffer.alloc(rowLength);
    for (let column = 0; column < rowLength; column += 1) {
      const encoded = filtered[inputOffset + column]!;
      const left = column >= bytesPerPixel ? current[column - bytesPerPixel]! : 0;
      const above = previous[column]!;
      const upperLeft = column >= bytesPerPixel ? previous[column - bytesPerPixel]! : 0;
      let predictor: number;
      switch (filter) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = left;
          break;
        case 2:
          predictor = above;
          break;
        case 3:
          predictor = Math.floor((left + above) / 2);
          break;
        case 4:
          predictor = paeth(left, above, upperLeft);
          break;
        default:
          throw new Error(`Screenshot PNG uses unsupported filter ${String(filter)}`);
      }
      current[column] = (encoded + predictor) & 0xff;
    }
    current.copy(normalized, outputOffset);
    inputOffset += rowLength;
    outputOffset += rowLength;
    previous = current;
  }
  return normalized;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBytes, data]);
  let crc = 0xffffffff;
  for (const value of crcInput) {
    crc = CRC_TABLE[(crc ^ value) & 0xff]! ^ (crc >>> 8);
  }
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
  return result;
}

/** Re-encodes Chromium's pixels with fixed filters and zlib settings. */
export function deterministicPng(input: Buffer): Buffer {
  const parsed = chunks(input);
  const header = parsed.find((chunk) => chunk.type === "IHDR")?.data;
  if (header === undefined || header.length !== 13) {
    throw new Error("Screenshot PNG is missing its IHDR chunk");
  }
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  const interlace = header[12];
  if (bitDepth !== 8 || ![2, 6].includes(colorType ?? -1) || interlace !== 0) {
    throw new Error("Screenshot PNG must be non-interlaced 8-bit RGB or RGBA");
  }
  const compressed = Buffer.concat(
    parsed.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data),
  );
  const normalized = unfilterScanlines(compressed, width, height, colorType === 6 ? 4 : 3);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(normalized, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
