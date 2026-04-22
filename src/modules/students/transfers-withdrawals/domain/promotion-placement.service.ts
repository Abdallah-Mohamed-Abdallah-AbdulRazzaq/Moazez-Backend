import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  StructureRepository,
  StructureTreeStageRecord,
} from '../../../academics/structure/infrastructure/structure.repository';
import {
  StudentEnrollmentInactiveYearException,
} from '../../enrollments/domain/enrollment.exceptions';
import {
  EnrollmentPlacementService,
  type ResolvedEnrollmentPlacement,
} from '../../enrollments/domain/enrollment-placement.service';
import { EnrollmentsRepository, type EnrollmentRecord } from '../../enrollments/infrastructure/enrollments.repository';
import { requireTargetAcademicYear } from '../application/shared';

type PromotionSectionRecord =
  StructureTreeStageRecord['grades'][number]['sections'][number];
type PromotionClassroomRecord = PromotionSectionRecord['classrooms'][number];

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function selectSection(
  sections: PromotionSectionRecord[],
  currentSection: Awaited<
    ReturnType<StructureRepository['findSectionById']>
  > extends infer T
    ? NonNullable<T>
    : never,
): PromotionSectionRecord | null {
  return (
    sections.find((section) => section.sortOrder === currentSection.sortOrder) ??
    sections.find(
      (section) =>
        normalizeName(section.nameEn) === normalizeName(currentSection.nameEn),
    ) ??
    sections.find(
      (section) =>
        normalizeName(section.nameAr) === normalizeName(currentSection.nameAr),
    ) ??
    sections[0] ??
    null
  );
}

function selectClassroom(
  classrooms: PromotionClassroomRecord[],
  currentClassroom: Awaited<
    ReturnType<StructureRepository['findClassroomById']>
  > extends infer T
    ? NonNullable<T>
    : never,
): PromotionClassroomRecord | null {
  return (
    classrooms.find(
      (classroom) => classroom.sortOrder === currentClassroom.sortOrder,
    ) ??
    classrooms.find(
      (classroom) =>
        normalizeName(classroom.nameEn) === normalizeName(currentClassroom.nameEn),
    ) ??
    classrooms.find(
      (classroom) =>
        normalizeName(classroom.nameAr) === normalizeName(currentClassroom.nameAr),
    ) ??
    classrooms[0] ??
    null
  );
}

function findStageForGrade(
  stages: StructureTreeStageRecord[],
  gradeId: string,
): StructureTreeStageRecord | null {
  return (
    stages.find((stage) => stage.grades.some((grade) => grade.id === gradeId)) ??
    null
  );
}

@Injectable()
export class PromotionPlacementService {
  constructor(
    private readonly structureRepository: StructureRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly enrollmentPlacementService: EnrollmentPlacementService,
  ) {}

  async resolvePlacement(params: {
    activeEnrollment: EnrollmentRecord;
    targetAcademicYear: string;
    effectiveDate: string;
  }): Promise<ResolvedEnrollmentPlacement> {
    const targetAcademicYearName = requireTargetAcademicYear(
      params.targetAcademicYear,
    );

    const targetAcademicYear =
      await this.enrollmentsRepository.findAcademicYearByName(
        targetAcademicYearName,
      );
    if (!targetAcademicYear) {
      throw new NotFoundDomainException('Academic year not found', {
        academicYear: targetAcademicYearName,
      });
    }

    if (!targetAcademicYear.isActive) {
      throw new StudentEnrollmentInactiveYearException({
        academicYearId: targetAcademicYear.id,
        studentId: params.activeEnrollment.studentId,
      });
    }

    if (targetAcademicYear.id === params.activeEnrollment.academicYearId) {
      throw new ValidationDomainException(
        'Promotion target academic year must differ from the current enrollment year',
        {
          field: 'targetAcademicYear',
          academicYearId: targetAcademicYear.id,
        },
      );
    }

    const [currentGrade, currentSection, currentClassroom, stages] =
      await Promise.all([
        this.structureRepository.findGradeById(
          params.activeEnrollment.classroom.section.grade.id,
        ),
        this.structureRepository.findSectionById(
          params.activeEnrollment.classroom.section.id,
        ),
        this.structureRepository.findClassroomById(
          params.activeEnrollment.classroom.id,
        ),
        this.structureRepository.listTree(),
      ]);

    if (!currentGrade || !currentSection || !currentClassroom) {
      throw new NotFoundDomainException('Current enrollment placement not found', {
        studentId: params.activeEnrollment.studentId,
      });
    }

    const stage = findStageForGrade(stages, currentGrade.id);
    if (!stage) {
      throw new NotFoundDomainException('Stage not found', {
        gradeId: currentGrade.id,
      });
    }

    const currentGradeIndex = stage.grades.findIndex(
      (grade) => grade.id === currentGrade.id,
    );
    const nextGrade =
      stage.grades
        .slice(currentGradeIndex + 1)
        .find((grade) => grade.sortOrder >= currentGrade.sortOrder) ?? null;

    if (!nextGrade) {
      throw new ValidationDomainException(
        'No next grade is configured for promotion',
        {
          field: 'studentId',
          studentId: params.activeEnrollment.studentId,
          gradeId: currentGrade.id,
        },
      );
    }

    const targetSection = selectSection(nextGrade.sections, currentSection);
    if (!targetSection) {
      throw new ValidationDomainException(
        'No target section is configured for the promoted grade',
        {
          field: 'targetAcademicYear',
          targetGradeId: nextGrade.id,
        },
      );
    }

    const targetClassroom = selectClassroom(
      targetSection.classrooms,
      currentClassroom,
    );
    if (!targetClassroom) {
      throw new ValidationDomainException(
        'No target classroom is configured for the promoted section',
        {
          field: 'targetAcademicYear',
          targetSectionId: targetSection.id,
        },
      );
    }

    return this.enrollmentPlacementService.resolvePlacement(
      {
        studentId: params.activeEnrollment.studentId,
        academicYearId: targetAcademicYear.id,
        gradeId: nextGrade.id,
        sectionId: targetSection.id,
        classroomId: targetClassroom.id,
        enrollmentDate: params.effectiveDate,
      },
      {
        ignoreEnrollmentId: params.activeEnrollment.id,
      },
    );
  }
}
