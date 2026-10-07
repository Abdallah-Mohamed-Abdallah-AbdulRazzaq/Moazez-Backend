import {
  AcademicContentAudienceType,
  AcademicContentType,
  AcademicOnlineSessionPlatform,
  Prisma,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { normalizeAcademicContentLibraryQuery } from './academic-content-library-normalization.policy';
import { normalizeAcademicContentTagValue } from './academic-content-links-tags.policy';
import {
  optionalId,
  optionalText,
} from './academic-content-type-detail.policy';

export const STUDENT_ACADEMIC_CONTENT_TYPES = [
  AcademicContentType.WEEKLY_PLAN,
  AcademicContentType.SUBJECT_RESOURCE,
  AcademicContentType.ONLINE_SESSION,
  AcademicContentType.GENERAL_RESOURCE,
] as const;
export type StudentAcademicContentType =
  (typeof STUDENT_ACADEMIC_CONTENT_TYPES)[number];

export type AcademicContentRecipientQuery = {
  type?: StudentAcademicContentType;
  subjectId?: string;
  search?: string;
  tag?: string;
  weeklyDateFrom?: string;
  weeklyDateTo?: string;
  sessionStartAtFrom?: string;
  sessionStartAtTo?: string;
  sessionPlatform?: AcademicOnlineSessionPlatform;
  page?: number;
  limit?: number;
};

export function normalizeAcademicContentRecipientQuery(
  query: AcademicContentRecipientQuery = {},
) {
  if (
    query.type !== undefined &&
    !STUDENT_ACADEMIC_CONTENT_TYPES.includes(query.type)
  )
    throw new ValidationDomainException(
      'Invalid Student Academic Content type',
    );
  if (
    query.sessionPlatform !== undefined &&
    !Object.values(AcademicOnlineSessionPlatform).includes(
      query.sessionPlatform,
    )
  )
    throw new ValidationDomainException('Invalid session platform');
  const ranges = normalizeAcademicContentLibraryQuery({
    weeklyDateFrom: query.weeklyDateFrom,
    weeklyDateTo: query.weeklyDateTo,
    sessionStartAtFrom: query.sessionStartAtFrom,
    sessionStartAtTo: query.sessionStartAtTo,
    page: query.page,
    limit: query.limit ?? 20,
  });
  return {
    type: query.type,
    subjectId: optionalId(query.subjectId, 'subjectId') ?? undefined,
    search: optionalText(query.search, 'search', 120) ?? undefined,
    normalizedTag:
      query.tag === undefined
        ? undefined
        : normalizeAcademicContentTagValue(query.tag).normalizedValue,
    weeklyDateFrom: ranges.weeklyDateFrom,
    weeklyDateTo: ranges.weeklyDateTo,
    sessionStartAtFrom: ranges.sessionStartAtFrom,
    sessionStartAtTo: ranges.sessionStartAtTo,
    sessionPlatform: query.sessionPlatform,
    page: ranges.page,
    limit: ranges.limit,
  };
}

export type AcademicContentRecipientFeedQuery = ReturnType<
  typeof normalizeAcademicContentRecipientQuery
>;
export type AcademicContentRecipientCard = {
  contentId: string;
  publicationId: string;
  revisionId: string;
  type: StudentAcademicContentType;
  audience: AcademicContentAudienceType;
  title: string;
  description: string | null;
  publishedAt: Date;
  visibleFrom: Date;
  visibleUntil: Date | null;
  summary: Prisma.JsonValue | null;
};
export type AcademicContentRecipientDetail = AcademicContentRecipientCard & {
  typeSpecificSnapshot: Prisma.JsonValue | null;
  assets: {
    fileId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: string;
    sortOrder: number;
  }[];
  links: { label: string; url: string; sortOrder: number }[];
  tags: { displayValue: string; sortOrder: number }[];
};
