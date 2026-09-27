import type {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentType,
  AcademicGuardianNotePriority,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
} from '@prisma/client';

export type AcademicContentLibraryQuery = {
  academicYearId?: string;
  termId?: string;
  type?: AcademicContentType;
  status?: AcademicContentStatus;
  audience?: AcademicContentAudienceType;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
  subjectId?: string;
  teacherUserId?: string;
  resourceCategory?: AcademicSubjectResourceCategory;
  weeklyDateFrom?: string;
  weeklyDateTo?: string;
  sessionStartAtFrom?: string;
  sessionStartAtTo?: string;
  sessionPlatform?: AcademicOnlineSessionPlatform;
  guardianPriority?: AcademicGuardianNotePriority;
  tag?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type AcademicContentLibraryResolvedScope = {
  kind: 'STAGE' | 'GRADE' | 'SECTION' | 'CLASSROOM';
  stageId: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
};
