import type {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentType,
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
