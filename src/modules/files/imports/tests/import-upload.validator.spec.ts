import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  FilesUploadMimeNotAllowedException,
  FilesUploadSizeExceededException,
} from '../../uploads/domain/file-upload.exceptions';
import { FILES_IMPORT_MAX_SIZE_BYTES } from '../domain/import-upload.constraints';
import { validateFilesImportUpload } from '../domain/import-upload.validator';

describe('validateFilesImportUpload', () => {
  it('requires a buffered multipart field named file', () => {
    expect(() => validateFilesImportUpload(undefined)).toThrow(
      ValidationDomainException,
    );
  });

  it('enforces the canonical import maximum size', () => {
    expect(() =>
      validateFilesImportUpload({
        originalname: 'oversized.csv',
        mimetype: 'text/csv',
        size: FILES_IMPORT_MAX_SIZE_BYTES + 1,
        buffer: Buffer.alloc(FILES_IMPORT_MAX_SIZE_BYTES + 1),
      }),
    ).toThrow(FilesUploadSizeExceededException);
  });

  it('enforces the canonical import MIME allowlist', () => {
    expect(() =>
      validateFilesImportUpload({
        originalname: 'students.json',
        mimetype: 'application/json',
        size: 2,
        buffer: Buffer.from('{}'),
      }),
    ).toThrow(FilesUploadMimeNotAllowedException);
  });

  it('returns the original allowed upload without inspecting CSV contents', () => {
    const file = {
      originalname: 'students.csv',
      mimetype: 'text/csv',
      size: 9,
      buffer: Buffer.from('arbitrary'),
    };

    expect(validateFilesImportUpload(file)).toBe(file);
  });
});
