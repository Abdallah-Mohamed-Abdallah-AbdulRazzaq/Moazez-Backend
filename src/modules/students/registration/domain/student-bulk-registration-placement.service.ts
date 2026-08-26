import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import type { StudentSeatLimitDecision } from '../../../platform-admin/application/student-seat-limit-policy.service';
import { StudentSeatLimitPolicyService } from '../../../platform-admin/application/student-seat-limit-policy.service';
import type {
  ClassroomRecord,
  GradeRecord,
  SectionRecord,
  StageRecord,
} from '../../../academics/structure/infrastructure/structure.repository';
import { StructureRepository } from '../../../academics/structure/infrastructure/structure.repository';
import type { TermRecord } from '../../../academics/structure/infrastructure/terms.repository';
import { TermsRepository } from '../../../academics/structure/infrastructure/terms.repository';
import type { AcademicYearRecord } from '../../enrollments/infrastructure/enrollments.repository';
import { EnrollmentsRepository } from '../../enrollments/infrastructure/enrollments.repository';
import { StudentEnrollmentInactiveYearException } from '../../enrollments/domain/enrollment.exceptions';
import { StudentPlacementCapacityPolicyService } from '../../enrollments/domain/student-placement-capacity-policy.service';
import { requireStudentsScope } from '../../students/domain/students-scope';
import type { StudentsScope } from '../../students/domain/students-scope';
import type { StudentBulkRegistrationPlacementDto } from '../dto/student-bulk-registration.dto';

export interface ResolvedStudentBulkRegistrationPlacement {
  scope: StudentsScope;
  academicYear: AcademicYearRecord;
  term: TermRecord | null;
  stage: StageRecord;
  grade: GradeRecord;
  section: SectionRecord;
  classroom: ClassroomRecord;
  enrollmentDate: string;
  studentSeat: StudentSeatLimitDecision;
}

export type ResolvedStudentBulkRegistrationValidationPlacement = Omit<
  ResolvedStudentBulkRegistrationPlacement,
  'studentSeat'
>;

@Injectable()
export class StudentBulkRegistrationPlacementService {
  constructor(
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly termsRepository: TermsRepository,
    private readonly structureRepository: StructureRepository,
    private readonly studentSeatLimitPolicy: StudentSeatLimitPolicyService,
    private readonly studentPlacementCapacityPolicy: StudentPlacementCapacityPolicyService,
  ) {}

  async resolve(
    command: StudentBulkRegistrationPlacementDto,
  ): Promise<ResolvedStudentBulkRegistrationPlacement> {
    const placement = await this.resolvePlacement(command);
    const studentSeat = await this.assertCapacity(
      placement,
      1,
      'bulk_registration_intake',
    );

    return { ...placement, studentSeat };
  }

  async resolveForValidation(
    command: StudentBulkRegistrationPlacementDto,
    incrementBy: number,
  ): Promise<ResolvedStudentBulkRegistrationValidationPlacement> {
    const placement = await this.resolvePlacement(command);
    if (incrementBy > 0) {
      await this.assertCapacity(
        placement,
        incrementBy,
        'bulk_registration_validation',
      );
    }
    return placement;
  }

  private async resolvePlacement(
    command: StudentBulkRegistrationPlacementDto,
  ): Promise<ResolvedStudentBulkRegistrationValidationPlacement> {
    const scope = requireStudentsScope();
    const academicYear = await this.enrollmentsRepository.findAcademicYearById(
      command.academicYearId,
    );
    if (!academicYear) {
      throw new NotFoundDomainException('Academic year not found', {
        academicYearId: command.academicYearId,
      });
    }
    if (!academicYear.isActive) {
      throw new StudentEnrollmentInactiveYearException({
        academicYearId: academicYear.id,
      });
    }

    const term = command.termId
      ? await this.termsRepository.findTermById(command.termId)
      : null;
    if (command.termId && !term) {
      throw new NotFoundDomainException('Term not found', {
        termId: command.termId,
      });
    }
    if (term && term.academicYearId !== academicYear.id) {
      throw new ValidationDomainException(
        'Term does not belong to the selected academic year',
        { field: 'termId' },
      );
    }

    const classroom = await this.structureRepository.findClassroomById(
      command.classroomId,
    );
    if (!classroom) {
      throw new NotFoundDomainException('Classroom not found', {
        classroomId: command.classroomId,
      });
    }

    const section = await this.structureRepository.findSectionById(
      classroom.sectionId,
    );
    if (!section) {
      throw new NotFoundDomainException('Classroom section not found', {
        sectionId: classroom.sectionId,
      });
    }

    const grade = await this.structureRepository.findGradeById(section.gradeId);
    if (!grade) {
      throw new NotFoundDomainException('Classroom grade not found', {
        gradeId: section.gradeId,
      });
    }

    const stage = await this.structureRepository.findStageById(grade.stageId);
    if (!stage) {
      throw new NotFoundDomainException('Classroom stage not found', {
        stageId: grade.stageId,
      });
    }

    return {
      scope,
      academicYear,
      term,
      stage,
      grade,
      section,
      classroom,
      enrollmentDate: command.enrollmentDate,
    };
  }

  private async assertCapacity(
    placement: ResolvedStudentBulkRegistrationValidationPlacement,
    incrementBy: number,
    reason: string,
  ): Promise<StudentSeatLimitDecision> {
    const studentSeat =
      await this.studentSeatLimitPolicy.assertCanIncreaseActiveStudentSeats({
        schoolId: placement.scope.schoolId,
        incrementBy,
        reason,
      });

    await this.studentPlacementCapacityPolicy.assertCanPlace({
      academicYearId: placement.academicYear.id,
      classroom: placement.classroom,
      incrementBy,
    });

    return studentSeat;
  }
}
