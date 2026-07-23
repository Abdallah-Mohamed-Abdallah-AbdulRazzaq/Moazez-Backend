import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileVisibility } from '@prisma/client';
import { MinioAdapter, type PresignedGetCapability } from './minio.adapter';

const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60;

export type SignedGetDisposition = 'attachment' | 'inline' | 'none';

@Injectable()
export class SignedUrlService {
  constructor(
    private readonly minioAdapter: MinioAdapter,
    private readonly configService: ConfigService,
  ) {}

  createDownloadUrl(input: {
    objectKey: string;
    bucket?: string;
    visibility?: FileVisibility;
    expiresInSeconds?: number;
    disposition?: SignedGetDisposition;
    contentType?: string;
    downloadFileName?: string | null;
  }): Promise<PresignedGetCapability> {
    const bucket =
      input.bucket ??
      this.resolveBucket(input.visibility ?? FileVisibility.PRIVATE);

    return this.minioAdapter.createPresignedGetUrl({
      bucket,
      objectKey: input.objectKey,
      expiresInSeconds:
        input.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS,
      responseHeaders: this.buildResponseHeaders({
        disposition: input.disposition ?? 'attachment',
        contentType: input.contentType,
        downloadFileName: input.downloadFileName,
      }),
    });
  }

  resolveBucket(visibility: FileVisibility): string {
    return visibility === FileVisibility.PUBLIC
      ? this.configService.getOrThrow<string>('STORAGE_PUBLIC_BUCKET')
      : this.configService.getOrThrow<string>('STORAGE_BUCKET');
  }

  private buildResponseHeaders(input: {
    disposition: SignedGetDisposition;
    contentType?: string;
    downloadFileName?: string | null;
  }): Record<string, string> | undefined {
    const headers: Record<string, string> = {};

    if (input.contentType) {
      headers['response-content-type'] = input.contentType;
    }

    if (input.disposition === 'inline') {
      headers['response-content-disposition'] = 'inline';
    }

    if (input.disposition === 'attachment') {
      headers['response-content-disposition'] = 'attachment';
      if (input.downloadFileName) {
        const sanitized = input.downloadFileName.replace(/["\r\n]/g, '').trim();
        if (sanitized.length > 0) {
          headers['response-content-disposition'] =
            `attachment; filename="${sanitized}"`;
        }
      }
    }

    return Object.keys(headers).length === 0 ? undefined : headers;
  }
}
