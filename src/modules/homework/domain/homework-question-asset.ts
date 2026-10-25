export type HomeworkAssetActor =
  | { surface: 'core' }
  | { surface: 'teacher'; classId: string }
  | { surface: 'student'; student: HomeworkAssetStudentContext };
export interface HomeworkAssetStudentContext {
  studentId: string;
  enrollmentId: string;
  classroomId: string;
  academicYearId: string;
  termId: string | null;
}
export interface HomeworkAssetResource {
  homeworkId: string;
  questionId: string;
  assetId?: string;
}

export {
  assetDisplayText,
  assetCategoryForMime,
  assessmentAssetExternalUrl as homeworkAssetExternalUrl,
} from '../../files/assessment-media/domain/assessment-asset-content';
