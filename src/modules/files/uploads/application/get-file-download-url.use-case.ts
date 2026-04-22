import { Injectable } from '@nestjs/common';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { requireFilesScope } from '../files-scope';
import { FilesNotFoundException } from '../domain/file-upload.exceptions';
import { FilesRepository } from '../infrastructure/files.repository';

@Injectable()
export class GetFileDownloadUrlUseCase {
  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly storageService: StorageService,
  ) {}

  async execute(fileId: string): Promise<string> {
    requireFilesScope();

    const file = await this.filesRepository.findScopedFileById(fileId);
    if (!file) {
      throw new FilesNotFoundException({ fileId });
    }

    return this.storageService.createDownloadUrl({
      bucket: file.bucket,
      objectKey: file.objectKey,
      expiresInSeconds: 5 * 60,
      downloadFileName: file.originalName,
    });
  }
}
