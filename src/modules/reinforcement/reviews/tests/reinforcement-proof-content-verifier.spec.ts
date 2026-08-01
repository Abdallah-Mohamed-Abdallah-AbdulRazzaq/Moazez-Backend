import { ReinforcementProofType } from '@prisma/client';
import { Readable } from 'node:stream';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { ReinforcementProofContentVerifierService } from '../application/reinforcement-proof-content-verifier.service';
import {
  detectReinforcementProofMime,
  REINFORCEMENT_PROOF_PREFIX_MAX_BYTES,
  REINFORCEMENT_PROOF_VERIFICATION_TIMEOUT_MS,
} from '../domain/reinforcement-proof-content';

const CRC32_TABLE = createCrc32Table();

describe('reinforcement proof content verification', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['image/png', buildPngHeader()],
    ['image/jpeg', buildJpegPrefix()],
    ['application/pdf', Buffer.from('%PDF-1.7\n', 'ascii')],
    ['video/mp4', buildIsoBmffHeader('isom', ['isom', 'avc1'])],
    ['video/webm', buildEbmlHeader('webm')],
  ] as const)('detects locked MIME %s from object bytes', (mimeType, body) => {
    expect(detectReinforcementProofMime(body)).toBe(mimeType);
  });

  it('rejects malformed locked-type signatures as unrecognized content', () => {
    const malformedPng = buildPngHeader();
    malformedPng.writeUInt32BE(0, 16);
    expect(detectReinforcementProofMime(malformedPng)).toBeNull();
    expect(detectReinforcementProofMime(Buffer.from('%PDF-x.y'))).toBeNull();
  });
  it('rejects invalid PNG bit-depth and color-type combinations', () => {
    const malformedPng = buildPngHeader();
    malformedPng[24] = 1;
    malformedPng[25] = 6;
    malformedPng.writeUInt32BE(crc32(malformedPng.subarray(12, 29)), 29);

    expect(detectReinforcementProofMime(malformedPng)).toBeNull();
  });

  it('rejects a PDF marker that is not the object header', () => {
    const embeddedPdfMarker = Buffer.concat([
      Buffer.from('not-a-pdf-container\n', 'ascii'),
      Buffer.from('%PDF-1.7\n', 'ascii'),
    ]);

    expect(detectReinforcementProofMime(embeddedPdfMarker)).toBeNull();
  });

  it.each([
    [ReinforcementProofType.IMAGE, 'image/png', buildPngHeader()],
    [ReinforcementProofType.IMAGE, 'image/jpeg', buildJpegPrefix()],
    [
      ReinforcementProofType.DOCUMENT,
      'application/pdf',
      Buffer.from('%PDF-1.7\n', 'ascii'),
    ],
    [
      ReinforcementProofType.VIDEO,
      'video/mp4',
      buildIsoBmffHeader('isom', ['isom', 'avc1']),
    ],
    [ReinforcementProofType.VIDEO, 'video/webm', buildEbmlHeader('webm')],
  ] as const)(
    'accepts detected bytes for %s / %s',
    async (proofType, declaredMimeType, body) => {
      const { verifier } = createVerifier(body);
      await expect(
        verifier.verify(
          verificationInput(proofType, declaredMimeType, BigInt(body.length)),
        ),
      ).resolves.toBeUndefined();
    },
  );

  it('rejects detected cross-type content as MIME not allowed', async () => {
    const body = Buffer.from('%PDF-1.7\n', 'ascii');
    const { verifier } = createVerifier(body);

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.mime_not_allowed',
      httpStatus: 415,
    });
  });

  it('rejects detected unsupported content as MIME not allowed', async () => {
    const body = Buffer.from('GIF89a\x01\x00\x01\x00', 'binary');
    const { verifier } = createVerifier(body);

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.mime_not_allowed',
      httpStatus: 415,
    });
  });

  it('reports mismatch when both detected and declared MIME are allowed', async () => {
    const body = buildJpegPrefix();
    const { verifier } = createVerifier(body);

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.mime_mismatch',
      httpStatus: 400,
    });
  });
  it('rejects declared and detected MIME mismatch', async () => {
    const body = buildIsoBmffHeader('isom', ['isom', 'avc1']);
    const { verifier } = createVerifier(body);

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.VIDEO,
          'video/webm',
          BigInt(body.length),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.mime_mismatch',
      httpStatus: 400,
    });
  });

  it('rejects malformed or ambiguous bytes', async () => {
    const body = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const { verifier } = createVerifier(body);

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    ).rejects.toMatchObject({ code: 'reinforcement.proof.invalid_content' });
  });

  it('rejects database and storage size mismatch before reading bytes', async () => {
    const body = buildPngHeader();
    const { verifier, storage } = createVerifier(body);

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length + 1),
        ),
      ),
    ).rejects.toMatchObject({ code: 'reinforcement.proof.invalid_content' });
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('rejects an expected zero size before contacting storage', async () => {
    const body = buildPngHeader();
    const { verifier, storage } = createVerifier(body);

    await expect(
      verifier.verify(
        verificationInput(ReinforcementProofType.IMAGE, 'image/png', 0n),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.invalid_content',
      httpStatus: 400,
    });
    expect(storage.statObject).not.toHaveBeenCalled();
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('rejects a stored zero size before reading object bytes', async () => {
    const body = buildPngHeader();
    const { verifier, storage } = createVerifier(body);
    storage.statObject.mockResolvedValueOnce({ size: 0 });

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.invalid_content',
      httpStatus: 400,
    });
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('maps object lookup and read failures to service unavailable', async () => {
    const body = buildPngHeader();
    const { verifier, storage } = createVerifier(body);
    storage.statObject.mockRejectedValueOnce(
      Object.assign(new Error('missing'), { code: 'NoSuchKey' }),
    );

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.verification_unavailable',
    });
  });

  it('maps getObject rejection to service unavailable', async () => {
    const body = buildPngHeader();
    const { verifier, storage } = createVerifier(body);
    storage.getObject.mockRejectedValueOnce(new Error('internal read failure'));

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.verification_unavailable',
      httpStatus: 503,
    });
  });

  it('times out a stalled stat operation', async () => {
    jest.useFakeTimers();
    const body = buildPngHeader();
    const { verifier, storage } = createVerifier(body);
    storage.statObject.mockReturnValueOnce(new Promise(() => undefined));

    const assertion = expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.verification_unavailable',
      httpStatus: 503,
    });

    await jest.advanceTimersByTimeAsync(
      REINFORCEMENT_PROOF_VERIFICATION_TIMEOUT_MS,
    );
    await assertion;
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('maps an object stream error to service unavailable', async () => {
    const body = buildPngHeader();
    const stream = new Readable({
      read() {
        this.destroy(new Error('internal stream failure'));
      },
    });
    const { verifier, storage } = createVerifier(body);
    storage.getObject.mockResolvedValueOnce(stream);

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.verification_unavailable',
      httpStatus: 503,
    });
  });

  it('rejects a stream truncated before the stat size', async () => {
    const body = buildPngHeader();
    const storedSize = body.length + 10;
    const { verifier, storage } = createVerifier(body);
    storage.statObject.mockResolvedValueOnce({ size: storedSize });

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(storedSize),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.invalid_content',
      httpStatus: 400,
    });
  });

  it('bounds retained bytes and closes the object stream', async () => {
    const body = Buffer.concat([
      buildPngHeader(),
      Buffer.alloc(REINFORCEMENT_PROOF_PREFIX_MAX_BYTES + 1),
    ]);
    const stream = Readable.from([body]);
    const destroy = jest.spyOn(stream, 'destroy');
    const { verifier, storage } = createVerifier(body);
    storage.getObject.mockResolvedValueOnce(stream);

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    ).resolves.toBeUndefined();
    expect(destroy).toHaveBeenCalled();
  });

  it('does not buffer a full video after the bounded 256 KiB prefix', async () => {
    const fullSize = REINFORCEMENT_PROOF_PREFIX_MAX_BYTES * 4;
    const chunkSize = 16 * 1024;
    const mp4Header = buildIsoBmffHeader('isom', ['isom', 'avc1']);
    let emittedBytes = 0;
    const stream = new Readable({
      highWaterMark: chunkSize,
      read() {
        const remainingBytes = fullSize - emittedBytes;
        if (remainingBytes <= 0) {
          this.push(null);
          return;
        }
        const nextSize = Math.min(chunkSize, remainingBytes);
        const chunk = Buffer.alloc(nextSize);
        if (emittedBytes === 0) mp4Header.copy(chunk);
        emittedBytes += nextSize;
        this.push(chunk);
      },
    });
    const { verifier, storage } = createVerifier(mp4Header);
    storage.statObject.mockResolvedValueOnce({ size: fullSize });
    storage.getObject.mockResolvedValueOnce(stream);

    await expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.VIDEO,
          'video/mp4',
          BigInt(fullSize),
        ),
      ),
    ).resolves.toBeUndefined();

    expect(emittedBytes).toBeLessThan(fullSize);
    expect(emittedBytes).toBeLessThanOrEqual(
      REINFORCEMENT_PROOF_PREFIX_MAX_BYTES + chunkSize,
    );
    expect(stream.destroyed).toBe(true);
  });

  it('keeps an internal storage cause out of public exception fields', async () => {
    const body = buildPngHeader();
    const { verifier, storage } = createVerifier(body);
    const internalMarker = 'private-storage-cause-marker';
    storage.statObject.mockRejectedValueOnce(new Error(internalMarker));

    const error = await captureRejection(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    );

    expect(error).toMatchObject({
      code: 'reinforcement.proof.verification_unavailable',
      httpStatus: 503,
    });
    expect(error.details).toBeUndefined();
    expect(error.message).not.toContain(internalMarker);
  });

  it('times out a stalled object stream and closes it', async () => {
    jest.useFakeTimers();
    const body = buildPngHeader();
    const stream = new Readable({ read() {} });
    const destroy = jest.spyOn(stream, 'destroy');
    const { verifier, storage } = createVerifier(body);
    storage.getObject.mockResolvedValueOnce(stream);

    const assertion = expect(
      verifier.verify(
        verificationInput(
          ReinforcementProofType.IMAGE,
          'image/png',
          BigInt(body.length),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.verification_unavailable',
    });

    await jest.advanceTimersByTimeAsync(
      REINFORCEMENT_PROOF_VERIFICATION_TIMEOUT_MS,
    );
    await assertion;
    expect(destroy).toHaveBeenCalled();
  });
});

function createVerifier(body: Buffer) {
  const storage = {
    statObject: jest.fn().mockResolvedValue({ size: body.length }),
    getObject: jest.fn().mockResolvedValue(Readable.from([body])),
  };
  const verifier = new ReinforcementProofContentVerifierService(
    storage as unknown as StorageService,
  );
  return { verifier, storage };
}

function verificationInput(
  proofType: ReinforcementProofType,
  declaredMimeType: string,
  expectedSizeBytes: bigint,
) {
  return {
    proofType,
    declaredMimeType,
    bucket: 'private-files',
    objectKey: 'org-1/school-1/proofs/file-1',
    expectedSizeBytes,
  };
}

async function captureRejection(promise: Promise<unknown>): Promise<
  Error & {
    code?: string;
    httpStatus?: number;
    details?: unknown;
  }
> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error('Expected promise to reject');
}

function buildPngHeader(width = 1, height = 1): Buffer {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const chunk = Buffer.alloc(25);
  chunk.writeUInt32BE(13, 0);
  chunk.write('IHDR', 4, 'ascii');
  chunk.writeUInt32BE(width, 8);
  chunk.writeUInt32BE(height, 12);
  chunk[16] = 8;
  chunk[17] = 6;
  chunk[18] = 0;
  chunk[19] = 0;
  chunk[20] = 0;
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 21)), 21);
  return Buffer.concat([signature, chunk]);
}

function buildJpegPrefix(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11,
    0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
  ]);
}

function buildIsoBmffHeader(majorBrand: string, compatibleBrands: string[]) {
  const boxSize = 16 + compatibleBrands.length * 4;
  const buffer = Buffer.alloc(boxSize);
  buffer.writeUInt32BE(boxSize, 0);
  buffer.write('ftyp', 4, 'ascii');
  buffer.write(majorBrand, 8, 'ascii');
  buffer.writeUInt32BE(0, 12);
  compatibleBrands.forEach((brand, index) => {
    buffer.write(brand, 16 + index * 4, 'ascii');
  });
  return buffer;
}

function buildEbmlHeader(docType: string): Buffer {
  const value = Buffer.from(docType, 'ascii');
  return Buffer.concat([
    Buffer.from([
      0x1a,
      0x45,
      0xdf,
      0xa3,
      0x80 | (3 + value.length),
      0x42,
      0x82,
      0x80 | value.length,
    ]),
    value,
  ]);
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
