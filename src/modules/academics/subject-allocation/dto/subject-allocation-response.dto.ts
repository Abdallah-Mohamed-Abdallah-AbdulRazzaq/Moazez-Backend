export class SubjectAllocationGradeResponseDto {
  id!: string;
  nameAr!: string;
  nameEn!: string;
}

export class SubjectAllocationSubjectResponseDto {
  id!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
  color!: string | null;
}

export class SubjectAllocationResponseDto {
  id!: string;
  academicYearId!: string;
  termId!: string;
  gradeId!: string;
  subjectId!: string;
  weeklyHours!: number;
  grade!: SubjectAllocationGradeResponseDto;
  subject!: SubjectAllocationSubjectResponseDto;
  createdAt!: string;
  updatedAt!: string;
}

export class SubjectAllocationsListResponseDto {
  items!: SubjectAllocationResponseDto[];
}

export class SubjectAllocationsBulkResponseDto extends SubjectAllocationsListResponseDto {}
