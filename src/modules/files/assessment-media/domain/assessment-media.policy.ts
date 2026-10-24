import type { SchoolAssessmentMediaPolicy } from '@prisma/client';
import {
  AssessmentMediaException,
  type AssessmentMediaOwner,
} from './assessment-media.contract';

export const ASSESSMENT_MEDIA_CAPS = Object.freeze({
  nonVideoBytes: 10_485_760n,
  videoBytes: 209_715_200n,
  resourceBytes: 1_677_721_600n,
  schoolBytes: 1_073_741_824n,
  filesPerResource: 8,
  concurrentUploads: 2,
  uploadsPerHour: 30,
  durationSeconds: 3600,
  width: 4096,
  height: 4096,
});
export const ASSESSMENT_MEDIA_MIMES = Object.freeze([
  'text/plain',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'video/mp4',
  'video/webm',
]);
const bounded = (value: number | undefined, fallback: number, cap: number) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, cap)
    : fallback;
const boundedBytes = (
  value: bigint | undefined,
  fallback: bigint,
  cap: bigint,
) =>
  value !== undefined && value > 0n ? (value < cap ? value : cap) : fallback;

export function effectiveAssessmentMediaPolicy(
  row: SchoolAssessmentMediaPolicy | null,
) {
  const caps = ASSESSMENT_MEDIA_CAPS;
  return Object.freeze({
    uploadsEnabled: row?.uploadsEnabled === true,
    teacherUploadsEnabled: row?.teacherUploadsEnabled === true,
    studentUploadsEnabled: row?.studentUploadsEnabled === true,
    allowedMimeTypes: Object.freeze(
      (row?.allowedMimeTypes ?? []).filter((mime) =>
        ASSESSMENT_MEDIA_MIMES.includes(mime),
      ),
    ),
    maximumFileSizeBytes: boundedBytes(
      row?.maximumFileSizeBytes,
      caps.nonVideoBytes,
      caps.videoBytes,
    ),
    maximumFilesPerResource: bounded(
      row?.maximumFilesPerResource,
      caps.filesPerResource,
      caps.filesPerResource,
    ),
    maximumResourceBytes: boundedBytes(
      row?.maximumResourceBytes,
      83_886_080n,
      caps.resourceBytes,
    ),
    maximumSchoolBytes: boundedBytes(
      row?.maximumSchoolBytes,
      caps.schoolBytes,
      caps.schoolBytes,
    ),
    maximumConcurrentUploads: bounded(
      row?.maximumConcurrentUploads,
      caps.concurrentUploads,
      caps.concurrentUploads,
    ),
    maximumUploadsPerHour: bounded(
      row?.maximumUploadsPerHour,
      caps.uploadsPerHour,
      caps.uploadsPerHour,
    ),
    maximumDurationSeconds: bounded(
      row?.maximumDurationSeconds,
      caps.durationSeconds,
      caps.durationSeconds,
    ),
    maximumWidth: bounded(row?.maximumWidth, 1920, caps.width),
    maximumHeight: bounded(row?.maximumHeight, 1080, caps.height),
    allowInlinePreview: row?.allowInlinePreview === true,
    allowDownload: row?.allowDownload === true,
    allowGuardianVisibility: row?.allowGuardianVisibility === true,
  });
}
export type EffectiveAssessmentMediaPolicy = ReturnType<
  typeof effectiveAssessmentMediaPolicy
>;

export function assertAssessmentUploadPolicy(
  policy: EffectiveAssessmentMediaPolicy,
  owner: AssessmentMediaOwner,
  mime: string,
  bytes: bigint,
): void {
  const maximum = mime.startsWith('video/')
    ? ASSESSMENT_MEDIA_CAPS.videoBytes
    : ASSESSMENT_MEDIA_CAPS.nonVideoBytes;
  if (
    !policy.uploadsEnabled ||
    !policy.allowedMimeTypes.includes(mime) ||
    (owner.studentPurpose
      ? !policy.studentUploadsEnabled
      : !policy.teacherUploadsEnabled) ||
    bytes <= 0n ||
    bytes > policy.maximumFileSizeBytes ||
    bytes > maximum
  )
    throw new AssessmentMediaException('policy_denied');
}
