import type { Storage } from '@google-cloud/storage';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import {
  GcsAdapter,
  GCS_RESUMABLE_SESSION_MAX_LIFETIME_MS,
} from '../../src/infrastructure/storage/gcs.adapter';

type ObjectGeneration = {
  bytes: Buffer;
  mime: string;
  generation: string;
};

type Initiation = {
  preconditionOpts: { ifGenerationMatch: number };
  metadata: { contentLength: number; contentType: string };
};

/** Real adapter over a disposable, stateful SDK double. No network or ADC. */
export class AssessmentGcsResumableFixture {
  private readonly objects = new Map<string, ObjectGeneration>();
  private readonly sessions = new Map<
    string,
    { key: string; initiation: Initiation; expires: number }
  >();
  private sequence = 0;
  readonly adapter: GcsAdapter;

  constructor() {
    const client = {
      bucket: (bucket: string) => ({
        file: (key: string, options?: { generation?: string }) =>
          this.file(`${bucket}/${key}`, options?.generation),
      }),
    } as unknown as Storage;
    this.adapter = new GcsAdapter(
      new ConfigService({ GCP_PROJECT_ID: 'assessment-test-double' }),
      {
        createRuntimeClient: () => client,
        createReadinessClient: () => client,
        createSigningClient: () => {
          throw new Error('Unexpected attempt to sign a download');
        },
      },
    );
  }

  stage(url: string, body: Buffer, now = Date.now()): boolean {
    const session = this.sessions.get(url);
    if (!session || session.expires <= now) return false;
    expect(session.initiation.preconditionOpts).toEqual({
      ifGenerationMatch: 0,
    });
    if (
      session.initiation.metadata.contentLength !== body.length ||
      this.objects.has(session.key)
    )
      return false;
    this.put(session.key, body, session.initiation.metadata.contentType);
    return true;
  }

  bytes(bucket: string, key: string): Buffer | undefined {
    return this.objects.get(`${bucket}/${key}`)?.bytes;
  }

  get issuedCount(): number {
    return this.sessions.size;
  }

  private put(key: string, bytes: Buffer, mime: string) {
    this.objects.set(key, {
      bytes: Buffer.from(bytes),
      mime,
      generation: String(++this.sequence),
    });
  }

  private file(key: string, generation?: string) {
    const get = () => {
      const object = this.objects.get(key);
      if (!object || (generation && object.generation !== generation))
        throw Object.assign(new Error('Fixture object not found'), {
          code: 404,
        });
      return object;
    };
    return {
      createResumableUpload: (initiation: Initiation) => {
        const url = `https://storage.invalid/session/${randomUUID()}`;
        this.sessions.set(url, {
          key,
          initiation,
          expires: Date.now() + GCS_RESUMABLE_SESSION_MAX_LIFETIME_MS,
        });
        return Promise.resolve([url]);
      },
      getMetadata: () =>
        Promise.resolve().then(() => {
          const object = get();
          return [
            {
              size: String(object.bytes.length),
              contentType: object.mime,
              generation: object.generation,
              etag: `fixture-${object.generation}`,
            },
          ];
        }),
      createReadStream: (range: { start?: number; end?: number }) => {
        const source = function* () {
          const { bytes } = get();
          yield bytes.subarray(
            range.start ?? 0,
            range.end === undefined ? bytes.length : range.end + 1,
          );
        };
        return Readable.from(source());
      },
      createWriteStream: (input: { contentType: string }) => {
        const chunks: Buffer[] = [];
        return new Writable({
          write: (chunk: Buffer, _encoding, callback) => {
            chunks.push(chunk);
            callback();
          },
          final: (callback) => {
            this.put(key, Buffer.concat(chunks), input.contentType);
            callback();
          },
        });
      },
    };
  }
}
