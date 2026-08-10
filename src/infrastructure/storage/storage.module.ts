import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GcsAdapter } from './gcs.adapter';
import { MinioAdapter } from './minio.adapter';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
} from './object-storage.port';
import { SignedUrlService } from './signed-url.service';
import { StorageService } from './storage.service';

export function createObjectStoragePort(
  configService: ConfigService,
): ObjectStoragePort {
  const provider = configService.getOrThrow<string>('STORAGE_PROVIDER');
  if (provider === 'gcs') return new GcsAdapter(configService);
  if (provider === 'minio' || provider === 's3') {
    return new MinioAdapter(configService);
  }
  throw new Error('storage_provider_unsupported');
}

@Module({
  providers: [
    {
      provide: OBJECT_STORAGE_PORT,
      inject: [ConfigService],
      useFactory: createObjectStoragePort,
    },
    SignedUrlService,
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
