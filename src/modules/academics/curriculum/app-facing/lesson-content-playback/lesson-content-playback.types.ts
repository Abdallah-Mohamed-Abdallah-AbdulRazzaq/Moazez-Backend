import type { LessonContentPublicationStatus, Prisma } from '@prisma/client';

export type PlayableVideoMimeType = 'video/mp4' | 'video/webm';

export type LessonContentPlayableMediaRecord = {
  bucket: string;
  objectKey: string;
  mimeType: PlayableVideoMimeType;
  sizeBytes: bigint;
};

export type LessonContentPlaybackCandidate = {
  lessonPlanItemId: string;
  lessonPlanId: string;
  academicYearId: string;
  termId: string;
  teacherSubjectAllocationId: string;
  teacherUserId: string;
  subjectId: string;
  classroomId: string;
  sectionId: string;
  gradeId: string;
  stageId: string;
  curriculumId: string;
  unitId: string;
  lessonId: string;
  contentItemId: string;
  publicationStatus: LessonContentPublicationStatus;
  fileId: string;
  uploadSessionId: string;
  record: LessonContentPlayableMediaRecord;
};

export type LessonContentPlaybackPolicy = {
  curriculum: 'ACTIVE' | 'NOT_ARCHIVED';
  content: 'PUBLISHED' | 'DRAFT_OR_PUBLISHED';
};

export type LessonContentPlaybackRequest = {
  schoolId: string;
  organizationId: string;
  lessonPlanItemId: string;
  contentItemId: string;
  visibilityWhere: Prisma.LessonPlanItemWhereInput;
  policy: LessonContentPlaybackPolicy;
  lockAuthorization: (
    transaction: Prisma.TransactionClient,
    candidate: LessonContentPlaybackCandidate,
  ) => Promise<boolean>;
};
