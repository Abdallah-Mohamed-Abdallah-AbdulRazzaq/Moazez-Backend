import {
  ACADEMIC_CONTENT_PLATFORM_DEFAULT_MAX_FILE_SIZE_BYTES,
  ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES,
} from './academic-content-file.constants';

export interface AcademicContentEffectiveFilePolicy {
  attachmentsEnabled: boolean;
  maximumFileSizeBytes: bigint;
  documentsEnabled: boolean;
  imagesEnabled: boolean;
  videosEnabled: boolean;
  audioEnabled: boolean;
  archivesEnabled: boolean;
  otherFilesEnabled: boolean;
  allowStudentDownload: boolean;
  allowGuardianDownload: boolean;
  allowInlinePreview: boolean;
}

export function effectiveAcademicContentFilePolicy(
  row?: Partial<AcademicContentEffectiveFilePolicy> | null,
): AcademicContentEffectiveFilePolicy {
  const maximumFileSizeBytes =
    row?.maximumFileSizeBytes ??
    ACADEMIC_CONTENT_PLATFORM_DEFAULT_MAX_FILE_SIZE_BYTES;
  return {
    attachmentsEnabled: row?.attachmentsEnabled ?? true,
    maximumFileSizeBytes:
      maximumFileSizeBytes < ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES
        ? maximumFileSizeBytes
        : ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES,
    documentsEnabled: row?.documentsEnabled ?? true,
    imagesEnabled: row?.imagesEnabled ?? true,
    videosEnabled: row?.videosEnabled ?? true,
    audioEnabled: row?.audioEnabled ?? true,
    archivesEnabled: row?.archivesEnabled ?? false,
    otherFilesEnabled: row?.otherFilesEnabled ?? false,
    allowStudentDownload: row?.allowStudentDownload ?? true,
    allowGuardianDownload: row?.allowGuardianDownload ?? true,
    allowInlinePreview: row?.allowInlinePreview ?? true,
  };
}

export function sameAcademicContentFilePolicy(
  first: AcademicContentEffectiveFilePolicy,
  second: AcademicContentEffectiveFilePolicy,
): boolean {
  return (
    Object.keys(first) as (keyof AcademicContentEffectiveFilePolicy)[]
  ).every((key) => first[key] === second[key]);
}
