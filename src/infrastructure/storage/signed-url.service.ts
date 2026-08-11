import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileVisibility } from '@prisma/client';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
  type ObjectStorageSignedCapability,
  type ObjectStorageSignedGetOverrides,
} from './object-storage.port';

const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60;

export type SignedGetDisposition = 'attachment' | 'inline' | 'none';

@Injectable()
export class SignedUrlService {
  constructor(
    @Inject(OBJECT_STORAGE_PORT)
    private readonly objectStorage: ObjectStoragePort,
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
  }): Promise<ObjectStorageSignedCapability> {
    const bucket =
      input.bucket ??
      this.resolveBucket(input.visibility ?? FileVisibility.PRIVATE);

    return this.objectStorage.createSignedGetUrl({
      bucket,
      objectKey: input.objectKey,
      expiresInSeconds:
        input.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS,
      overrides: this.buildOverrides({
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

  private buildOverrides(input: {
    disposition: SignedGetDisposition;
    contentType?: string;
    downloadFileName?: string | null;
  }): ObjectStorageSignedGetOverrides | undefined {
    const overrides: ObjectStorageSignedGetOverrides = {};

    if (input.contentType) {
      overrides.contentType = input.contentType;
    }

    if (input.disposition === 'inline') {
      overrides.contentDisposition = 'inline';
    }

    if (input.disposition === 'attachment') {
      overrides.contentDisposition = 'attachment';
      if (input.downloadFileName) {
        const sanitized = input.downloadFileName.replace(/["\r\n]/g, '').trim();
        if (sanitized.length > 0) {
          overrides.contentDisposition = `attachment; filename="${sanitized}"`;
        }
      }
    }

    return Object.keys(overrides).length === 0 ? undefined : overrides;
  }
}
