import type { Prisma } from '@prisma/client';
export type GradeAssetActor =
  | { surface: 'core' }
  | { surface: 'teacher'; classId: string; authoring?: true }
  | {
      surface: 'released-review';
      audience: 'STUDENT' | 'PARENT';
      studentId?: string;
      authorize: (
        tx: Prisma.TransactionClient,
        assessmentId: string,
      ) => Promise<void>;
    }
  | {
      surface: 'student-exams' | 'student-grades';
      authorize: (
        tx: Prisma.TransactionClient,
        assessmentId: string,
      ) => Promise<void>;
    };
export interface GradeAssetResource {
  assessmentId: string;
  questionId?: string;
  assetId?: string;
}
export const isGradeAssetStudent = (actor: GradeAssetActor): boolean =>
  actor.surface === 'student-exams' ||
  actor.surface === 'student-grades' ||
  actor.surface === 'released-review';
