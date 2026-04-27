import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { UpsertGradeAssessmentItemDto } from '../dto/grade-assessment-items.dto';
import {
  GradebookNoEnrollmentException,
  assertAssessmentAcceptsGradeItems,
  buildGradeItemUpsertPayload,
  normalizeGradeItemEntryPayload,
  validateStudentWithinAssessmentScope,
} from '../domain/grade-item-entry-domain';
import {
  GradeItemRecord,
  GradesAssessmentItemsRepository,
} from '../infrastructure/grades-assessment-items.repository';
import { presentGradeItem } from '../presenters/grade-item.presenter';

@Injectable()
export class UpsertGradeAssessmentItemUseCase {
  constructor(
    private readonly gradeItemsRepository: GradesAssessmentItemsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    assessmentId: string,
    studentId: string,
    command: UpsertGradeAssessmentItemDto,
  ) {
    const scope = requireGradesScope();
    const assessment =
      await this.gradeItemsRepository.findAssessmentForItems(assessmentId);

    if (!assessment) {
      throw new NotFoundDomainException('Grade assessment not found', {
        assessmentId,
      });
    }

    assertAssessmentAcceptsGradeItems(assessment, assessment.term);

    const student =
      await this.gradeItemsRepository.findStudentForGradeEntry(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const enrollment =
      await this.gradeItemsRepository.findStudentEnrollmentForAssessmentScope({
        assessment,
        studentId,
      });
    if (!enrollment) {
      throw new GradebookNoEnrollmentException({
        assessmentId: assessment.id,
        studentId,
      });
    }

    validateStudentWithinAssessmentScope({ assessment, enrollment });

    const normalized = normalizeGradeItemEntryPayload(
      command,
      assessment.maxScore,
    );
    const before =
      await this.gradeItemsRepository.findGradeItemByAssessmentAndStudent({
        assessmentId: assessment.id,
        studentId,
      });
    const item = await this.gradeItemsRepository.upsertGradeItem(
      buildGradeItemUpsertPayload({
        assessment,
        studentId,
        enrollmentId: enrollment.id,
        normalized,
        enteredById: scope.actorId,
        enteredAt: new Date(),
      }),
    );

    await this.authRepository.createAuditLog(
      buildGradeItemAuditEntry({
        scope,
        item,
        before,
      }),
    );

    return presentGradeItem(item);
  }
}

function buildGradeItemAuditEntry(params: {
  scope: ReturnType<typeof requireGradesScope>;
  item: GradeItemRecord;
  before?: GradeItemRecord | null;
}) {
  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'grades',
    action: 'grades.item.update',
    resourceType: 'grade_item',
    resourceId: params.item.id,
    outcome: AuditOutcome.SUCCESS,
    after: summarizeGradeItemForAudit(params.item),
  };

  return params.before
    ? { ...entry, before: summarizeGradeItemForAudit(params.before) }
    : entry;
}

function summarizeGradeItemForAudit(item: GradeItemRecord) {
  return {
    id: item.id,
    termId: item.termId,
    assessmentId: item.assessmentId,
    studentId: item.studentId,
    enrollmentId: item.enrollmentId,
    score: decimalToNumber(item.score),
    status: item.status,
    comment: item.comment,
    enteredById: item.enteredById,
    enteredAt: item.enteredAt?.toISOString() ?? null,
  };
}

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
