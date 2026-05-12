import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileVisibility } from '@prisma/client';
import { MinioAdapter } from './minio.adapter';

const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60;

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
    downloadFileName?: string | null;
  }): Promise<string> {
    const bucket =
      input.bucket ?? this.resolveBucket(input.visibility ?? FileVisibility.PRIVATE);

    return this.minioAdapter.createPresignedGetUrl({
      bucket,
      objectKey: input.objectKey,
      expiresInSeconds:
        input.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS,
      responseHeaders: this.buildResponseHeaders(input.downloadFileName),
    });
  }

  resolveBucket(visibility: FileVisibility): string {
    return visibility === FileVisibility.PUBLIC
      ? this.configService.getOrThrow<string>('STORAGE_PUBLIC_BUCKET')
      : this.configService.getOrThrow<string>('STORAGE_BUCKET');
  }

  private buildResponseHeaders(
    downloadFileName?: string | null,
  ): Record<string, string> | undefined {
    if (!downloadFileName) {
      return undefined;
    }

    const sanitized = downloadFileName.replace(/["\r\n]/g, '').trim();
    if (sanitized.length === 0) {
      return undefined;
    }

    return {
      'response-content-disposition': `attachment; filename="${sanitized}"`,
    };
  }
}
