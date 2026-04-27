import {
  presentAssessmentApprovalStatus,
  presentDecimal,
  presentDeliveryMode,
  presentGradeScopeType,
} from '../../shared/presenters/grades.presenter';
import {
  GradeAssessmentResponseDto,
  GradeAssessmentSubjectResponseDto,
  GradeAssessmentsListResponseDto,
} from '../dto/grade-assessment.dto';
import { GradeAssessmentRecord } from '../infrastructure/grades-assessments.repository';

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function deriveSubjectName(subject: {
  nameAr: string;
  nameEn: string;
}): string {
  return subject.nameEn.trim().length > 0 ? subject.nameEn : subject.nameAr;
}

function presentSubject(
  subject: GradeAssessmentRecord['subject'] | null,
): GradeAssessmentSubjectResponseDto | null {
  if (!subject) return null;

  return {
    id: subject.id,
    name: deriveSubjectName(subject),
    nameAr: subject.nameAr,
    nameEn: subject.nameEn,
    code: subject.code ?? null,
    color: subject.color ?? null,
  };
}

export function presentGradeAssessment(
  assessment: GradeAssessmentRecord,
): GradeAssessmentResponseDto {
  const title = assessment.titleEn ?? assessment.titleAr ?? null;

  return {
    id: assessment.id,
    academicYearId: assessment.academicYearId,
    yearId: assessment.academicYearId,
    termId: assessment.termId,
    subjectId: assessment.subjectId,
    subject: presentSubject(assessment.subject),
    scopeType: presentGradeScopeType(assessment.scopeType),
    scopeKey: assessment.scopeKey,
    scopeId: assessment.scopeKey,
    stageId: assessment.stageId,
    gradeId: assessment.gradeId,
    sectionId: assessment.sectionId,
    classroomId: assessment.classroomId,
    title,
    titleEn: assessment.titleEn,
    titleAr: assessment.titleAr,
    type: assessment.type,
    deliveryMode: presentDeliveryMode(assessment.deliveryMode),
    date: formatDateOnly(assessment.date),
    weight: presentDecimal(assessment.weight) ?? 0,
    maxScore: presentDecimal(assessment.maxScore) ?? 0,
    expectedTimeMinutes: assessment.expectedTimeMinutes,
    approvalStatus: presentAssessmentApprovalStatus(
      assessment.approvalStatus,
    ),
    isLocked: Boolean(assessment.lockedAt),
    publishedAt: presentNullableDate(assessment.publishedAt),
    publishedById: assessment.publishedById,
    approvedAt: presentNullableDate(assessment.approvedAt),
    approvedById: assessment.approvedById,
    lockedAt: presentNullableDate(assessment.lockedAt),
    lockedById: assessment.lockedById,
    createdById: assessment.createdById,
    createdAt: assessment.createdAt.toISOString(),
    updatedAt: assessment.updatedAt.toISOString(),
  };
}

export function presentGradeAssessments(
  assessments: GradeAssessmentRecord[],
): GradeAssessmentsListResponseDto {
  return {
    items: assessments.map((assessment) => presentGradeAssessment(assessment)),
  };
}
