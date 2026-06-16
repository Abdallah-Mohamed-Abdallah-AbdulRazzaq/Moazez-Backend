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

export class TeacherAllocationsBulkResponseDto extends TeacherAllocationsListResponseDto {
  summary!: {
    requestedCount: number;
    createdCount: number;
    existingCount: number;
  };
}

export class ApplyTeacherAllocationToGradeResponseDto extends TeacherAllocationsListResponseDto {
  summary!: {
    requestedClassrooms: number;
    createdCount: number;
    existingCount: number;
  };
}

export class ClearTeacherAllocationsResponseDto {
  ok!: boolean;
  deletedCount!: number;
}

export class DeleteTeacherAllocationResponseDto {
  ok!: boolean;
}

export type TeacherAllocationValidationStatus =
  | 'complete'
  | 'incomplete'
  | 'missing_subject_allocation';

export class TeacherAllocationValidationIssueDto {
  code!: string;
  message!: string;
  classroomIds?: string[];
}

export class TeacherAllocationValidationItemDto {
  gradeId!: string | null;
  grade!: { id: string; nameAr: string; nameEn: string } | null;
  subjectId!: string | null;
  subject!: {
    id: string;
    nameAr: string;
    nameEn: string;
    code: string | null;
    color: string | null;
  } | null;
  weeklyHours!: number | null;
  classroomCount!: number;
  allocatedClassroomCount!: number;
  missingClassroomCount!: number;
  status!: TeacherAllocationValidationStatus;
  issues!: TeacherAllocationValidationIssueDto[];
}

export class TeacherAllocationValidationResponseDto {
  termId!: string;
  academicYearId!: string;
  summary!: {
    gradesChecked: number;
    subjectAllocationRows: number;
    teacherAllocationRows: number;
    missingTeacherAssignments: number;
    missingSubjectAllocationRows: number;
    overAllocatedSubjects: number;
    underAllocatedSubjects: number;
  };
  items!: TeacherAllocationValidationItemDto[];
}

export class TeacherLoadWarningDto {
  code!: string;
  message!: string;
  allocationId?: string;
  subjectId?: string;
  classroomId?: string;
}

export class TeacherLoadDetailDto {
  allocationId!: string;
  subjectId!: string;
  subject!: {
    id: string;
    nameAr: string;
    nameEn: string;
    code: string | null;
    color: string | null;
  };
  classroomId!: string;
  classroom!: { id: string; nameAr: string; nameEn: string };
  gradeId!: string;
  grade!: { id: string; nameAr: string; nameEn: string };
  weeklyHours!: number | null;
}

export class TeacherLoadItemDto {
  teacherUserId!: string;
  teacher!: {
    id: string;
    firstName: string;
    lastName: string;
  };
  allocationCount!: number;
  totalWeeklyHours!: number;
  classroomsCount!: number;
  subjectsCount!: number;
  loads!: TeacherLoadDetailDto[];
  warnings!: TeacherLoadWarningDto[];
}

export class TeacherLoadsResponseDto {
  termId!: string;
  academicYearId!: string;
  items!: TeacherLoadItemDto[];
}
