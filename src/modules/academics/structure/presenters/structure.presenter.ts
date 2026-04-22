import {
  AcademicYear,
  Classroom,
  Grade,
  Section,
  Stage,
  Term,
} from '@prisma/client';
import {
  AcademicYearResponseDto,
  AcademicYearsListResponseDto,
  ClassroomResponseDto,
  GradeResponseDto,
  SectionResponseDto,
  StageResponseDto,
  StructureTreeResponseDto,
  TermResponseDto,
  TermsListResponseDto,
} from '../dto/structure-response.dto';
import {
  StructureTreeStageRecord,
} from '../infrastructure/structure.repository';

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

function compareBySortOrderAndName(
  left: { sortOrder: number; nameAr: string; nameEn: string },
  right: { sortOrder: number; nameAr: string; nameEn: string },
): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  const leftName = deriveName(left.nameAr, left.nameEn).toLocaleLowerCase();
  const rightName = deriveName(right.nameAr, right.nameEn).toLocaleLowerCase();
  return leftName.localeCompare(rightName);
}

export function presentAcademicYear(
  year: AcademicYear,
): AcademicYearResponseDto {
  return {
    id: year.id,
    name: deriveName(year.nameAr, year.nameEn),
    nameAr: year.nameAr,
    nameEn: year.nameEn,
    startDate: formatDateOnly(year.startDate),
    endDate: formatDateOnly(year.endDate),
    isActive: year.isActive,
  };
}

export function presentAcademicYears(
  years: AcademicYear[],
): AcademicYearsListResponseDto {
  return {
    items: years.map((year) => presentAcademicYear(year)),
  };
}

export function presentTerm(term: Term): TermResponseDto {
  const status = term.isActive ? 'open' : 'closed';

  return {
    id: term.id,
    academicYearId: term.academicYearId,
    yearId: term.academicYearId,
    name: deriveName(term.nameAr, term.nameEn),
    nameAr: term.nameAr,
    nameEn: term.nameEn,
    startDate: formatDateOnly(term.startDate),
    endDate: formatDateOnly(term.endDate),
    isActive: term.isActive,
    status,
  };
}

export function presentTerms(terms: Term[]): TermsListResponseDto {
  return {
    items: terms.map((term) => presentTerm(term)),
  };
}

export function presentStage(stage: Stage): StageResponseDto {
  return {
    id: stage.id,
    name: deriveName(stage.nameAr, stage.nameEn),
    nameAr: stage.nameAr,
    nameEn: stage.nameEn,
    sortOrder: stage.sortOrder,
    order: stage.sortOrder,
    description: null,
  };
}

export function presentGrade(grade: Grade): GradeResponseDto {
  return {
    id: grade.id,
    stageId: grade.stageId,
    name: deriveName(grade.nameAr, grade.nameEn),
    nameAr: grade.nameAr,
    nameEn: grade.nameEn,
    sortOrder: grade.sortOrder,
    order: grade.sortOrder,
    capacity: grade.capacity ?? null,
    notes: null,
  };
}

export function presentSection(section: Section): SectionResponseDto {
  return {
    id: section.id,
    gradeId: section.gradeId,
    name: deriveName(section.nameAr, section.nameEn),
    nameAr: section.nameAr,
    nameEn: section.nameEn,
    sortOrder: section.sortOrder,
    order: section.sortOrder,
    capacity: section.capacity ?? null,
    notes: null,
  };
}

export function presentClassroom(classroom: Classroom): ClassroomResponseDto {
  return {
    id: classroom.id,
    sectionId: classroom.sectionId,
    name: deriveName(classroom.nameAr, classroom.nameEn),
    nameAr: classroom.nameAr,
    nameEn: classroom.nameEn,
    sortOrder: classroom.sortOrder,
    order: classroom.sortOrder,
    capacity: classroom.capacity ?? null,
    notes: null,
  };
}

export function presentStructureTree(
  yearId: string,
  termId: string,
  stages: StructureTreeStageRecord[],
): StructureTreeResponseDto {
  return {
    yearId,
    termId,
    stages: [...stages]
      .sort(compareBySortOrderAndName)
      .map((stage) => ({
        ...presentStage(stage),
        grades: [...stage.grades]
          .sort(compareBySortOrderAndName)
          .map((grade) => ({
            ...presentGrade(grade),
            sections: [...grade.sections]
              .sort(compareBySortOrderAndName)
              .map((section) => ({
                ...presentSection(section),
                classrooms: [...section.classrooms]
                  .sort(compareBySortOrderAndName)
                  .map((classroom) => presentClassroom(classroom)),
              })),
          })),
      })),
  };
}
