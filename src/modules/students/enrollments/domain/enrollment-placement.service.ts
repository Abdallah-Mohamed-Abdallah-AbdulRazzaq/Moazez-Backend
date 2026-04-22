import { Injectable } from '@nestjs/common';
import { ValidationDomainException, NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ApplicationEnrollmentHandoffResponseDto } from '../../../admissions/applications/dto/application.dto';
import { TermsRepository, type TermRecord } from '../../../academics/structure/infrastructure/terms.repository';
import {
  StructureRepository,
  type ClassroomRecord,
  type GradeRecord,
  type SectionRecord,
} from '../../../academics/structure/infrastructure/structure.repository';
import { StudentsRepository, type StudentRecord } from '../../students/infrastructure/students.repository';
import { CreateEnrollmentDto, UpsertEnrollmentDto, ValidateEnrollmentDto } from '../dto/enrollment.dto';
import { EnrollmentsRepository, type AcademicYearRecord, type EnrollmentRecord } from '../infrastructure/enrollments.repository';
import { StudentEnrollmentInactiveYearException, StudentEnrollmentPlacementConflictException } from './enrollment.exceptions';

type EnrollmentPlacementCommand =
  | CreateEnrollmentDto
  | UpsertEnrollmentDto
  | ValidateEnrollmentDto;

export interface ResolvedEnrollmentPlacement {
  student: StudentRecord;
  academicYear: AcademicYearRecord;
  term: TermRecord | null;
  grade: GradeRecord;
  section: SectionRecord;
  classroom: ClassroomRecord;
  activeEnrollment: EnrollmentRecord | null;
}

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : null;
}

function sameOptionalUuid(left?: string | null, right?: string | null): boolean {
  return (left ?? null) === (right ?? null);
}

@Injectable()
export class EnrollmentPlacementService {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly structureRepository: StructureRepository,
    private readonly termsRepository: TermsRepository,
  ) {}

  async resolvePlacement(
    command: EnrollmentPlacementCommand,
    options?: {
      handoff?: ApplicationEnrollmentHandoffResponseDto | null;
      allowMatchingActiveEnrollment?: boolean;
      ignoreEnrollmentId?: string;
    },
  ): Promise<ResolvedEnrollmentPlacement> {
    const student = await this.studentsRepository.findStudentById(command.studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', {
        studentId: command.studentId,
      });
    }

    if (command.status && command.status !== 'active') {
      throw new ValidationDomainException(
        'Only active enrollments can be created in this phase',
        { field: 'status' },
      );
    }

    const handoffYearId =
      options?.handoff?.handoff.enrollmentDraft.requestedAcademicYearId ?? null;
    const handoffYearName =
      normalizeOptionalText(
        options?.handoff?.handoff.enrollmentDraft.requestedAcademicYearName,
      ) ?? null;
    const handoffGradeId =
      options?.handoff?.handoff.enrollmentDraft.requestedGradeId ?? null;

    const resolvedAcademicYear = await this.resolveAcademicYear(
      command.academicYearId ?? null,
      command.academicYear ?? null,
      handoffYearId,
      handoffYearName,
    );

    if (!resolvedAcademicYear.isActive) {
      throw new StudentEnrollmentInactiveYearException({
        academicYearId: resolvedAcademicYear.id,
        studentId: student.id,
      });
    }

    const term = await this.resolveTerm(
      command.termId ?? null,
      resolvedAcademicYear.id,
    );

    const classroom = await this.structureRepository.findClassroomById(
      command.classroomId,
    );
    if (!classroom) {
      throw new NotFoundDomainException('Classroom not found', {
        classroomId: command.classroomId,
      });
    }

    if (command.sectionId && classroom.sectionId !== command.sectionId) {
      throw new ValidationDomainException(
        'Classroom does not belong to the provided section',
        {
          field: 'classroomId',
          sectionId: command.sectionId,
          classroomId: command.classroomId,
        },
      );
    }

    const section = await this.structureRepository.findSectionById(
      classroom.sectionId,
    );
    if (!section) {
      throw new NotFoundDomainException('Section not found', {
        sectionId: classroom.sectionId,
      });
    }

    const expectedGradeId = command.gradeId ?? handoffGradeId;
    if (expectedGradeId && section.gradeId !== expectedGradeId) {
      throw new ValidationDomainException(
        'Section does not belong to the provided grade',
        {
          field: 'sectionId',
          gradeId: expectedGradeId,
          sectionId: section.id,
        },
      );
    }

    const grade = await this.structureRepository.findGradeById(section.gradeId);
    if (!grade) {
      throw new NotFoundDomainException('Grade not found', {
        gradeId: section.gradeId,
      });
    }

    const activeEnrollment =
      await this.enrollmentsRepository.findActiveEnrollmentByStudentId(student.id);

    if (
      activeEnrollment &&
      activeEnrollment.id !== (options?.ignoreEnrollmentId ?? null)
    ) {
      const matchesRequestedPlacement =
        activeEnrollment.academicYearId === resolvedAcademicYear.id &&
        activeEnrollment.classroomId === classroom.id &&
        sameOptionalUuid(activeEnrollment.termId, term?.id ?? null);

      if (!(options?.allowMatchingActiveEnrollment && matchesRequestedPlacement)) {
        throw new StudentEnrollmentPlacementConflictException({
          studentId: student.id,
          activeEnrollmentId: activeEnrollment.id,
          requestedAcademicYearId: resolvedAcademicYear.id,
          requestedClassroomId: classroom.id,
        });
      }
    }

    return {
      student,
      academicYear: resolvedAcademicYear,
      term,
      grade,
      section,
      classroom,
      activeEnrollment,
    };
  }

  private async resolveAcademicYear(
    explicitAcademicYearId: string | null,
    explicitAcademicYearName: string | null,
    handoffAcademicYearId: string | null,
    handoffAcademicYearName: string | null,
  ): Promise<AcademicYearRecord> {
    if (explicitAcademicYearId && handoffAcademicYearId) {
      if (explicitAcademicYearId !== handoffAcademicYearId) {
        throw new ValidationDomainException(
          'Enrollment academic year does not match the admissions handoff',
          {
            field: 'academicYearId',
            academicYearId: explicitAcademicYearId,
            handoffAcademicYearId,
          },
        );
      }
    }

    const normalizedExplicitName = normalizeOptionalText(explicitAcademicYearName);
    const normalizedHandoffName = normalizeOptionalText(handoffAcademicYearName);

    if (normalizedExplicitName && normalizedHandoffName) {
      const sameName =
        normalizedExplicitName.localeCompare(normalizedHandoffName, undefined, {
          sensitivity: 'accent',
        }) === 0;
      if (!sameName) {
        throw new ValidationDomainException(
          'Enrollment academic year does not match the admissions handoff',
          {
            field: 'academicYear',
            academicYear: normalizedExplicitName,
            handoffAcademicYear: normalizedHandoffName,
          },
        );
      }
    }

    const academicYearId = explicitAcademicYearId ?? handoffAcademicYearId;
    const academicYearName = normalizedExplicitName ?? normalizedHandoffName;

    if (academicYearId) {
      const academicYear = await this.enrollmentsRepository.findAcademicYearById(
        academicYearId,
      );
      if (!academicYear) {
        throw new NotFoundDomainException('Academic year not found', {
          academicYearId,
        });
      }

      return academicYear;
    }

    if (academicYearName) {
      const academicYear =
        await this.enrollmentsRepository.findAcademicYearByName(academicYearName);
      if (!academicYear) {
        throw new NotFoundDomainException('Academic year not found', {
          academicYear: academicYearName,
        });
      }

      return academicYear;
    }

    throw new ValidationDomainException('Academic year is required', {
      field: 'academicYearId',
    });
  }

  private async resolveTerm(
    termId: string | null,
    academicYearId: string,
  ): Promise<TermRecord | null> {
    if (!termId) {
      return null;
    }

    const term = await this.termsRepository.findTermById(termId);
    if (!term) {
      throw new NotFoundDomainException('Term not found', { termId });
    }

    if (term.academicYearId !== academicYearId) {
      throw new ValidationDomainException(
        'Term does not belong to the provided academic year',
        {
          field: 'termId',
          termId,
          academicYearId,
        },
      );
    }

    return term;
  }
}
