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

    const studentSeat =
      await this.studentSeatLimitPolicy.assertCanIncreaseActiveStudentSeats({
        schoolId: scope.schoolId,
        incrementBy: 1,
        reason: 'bulk_registration_intake',
      });

    await this.studentPlacementCapacityPolicy.assertCanPlace({
      academicYearId: academicYear.id,
      classroom,
      incrementBy: 1,
    });

    return {
      scope,
      academicYear,
      term,
      stage,
      grade,
      section,
      classroom,
      enrollmentDate: command.enrollmentDate,
      studentSeat,
    };
  }
}
