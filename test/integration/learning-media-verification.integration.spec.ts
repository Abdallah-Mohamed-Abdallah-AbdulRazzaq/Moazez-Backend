import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { MinioAdapter } from '../../src/infrastructure/storage/minio.adapter';
import { SignedUrlService } from '../../src/infrastructure/storage/signed-url.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { MediaVerifierService } from '../../src/modules/files/uploads/application/media-verifier.service';

jest.setTimeout(120_000);

describe('authoritative learning media verification in canonical runtime', () => {
  const config = new ConfigService(process.env);
  const adapter = new MinioAdapter(config);
  const storage = new StorageService(
    adapter,
    new SignedUrlService(adapter, config),
  );
  const verifier = new MediaVerifierService(storage, config);
  const bucket = process.env.STORAGE_BUCKET ?? '';
  const directory = mkdtempSync(join(tmpdir(), 'moazez-verification-test-'));
  const objects: string[] = [];

  afterAll(async () => {
    for (const objectKey of objects) {
      await storage.deleteObject({ bucket, objectKey }).catch(() => undefined);
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    ['application/pdf', 'pdf', false, null, null],
    ['text/plain', 'txt', false, null, null],
    ['image/jpeg', 'jpg', false, 64, 32],
    ['image/png', 'png', false, 64, 32],
    ['audio/mpeg', 'mp3', true, null, null],
    ['audio/mp4', 'm4a', true, null, null],
    ['audio/webm', 'webm-audio', true, null, null],
    ['video/mp4', 'mp4', true, 320, 180],
    ['video/webm', 'webm-video', true, 320, 180],
  ] as const)(
    'streams, hashes, and verifies the locked %s FILE type',
    async (mimeType, fixtureType, requiresDuration, width, height) => {
      const body = createFixture(fixtureType);
      const objectKey = `learning-media-verification/${randomUUID()}`;
      objects.push(objectKey);
      await storage.saveObject({
        bucket,
        objectKey,
        body,
        contentType: mimeType,
      });

      const facts = await verifier.verifyExistingFinal({
        finalBucket: bucket,
        finalObjectKey: objectKey,
        expectedMimeType: mimeType,
        expectedSizeBytes: BigInt(body.byteLength),
      });

      expect(facts.verifiedMimeType).toBe(mimeType);
      expect(facts.actualSizeBytes).toBe(BigInt(body.byteLength));
      if (requiresDuration) {
        expect(typeof facts.durationSeconds).toBe('number');
      } else {
        expect(facts.durationSeconds).toBeNull();
      }
      expect(facts.width).toBe(width);
      expect(facts.height).toBe(height);
      expect(facts.verificationVersion).toBe(
        'ffprobe-5.1.9-debian12-learning-media-v1',
      );
      expect(facts.checksumSha256).toMatch(/^[a-f0-9]{64}$/u);
    },
  );

  it.each([
    ['video/mp4 bytes declared WebM', 'video/webm', 'mp4', 'magic_mismatch'],
    ['PDF bytes declared text', 'text/plain', 'pdf', 'magic_mismatch'],
    [
      'audio-only WebM declared video',
      'video/webm',
      'webm-audio',
      'invalid_stream_layout',
    ],
  ] as const)(
    'rejects %s without exposing raw subprocess output',
    async (_label, expectedMimeType, fixtureType, reasonCode) => {
      const body = createFixture(fixtureType);
      const objectKey = `learning-media-verification/spoof/${randomUUID()}`;
      objects.push(objectKey);
      await storage.saveObject({ bucket, objectKey, body });

      await expect(
        verifier.verifyExistingFinal({
          finalBucket: bucket,
          finalObjectKey: objectKey,
          expectedMimeType,
          expectedSizeBytes: BigInt(body.byteLength),
        }),
      ).rejects.toMatchObject({ reasonCode });
    },
  );

  it('rejects binary/NUL spoofing for text/plain', async () => {
    const body = Buffer.from([0x68, 0x69, 0x00, 0x89, 0x50, 0x4e, 0x47]);
    const objectKey = `learning-media-verification/spoof/${randomUUID()}`;
    objects.push(objectKey);
    await storage.saveObject({ bucket, objectKey, body });

    await expect(
      verifier.verifyExistingFinal({
        finalBucket: bucket,
        finalObjectKey: objectKey,
        expectedMimeType: 'text/plain',
        expectedSizeBytes: BigInt(body.byteLength),
      }),
    ).rejects.toMatchObject({ reasonCode: 'magic_mismatch' });
  });

  it.each([
    ['QuickTime/MOV', 'video/mp4', 'mov'],
    ['Matroska', 'video/webm', 'matroska'],
  ] as const)(
    'rejects the near-neighbor %s container',
    async (_label, expectedMimeType, fixtureType) => {
      const body = createFixture(fixtureType);
      const objectKey = `learning-media-verification/container/${randomUUID()}`;
      objects.push(objectKey);
      await storage.saveObject({ bucket, objectKey, body });

      await expect(
        verifier.verifyExistingFinal({
          finalBucket: bucket,
          finalObjectKey: objectKey,
          expectedMimeType,
          expectedSizeBytes: BigInt(body.byteLength),
        }),
      ).rejects.toMatchObject({ reasonCode: 'unsupported_container' });
    },
  );

  it.each([
    [
      'unsupported ISO BMFF brand',
      'video/mp4',
      buildIsoBmffHeader('3gp5'),
      'unsupported_container',
    ],
    [
      'EBML with a non-WebM DocType',
      'video/webm',
      buildEbmlHeader('notwebm'),
      'unsupported_container',
    ],
    [
      'raw MP4 magic spoof',
      'video/mp4',
      buildIsoBmffHeader('isom'),
      'probe_failed',
    ],
  ] as const)(
    'rejects %s without trusting family magic',
    async (_label, expectedMimeType, body, reasonCode) => {
      const objectKey = `learning-media-verification/container/${randomUUID()}`;
      objects.push(objectKey);
      await storage.saveObject({ bucket, objectKey, body });

      await expect(
        verifier.verifyExistingFinal({
          finalBucket: bucket,
          finalObjectKey: objectKey,
          expectedMimeType,
          expectedSizeBytes: BigInt(body.byteLength),
        }),
      ).rejects.toMatchObject({ reasonCode });
    },
  );

  function createFixture(
    type:
      | 'pdf'
      | 'txt'
      | 'jpg'
      | 'png'
      | 'mp3'
      | 'm4a'
      | 'webm-audio'
      | 'mp4'
      | 'webm-video'
      | 'mov'
      | 'matroska',
  ): Buffer {
    const path = join(directory, `${type}-${randomUUID()}.${extension(type)}`);
    if (type === 'pdf') {
      writeFileSync(
        path,
        '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
      );
    } else if (type === 'txt') {
      writeFileSync(path, 'A safe UTF-8 lesson text.\nمرحبا بالعالم\n');
    } else if (type === 'jpg' || type === 'png') {
      runFfmpeg([
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=64x32:d=0.1',
        '-frames:v',
        '1',
        path,
      ]);
    } else if (type === 'mp3' || type === 'm4a' || type === 'webm-audio') {
      const codec =
        type === 'mp3' ? 'libmp3lame' : type === 'm4a' ? 'aac' : 'libopus';
      runFfmpeg([
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.25',
        '-c:a',
        codec,
        path,
      ]);
    } else if (type === 'mov') {
      runFfmpeg([
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=320x180:d=0.25',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-f',
        'mov',
        path,
      ]);
    } else if (type === 'matroska') {
      runFfmpeg([
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=320x180:d=0.25',
        '-c:v',
        'libvpx-vp9',
        '-pix_fmt',
        'yuv420p',
        '-f',
        'matroska',
        path,
      ]);
    } else {
      runFfmpeg([
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=320x180:d=0.25',
        '-c:v',
        type === 'mp4' ? 'libx264' : 'libvpx',
        '-pix_fmt',
        'yuv420p',
        path,
      ]);
    }
    return readFileSync(path);
  }

  function runFfmpeg(arguments_: string[]): void {
    execFileSync(
      '/usr/bin/ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-y', ...arguments_],
      { stdio: 'ignore' },
    );
  }

  function extension(type: string): string {
    const extensions: Record<string, string> = {
      pdf: 'pdf',
      txt: 'txt',
      jpg: 'jpg',
      png: 'png',
      mp3: 'mp3',
      m4a: 'm4a',
      'webm-audio': 'webm',
      mp4: 'mp4',
      'webm-video': 'webm',
      mov: 'mov',
      matroska: 'mkv',
    };
    return extensions[type];
  }

  function buildIsoBmffHeader(majorBrand: string): Buffer {
    const head = Buffer.alloc(20);
    head.writeUInt32BE(head.length, 0);
    head.write('ftyp', 4, 'ascii');
    head.write(majorBrand, 8, 'ascii');
    head.write(majorBrand, 16, 'ascii');
    return head;
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
});
