export class StudentSubjectTeacherDto {
  teacherUserId!: string;
  displayName!: string;
}

export class StudentSubjectHierarchyNodeDto {
  id!: string;
  name!: string;
}

export class StudentSubjectGradeStatsDto {
  assessmentsCount!: number;
  gradedCount!: number;
  missingCount!: number;
  absentCount!: number;
  earnedScore!: number;
  maxScore!: number;
  averagePercent!: number | null;
}

export class StudentSubjectUnsupportedDto {
  lessons!: true;
  curriculumProgress!: true;
  resources!: true;
  reason!: string;
}

export class StudentSubjectCardDto {
  id!: string;
  subjectId!: string;
  name!: string;
  code!: string | null;
  teacher!: StudentSubjectTeacherDto | null;
  classroom!: StudentSubjectHierarchyNodeDto;
  grade!: StudentSubjectHierarchyNodeDto;
  section!: StudentSubjectHierarchyNodeDto;
  stats!: StudentSubjectGradeStatsDto;
  lessonsCount!: null;
  totalHours!: null;
  progress!: null;
  iconKey!: null;
  lessons_count!: null;
  total_hours!: null;
  icon_key!: null;
}

export class StudentSubjectsListResponseDto {
  subjects!: StudentSubjectCardDto[];
  unsupported!: StudentSubjectUnsupportedDto;
}

export class StudentSubjectDetailDto extends StudentSubjectCardDto {
  resources!: {
    attachmentsCount: number;
    unsupportedReason: string;
  };
}

export class StudentSubjectLessonDto {
  id!: string;
  title!: string;
  duration_minutes!: number;
  type_label!: string;
  watch_xp!: number;
}

export class StudentSubjectAssignmentDto {
  id!: string;
  title!: string;
  status!: 'pending' | 'completed';
  due_label!: string | null;
  xp!: number;
}

export class StudentSubjectAttachmentDto {
  fileId!: string;
  filename!: string;
  mimeType!: string;
  size!: number;
}

export class StudentSubjectDetailResponseDto {
  subject!: StudentSubjectDetailDto;
  lessons!: StudentSubjectLessonDto[];
  assignments!: StudentSubjectAssignmentDto[];
  attachments!: StudentSubjectAttachmentDto[];
  unsupported!: StudentSubjectUnsupportedDto;
}
