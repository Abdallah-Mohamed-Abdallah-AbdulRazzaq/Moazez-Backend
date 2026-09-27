import type { AcademicContentReviewRepository } from '../infrastructure/academic-content-review.repository';
import {
  AcademicContentApprovalHistoryResponseDto,
  AcademicContentReviewQueueResponseDto,
} from '../dto/academic-content-review.dto';

type QueuePage = Awaited<ReturnType<AcademicContentReviewRepository['queue']>>;
type HistoryPage = Awaited<
  ReturnType<AcademicContentReviewRepository['history']>
>;

export function presentAcademicContentReviewQueue(
  page: QueuePage,
): AcademicContentReviewQueueResponseDto {
  return {
    items: page.items.map((item) => ({
      contentId: item.contentId,
      title: item.title,
      academicYearId: item.academicYearId,
      termId: item.termId,
      approvalId: item.approvalId,
      submittedRevisionId: item.submittedRevisionId,
      roundNumber: item.roundNumber,
      submittedAt: item.submittedAt.toISOString(),
      submittedByUserId: item.submittedByUserId,
      targets: item.targets.map((target) => ({
        scopeType: target.scopeType,
        stageId: target.stageId,
        gradeId: target.gradeId,
        sectionId: target.sectionId,
        classroomId: target.classroomId,
        subjectId: target.subjectId,
        teacherSubjectAllocationId: target.teacherSubjectAllocationId,
      })),
    })),
    page: page.page,
    limit: page.limit,
    total: page.total,
  };
}

export function presentAcademicContentApprovalHistory(
  page: HistoryPage,
): AcademicContentApprovalHistoryResponseDto {
  return {
    items: page.items.map((item) => ({
      approvalId: item.id,
      revisionId: item.revisionId,
      roundNumber: item.roundNumber,
      status: item.status,
      submittedByUserId: item.submittedByUserId,
      submittedAt: item.submittedAt.toISOString(),
      decidedByUserId: item.decidedByUserId,
      decidedAt: item.decidedAt?.toISOString() ?? null,
      decisionNote: item.decisionNote,
    })),
    page: page.page,
    limit: page.limit,
    total: page.total,
  };
}
