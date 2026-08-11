import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isObjectStorageNotFoundError } from '../../../../infrastructure/storage/object-storage.errors';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import {
  learningMediaMaximumSizeBytes,
  LEARNING_MEDIA_MAX_DURATION_SECONDS,
  LEARNING_MEDIA_MAX_HEIGHT,
  LEARNING_MEDIA_MAX_WIDTH,
  LEARNING_MEDIA_VERIFICATION_VERSION,
  type LearningMediaMimeType,
} from '../domain/learning-media.constants';
import { MEDIA_RUNTIME_CONTRACT } from './media-runtime-startup.guard';

type BoundedProcessResult = {
  ok: boolean;
  reason: string | null;
  stdout?: Buffer;
};
type RuntimeContractModule = {
  runBounded(
    executable: string,
    args: string[],
    options: {
      timeoutMs: number;
      maximumStdoutBytes: number;
      maximumStderrBytes: number;
      maximumTotalOutputBytes: number;
    },
  ): Promise<BoundedProcessResult>;
};
const runtime = createRequire(__filename)(
  join(process.cwd(), 'scripts/media-runtime-contract.cjs'),
) as RuntimeContractModule;

export type MediaVerificationFailureReason =
  | 'binary_unavailable'
  | 'version_mismatch'
  | 'timeout'
  | 'output_limit_exceeded'
  | 'network_protocol_forbidden'
  | 'invalid_probe_output'
  | 'unsupported_container'
  | 'unsupported_video_codec'
  | 'unsupported_audio_codec'
  | 'invalid_stream_layout'
  | 'invalid_duration'
  | 'invalid_dimensions'
  | 'probe_failed'
  | 'object_not_found'
  | 'size_mismatch'
  | 'magic_mismatch';

export class MediaVerificationError extends Error {
  constructor(readonly reasonCode: MediaVerificationFailureReason) {
    super(reasonCode);
  }
}

export class MediaInfrastructureError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
  }
}

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number }>;
};
type ProbeOutput = {
  streams?: ProbeStream[];
  format?: { duration?: string; format_name?: string };
};

export type MediaVerificationFacts = {
  verifiedMimeType: LearningMediaMimeType;
  actualSizeBytes: bigint;
  checksumSha256: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  verifiedAt: Date;
  verificationVersion: string;
};

@Injectable()
export class MediaVerifierService {
  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  verify(input: {
    bucket: string;
    objectKey: string;
    expectedMimeType: string;
    expectedSizeBytes: bigint;
  }): Promise<MediaVerificationFacts> {
    return this.verifyObject({
      sourceBucket: input.bucket,
      sourceObjectKey: input.objectKey,
      expectedMimeType: input.expectedMimeType,
      expectedSizeBytes: input.expectedSizeBytes,
    });
  }

  verifyExistingFinal(input: {
    finalBucket: string;
    finalObjectKey: string;
    expectedMimeType: string;
    expectedSizeBytes: bigint;
  }): Promise<MediaVerificationFacts> {
    return this.verifyObject({
      sourceBucket: input.finalBucket,
      sourceObjectKey: input.finalObjectKey,
      expectedMimeType: input.expectedMimeType,
      expectedSizeBytes: input.expectedSizeBytes,
    });
  }

  verifyAndStoreFinal(input: {
    stagingBucket: string;
    stagingObjectKey: string;
    finalBucket: string;
    finalObjectKey: string;
    expectedMimeType: string;
    expectedSizeBytes: bigint;
  }): Promise<MediaVerificationFacts> {
    return this.verifyObject({
      sourceBucket: input.stagingBucket,
      sourceObjectKey: input.stagingObjectKey,
      finalBucket: input.finalBucket,
      finalObjectKey: input.finalObjectKey,
      expectedMimeType: input.expectedMimeType,
      expectedSizeBytes: input.expectedSizeBytes,
    });
  }

  private async verifyObject(input: {
    sourceBucket: string;
    sourceObjectKey: string;
    finalBucket?: string;
    finalObjectKey?: string;
    expectedMimeType: string;
    expectedSizeBytes: bigint;
  }): Promise<MediaVerificationFacts> {
    const expectedMimeType = input.expectedMimeType as LearningMediaMimeType;
    const maximumBytes = learningMediaMaximumSizeBytes(expectedMimeType);
    let stat: Awaited<ReturnType<StorageService['statObject']>>;
    try {
      stat = await this.storage.statObject({
        bucket: input.sourceBucket,
        objectKey: input.sourceObjectKey,
      });
    } catch (error) {
      if (isObjectStorageNotFoundError(error)) {
        throw new MediaVerificationError('object_not_found');
      }
      throw new MediaInfrastructureError('storage_read_failed');
    }
    const statSizeBytes = BigInt(stat.size);
    if (
      statSizeBytes !== input.expectedSizeBytes ||
      statSizeBytes > maximumBytes
    ) {
      throw new MediaVerificationError('size_mismatch');
    }

    const directory = await mkdtemp(join(tmpdir(), 'moazez-media-'));
    const localPath = join(directory, 'verified.media');
    try {
      const streamed = await this.downloadAndHash({
        bucket: input.sourceBucket,
        objectKey: input.sourceObjectKey,
        localPath,
        maximumBytes,
      });
      if (
        streamed.actualSizeBytes !== input.expectedSizeBytes ||
        streamed.actualSizeBytes !== statSizeBytes
      ) {
        throw new MediaVerificationError('size_mismatch');
      }
      const mediaFacts = await this.inspectLocalArtifact(
        localPath,
        expectedMimeType,
      );
      if (input.finalBucket && input.finalObjectKey) {
        try {
          await this.storage.saveObject({
            bucket: input.finalBucket,
            objectKey: input.finalObjectKey,
            body: createReadStream(localPath),
            sizeBytes: Number(streamed.actualSizeBytes),
            contentType: expectedMimeType,
          });
          const finalStat = await this.storage.statObject({
            bucket: input.finalBucket,
            objectKey: input.finalObjectKey,
          });
          if (BigInt(finalStat.size) !== streamed.actualSizeBytes) {
            throw new MediaInfrastructureError('final_object_size_mismatch');
          }
        } catch (error) {
          if (error instanceof MediaInfrastructureError) throw error;
          throw new MediaInfrastructureError('final_object_write_failed');
        }
      }
      return {
        verifiedMimeType: expectedMimeType,
        actualSizeBytes: streamed.actualSizeBytes,
        checksumSha256: streamed.checksumSha256,
        ...mediaFacts,
        verifiedAt: new Date(),
        verificationVersion: LEARNING_MEDIA_VERIFICATION_VERSION,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async downloadAndHash(input: {
    bucket: string;
    objectKey: string;
    localPath: string;
    maximumBytes: bigint;
  }): Promise<{ actualSizeBytes: bigint; checksumSha256: string }> {
    const hash = createHash('sha256');
    let received = 0n;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += BigInt(chunk.byteLength);
        if (received > input.maximumBytes) {
          callback(new MediaVerificationError('size_mismatch'));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    try {
      const stream = await this.storage.getObject({
        bucket: input.bucket,
        objectKey: input.objectKey,
      });
      await pipeline(
        stream,
        limiter,
        createWriteStream(input.localPath, { flags: 'wx' }),
      );
    } catch (error) {
      if (error instanceof MediaVerificationError) throw error;
      if (isObjectStorageNotFoundError(error)) {
        throw new MediaVerificationError('object_not_found');
      }
      throw new MediaInfrastructureError('storage_read_failed');
    }
    return { actualSizeBytes: received, checksumSha256: hash.digest('hex') };
  }

  private async inspectLocalArtifact(
    localPath: string,
    mimeType: LearningMediaMimeType,
  ): Promise<{
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
  }> {
    const head = await readFileHead(localPath, 4_096);
    assertContainerSignature(head, mimeType);
    if (mimeType === 'text/plain') {
      await validateTextFile(localPath);
      return { durationSeconds: null, width: null, height: null };
    }
    if (mimeType === 'application/pdf') {
      return { durationSeconds: null, width: null, height: null };
    }
    if (mimeType === 'image/png') {
      const width = head.readUInt32BE(16);
      const height = head.readUInt32BE(20);
      validateImageDimensions(width, height);
      return { durationSeconds: null, width, height };
    }
    if (mimeType === 'image/jpeg') {
      const { width, height } = await readJpegDimensions(localPath);
      validateImageDimensions(width, height);
      return { durationSeconds: null, width, height };
    }
    return validateProbe(await this.probe(localPath), mimeType);
  }

  private async probe(localPath: string): Promise<ProbeOutput> {
    const executable = this.config.getOrThrow<string>('FFPROBE_PATH');
    if (executable !== MEDIA_RUNTIME_CONTRACT.executablePath) {
      throw new MediaInfrastructureError('version_mismatch');
    }
    const result = await runtime.runBounded(
      executable,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        MEDIA_RUNTIME_CONTRACT.protocolWhitelist,
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        localPath,
      ],
      {
        timeoutMs: this.config.getOrThrow<number>('FFPROBE_TIMEOUT_MS'),
        maximumStdoutBytes: MEDIA_RUNTIME_CONTRACT.maximumStdoutBytes,
        maximumStderrBytes: MEDIA_RUNTIME_CONTRACT.maximumStderrBytes,
        maximumTotalOutputBytes: this.config.getOrThrow<number>(
          'FFPROBE_MAX_OUTPUT_BYTES',
        ),
      },
    );
    if (!result.ok) {
      if (result.reason === 'binary_unavailable') {
        throw new MediaInfrastructureError('binary_unavailable');
      }
      const reason = isProbeReason(result.reason)
        ? result.reason
        : 'probe_failed';
      throw new MediaVerificationError(reason);
    }
    try {
      return JSON.parse(result.stdout?.toString('utf8') ?? '') as ProbeOutput;
    } catch {
      throw new MediaVerificationError('invalid_probe_output');
    }
  }
}

async function readFileHead(
  path: string,
  maximumBytes: number,
): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const head = Buffer.alloc(maximumBytes);
    const { bytesRead } = await handle.read(head, 0, maximumBytes, 0);
    return head.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function detectContainerMime(head: Buffer): string | null {
  if (head.subarray(0, 5).toString('ascii') === '%PDF-')
    return 'application/pdf';
  if (
    head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return 'image/png';
  }
  if (
    head.length >= 3 &&
    head[0] === 0xff &&
    head[1] === 0xd8 &&
    head[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (readAcceptedIsoBmffBrands(head) !== null) {
    return 'video/mp4';
  }
  if (readEbmlDocType(head) === 'webm') {
    return 'video/webm';
  }
  if (
    head.subarray(0, 3).toString('ascii') === 'ID3' ||
    (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0)
  ) {
    return 'audio/mpeg';
  }
  return null;
}

function assertContainerSignature(
  head: Buffer,
  mimeType: LearningMediaMimeType,
): void {
  if (mimeType === 'text/plain') {
    if (
      !(
        head.length > 0 &&
        !head.includes(0) &&
        detectContainerMime(head) === null
      )
    ) {
      throw new MediaVerificationError('magic_mismatch');
    }
    return;
  }
  if (mimeType === 'audio/mp4' || mimeType === 'video/mp4') {
    if (!isIsoBmffFamily(head)) {
      throw new MediaVerificationError('magic_mismatch');
    }
    if (readAcceptedIsoBmffBrands(head) === null) {
      throw new MediaVerificationError('unsupported_container');
    }
    return;
  }
  if (mimeType === 'audio/webm' || mimeType === 'video/webm') {
    if (!isEbmlFamily(head)) {
      throw new MediaVerificationError('magic_mismatch');
    }
    if (readEbmlDocType(head) !== 'webm') {
      throw new MediaVerificationError('unsupported_container');
    }
    return;
  }
  const detected = detectContainerMime(head);
  if (detected !== mimeType) {
    throw new MediaVerificationError('magic_mismatch');
  }
}

export function validateProbe(probe: ProbeOutput, mimeType: string) {
  const streams = probe.streams ?? [];
  const videos = streams.filter((stream) => stream.codec_type === 'video');
  const audios = streams.filter((stream) => stream.codec_type === 'audio');
  const durationSeconds = Number(probe.format?.duration);
  const formatNames = new Set(
    (probe.format?.format_name ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
  if (
    ((mimeType === 'video/mp4' || mimeType === 'audio/mp4') &&
      !formatNames.has('mp4')) ||
    ((mimeType === 'video/webm' || mimeType === 'audio/webm') &&
      !formatNames.has('webm'))
  ) {
    throw new MediaVerificationError('unsupported_container');
  }
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > LEARNING_MEDIA_MAX_DURATION_SECONDS
  ) {
    throw new MediaVerificationError('invalid_duration');
  }
  if (mimeType.startsWith('audio/')) {
    if (videos.length !== 0 || audios.length !== 1) {
      throw new MediaVerificationError('invalid_stream_layout');
    }
    const allowedAudio =
      mimeType === 'audio/mpeg'
        ? ['mp3']
        : mimeType === 'audio/mp4'
          ? ['aac']
          : ['opus', 'vorbis'];
    if (!audios[0].codec_name || !allowedAudio.includes(audios[0].codec_name)) {
      throw new MediaVerificationError('unsupported_audio_codec');
    }
    return { durationSeconds, width: null, height: null };
  }
  if (videos.length !== 1 || audios.length > 1) {
    throw new MediaVerificationError('invalid_stream_layout');
  }
  const video = videos[0];
  const allowedVideo = mimeType === 'video/mp4' ? ['h264'] : ['vp8', 'vp9'];
  const allowedAudio = mimeType === 'video/mp4' ? ['aac'] : ['opus', 'vorbis'];
  if (!video.codec_name || !allowedVideo.includes(video.codec_name)) {
    throw new MediaVerificationError('unsupported_video_codec');
  }
  if (audios[0]?.codec_name && !allowedAudio.includes(audios[0].codec_name)) {
    throw new MediaVerificationError('unsupported_audio_codec');
  }
  const rawWidth = video.width ?? 0;
  const rawHeight = video.height ?? 0;
  const rotation =
    video.side_data_list?.find((data) => Number.isFinite(data.rotation))
      ?.rotation ?? Number(video.tags?.rotate ?? 0);
  const swapsDimensions = Math.abs(rotation) % 180 === 90;
  const width = swapsDimensions ? rawHeight : rawWidth;
  const height = swapsDimensions ? rawWidth : rawHeight;
  if (
    width <= 0 ||
    height <= 0 ||
    width > LEARNING_MEDIA_MAX_WIDTH ||
    height > LEARNING_MEDIA_MAX_HEIGHT
  ) {
    throw new MediaVerificationError('invalid_dimensions');
  }
  return { durationSeconds, width, height };
}

async function validateTextFile(localPath: string): Promise<void> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const stream = createReadStream(localPath);
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (buffer.includes(0))
        throw new MediaVerificationError('magic_mismatch');
      const text = decoder.decode(buffer, { stream: true });
      if (/[^\t\n\r\x20-\x7e\u00a0-\uffff]/u.test(text)) {
        throw new MediaVerificationError('magic_mismatch');
      }
    }
    decoder.decode();
  } catch (error) {
    if (error instanceof MediaVerificationError) throw error;
    throw new MediaVerificationError('magic_mismatch');
  }
}

async function readJpegDimensions(
  localPath: string,
): Promise<{ width: number; height: number }> {
  const handle = await open(localPath, 'r');
  try {
    const buffer = Buffer.alloc(65_536);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    let offset = 2;
    while (offset + 9 < bytesRead) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > bytesRead) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += length + 2;
    }
  } finally {
    await handle.close();
  }
  throw new MediaVerificationError('invalid_dimensions');
}

function validateImageDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0 || width > 20_000 || height > 20_000) {
    throw new MediaVerificationError('invalid_dimensions');
  }
}

function isProbeReason(
  reason: string | null,
): reason is MediaVerificationFailureReason {
  return [
    'timeout',
    'output_limit_exceeded',
    'network_protocol_forbidden',
    'invalid_probe_output',
    'probe_failed',
  ].includes(reason ?? '');
}

const ACCEPTED_MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'mp41',
  'mp42',
  'avc1',
  'M4A ',
  'M4V ',
]);

function isIsoBmffFamily(head: Buffer): boolean {
  return head.length >= 8 && head.subarray(4, 8).toString('ascii') === 'ftyp';
}

function readAcceptedIsoBmffBrands(head: Buffer): string[] | null {
  if (!isIsoBmffFamily(head) || head.length < 16) return null;
  const boxSize = head.readUInt32BE(0);
  if (boxSize < 16 || boxSize > head.length || boxSize % 4 !== 0) return null;
  const majorBrand = head.subarray(8, 12).toString('ascii');
  if (!ACCEPTED_MP4_BRANDS.has(majorBrand)) return null;
  const compatibleBrands: string[] = [];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    compatibleBrands.push(head.subarray(offset, offset + 4).toString('ascii'));
  }
  if (compatibleBrands.includes('qt  ')) return null;
  if (
    compatibleBrands.length > 0 &&
    !compatibleBrands.some((brand) => ACCEPTED_MP4_BRANDS.has(brand))
  ) {
    return null;
  }
  return [majorBrand, ...compatibleBrands];
}

function isEbmlFamily(head: Buffer): boolean {
  return head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
}

function readEbmlDocType(head: Buffer): string | null {
  if (!isEbmlFamily(head)) return null;
  const rootSize = readEbmlVint(head, 4, false);
  if (!rootSize) return null;
  let offset = 4 + rootSize.length;
  const headerEnd = Math.min(head.length, offset + rootSize.value);
  while (offset < headerEnd) {
    const id = readEbmlVint(head, offset, true);
    if (!id) return null;
    offset += id.length;
    const size = readEbmlVint(head, offset, false);
    if (!size) return null;
    offset += size.length;
    const valueEnd = offset + size.value;
    if (valueEnd > headerEnd) return null;
    if (id.value === 0x4282) {
      return head.subarray(offset, valueEnd).toString('ascii').toLowerCase();
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
