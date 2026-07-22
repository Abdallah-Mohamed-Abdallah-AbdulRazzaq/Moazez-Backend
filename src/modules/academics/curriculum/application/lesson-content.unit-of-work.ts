import type {
  LessonContentPublicationStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import type {
  ConditionalLessonContentItemUpdateResult,
  LessonContentItemRecord,
  LessonContentScopeRecord,
} from '../infrastructure/lesson-content.repository';

export type LessonContentPath = {
  curriculumId: string;
  unitId: string;
  lessonId: string;
};

export type LessonContentItemPath = LessonContentPath & {
  contentItemId: string;
};

export type LessonContentSuccessfulAuditEntry = {
  actorId: string;
  userType: UserType;
  organizationId: string;
  schoolId: string;
  action: string;
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export interface LessonContentTransactionContext {
  lockLessonContentScope(
    path: LessonContentPath,
  ): Promise<LessonContentScopeRecord>;
  getNextSortOrder(path: LessonContentPath): Promise<number>;
  lockLiveFile(fileId: string): Promise<boolean>;
  createContentItem(
    data: Prisma.LessonContentItemUncheckedCreateInput,
  ): Promise<LessonContentItemRecord>;
  updateContentItemConditionally(input: {
    curriculumId: string;
    unitId: string;
    lessonId: string;
    contentItemId: string;
    expectedPublicationStatus: LessonContentPublicationStatus;
    expectedUpdatedAt: Date;
    data: Prisma.LessonContentItemUncheckedUpdateManyInput;
  }): Promise<ConditionalLessonContentItemUpdateResult>;
  writeSuccessfulAudit(entry: LessonContentSuccessfulAuditEntry): Promise<void>;
}

export abstract class LessonContentUnitOfWork {
  abstract execute<T>(
    schoolId: string,
    callback: (context: LessonContentTransactionContext) => Promise<T>,
  ): Promise<T>;
}
