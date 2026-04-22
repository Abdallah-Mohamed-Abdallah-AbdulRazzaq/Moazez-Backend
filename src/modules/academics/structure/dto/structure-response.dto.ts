export class AcademicYearResponseDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  startDate!: string;
  endDate!: string;
  isActive!: boolean;
}

export class AcademicYearsListResponseDto {
  items!: AcademicYearResponseDto[];
}

export class TermResponseDto {
  id!: string;
  academicYearId!: string;
  yearId!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  startDate!: string;
  endDate!: string;
  isActive!: boolean;
  status!: 'open' | 'closed';
}

export class TermsListResponseDto {
  items!: TermResponseDto[];
}

export class StageResponseDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  sortOrder!: number;
  order!: number;
  description!: string | null;
}

export class GradeResponseDto {
  id!: string;
  stageId!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  sortOrder!: number;
  order!: number;
  capacity!: number | null;
  notes!: string | null;
}

export class SectionResponseDto {
  id!: string;
  gradeId!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  sortOrder!: number;
  order!: number;
  capacity!: number | null;
  notes!: string | null;
}

export class ClassroomResponseDto {
  id!: string;
  sectionId!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  sortOrder!: number;
  order!: number;
  capacity!: number | null;
  notes!: string | null;
}

export class DeleteStructureNodeResponseDto {
  ok!: true;
}

export class ClassroomTreeNodeDto extends ClassroomResponseDto {}

export class SectionTreeNodeDto extends SectionResponseDto {
  classrooms!: ClassroomTreeNodeDto[];
}

export class GradeTreeNodeDto extends GradeResponseDto {
  sections!: SectionTreeNodeDto[];
}

export class StageTreeNodeDto extends StageResponseDto {
  grades!: GradeTreeNodeDto[];
}

export class StructureTreeResponseDto {
  yearId!: string;
  termId!: string;
  stages!: StageTreeNodeDto[];
}
