// Compatibility exports; pure content primitives are shared, policy stays domain-owned.
export {
  FILE_CONTENT_TYPES as ACADEMIC_CONTENT_FILE_TYPES,
  resolveFileContentType as resolveAcademicContentFileType,
  verifyFileContentSignature as verifyAcademicContentSignature,
} from '../../../../files/shared/domain/file-content.registry';
export type {
  FileContentCategory as AcademicContentFileCategory,
  FileContentSignature as AcademicContentSignature,
  FileContentType as AcademicContentFileType,
} from '../../../../files/shared/domain/file-content.registry';
