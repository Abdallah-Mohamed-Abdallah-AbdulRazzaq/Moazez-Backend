import { HttpStatus } from '@nestjs/common';
import { ReinforcementProofType } from '@prisma/client';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export const REINFORCEMENT_PROOF_PREFIX_MAX_BYTES = 256 * 1024;
export const REINFORCEMENT_PROOF_VERIFICATION_TIMEOUT_MS = 5_000;

export type ReinforcementProofDetectedMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'video/mp4'
  | 'video/webm'
  | 'application/pdf'
  | 'image/gif'
  | 'image/webp'
  | 'audio/mpeg'
  | 'audio/mp4'
  | 'video/quicktime'
  | 'video/3gpp'
  | 'video/x-matroska'
  | 'application/zip';

export class ReinforcementProofMimeMismatchException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.proof.mime_mismatch',
      message: 'The declared proof file type does not match its content',
      httpStatus: HttpStatus.BAD_REQUEST,
      details,
    });
  }
}

export class ReinforcementProofInvalidContentException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.proof.invalid_content',
      message: 'The proof file content is invalid or incomplete',
      httpStatus: HttpStatus.BAD_REQUEST,
      details,
    });
  }
}

export class ReinforcementProofVerificationUnavailableException extends DomainException {
  constructor(cause?: unknown) {
    super({
      code: 'reinforcement.proof.verification_unavailable',
      message: 'Proof file verification is temporarily unavailable',
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
      cause,
    });
  }
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_IHDR = Buffer.from('IHDR', 'ascii');
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const PNG_ALLOWED_BIT_DEPTHS_BY_COLOR_TYPE: Readonly<
  Record<number, readonly number[]>
> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

const ACCEPTED_VIDEO_MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
]);
const CRC32_TABLE = createCrc32Table();

export function detectReinforcementProofMime(
  prefix: Buffer,
): ReinforcementProofDetectedMimeType | null {
  if (isStructurallyValidPngPrefix(prefix)) return 'image/png';
  if (isStructurallyValidJpegPrefix(prefix)) return 'image/jpeg';
  if (hasPdfHeader(prefix)) return 'application/pdf';

  const isoBmffMime = detectIsoBmffMime(prefix);
  if (isoBmffMime) return isoBmffMime;

  const ebmlMime = detectEbmlMime(prefix);
  if (ebmlMime) return ebmlMime;

  if (
    prefix.subarray(0, 6).toString('ascii') === 'GIF87a' ||
    prefix.subarray(0, 6).toString('ascii') === 'GIF89a'
  ) {
    return 'image/gif';
  }
  if (
    prefix.subarray(0, 4).toString('ascii') === 'RIFF' &&
    prefix.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    prefix.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
    prefix.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  ) {
    return 'application/zip';
  }
  if (
    prefix.subarray(0, 3).toString('ascii') === 'ID3' ||
    (prefix.length >= 2 && prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0)
  ) {
    return 'audio/mpeg';
  }

  return null;
}

export function isFileBackedReinforcementProofType(
  proofType: ReinforcementProofType,
): boolean {
  return proofType !== ReinforcementProofType.NONE;
}

function isStructurallyValidPngPrefix(buffer: Buffer): boolean {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return false;
  }
  if (buffer.readUInt32BE(8) !== 13) return false;
  if (!buffer.subarray(12, 16).equals(PNG_IHDR)) return false;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) return false;

  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const compressionMethod = buffer[26];
  const filterMethod = buffer[27];
  const interlaceMethod = buffer[28];
  const allowedBitDepths = PNG_ALLOWED_BIT_DEPTHS_BY_COLOR_TYPE[colorType];
  if (!allowedBitDepths?.includes(bitDepth)) return false;
  if (compressionMethod !== 0 || filterMethod !== 0) return false;
  if (interlaceMethod !== 0 && interlaceMethod !== 1) return false;

  const expectedCrc = buffer.readUInt32BE(29);
  const actualCrc = crc32(buffer.subarray(12, 29));
  return expectedCrc === actualCrc;
}

function isStructurallyValidJpegPrefix(buffer: Buffer): boolean {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return false;
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) return false;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) return false;

    const marker = buffer[offset];
    offset += 1;
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xda) return false;

    if (buffer.length - offset < 2) return false;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      return false;
    }

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 8) return false;
      return (
        buffer.readUInt16BE(offset + 3) > 0 &&
        buffer.readUInt16BE(offset + 5) > 0
      );
    }

    offset += segmentLength;
  }

  return false;
}

function hasPdfHeader(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  return /^%PDF-[12]\.[0-9]$/u.test(buffer.subarray(0, 8).toString('ascii'));
}

function detectIsoBmffMime(
  buffer: Buffer,
): ReinforcementProofDetectedMimeType | null {
  if (
    buffer.length < 16 ||
    buffer.subarray(4, 8).toString('ascii') !== 'ftyp'
  ) {
    return null;
  }

  const boxSize = buffer.readUInt32BE(0);
  if (boxSize < 16 || boxSize > buffer.length || boxSize % 4 !== 0) return null;

  const brands: string[] = [buffer.subarray(8, 12).toString('ascii')];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.push(buffer.subarray(offset, offset + 4).toString('ascii'));
  }

  if (brands.includes('qt  ')) return 'video/quicktime';
  if (brands.some((brand) => /^3g[p2]/u.test(brand))) return 'video/3gpp';
  if (
    brands.includes('M4A ') &&
    !brands.some((brand) => ['M4V ', 'avc1'].includes(brand))
  ) {
    return 'audio/mp4';
  }
  if (brands.some((brand) => ACCEPTED_VIDEO_MP4_BRANDS.has(brand))) {
    return 'video/mp4';
  }

  return null;
}

function detectEbmlMime(
  buffer: Buffer,
): ReinforcementProofDetectedMimeType | null {
  if (!buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return null;
  }

  const rootSize = readEbmlVint(buffer, 4, false);
  if (!rootSize) return null;

  let offset = 4 + rootSize.length;
  const headerEnd = Math.min(buffer.length, offset + rootSize.value);
  while (offset < headerEnd) {
    const id = readEbmlVint(buffer, offset, true);
    if (!id) return null;
    offset += id.length;

    const size = readEbmlVint(buffer, offset, false);
    if (!size) return null;
    offset += size.length;

    const valueEnd = offset + size.value;
    if (valueEnd > headerEnd) return null;
    if (id.value === 0x4282) {
      const docType = buffer
        .subarray(offset, valueEnd)
        .toString('ascii')
        .toLowerCase();
      if (docType === 'webm') return 'video/webm';
      if (docType === 'matroska') return 'video/x-matroska';
      return null;
    }
    offset = valueEnd;
  }

  return null;
}

function readEbmlVint(
  buffer: Buffer,
  offset: number,
  preserveMarker: boolean,
): { length: number; value: number } | null {
  const first = buffer[offset];
  if (first === undefined || first === 0) return null;

  let marker = 0x80;
  let length = 1;
  while (length <= 8 && (first & marker) === 0) {
    marker >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > buffer.length) return null;

  let value = preserveMarker ? first : first & (marker - 1);
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + buffer[offset + index];
  }
  if (!Number.isSafeInteger(value)) return null;
  return { length, value };
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
