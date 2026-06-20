import { Injectable } from '@nestjs/common';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { FilesNotFoundException } from '../../../files/uploads/domain/file-upload.exceptions';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentFilesReadAdapter } from '../infrastructure/parent-files-read.adapter';

@Injectable()
export class GetParentChildFileDownloadUrlUseCase {
  constructor(
    private readonly parentAppAccessService: ParentAppAccessService,
    private readonly parentFilesReadAdapter: ParentFilesReadAdapter,
    private readonly storageService: StorageService,
  ) {}

  async execute(params: {
    studentId: string;
    fileId: string;
  }): Promise<string> {
    const child = await this.parentAppAccessService.assertParentOwnsStudent(
      params.studentId,
    );
    const file =
      await this.parentFilesReadAdapter.findTaskProofFileForDownload({
        child,
        fileId: params.fileId,
      });

    if (!file) {
      throw new FilesNotFoundException({ fileId: params.fileId });
    }

    return this.storageService.createDownloadUrl({
      bucket: file.bucket,
      objectKey: file.objectKey,
      expiresInSeconds: 5 * 60,
      downloadFileName: file.originalName,
    });
  }
}
