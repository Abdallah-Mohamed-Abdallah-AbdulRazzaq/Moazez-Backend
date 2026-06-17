import { IsOptional, IsUUID } from 'class-validator';

export class GetGradesBootstrapQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;
}

export class GradesBootstrapAcademicYearResponseDto {
  id!: string;
  nameAr!: string | null;
  nameEn!: string | null;
  isActive!: boolean;
}

export class GradesBootstrapTermResponseDto {
  id!: string;
  academicYearId!: string;
  nameAr!: string | null;
  nameEn!: string | null;
  startDate!: string | null;
  endDate!: string | null;
  isActive!: boolean;
}

export class GradesBootstrapStageResponseDto {
  id!: string;
  nameAr!: string | null;
  nameEn!: string | null;
  sortOrder!: number | null;
}

export class GradesBootstrapGradeResponseDto {
  id!: string;
  stageId!: string;
  nameAr!: string | null;
  nameEn!: string | null;
  sortOrder!: number | null;
}

export class GradesBootstrapSectionResponseDto {
  id!: string;
  gradeId!: string;
  nameAr!: string | null;
  nameEn!: string | null;
  sortOrder!: number | null;
}

export class GradesBootstrapClassroomResponseDto {
  id!: string;
  sectionId!: string;
  gradeId!: string | null;
  nameAr!: string | null;
  nameEn!: string | null;
  isActive!: boolean;
}

export class GradesBootstrapSubjectResponseDto {
  id!: string;
  nameAr!: string | null;
  nameEn!: string | null;
  code!: string | null;
  isActive!: boolean;
}

export class GradesBootstrapDefaultsResponseDto {
  academicYearId!: string | null;
  termId!: string | null;
}

export class GradesBootstrapResponseDto {
  academicYears!: GradesBootstrapAcademicYearResponseDto[];
  terms!: GradesBootstrapTermResponseDto[];
  stages!: GradesBootstrapStageResponseDto[];
  grades!: GradesBootstrapGradeResponseDto[];
  sections!: GradesBootstrapSectionResponseDto[];
  classrooms!: GradesBootstrapClassroomResponseDto[];
  subjects!: GradesBootstrapSubjectResponseDto[];
  defaults!: GradesBootstrapDefaultsResponseDto;
  supportedScopes!: Array<'school' | 'stage' | 'grade' | 'section' | 'classroom'>;
  assessmentTypes!: string[];
  deliveryModes!: string[];
  approvalStatuses!: string[];
}
