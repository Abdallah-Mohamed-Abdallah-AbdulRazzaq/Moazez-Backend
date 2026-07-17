import {
  BrandingLogoMimeType,
  isBrandingLogoMimeType,
} from './branding-logo.constants';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_IHDR = Buffer.from('IHDR', 'ascii');
const PNG_IDAT = Buffer.from('IDAT', 'ascii');
const PNG_IEND = Buffer.from('IEND', 'ascii');
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const CRC32_TABLE = createCrc32Table();

export function detectBrandingLogoMimeType(
  buffer: Buffer,
): BrandingLogoMimeType | null {
  const signature = detectBrandingLogoSignatureMimeType(buffer);
  if (signature === 'image/png' && isStructurallyValidPng(buffer)) {
    return 'image/png';
  }
  if (signature === 'image/jpeg' && isStructurallyValidJpeg(buffer)) {
    return 'image/jpeg';
  }
  return null;
}

export function detectBrandingLogoSignatureMimeType(
  buffer: Buffer,
): BrandingLogoMimeType | null {
  if (
    buffer.byteLength >= PNG_SIGNATURE.byteLength &&
    buffer.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)
  ) {
    return 'image/png';
  }
  if (
    buffer.byteLength >= JPEG_SIGNATURE.byteLength &&
    buffer.subarray(0, JPEG_SIGNATURE.byteLength).equals(JPEG_SIGNATURE)
  ) {
    return 'image/jpeg';
  }
  return null;
}

export function normalizeBrandingLogoDeclaredMime(
  value: string,
): BrandingLogoMimeType | null {
  const normalized = value.trim().toLowerCase();
  return isBrandingLogoMimeType(normalized) ? normalized : null;
}

function isStructurallyValidPng(buffer: Buffer): boolean {
  let offset = PNG_SIGNATURE.byteLength;
  let chunkIndex = 0;
  let hasImageData = false;

  while (offset < buffer.byteLength) {
    if (buffer.byteLength - offset < 12) return false;
    const dataLength = buffer.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const chunkEnd = dataStart + dataLength + 4;
    if (chunkEnd > buffer.byteLength) return false;

    const type = buffer.subarray(typeStart, dataStart);
    if (chunkIndex === 0) {
      if (!type.equals(PNG_IHDR) || dataLength !== 13) return false;
      const width = buffer.readUInt32BE(dataStart);
      const height = buffer.readUInt32BE(dataStart + 4);
      if (width === 0 || height === 0) return false;
    } else if (type.equals(PNG_IHDR)) {
      return false;
    }

    const expectedCrc = buffer.readUInt32BE(chunkEnd - 4);
    const actualCrc = crc32(buffer.subarray(typeStart, chunkEnd - 4));
    if (expectedCrc !== actualCrc) return false;

    if (type.equals(PNG_IDAT)) hasImageData = true;
    if (type.equals(PNG_IEND)) {
      return dataLength === 0 && hasImageData && chunkEnd === buffer.byteLength;
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }

  return false;
}

function isStructurallyValidJpeg(buffer: Buffer): boolean {
  if (buffer.byteLength < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return false;
  }

  let offset = 2;
  let hasSupportedFrame = false;
  let hasScan = false;

  while (offset < buffer.byteLength) {
    if (buffer[offset] !== 0xff) return false;
    while (offset < buffer.byteLength && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.byteLength) return false;

    const marker = buffer[offset];
    offset += 1;
    if (marker === 0x00 || marker === 0xd8) return false;
    if (marker === 0xd9) {
      return hasSupportedFrame && hasScan && offset === buffer.byteLength;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) return false;

    if (buffer.byteLength - offset < 2) return false;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.byteLength) {
      return false;
    }

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 8) return false;
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      if (width === 0 || height === 0) return false;
      hasSupportedFrame = true;
    }

    offset += segmentLength;
    if (marker === 0xda) {
      if (!hasSupportedFrame) return false;
      hasScan = true;
      const nextMarker = findMarkerAfterScanData(buffer, offset);
      if (nextMarker === null) return false;
      offset = nextMarker;
    }
  }

  return false;
}

function findMarkerAfterScanData(buffer: Buffer, start: number): number | null {
  let offset = start;
  while (offset < buffer.byteLength) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const markerStart = offset;
    while (offset < buffer.byteLength && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.byteLength) return null;
    const marker = buffer[offset];
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 1;
      continue;
    }
    return markerStart;
  }
  return null;
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let value = 0; value < table.length; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
}

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
