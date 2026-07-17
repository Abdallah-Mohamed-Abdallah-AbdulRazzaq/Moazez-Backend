import {
  detectBrandingLogoMimeType,
  detectBrandingLogoSignatureMimeType,
  normalizeBrandingLogoDeclaredMime,
} from '../domain/branding-logo-signature';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==',
  'base64',
);

describe('branding logo signature validation', () => {
  it('accepts complete structurally valid PNG and JPEG files', () => {
    expect(detectBrandingLogoMimeType(PNG)).toBe('image/png');
    expect(detectBrandingLogoMimeType(JPEG)).toBe('image/jpeg');
  });

  it.each([
    ['empty', Buffer.alloc(0)],
    ['PNG signature only', PNG.subarray(0, 8)],
    ['JPEG signature only', JPEG.subarray(0, 3)],
    ['truncated PNG', PNG.subarray(0, PNG.length - 3)],
    ['truncated JPEG', JPEG.subarray(0, JPEG.length - 3)],
    ['PNG without IEND', PNG.subarray(0, PNG.length - 12)],
    ['PNG with an invalid chunk CRC', pngWithCorruptCrc(PNG)],
    ['JPEG without EOI', JPEG.subarray(0, JPEG.length - 2)],
    [
      'PNG with trailing polyglot text',
      Buffer.concat([PNG, Buffer.from('text')]),
    ],
    [
      'JPEG with trailing polyglot text',
      Buffer.concat([JPEG, Buffer.from('text')]),
    ],
    ['unrelated text', Buffer.from('not-an-image')],
  ])('rejects %s', (_label, value) => {
    expect(detectBrandingLogoMimeType(value)).toBeNull();
  });

  it('rejects positive-signature files with invalid dimensions', () => {
    expect(detectBrandingLogoMimeType(pngWithZeroWidth(PNG))).toBeNull();
    expect(detectBrandingLogoMimeType(jpegWithZeroHeight(JPEG))).toBeNull();
  });

  it('distinguishes a recognized prefix from complete structural acceptance', () => {
    expect(detectBrandingLogoSignatureMimeType(PNG.subarray(0, 8))).toBe(
      'image/png',
    );
    expect(detectBrandingLogoMimeType(PNG.subarray(0, 8))).toBeNull();
  });

  it('normalizes only the two approved declared MIME types', () => {
    expect(normalizeBrandingLogoDeclaredMime(' IMAGE/PNG ')).toBe('image/png');
    expect(normalizeBrandingLogoDeclaredMime('image/jpeg')).toBe('image/jpeg');
    expect(normalizeBrandingLogoDeclaredMime('image/svg+xml')).toBeNull();
  });
});

function pngWithZeroWidth(value: Buffer): Buffer {
  const result = Buffer.from(value);
  result.writeUInt32BE(0, 16);
  result.writeUInt32BE(crc32(result.subarray(12, 29)), 29);
  return result;
}

function pngWithCorruptCrc(value: Buffer): Buffer {
  const result = Buffer.from(value);
  result[29] ^= 0xff;
  return result;
}

function jpegWithZeroHeight(value: Buffer): Buffer {
  const result = Buffer.from(value);
  for (let offset = 2; offset < result.length - 8; ) {
    if (result[offset] !== 0xff) break;
    while (result[offset] === 0xff) offset += 1;
    const marker = result[offset];
    offset += 1;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      result.writeUInt16BE(0, offset + 3);
      return result;
    }
    offset += result.readUInt16BE(offset);
  }
  throw new Error('SOF marker not found in JPEG fixture');
}

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
