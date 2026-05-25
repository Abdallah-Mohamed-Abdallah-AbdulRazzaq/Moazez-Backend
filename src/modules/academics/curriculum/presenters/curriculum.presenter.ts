import { Prisma } from '@prisma/client';
import type {
  CurriculumDetailRecord,
  CurriculumLessonRecord,
  CurriculumListRecord,
  CurriculumUnitRecord,
} from '../infrastructure/curriculum.repository';
import type {
  CurriculaListResponseDto,
  CurriculumDetailResponseDto,
  CurriculumLessonResponseDto,
  CurriculumResponseDto,
  CurriculumUnitResponseDto,
} from '../dto/curriculum-response.dto';

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

function dateToIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function normalizeObjectives(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

export function presentCurriculum(
  curriculum: CurriculumListRecord | CurriculumDetailRecord,
): CurriculumResponseDto {
  return {
    id: curriculum.id,
    curriculumId: curriculum.id,
    academicYearId: curriculum.academicYearId,
    termId: curriculum.termId,
    gradeId: curriculum.gradeId,
    subjectId: curriculum.subjectId,
    title: curriculum.title,
    description: curriculum.description ?? null,
    status: curriculum.status.toLowerCase(),
    publishedAt: dateToIso(curriculum.publishedAt),
    archivedAt: dateToIso(curriculum.archivedAt),
    createdAt: curriculum.createdAt.toISOString(),
    updatedAt: curriculum.updatedAt.toISOString(),
    academicYear: {
      id: curriculum.academicYear.id,
      name: deriveName(
        curriculum.academicYear.nameAr,
        curriculum.academicYear.nameEn,
      ),
      nameAr: curriculum.academicYear.nameAr,
      nameEn: curriculum.academicYear.nameEn,
    },
    term: {
      id: curriculum.term.id,
      name: deriveName(curriculum.term.nameAr, curriculum.term.nameEn),
      nameAr: curriculum.term.nameAr,
      nameEn: curriculum.term.nameEn,
    },
    grade: {
      id: curriculum.grade.id,
      name: deriveName(curriculum.grade.nameAr, curriculum.grade.nameEn),
      nameAr: curriculum.grade.nameAr,
      nameEn: curriculum.grade.nameEn,
    },
    subject: {
      id: curriculum.subject.id,
      name: deriveName(curriculum.subject.nameAr, curriculum.subject.nameEn),
      nameAr: curriculum.subject.nameAr,
      nameEn: curriculum.subject.nameEn,
      code: curriculum.subject.code ?? null,
      color: curriculum.subject.color ?? null,
    },
    unitCount: curriculum.units.length,
    lessonCount: curriculum.lessons.length,
  };
}

export function presentCurricula(
  curricula: CurriculumListRecord[],
): CurriculaListResponseDto {
  return {
    items: curricula.map((curriculum) => presentCurriculum(curriculum)),
  };
}

export function presentCurriculumDetail(
  curriculum: CurriculumDetailRecord,
): CurriculumDetailResponseDto {
  return {
    ...presentCurriculum(curriculum),
    units: curriculum.units.map((unit) => presentCurriculumUnit(unit)),
  };
}

export function presentCurriculumUnit(
  unit: CurriculumUnitRecord,
): CurriculumUnitResponseDto {
  return {
    id: unit.id,
    unitId: unit.id,
    curriculumId: unit.curriculumId,
    title: unit.title,
    description: unit.description ?? null,
    sortOrder: unit.sortOrder,
    estimatedLessons: unit.estimatedLessons ?? null,
    lessonCount: unit.lessons.length,
    lessons: unit.lessons.map((lesson) => presentCurriculumLesson(lesson)),
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  };
}

export function presentCurriculumLesson(
  lesson: CurriculumLessonRecord,
): CurriculumLessonResponseDto {
  return {
    id: lesson.id,
    lessonId: lesson.id,
    curriculumId: lesson.curriculumId,
    unitId: lesson.unitId,
    title: lesson.title,
    description: lesson.description ?? null,
    objectives: normalizeObjectives(lesson.objectives),
    sortOrder: lesson.sortOrder,
    estimatedMinutes: lesson.estimatedMinutes ?? null,
    createdAt: lesson.createdAt.toISOString(),
    updatedAt: lesson.updatedAt.toISOString(),
  };
}
