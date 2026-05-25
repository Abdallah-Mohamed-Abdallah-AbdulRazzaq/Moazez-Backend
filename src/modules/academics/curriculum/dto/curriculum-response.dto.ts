export class CurriculumAcademicYearSummaryDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class CurriculumTermSummaryDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class CurriculumGradeSummaryDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
}

export class CurriculumSubjectSummaryDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
  color!: string | null;
}

export class CurriculumLessonResponseDto {
  id!: string;
  lessonId!: string;
  curriculumId!: string;
  unitId!: string;
  title!: string;
  description!: string | null;
  objectives!: string[];
  sortOrder!: number;
  estimatedMinutes!: number | null;
  createdAt!: string;
  updatedAt!: string;
}

export class CurriculumUnitResponseDto {
  id!: string;
  unitId!: string;
  curriculumId!: string;
  title!: string;
  description!: string | null;
  sortOrder!: number;
  estimatedLessons!: number | null;
  lessonCount!: number;
  lessons!: CurriculumLessonResponseDto[];
  createdAt!: string;
  updatedAt!: string;
}

export class CurriculumResponseDto {
  id!: string;
  curriculumId!: string;
  academicYearId!: string;
  termId!: string;
  gradeId!: string;
  subjectId!: string;
  title!: string;
  description!: string | null;
  status!: string;
  publishedAt!: string | null;
  archivedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
  academicYear!: CurriculumAcademicYearSummaryDto;
  term!: CurriculumTermSummaryDto;
  grade!: CurriculumGradeSummaryDto;
  subject!: CurriculumSubjectSummaryDto;
  unitCount!: number;
  lessonCount!: number;
}

export class CurriculumDetailResponseDto extends CurriculumResponseDto {
  units!: CurriculumUnitResponseDto[];
}

export class CurriculaListResponseDto {
  items!: CurriculumResponseDto[];
}

export class DeleteCurriculumNodeResponseDto {
  ok!: true;
}
