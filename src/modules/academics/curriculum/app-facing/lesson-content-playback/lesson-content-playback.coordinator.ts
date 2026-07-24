import { Injectable } from '@nestjs/common';
import {
  FileUploadPurpose,
  FileUploadSessionStatus,
  LessonContentItemType,
  LessonContentPublicationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { StorageService } from '../../../../../infrastructure/storage/storage.service';
import { LessonContentPlaybackPresenter } from './lesson-content-playback.presenter';
import type { LessonContentPlaybackResponseDto } from './lesson-content-playback-response.dto';
import type {
  LessonContentPlaybackCandidate,
  LessonContentPlaybackPolicy,
  LessonContentPlaybackRequest,
  PlayableVideoMimeType,
} from './lesson-content-playback.types';

export const LESSON_CONTENT_PLAYBACK_TTL_SECONDS = 300;

type LessonPlanItemReader = Pick<Prisma.TransactionClient, 'lessonPlanItem'>;

@Injectable()
export class LessonContentPlaybackCoordinator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async execute(
    request: LessonContentPlaybackRequest,
  ): Promise<LessonContentPlaybackResponseDto | null> {
    return this.withPlayableMedia(request, async (playable) => {
      const capability = await this.storageService.createDownloadUrl({
        bucket: playable.bucket,
        objectKey: playable.objectKey,
        expiresInSeconds: LESSON_CONTENT_PLAYBACK_TTL_SECONDS,
        disposition: 'inline',
        contentType: playable.mimeType,
      });

      return LessonContentPlaybackPresenter.present({
        url: capability.url,
        expiresAt: capability.expiresAt,
        mimeType: playable.mimeType,
        sizeBytes: playable.sizeBytes,
      });
    });
  }

  async withPlayableMedia<T>(
    request: LessonContentPlaybackRequest,
    operation: (
      playable: LessonContentPlaybackCandidate['record'],
    ) => Promise<T>,
  ): Promise<T | null> {
    const candidate = await this.findCandidate(this.scopedPrisma, request);
    if (!candidate) return null;

    return this.prisma.$transaction(
      async (transaction) => {
        if (!(await request.lockAuthorization(transaction, candidate))) {
          return null;
        }

        if (!(await lockPlayableMedia(transaction, request, candidate))) {
          return null;
        }

        const revalidated = await this.findCandidate(transaction, request);
        if (!revalidated || !samePlaybackCandidate(candidate, revalidated)) {
          return null;
        }

        return operation(revalidated.record);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  }

  private async findCandidate(
    client: LessonPlanItemReader,
    request: Omit<LessonContentPlaybackRequest, 'lockAuthorization'>,
  ): Promise<LessonContentPlaybackCandidate | null> {
    const contentWhere = playableContentWhere(request);
    const item = await client.lessonPlanItem.findFirst({
      where: {
        AND: [
          { id: request.lessonPlanItemId },
          request.visibilityWhere,
          {
            schoolId: request.schoolId,
            deletedAt: null,
            lesson: {
              is: {
                schoolId: request.schoolId,
                deletedAt: null,
                contentItems: { some: contentWhere },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        lessonPlanId: true,
        curriculumId: true,
        unitId: true,
        lessonId: true,
        lessonPlan: {
          select: {
            id: true,
            academicYearId: true,
            termId: true,
            teacherSubjectAllocationId: true,
            teacherUserId: true,
            subjectId: true,
            classroomId: true,
            classroom: {
              select: {
                sectionId: true,
                section: {
                  select: {
                    gradeId: true,
                    grade: { select: { stageId: true } },
                  },
                },
              },
            },
          },
        },
        lesson: {
          select: {
            contentItems: {
              where: contentWhere,
              take: 1,
              select: {
                id: true,
                curriculumId: true,
                unitId: true,
                lessonId: true,
                publicationStatus: true,
                fileId: true,
                file: {
                  select: {
                    id: true,
                    bucket: true,
                    objectKey: true,
                    mimeType: true,
                    sizeBytes: true,
                    schoolId: true,
                    organizationId: true,
                    uploadSession: {
                      select: {
                        id: true,
                        purpose: true,
                        status: true,
                        fileId: true,
                        schoolId: true,
                        organizationId: true,
                        finalBucket: true,
                        finalObjectKey: true,
                        finalCleanupClaimedAt: true,
                        finalObjectDeletedAt: true,
                        verifiedMimeType: true,
                        actualSizeBytes: true,
                        durationSeconds: true,
                        width: true,
                        height: true,
                        verifiedAt: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const contentItem = item?.lesson.contentItems[0];
    const file = contentItem?.file;
    const session = file?.uploadSession;
    if (!item || !contentItem || !file || !session || !contentItem.fileId) {
      return null;
    }

    if (
      contentItem.curriculumId !== item.curriculumId ||
      contentItem.unitId !== item.unitId ||
      contentItem.lessonId !== item.lessonId ||
      contentItem.fileId !== file.id ||
      file.schoolId !== request.schoolId ||
      file.organizationId !== request.organizationId ||
      session.schoolId !== request.schoolId ||
      session.organizationId !== request.organizationId ||
      session.fileId !== file.id ||
      session.purpose !== FileUploadPurpose.LESSON_CONTENT ||
      session.status !== FileUploadSessionStatus.READY ||
      session.finalCleanupClaimedAt ||
      session.finalObjectDeletedAt ||
      session.finalBucket !== file.bucket ||
      session.finalObjectKey !== file.objectKey ||
      session.verifiedMimeType !== file.mimeType ||
      session.actualSizeBytes !== file.sizeBytes ||
      !session.verifiedAt ||
      session.durationSeconds === null ||
      session.width === null ||
      session.height === null ||
      !isPlayableVideoMime(file.mimeType)
    ) {
      return null;
    }

    return {
      lessonPlanItemId: item.id,
      lessonPlanId: item.lessonPlan.id,
      academicYearId: item.lessonPlan.academicYearId,
      termId: item.lessonPlan.termId,
      teacherSubjectAllocationId: item.lessonPlan.teacherSubjectAllocationId,
      teacherUserId: item.lessonPlan.teacherUserId,
      subjectId: item.lessonPlan.subjectId,
      classroomId: item.lessonPlan.classroomId,
      sectionId: item.lessonPlan.classroom.sectionId,
      gradeId: item.lessonPlan.classroom.section.gradeId,
      stageId: item.lessonPlan.classroom.section.grade.stageId,
      curriculumId: item.curriculumId,
      unitId: item.unitId,
      lessonId: item.lessonId,
      contentItemId: contentItem.id,
      publicationStatus: contentItem.publicationStatus,
      fileId: file.id,
      uploadSessionId: session.id,
      record: {
        bucket: file.bucket,
        objectKey: file.objectKey,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      },
    };
  }
}

function playableContentWhere(
  request: Pick<
    LessonContentPlaybackRequest,
    'schoolId' | 'organizationId' | 'contentItemId' | 'policy'
  >,
): Prisma.LessonContentItemWhereInput {
  return {
    id: request.contentItemId,
    schoolId: request.schoolId,
    deletedAt: null,
    publicationStatus:
      request.policy.content === 'PUBLISHED'
        ? LessonContentPublicationStatus.PUBLISHED
        : {
            in: [
              LessonContentPublicationStatus.DRAFT,
              LessonContentPublicationStatus.PUBLISHED,
            ],
          },
    type: LessonContentItemType.FILE,
    file: {
      is: {
        schoolId: request.schoolId,
        organizationId: request.organizationId,
        deletedAt: null,
        uploadSession: {
          is: {
            schoolId: request.schoolId,
            organizationId: request.organizationId,
            purpose: FileUploadPurpose.LESSON_CONTENT,
            status: FileUploadSessionStatus.READY,
            finalCleanupClaimedAt: null,
            finalObjectDeletedAt: null,
            verifiedAt: { not: null },
            verifiedMimeType: { in: ['video/mp4', 'video/webm'] },
            actualSizeBytes: { not: null },
            durationSeconds: { not: null },
            width: { not: null },
            height: { not: null },
          },
        },
      },
    },
  };
}

async function lockPlayableMedia(
  transaction: Prisma.TransactionClient,
  request: Pick<
    LessonContentPlaybackRequest,
    'schoolId' | 'organizationId' | 'policy'
  >,
  candidate: LessonContentPlaybackCandidate,
): Promise<boolean> {
  const curriculumStatus = curriculumStatusSql(request.policy);
  const contentStatus = contentStatusSql(request.policy);
  const hierarchy = await transaction.$queryRaw<Array<{ lessonId: string }>>(
    Prisma.sql`
      SELECT lesson."id" AS "lessonId"
      FROM "curricula" AS curriculum
      INNER JOIN "curriculum_units" AS unit
        ON unit."id" = ${candidate.unitId}::uuid
        AND unit."school_id" = curriculum."school_id"
        AND unit."curriculum_id" = curriculum."id"
        AND unit."deleted_at" IS NULL
      INNER JOIN "curriculum_lessons" AS lesson
        ON lesson."id" = ${candidate.lessonId}::uuid
        AND lesson."school_id" = curriculum."school_id"
        AND lesson."curriculum_id" = curriculum."id"
        AND lesson."unit_id" = unit."id"
        AND lesson."deleted_at" IS NULL
      WHERE curriculum."id" = ${candidate.curriculumId}::uuid
        AND curriculum."school_id" = ${request.schoolId}::uuid
        AND curriculum."academic_year_id" = ${candidate.academicYearId}::uuid
        AND curriculum."term_id" = ${candidate.termId}::uuid
        AND ${curriculumStatus}
        AND curriculum."deleted_at" IS NULL
      FOR SHARE OF curriculum, unit, lesson
    `,
  );
  if (hierarchy.length !== 1) return false;

  const uploadSessions = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "file_upload_sessions"
      WHERE "id" = ${candidate.uploadSessionId}::uuid
        AND "file_id" = ${candidate.fileId}::uuid
        AND "school_id" = ${request.schoolId}::uuid
        AND "organization_id" = ${request.organizationId}::uuid
        AND "purpose" = 'LESSON_CONTENT'
        AND "status" = 'READY'
        AND "final_cleanup_claimed_at" IS NULL
        AND "final_object_deleted_at" IS NULL
      FOR SHARE
    `,
  );
  if (uploadSessions.length !== 1) return false;

  const files = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "files"
    WHERE "id" = ${candidate.fileId}::uuid
      AND "school_id" = ${request.schoolId}::uuid
      AND "organization_id" = ${request.organizationId}::uuid
      AND "deleted_at" IS NULL
    FOR SHARE
  `);
  if (files.length !== 1) return false;

  const contentItems = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "lesson_content_items"
      WHERE "id" = ${candidate.contentItemId}::uuid
        AND "school_id" = ${request.schoolId}::uuid
        AND "curriculum_id" = ${candidate.curriculumId}::uuid
        AND "unit_id" = ${candidate.unitId}::uuid
        AND "lesson_id" = ${candidate.lessonId}::uuid
        AND "file_id" = ${candidate.fileId}::uuid
        AND "type" = 'FILE'
        AND ${contentStatus}
        AND "deleted_at" IS NULL
      FOR SHARE
    `,
  );

  return contentItems.length === 1;
}

function curriculumStatusSql(policy: LessonContentPlaybackPolicy): Prisma.Sql {
  return policy.curriculum === 'ACTIVE'
    ? Prisma.sql`curriculum."status" = 'ACTIVE'`
    : Prisma.sql`curriculum."status" <> 'ARCHIVED'`;
}

function contentStatusSql(policy: LessonContentPlaybackPolicy): Prisma.Sql {
  return policy.content === 'PUBLISHED'
    ? Prisma.sql`"publication_status" = 'PUBLISHED'`
    : Prisma.sql`"publication_status" IN ('DRAFT', 'PUBLISHED')`;
}

export function samePlaybackCandidate(
  before: LessonContentPlaybackCandidate,
  after: LessonContentPlaybackCandidate,
): boolean {
  return (
    before.lessonPlanItemId === after.lessonPlanItemId &&
    before.lessonPlanId === after.lessonPlanId &&
    before.academicYearId === after.academicYearId &&
    before.termId === after.termId &&
    before.teacherSubjectAllocationId === after.teacherSubjectAllocationId &&
    before.teacherUserId === after.teacherUserId &&
    before.subjectId === after.subjectId &&
    before.classroomId === after.classroomId &&
    before.sectionId === after.sectionId &&
    before.gradeId === after.gradeId &&
    before.stageId === after.stageId &&
    before.curriculumId === after.curriculumId &&
    before.unitId === after.unitId &&
    before.lessonId === after.lessonId &&
    before.contentItemId === after.contentItemId &&
    before.publicationStatus === after.publicationStatus &&
    before.fileId === after.fileId &&
    before.uploadSessionId === after.uploadSessionId &&
    before.record.bucket === after.record.bucket &&
    before.record.objectKey === after.record.objectKey &&
    before.record.mimeType === after.record.mimeType &&
    before.record.sizeBytes === after.record.sizeBytes
  );
}

function isPlayableVideoMime(value: string): value is PlayableVideoMimeType {
  return value === 'video/mp4' || value === 'video/webm';
}
