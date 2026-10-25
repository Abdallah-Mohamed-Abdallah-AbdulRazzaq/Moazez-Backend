import type { AssessmentAssetCategory } from '@prisma/client';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { classifyPersistedUrl } from '../../../infrastructure/storage/provider-url.policy';

export type HomeworkAssetActor =
  | { surface: 'core' }
  | { surface: 'teacher'; classId: string }
  | { surface: 'student'; student: HomeworkAssetStudentContext };
export interface HomeworkAssetStudentContext {
  studentId: string;
  enrollmentId: string;
  classroomId: string;
  academicYearId: string;
  termId: string | null;
}
export interface HomeworkAssetResource {
  homeworkId: string;
  questionId: string;
  assetId?: string;
}

export function assetDisplayText(
  value: unknown,
  maximum: number,
): string | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    /[<>\p{Cf}\p{Cs}]/u.test(value) ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  )
    throw new ValidationDomainException('Asset display text is invalid');
  return value.trim() || null;
}

/** Intersection with ST-05's deliberately narrower PostgreSQL representation. */
export function homeworkAssetExternalUrl(
  value: unknown,
  classify: typeof classifyPersistedUrl = classifyPersistedUrl,
): string {
  if (typeof value !== 'string' || value.length > 2000)
    throw new ValidationDomainException('Asset external reference is invalid');
  const url = value.trim();
  const classified = classify(url);
  const representation =
    /^https:\/\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(\/[A-Za-z0-9._~/-]*)?$/u;
  if (
    classified.classification !== 'external_https' ||
    !representation.test(url)
  )
    throw new ValidationDomainException('Asset external reference is invalid');
  const parsed = new URL(url);
  if (
    parsed.hostname.length > 253 ||
    /(^|\.)(googleapis\.com|cloud\.google\.com|amazonaws\.com|amazonaws\.com\.cn)$/iu.test(
      parsed.hostname,
    ) ||
    /(^|\.)(minio|minio-[a-z0-9-]+|[a-z0-9-]+-minio)(\.|$)/iu.test(
      parsed.hostname,
    ) ||
    /\.(localhost|local|localdomain|internal|intranet|lan|home|arpa|test|example|invalid)$/iu.test(
      parsed.hostname,
    ) ||
    /\/api\/v1\/files\/[^/]+\/download(\/|$)/iu.test(parsed.pathname) ||
    (classified.normalizedValue !== url &&
      classified.normalizedValue !== url + '/')
  )
    throw new ValidationDomainException('Asset external reference is invalid');
  return classified.normalizedValue;
}

export function assetCategoryForMime(
  category: string,
): AssessmentAssetCategory {
  return category === 'IMAGE' ||
    category === 'AUDIO' ||
    category === 'VIDEO' ||
    category === 'DOCUMENT'
    ? category
    : 'OTHER';
}
