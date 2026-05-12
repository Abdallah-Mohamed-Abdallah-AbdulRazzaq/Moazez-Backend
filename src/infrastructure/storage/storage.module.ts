import { Module } from '@nestjs/common';
import { MinioAdapter } from './minio.adapter';
import { SignedUrlService } from './signed-url.service';
import { StorageService } from './storage.service';

@Module({
  providers: [MinioAdapter, SignedUrlService, StorageService],
  exports: [MinioAdapter, SignedUrlService, StorageService],
})
export class StorageModule {}
