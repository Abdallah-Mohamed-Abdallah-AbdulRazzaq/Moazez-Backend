export type AcademicContentReviewQueueQuery = {
  academicYearId?: string;
  termId?: string;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
  subjectId?: string;
  teacherUserId?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type AcademicContentReviewPage = {
  page?: number;
  limit?: number;
};
