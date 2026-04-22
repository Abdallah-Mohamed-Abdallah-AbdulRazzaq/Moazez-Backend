export class TeacherSummaryDto {
  id!: string;
  fullName!: string;
  email!: string;
}

export class AllocationSubjectSummaryDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
}

export class AllocationClassroomSummaryDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  sectionId!: string;
  roomId!: string | null;
}

export class AllocationTermSummaryDto {
  id!: string;
  academicYearId!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  status!: 'open' | 'closed';
}

export class TeacherAllocationResponseDto {
  id!: string;
  teacher!: TeacherSummaryDto;
  subject!: AllocationSubjectSummaryDto;
  classroom!: AllocationClassroomSummaryDto;
  term!: AllocationTermSummaryDto;
  createdAt!: string;
}

export class TeacherAllocationsListResponseDto {
  items!: TeacherAllocationResponseDto[];
}

export class DeleteTeacherAllocationResponseDto {
  ok!: boolean;
}
