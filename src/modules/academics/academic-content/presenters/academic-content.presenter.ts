import {
  AcademicContentRecord,
  AcademicContentManagementDetail,
} from '../infrastructure/academic-content.repository';
import {
  AcademicContentDetailResponseDto,
  AcademicContentListResponseDto,
  AcademicContentResponseDto,
  AcademicContentTargetResponseDto,
  AcademicContentTargetsResponseDto,
  AcademicContentUploadIntentResponseDto,
  AcademicContentUploadCompleteResponseDto,
  AcademicContentUploadCancelResponseDto,
  AcademicContentFilePolicyResponseDto,
  AcademicContentLinkResponseDto,
  AcademicContentLinksResponseDto,
  AcademicContentTagResponseDto,
  AcademicContentTagsResponseDto,
} from '../dto/academic-content-response.dto';
import {
  AcademicContentRevisionDetailDto,
  AcademicContentRevisionListDto,
  AcademicContentRevisionSummaryDto,
} from '../dto/academic-content-revision-response.dto';
import { AcademicContentRevisionDetail } from '../infrastructure/academic-content-revision.repository';
import { AcademicContentEffectiveFilePolicy } from '../files/domain/academic-content-file-policy';
import { AcademicContentTargetInput } from '../domain/academic-content-target.policy';
import { AcademicContentType, FileUploadSessionStatus } from '@prisma/client';
import type {
  GuardianNoteCommand,
  NormalizedDetail,
  PreparationCommand,
  SubjectResourceCommand,
  WeeklyPlanCommand,
} from '../domain/academic-content-type-detail.policy';
import type { AcademicContentReadiness } from '../domain/academic-content-readiness.policy';
import type {
  AcademicContentGuardianNoteDetailResponseDto,
  AcademicContentOnlineSessionDetailResponseDto,
  AcademicContentPreparationDetailResponseDto,
  AcademicContentSubjectResourceDetailResponseDto,
  AcademicContentTypeDetailResponseDto,
  AcademicContentWeeklyPlanDetailResponseDto,
} from '../dto/academic-content-type-detail.dto';
import type { AcademicContentReadinessResponseDto } from '../dto/academic-content-response.dto';

export function presentAcademicContentPreparationDetail(
  state: Required<PreparationCommand>,
): AcademicContentPreparationDetailResponseDto {
  return {
    topic: state.topic ?? null,
    objectives: state.objectives,
    learningOutcomes: state.learningOutcomes,
    teachingStrategies: state.teachingStrategies,
    activities: state.activities,
    resourceNotes: state.resourceNotes ?? null,
    assessmentNotes: state.assessmentNotes ?? null,
    teacherNotes: state.teacherNotes ?? null,
    curriculumId: state.curriculumId ?? null,
    curriculumUnitId: state.curriculumUnitId ?? null,
    curriculumLessonId: state.curriculumLessonId ?? null,
    lessonPlanId: state.lessonPlanId ?? null,
    lessonPlanItemId: state.lessonPlanItemId ?? null,
    timetableEntryId: state.timetableEntryId ?? null,
  };
}

type WeeklyPlanView = Omit<
  Required<WeeklyPlanCommand>,
  'weekStartDate' | 'weekEndDate'
> & {
  weekStartDate: string | Date;
  weekEndDate: string | Date;
};
const dateOnly = (value: string | Date) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value;

export function presentAcademicContentWeeklyPlanDetail(
  state: WeeklyPlanView,
): AcademicContentWeeklyPlanDetailResponseDto {
  return {
    weekStartDate: dateOnly(state.weekStartDate),
    weekEndDate: dateOnly(state.weekEndDate),
    objectives: state.objectives,
    topics: state.topics,
    expectedHomework: state.expectedHomework ?? null,
    upcomingAssessments: state.upcomingAssessments ?? null,
    notes: state.notes ?? null,
    homeworkAssignmentIds: state.homeworkAssignmentIds,
    gradeAssessmentIds: state.gradeAssessmentIds,
  };
}

export function presentAcademicContentGuardianNoteDetail(
  state: GuardianNoteCommand,
): AcademicContentGuardianNoteDetailResponseDto {
  return {
    body: state.body,
    priority: state.priority,
    requiresAcknowledgement: state.requiresAcknowledgement,
  };
}

export function presentAcademicContentSubjectResourceDetail(
  state: Required<SubjectResourceCommand>,
): AcademicContentSubjectResourceDetailResponseDto {
  return {
    resourceCategory: state.resourceCategory,
    curriculumId: state.curriculumId ?? null,
    curriculumUnitId: state.curriculumUnitId ?? null,
    curriculumLessonId: state.curriculumLessonId ?? null,
  };
}

type OnlineSessionView = Omit<
  Extract<NormalizedDetail, { type: 'ONLINE_SESSION' }>['state'],
  'startAt' | 'endAt'
> & {
  startAt: string | Date;
  endAt: string | Date;
};
const instant = (value: string | Date) =>
  value instanceof Date ? value.toISOString() : value;

export function presentAcademicContentOnlineSessionDetail(
  state: OnlineSessionView,
): AcademicContentOnlineSessionDetailResponseDto {
  return {
    platform: state.platform,
    providerName: state.providerName ?? null,
    joinUrl: state.joinUrl,
    accessCode: state.accessCode ?? null,
    instructions: state.instructions ?? null,
    startAt: instant(state.startAt),
    endAt: instant(state.endAt),
    timezone: state.timezone,
    timetableEntryId: state.timetableEntryId ?? null,
  };
}

export function presentAcademicContentCurrentDetails(
  content: AcademicContentManagementDetail,
): AcademicContentTypeDetailResponseDto | null {
  switch (content.type) {
    case AcademicContentType.TEACHER_PREPARATION:
      return content.preparationDetail
        ? presentAcademicContentPreparationDetail(
            content.preparationDetail as unknown as Required<PreparationCommand>,
          )
        : null;
    case AcademicContentType.WEEKLY_PLAN: {
      const detail = content.weeklyPlanDetail;
      return detail
        ? presentAcademicContentWeeklyPlanDetail({
            ...detail,
            objectives: detail.objectives as string[],
            topics: detail.topics as string[],
            homeworkAssignmentIds: detail.homeworkReferences.map(
              (reference) => reference.homeworkAssignmentId,
            ),
            gradeAssessmentIds: detail.assessmentReferences.map(
              (reference) => reference.gradeAssessmentId,
            ),
          })
        : null;
    }
    case AcademicContentType.GUARDIAN_WEEKLY_NOTE:
      return content.guardianNoteDetail
        ? presentAcademicContentGuardianNoteDetail(content.guardianNoteDetail)
        : null;
    case AcademicContentType.SUBJECT_RESOURCE:
      return content.subjectResourceDetail
        ? presentAcademicContentSubjectResourceDetail(
            content.subjectResourceDetail,
          )
        : null;
    case AcademicContentType.ONLINE_SESSION:
      return content.onlineSessionDetail
        ? presentAcademicContentOnlineSessionDetail(content.onlineSessionDetail)
        : null;
    case AcademicContentType.GENERAL_RESOURCE:
      return null;
    default:
      return null;
  }
}

export function presentAcademicContentReadiness(
  readiness: AcademicContentReadiness,
): AcademicContentReadinessResponseDto {
  return {
    canAdvance: readiness.canAdvance,
    blockingReasons: readiness.blockingReasons.map(({ code, message }) => ({
      code,
      message,
    })),
  };
}

export function presentAcademicContent(
  content: AcademicContentRecord,
): AcademicContentResponseDto {
  return {
    id: content.id,
    academicYearId: content.academicYearId,
    termId: content.termId,
    type: content.type,
    audience: content.audience,
    title: content.title,
    description: content.description,
    status: content.status,
    archivedAt: content.archivedAt?.toISOString() ?? null,
    createdAt: content.createdAt.toISOString(),
    updatedAt: content.updatedAt.toISOString(),
  };
}

type PresentableTarget = AcademicContentTargetInput & { id: string };

export function presentAcademicContentTarget(
  target: PresentableTarget,
): AcademicContentTargetResponseDto {
  return {
    id: target.id,
    scopeType: target.scopeType,
    stageId: target.stageId ?? null,
    gradeId: target.gradeId ?? null,
    sectionId: target.sectionId ?? null,
    classroomId: target.classroomId ?? null,
    subjectId: target.subjectId ?? null,
    teacherSubjectAllocationId: target.teacherSubjectAllocationId ?? null,
  };
}

export function presentAcademicContentTargets(
  targets: readonly PresentableTarget[],
): AcademicContentTargetsResponseDto {
  return { targets: targets.map(presentAcademicContentTarget) };
}

type PresentableLink = {
  id: string;
  label: string;
  url: string;
  sortOrder: number;
};
type PresentableTag = { id: string; displayValue: string; sortOrder: number };

export function presentAcademicContentLink(
  link: PresentableLink,
): AcademicContentLinkResponseDto {
  return {
    id: link.id,
    label: link.label,
    url: link.url,
    sortOrder: link.sortOrder,
  };
}

export function presentAcademicContentTag(
  tag: PresentableTag,
): AcademicContentTagResponseDto {
  return { id: tag.id, value: tag.displayValue, sortOrder: tag.sortOrder };
}

export function presentAcademicContentLinks(
  links: readonly PresentableLink[],
): AcademicContentLinksResponseDto {
  return { links: links.map(presentAcademicContentLink) };
}

export function presentAcademicContentTags(
  tags: readonly PresentableTag[],
): AcademicContentTagsResponseDto {
  return { tags: tags.map(presentAcademicContentTag) };
}

export function presentAcademicContentDetail(
  content: AcademicContentManagementDetail,
): AcademicContentDetailResponseDto {
  return {
    ...presentAcademicContent(content),
    targets: content.targets.map(presentAcademicContentTarget),
    assets: content.assets.map((asset) => ({
      assetId: asset.id,
      fileId: asset.fileId,
      originalName: asset.file.originalName,
      mimeType: asset.file.mimeType,
      sizeBytes: asset.file.sizeBytes.toString(),
      sortOrder: asset.sortOrder,
      createdAt: asset.createdAt.toISOString(),
    })),
    links: content.links.map(presentAcademicContentLink),
    tags: content.tags.map(presentAcademicContentTag),
    details: presentAcademicContentCurrentDetails(content),
  };
}

export function presentAcademicContentRevisionSummary(input: {
  id: string;
  revisionNumber: number;
  snapshotContractVersion: number;
  sourceStatus: AcademicContentRevisionDetail['sourceStatus'];
  title: string;
  capturedAt: Date;
}): AcademicContentRevisionSummaryDto {
  return {
    id: input.id,
    revisionNumber: input.revisionNumber,
    snapshotContractVersion: input.snapshotContractVersion,
    sourceStatus: input.sourceStatus,
    title: input.title,
    capturedAt: input.capturedAt.toISOString(),
  };
}

export function presentAcademicContentRevisionList(input: {
  items: Parameters<typeof presentAcademicContentRevisionSummary>[0][];
  page: number;
  limit: number;
  total: number;
}): AcademicContentRevisionListDto {
  return {
    items: input.items.map(presentAcademicContentRevisionSummary),
    page: input.page,
    limit: input.limit,
    total: input.total,
  };
}

export function presentAcademicContentRevisionDetail(
  revision: AcademicContentRevisionDetail,
): AcademicContentRevisionDetailDto {
  return {
    ...presentAcademicContentRevisionSummary(revision),
    academicContentId: revision.academicContentId,
    academicYearId: revision.academicYearId,
    termId: revision.termId,
    type: revision.type,
    audience: revision.audience,
    description: revision.description,
    targets: revision.targets.map(presentAcademicContentTarget),
    assets: revision.assets.map((asset) => ({
      fileId: asset.fileId,
      sortOrder: asset.sortOrder,
      originalName: asset.file.originalName,
      mimeType: asset.file.mimeType,
      sizeBytes: asset.file.sizeBytes.toString(),
    })),
    links: revision.links.map(presentAcademicContentLink),
    tags: revision.tags.map(presentAcademicContentTag),
  };
}

export function presentAcademicContentList(input: {
  items: AcademicContentRecord[];
  page: number;
  limit: number;
  total: number;
}): AcademicContentListResponseDto {
  return {
    items: input.items.map(presentAcademicContent),
    page: input.page,
    limit: input.limit,
    total: input.total,
  };
}

export function presentAcademicContentUploadIntent(input: {
  uploadId: string;
  status: FileUploadSessionStatus;
  sessionUrl: string;
  capabilityExpiresAt: Date;
  expiresAt: Date;
  expectedMimeType: string;
  expectedSizeBytes: bigint;
  uploadMode: 'resumable';
}): AcademicContentUploadIntentResponseDto {
  return {
    uploadId: input.uploadId,
    status: input.status,
    sessionUrl: input.sessionUrl,
    capabilityExpiresAt: input.capabilityExpiresAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    expectedMimeType: input.expectedMimeType,
    expectedSizeBytes: input.expectedSizeBytes.toString(),
    uploadMode: input.uploadMode,
  };
}

export function presentAcademicContentUploadComplete(input: {
  asset: {
    id: string;
    academicContentId: string;
    fileId: string;
    createdAt: Date;
  };
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
  };
}): AcademicContentUploadCompleteResponseDto {
  return {
    asset: {
      id: input.asset.id,
      academicContentId: input.asset.academicContentId,
      fileId: input.asset.fileId,
      createdAt: input.asset.createdAt.toISOString(),
    },
    file: {
      id: input.file.id,
      originalName: input.file.originalName,
      mimeType: input.file.mimeType,
      sizeBytes: input.file.sizeBytes.toString(),
    },
  };
}

export function presentAcademicContentUploadCancel(input: {
  id: string;
  status: FileUploadSessionStatus;
  cancelledAt: Date | null;
}): AcademicContentUploadCancelResponseDto {
  return {
    uploadId: input.id,
    status: input.status,
    cancelledAt: input.cancelledAt?.toISOString() ?? null,
  };
}

export function presentAcademicContentFilePolicy(
  policy: AcademicContentEffectiveFilePolicy,
): AcademicContentFilePolicyResponseDto {
  return {
    attachmentsEnabled: policy.attachmentsEnabled,
    maximumFileSizeBytes: policy.maximumFileSizeBytes.toString(),
    documentsEnabled: policy.documentsEnabled,
    imagesEnabled: policy.imagesEnabled,
    videosEnabled: policy.videosEnabled,
    audioEnabled: policy.audioEnabled,
    archivesEnabled: policy.archivesEnabled,
    otherFilesEnabled: policy.otherFilesEnabled,
    allowStudentDownload: policy.allowStudentDownload,
    allowGuardianDownload: policy.allowGuardianDownload,
    allowInlinePreview: policy.allowInlinePreview,
  };
}
