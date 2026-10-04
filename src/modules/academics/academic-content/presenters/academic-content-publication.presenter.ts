import type {
  AcademicContentAudiencePreviewResponseDto,
  AcademicContentPublicationHistoryResponseDto,
  AcademicContentPublicationReadinessResponseDto,
  AcademicContentPublicationResponseDto,
  AcademicContentPublicationRevisionStartResponseDto,
} from '../dto/academic-content-publication.dto';

type PublicationView = Omit<
  AcademicContentPublicationResponseDto,
  | 'publishAt'
  | 'visibleFrom'
  | 'visibleUntil'
  | 'publishedAt'
  | 'expiredAt'
  | 'cancelledAt'
  | 'createdAt'
> & {
  publishAt: Date;
  visibleFrom: Date;
  visibleUntil: Date | null;
  publishedAt: Date | null;
  expiredAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
};

export function presentAcademicContentPublication(
  input: PublicationView,
): AcademicContentPublicationResponseDto {
  return {
    publicationId: input.publicationId,
    revisionId: input.revisionId,
    status: input.status,
    sourceContentStatus: input.sourceContentStatus,
    publishAt: input.publishAt.toISOString(),
    visibleFrom: input.visibleFrom.toISOString(),
    visibleUntil: input.visibleUntil?.toISOString() ?? null,
    publishedAt: input.publishedAt?.toISOString() ?? null,
    expiredAt: input.expiredAt?.toISOString() ?? null,
    cancelledAt: input.cancelledAt?.toISOString() ?? null,
    studentRecipientCount: input.studentRecipientCount,
    guardianRecipientContextCount: input.guardianRecipientContextCount,
    createdByUserId: input.createdByUserId,
    createdAt: input.createdAt.toISOString(),
    cancellationReason: input.cancellationReason,
    supersedesPublicationId: input.supersedesPublicationId,
    changeSignificance: input.changeSignificance,
    notifyMinorUpdate: input.notifyMinorUpdate,
  };
}

export function presentAcademicContentPublicationRevisionStart(
  input: Omit<
    AcademicContentPublicationRevisionStartResponseDto,
    'cancelledAt'
  > & {
    cancelledAt: Date;
  },
): AcademicContentPublicationRevisionStartResponseDto {
  return {
    contentId: input.contentId,
    oldPublicationId: input.oldPublicationId,
    oldRevisionId: input.oldRevisionId,
    cancellationReason: input.cancellationReason,
    restoredContentStatus: input.restoredContentStatus,
    cancelledAt: input.cancelledAt.toISOString(),
  };
}

export function presentAcademicContentPublicationList(input: {
  items: PublicationView[];
  page: number;
  limit: number;
  total: number;
}): AcademicContentPublicationHistoryResponseDto {
  return {
    items: input.items.map(presentAcademicContentPublication),
    page: input.page,
    limit: input.limit,
    total: input.total,
  };
}

export function presentAcademicContentPublicationReadiness(
  input: AcademicContentPublicationReadinessResponseDto,
): AcademicContentPublicationReadinessResponseDto {
  return {
    canPublish: input.canPublish,
    canSchedule: input.canSchedule,
    blockingReasons: [...input.blockingReasons],
  };
}

export function presentAcademicContentAudiencePreview(
  input: Omit<AcademicContentAudiencePreviewResponseDto, 'asOf'> & {
    asOf: Date;
  },
): AcademicContentAudiencePreviewResponseDto {
  return {
    asOf: input.asOf.toISOString(),
    students: input.students,
    guardianContexts: input.guardianContexts,
    guardianUsersWithAccounts: input.guardianUsersWithAccounts,
    guardianNotificationOptOutContexts:
      input.guardianNotificationOptOutContexts,
  };
}
