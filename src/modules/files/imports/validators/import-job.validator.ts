import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  FILES_IMPORT_ALLOWED_TYPES,
  FilesImportType,
} from '../domain/import-upload.constraints';

const FILES_IMPORT_ALLOWED_TYPE_SET = new Set<string>(FILES_IMPORT_ALLOWED_TYPES);

export function normalizeImportJobType(type: string): FilesImportType {
  const normalized = type.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new ValidationDomainException('Import type is required', {
      field: 'type',
    });
  }

  if (!FILES_IMPORT_ALLOWED_TYPE_SET.has(normalized)) {
    throw new ValidationDomainException('Import type is not allowed', {
      field: 'type',
      allowedValues: FILES_IMPORT_ALLOWED_TYPES,
    });
  }

  return normalized as FilesImportType;
}
