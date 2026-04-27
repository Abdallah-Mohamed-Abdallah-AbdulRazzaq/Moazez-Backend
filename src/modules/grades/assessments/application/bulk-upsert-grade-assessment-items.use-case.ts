import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { GradesScope, requireGradesScope } from '../../grades-context';
import { BulkUpsertGradeAssessmentItemsDto } from '../dto/grade-assessment-items.dto';
import {
  GradebookNoEnrollmentException,
  assertAssessmentAcceptsGradeItems,
  buildGradeItemUpsertPayload,
  validateBulkGradeItemPayload,
  validateStudentWithinAssessmentScope,
} from '../domain/grade-item-entry-domain';
import {
  GradeAssessmentForGradeItemsRecord,
  GradeItemEnrollmentRecord,
  GradesAssessmentItemsRepository,
} from '../infrastructure/grades-assessment-items.repository';
import { presentBulkGradeItems } from '../presenters/grade-item.presenter';

@Injectable()
export class BulkUpsertGradeAssessmentItemsUseCase {
  constructor(
    private readonly gradeItemsRepository: GradesAssessmentItemsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    assessmentId: string,
    command: BulkUpsertGradeAssessmentItemsDto,
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

    const normalizedItems = validateBulkGradeItemPayload(
      command.items,
      assessment.maxScore,
    );
    const studentIds = normalizedItems.map((item) => item.studentId);
    const students =
      await this.gradeItemsRepository.findStudentsForBulkGradeEntry(studentIds);
    const foundStudentIds = new Set(students.map((student) => student.id));
    const missingStudentIds = studentIds.filter(
      (studentId) => !foundStudentIds.has(studentId),
    );
    if (missingStudentIds.length > 0) {
      throw new NotFoundDomainException('Student not found', {
        studentIds: missingStudentIds,
      });
    }

    const enrollments =
      await this.gradeItemsRepository.findStudentEnrollmentsForAssessmentScope({
        assessment,
        studentIds,
      });
    const enrollmentByStudentId = new Map(
      enrollments.map((enrollment) => [enrollment.studentId, enrollment]),
    );

    const payloads = normalizedItems.map((item) => {
      const enrollment = enrollmentByStudentId.get(item.studentId);
      if (!enrollment) {
        throw new GradebookNoEnrollmentException({
          assessmentId: assessment.id,
          studentId: item.studentId,
        });
      }

      validateStudentWithinAssessmentScope({ assessment, enrollment });

      return buildGradeItemUpsertPayload({
        assessment,
        studentId: item.studentId,
        enrollmentId: enrollment.id,
        normalized: item,
        enteredById: scope.actorId,
        enteredAt: new Date(),
      });
    });

    const items =
      await this.gradeItemsRepository.bulkUpsertGradeItems(payloads);

    await this.authRepository.createAuditLog(
      buildBulkGradeItemsAuditEntry({
        scope,
        assessment,
        enrollments,
        studentIds,
      }),
    );

    return presentBulkGradeItems({ assessmentId: assessment.id, items });
  }
}

function buildBulkGradeItemsAuditEntry(params: {
  scope: GradesScope;
  assessment: GradeAssessmentForGradeItemsRecord;
  enrollments: GradeItemEnrollmentRecord[];
  studentIds: string[];
}) {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'grades',
    action: 'grades.items.bulk_update',
    resourceType: 'grade_assessment',
    resourceId: params.assessment.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      assessmentId: params.assessment.id,
      affectedStudentIds: params.studentIds,
      affectedEnrollmentIds: params.enrollments.map(
        (enrollment) => enrollment.id,
      ),
      count: params.studentIds.length,
    },
  };
}
