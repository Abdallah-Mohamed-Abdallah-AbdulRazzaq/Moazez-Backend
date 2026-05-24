export class HomeworkNamedReferenceDto {
  id!: string;
  name!: string;
  nameAr?: string | null;
  nameEn?: string | null;
}

export class HomeworkClassroomReferenceDto extends HomeworkNamedReferenceDto {
  section?: HomeworkNamedReferenceDto | null;
  grade?: HomeworkNamedReferenceDto | null;
}

export class HomeworkSubjectReferenceDto extends HomeworkNamedReferenceDto {
  code?: string | null;
  color?: string | null;
}

export class HomeworkTeacherReferenceDto {
  userId!: string;
  fullName!: string;
}

export class HomeworkCountersDto {
  totalTargets!: number;
  assigned!: number;
  viewed!: number;
  submitted!: number;
  late!: number;
  missing!: number;
  reviewed!: number;
  excused!: number;
}

export class HomeworkAssignmentResponseDto {
  id!: string;
  title!: string;
  description!: string | null;
  mode!: string;
  status!: string;
  targetMode!: string;
  academicYear!: HomeworkNamedReferenceDto;
  term!: HomeworkNamedReferenceDto & {
    startDate: string;
    endDate: string;
  };
  classroom!: HomeworkClassroomReferenceDto;
  subject!: HomeworkSubjectReferenceDto;
  teacher!: HomeworkTeacherReferenceDto;
  teacherSubjectAllocationId!: string;
  timetableEntryId!: string | null;
  scheduleDate!: string | null;
  publishAt!: string | null;
  publishedAt!: string | null;
  dueAt!: string;
  closedAt!: string | null;
  estimatedMinutes!: number | null;
  totalMarks!: number | null;
  isGraded!: boolean;
  counters!: HomeworkCountersDto;
  createdAt!: string;
  updatedAt!: string;
}

export class HomeworkAssignmentsListResponseDto {
  items!: HomeworkAssignmentResponseDto[];
  meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class HomeworkTargetStudentResponseDto {
  id!: string;
  displayName!: string;
}

export class HomeworkTargetResponseDto {
  targetId!: string;
  studentId!: string;
  enrollmentId!: string;
  student!: HomeworkTargetStudentResponseDto;
  status!: string;
  assignedAt!: string;
  viewedAt!: string | null;
  submittedAt!: string | null;
  reviewedAt!: string | null;
  excusedAt!: string | null;
}

export class HomeworkTargetsListResponseDto {
  items!: HomeworkTargetResponseDto[];
}
