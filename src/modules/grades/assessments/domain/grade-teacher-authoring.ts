export const GRADE_TEACHER_AUTHORING_PERMISSION =
  'grades.teacher_authoring.manage';

/** Internal adapter contract, never a request-body authority or substituted actor. */
export interface GradeTeacherAuthoringActor {
  surface: 'teacher';
  authoring: true;
  classId: string;
  assessmentId: string;
  expectedQuestionUpdatedAt?: string;
}
