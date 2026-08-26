import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  FilesUploadMimeNotAllowedException,
  FilesUploadSizeExceededException,
} from '../../uploads/domain/file-upload.exceptions';
import type { UploadedMultipartFile } from '../../uploads/domain/uploaded-file';
import {
  FILES_IMPORT_MAX_SIZE_BYTES,
  isFilesImportMimeTypeAllowed,
} from './import-upload.constraints';

export function validateFilesImportUpload(
  file: UploadedMultipartFile | undefined,
): UploadedMultipartFile {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new ValidationDomainException(
      'A multipart file field named "file" is required',
      { field: 'file' },
    );
  }

  if (file.buffer.byteLength > FILES_IMPORT_MAX_SIZE_BYTES) {
    throw new FilesUploadSizeExceededException({
      maxSizeBytes: FILES_IMPORT_MAX_SIZE_BYTES,
      actualSizeBytes: file.buffer.byteLength,
    });
  }

  if (!isFilesImportMimeTypeAllowed(file.mimetype)) {
    throw new FilesUploadMimeNotAllowedException({
      mimeType: file.mimetype,
    });
  }

  return file;
}
