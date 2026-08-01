import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ReinforcementProofType } from '@prisma/client';
import { MinioAdapter } from '../../src/infrastructure/storage/minio.adapter';
import { SignedUrlService } from '../../src/infrastructure/storage/signed-url.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { ReinforcementProofContentVerifierService } from '../../src/modules/reinforcement/reviews/application/reinforcement-proof-content-verifier.service';

const CRC32_TABLE = createCrc32Table();

jest.setTimeout(120_000);

describe('reinforcement proof verification against real MinIO objects', () => {
  const config = new ConfigService(process.env);
  const adapter = new MinioAdapter(config);
  const storage = new StorageService(
    adapter,
    new SignedUrlService(adapter, config),
  );
  const verifier = new ReinforcementProofContentVerifierService(storage);
  const bucket = process.env.STORAGE_BUCKET ?? '';
  const objectKeys: string[] = [];

  afterAll(async () => {
    for (const objectKey of objectKeys) {
      await storage.deleteObject({ bucket, objectKey }).catch(() => undefined);
    }
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
    'accepts stored %s bytes declared as %s',
    async (proofType, declaredMimeType, body) => {
      const objectKey = await saveObject(body, declaredMimeType);

      await expect(
        verifier.verify({
          proofType,
          declaredMimeType,
          bucket,
          objectKey,
          expectedSizeBytes: BigInt(body.length),
        }),
      ).resolves.toBeUndefined();
    },
  );

  it('rejects stored cross-type content as MIME not allowed', async () => {
    const body = Buffer.from('%PDF-1.7\n', 'ascii');
    const objectKey = await saveObject(body, 'image/png');

    await expect(
      verifier.verify({
        proofType: ReinforcementProofType.IMAGE,
        declaredMimeType: 'image/png',
        bucket,
        objectKey,
        expectedSizeBytes: BigInt(body.length),
      }),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.mime_not_allowed',
      httpStatus: 415,
    });
  });

  it('rejects stored unsupported content as MIME not allowed', async () => {
    const body = Buffer.from('GIF89a\x01\x00\x01\x00', 'binary');
    const objectKey = await saveObject(body, 'image/png');

    await expect(
      verifier.verify({
        proofType: ReinforcementProofType.IMAGE,
        declaredMimeType: 'image/png',
        bucket,
        objectKey,
        expectedSizeBytes: BigInt(body.length),
      }),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.mime_not_allowed',
      httpStatus: 415,
    });
  });

  it('rejects stored sibling MIME mismatch', async () => {
    const body = buildIsoBmffHeader('isom', ['isom', 'avc1']);
    const objectKey = await saveObject(body, 'video/webm');

    await expect(
      verifier.verify({
        proofType: ReinforcementProofType.VIDEO,
        declaredMimeType: 'video/webm',
        bucket,
        objectKey,
        expectedSizeBytes: BigInt(body.length),
      }),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.mime_mismatch',
      httpStatus: 400,
    });
  });

  it('rejects stored malformed bytes', async () => {
    const body = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const objectKey = await saveObject(body, 'image/png');

    await expect(
      verifier.verify({
        proofType: ReinforcementProofType.IMAGE,
        declaredMimeType: 'image/png',
        bucket,
        objectKey,
        expectedSizeBytes: BigInt(body.length),
      }),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.invalid_content',
      httpStatus: 400,
    });
  });

  it('rejects database and stored-object size mismatch', async () => {
    const body = buildPngHeader();
    const objectKey = await saveObject(body, 'image/png');

    await expect(
      verifier.verify({
        proofType: ReinforcementProofType.IMAGE,
        declaredMimeType: 'image/png',
        bucket,
        objectKey,
        expectedSizeBytes: BigInt(body.length + 1),
      }),
    ).rejects.toMatchObject({
      code: 'reinforcement.proof.invalid_content',
      httpStatus: 400,
    });
  });

  it('maps a missing stored object to unavailable without storage leakage', async () => {
    const objectKey = `reinforcement-proof-integration/missing/${randomUUID()}`;

    const error = await captureRejection(
      verifier.verify({
        proofType: ReinforcementProofType.IMAGE,
        declaredMimeType: 'image/png',
        bucket,
        objectKey,
        expectedSizeBytes: 33n,
      }),
    );

    expect(error).toMatchObject({
      code: 'reinforcement.proof.verification_unavailable',
      httpStatus: 503,
    });
    expect(error.details).toBeUndefined();
    expect(error.message).not.toContain(bucket);
    expect(error.message).not.toContain(objectKey);
  });

  async function saveObject(
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    const objectKey = `reinforcement-proof-integration/${randomUUID()}`;
    objectKeys.push(objectKey);
    await storage.saveObject({
      bucket,
      objectKey,
      body,
      contentType,
    });
    return objectKey;
  }
});

async function captureRejection(
  promise: Promise<unknown>,
): Promise<{
  code?: string;
  httpStatus?: number;
  details?: unknown;
  message: string;
}> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error as Error & {
        code?: string;
        httpStatus?: number;
        details?: unknown;
      };
    }
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
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    0x00, 0x01,
    0x00, 0x01,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
  ]);
}

function buildIsoBmffHeader(
  majorBrand: string,
  compatibleBrands: string[],
): Buffer {
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
