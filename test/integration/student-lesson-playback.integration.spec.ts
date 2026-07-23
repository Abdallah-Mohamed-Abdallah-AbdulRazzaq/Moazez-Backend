import { randomUUID } from 'node:crypto';
import {
  CurriculumStatus,
  type FileUploadSession,
  FileUploadPurpose,
  FileUploadSessionStatus,
  FileVisibility,
  LessonContentItemType,
  LessonContentPublicationStatus,
  LessonPlanItemStatus,
  LessonPlanStatus,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { GetStudentLessonPlaybackUseCase } from '../../src/modules/student-app/lessons/application/get-student-lesson-playback.use-case';
import {
  StudentLessonPlayableContentRecord,
  StudentLessonsReadAdapter,
} from '../../src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../src/modules/student-app/shared/student-app.types';

jest.setTimeout(120_000);

type BaseFixture = {
  organizationId: string;
  schoolId: string;
  teacherUserId: string;
  studentUserId: string;
  academicYearId: string;
  termId: string;
  stageId: string;
  gradeId: string;
  sectionId: string;
  classroomId: string;
  subjectId: string;
  allocationId: string;
  curriculumId: string;
  unitId: string;
  lessonId: string;
  lessonPlanId: string;
  lessonPlanItemId: string;
  studentId: string;
  membershipId: string;
  roleId: string;
  enrollmentId: string;
};

type MediaFixture = {
  contentItemId: string;
  fileId: string;
  uploadSessionId: string;
  mimeType: 'video/mp4' | 'video/webm';
  sizeBytes: bigint;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value?: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

describe('Student lesson secure playback PostgreSQL boundary', () => {
  const prisma = new PrismaService();
  const observer = new PrismaClient({
    datasourceUrl: buildObserverDatabaseUrl(),
  });
  const adapter = new StudentLessonsReadAdapter(prisma);
  const marker = `student-playback-${randomUUID().split('-')[0]}`;
  const mediaFixtures: MediaFixture[] = [];
  const extraLessonIds: string[] = [];
  let fixture: BaseFixture;
  let mp4: MediaFixture;
  let webm: MediaFixture;

  beforeAll(async () => {
    await prisma.$connect();
    await observer.$connect();
    fixture = await createBaseFixture(prisma, marker);
    mp4 = await createReadyVideo(prisma, fixture, marker, 'mp4', 'video/mp4');
    webm = await createReadyVideo(
      prisma,
      fixture,
      marker,
      'webm',
      'video/webm',
    );
    mediaFixtures.push(mp4, webm);
  });

  afterAll(async () => {
    try {
      await cleanupFixture(prisma, fixture, mediaFixtures, extraLessonIds);
    } finally {
      try {
        await observer.$disconnect();
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it.each([
    ['MP4', () => mp4, 'video/mp4'],
    ['WebM', () => webm, 'video/webm'],
  ] as const)(
    'returns an exact eligible %s record and remains renewable without writes',
    async (_label, getMedia, expectedMime) => {
      const media = getMedia();
      const auditBefore = await prisma.auditLog.count({
        where: { schoolId: fixture.schoolId },
      });
      const sessionBefore = await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: media.uploadSessionId },
        select: { updatedAt: true },
      });

      const first = await findPlayable(media);
      const second = await findPlayable(media);

      expect(first).toEqual({
        bucket: `${marker}-final`,
        objectKey: `${marker}/${expectedMime}/final`,
        mimeType: expectedMime,
        sizeBytes: media.sizeBytes,
      });
      expect(second).toEqual(first);
      expect(
        await prisma.auditLog.count({ where: { schoolId: fixture.schoolId } }),
      ).toBe(auditBefore);
      await expect(
        prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: media.uploadSessionId },
          select: { updatedAt: true },
        }),
      ).resolves.toEqual(sessionBefore);
    },
  );

  it.each(authorizationMutationCases())(
    'returns no capability when $label wins before the authorization gate',
    async ({ mutate, restore }) => {
      const mutationHeld = deferred<void>();
      const releaseMutation = deferred<void>();
      let signedCount = 0;
      let playback:
        | Promise<StudentLessonPlayableContentRecord | null>
        | undefined;
      const mutation = prisma.$transaction(async (transaction) => {
        await mutate(transaction);
        mutationHeld.resolve();
        await releaseMutation.promise;
      });

      try {
        await mutationHeld.promise;
        playback = inStudentScope(() =>
          adapter.withPlayableLessonContent(playbackParams(mp4), (record) => {
            signedCount += 1;
            return Promise.resolve(record);
          }),
        );
        await waitUntilAnyBackendIsBlocked();
        releaseMutation.resolve();
        await mutation;
        await expect(playback).resolves.toBeNull();
        expect(signedCount).toBe(0);
      } finally {
        releaseMutation.resolve();
        await Promise.allSettled([mutation, ...(playback ? [playback] : [])]);
        await restore();
      }
    },
  );

  it.each(authorizationMutationCases())(
    'holds $label until protected signing completes',
    async ({ mutate, restore }) => {
      const signingStarted = deferred<void>();
      const releaseSigning = deferred<void>();
      let signedCount = 0;
      const playback = inStudentScope(() =>
        adapter.withPlayableLessonContent(
          playbackParams(mp4),
          async (record) => {
            signingStarted.resolve();
            await releaseSigning.promise;
            signedCount += 1;
            return record;
          },
        ),
      );
      await signingStarted.promise;

      let mutationSettled = false;
      const mutation = prisma
        .$transaction((transaction) => mutate(transaction))
        .finally(() => {
          mutationSettled = true;
        });

      try {
        await waitUntilAnyBackendIsBlocked();
        expect(mutationSettled).toBe(false);
        releaseSigning.resolve();
        await expect(playback).resolves.toMatchObject({
          mimeType: 'video/mp4',
        });
        await mutation;
        expect(signedCount).toBe(1);
        await expect(findPlayable(mp4)).resolves.toBeNull();
      } finally {
        releaseSigning.resolve();
        await Promise.allSettled([playback, mutation]);
        await restore();
      }
    },
  );

  it('returns the exact public use-case contract without an AuditLog write', async () => {
    const storage = {
      createDownloadUrl: jest.fn().mockResolvedValue({
        url: 'https://storage.invalid/playback',
        expiresAt: new Date('2026-07-23T12:05:00.000Z'),
      }),
    };
    const access = {
      getCurrentStudentWithEnrollment: jest
        .fn()
        .mockResolvedValue(currentStudent()),
    };
    const useCase = new GetStudentLessonPlaybackUseCase(
      access as unknown as StudentAppAccessService,
      adapter,
      storage as unknown as StorageService,
    );
    const before = await prisma.auditLog.count({
      where: { schoolId: fixture.schoolId },
    });

    const response = await inStudentScope(() =>
      useCase.execute({
        lessonPlanItemId: fixture.lessonPlanItemId,
        contentItemId: mp4.contentItemId,
      }),
    );

    expect(response).toEqual({
      url: 'https://storage.invalid/playback',
      expiresAt: '2026-07-23T12:05:00.000Z',
      mimeType: 'video/mp4',
      sizeBytes: mp4.sizeBytes.toString(10),
      disposition: 'inline',
      renewable: true,
    });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith({
      bucket: `${marker}-final`,
      objectKey: `${marker}/video/mp4/final`,
      expiresInSeconds: 300,
      disposition: 'inline',
      contentType: 'video/mp4',
    });
    expect(
      await prisma.auditLog.count({ where: { schoolId: fixture.schoolId } }),
    ).toBe(before);
  });

  it('rejects a content item from another lesson and a same-school unrelated File', async () => {
    const otherLesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: fixture.schoolId,
        curriculumId: fixture.curriculumId,
        unitId: fixture.unitId,
        title: `${marker}-other-lesson`,
        sortOrder: 2,
      },
      select: { id: true },
    });
    extraLessonIds.push(otherLesson.id);
    const otherContent = await prisma.lessonContentItem.create({
      data: {
        schoolId: fixture.schoolId,
        curriculumId: fixture.curriculumId,
        unitId: fixture.unitId,
        lessonId: otherLesson.id,
        type: LessonContentItemType.FILE,
        title: `${marker}-other-content`,
        fileId: mp4.fileId,
        sortOrder: 1,
        createdByUserId: fixture.teacherUserId,
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: fixture.teacherUserId,
      },
      select: { id: true },
    });

    await expect(
      findByIds(fixture.lessonPlanItemId, otherContent.id),
    ).resolves.toBeNull();

    const unrelatedFile = await prisma.file.create({
      data: {
        organizationId: fixture.organizationId,
        schoolId: fixture.schoolId,
        uploaderId: fixture.teacherUserId,
        bucket: `${marker}-unrelated`,
        objectKey: `${marker}/unrelated`,
        originalName: 'unrelated.mp4',
        mimeType: 'video/mp4',
        sizeBytes: BigInt(1024),
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    try {
      await prisma.lessonContentItem.update({
        where: { id: mp4.contentItemId },
        data: { fileId: unrelatedFile.id },
      });
      await expect(findPlayable(mp4)).resolves.toBeNull();
    } finally {
      await prisma.lessonContentItem.update({
        where: { id: mp4.contentItemId },
        data: { fileId: mp4.fileId },
      });
      await prisma.file.delete({ where: { id: unrelatedFile.id } });
      await prisma.lessonContentItem.delete({ where: { id: otherContent.id } });
    }

    for (const contextOverride of [
      { classroomId: randomUUID() },
      { academicYearId: randomUUID() },
      { termId: randomUUID() },
      { schoolId: randomUUID(), organizationId: randomUUID() },
    ]) {
      await expect(
        inStudentScope(() =>
          adapter.findPlayableLessonContent({
            context: { ...currentStudent().context, ...contextOverride },
            lessonPlanItemId: fixture.lessonPlanItemId,
            contentItemId: mp4.contentItemId,
          }),
        ),
      ).resolves.toBeNull();
    }

    const staleSubject = await prisma.subject.create({
      data: {
        schoolId: fixture.schoolId,
        nameAr: `${marker}-stale-subject-ar`,
        nameEn: `${marker}-stale-subject`,
        code: `${marker.slice(0, 22).toUpperCase()}-STALE`,
        isActive: true,
      },
    });
    try {
      await prisma.teacherSubjectAllocation.update({
        where: { id: fixture.allocationId },
        data: { subjectId: staleSubject.id },
      });
      await expect(findPlayable(mp4)).resolves.toMatchObject({
        mimeType: 'video/mp4',
      });
    } finally {
      await prisma.teacherSubjectAllocation.update({
        where: { id: fixture.allocationId },
        data: { subjectId: fixture.subjectId },
      });
      await prisma.subject.delete({ where: { id: staleSubject.id } });
    }
  });

  it('collapses DRAFT, ARCHIVED, deleted File, cleanup claim, and metadata mismatch', async () => {
    await withRestoredMutation(
      () =>
        prisma.lessonContentItem.update({
          where: { id: mp4.contentItemId },
          data: {
            publicationStatus: LessonContentPublicationStatus.DRAFT,
            publishedAt: null,
            publishedByUserId: null,
          },
        }),
      restorePublished,
      () => expect(findPlayable(mp4)).resolves.toBeNull(),
    );
    await withRestoredMutation(
      () =>
        prisma.lessonContentItem.update({
          where: { id: mp4.contentItemId },
          data: {
            publicationStatus: LessonContentPublicationStatus.ARCHIVED,
            archivedAt: new Date(),
            archivedByUserId: fixture.teacherUserId,
          },
        }),
      restorePublished,
      () => expect(findPlayable(mp4)).resolves.toBeNull(),
    );
    await withRestoredMutation(
      () =>
        prisma.file.update({
          where: { id: mp4.fileId },
          data: { deletedAt: new Date() },
        }),
      () =>
        prisma.file.update({
          where: { id: mp4.fileId },
          data: { deletedAt: null },
        }),
      () => expect(findPlayable(mp4)).resolves.toBeNull(),
    );
    await withRestoredMutation(
      () =>
        prisma.fileUploadSession.update({
          where: { id: mp4.uploadSessionId },
          data: { finalCleanupClaimedAt: new Date() },
        }),
      () =>
        prisma.fileUploadSession.update({
          where: { id: mp4.uploadSessionId },
          data: { finalCleanupClaimedAt: null },
        }),
      () => expect(findPlayable(mp4)).resolves.toBeNull(),
    );
    await withRestoredMutation(
      () =>
        prisma.file.update({
          where: { id: mp4.fileId },
          data: { sizeBytes: mp4.sizeBytes + BigInt(1) },
        }),
      () =>
        prisma.file.update({
          where: { id: mp4.fileId },
          data: { sizeBytes: mp4.sizeBytes },
        }),
      () => expect(findPlayable(mp4)).resolves.toBeNull(),
    );
    await withRestoredMutation(
      () =>
        prisma.file.update({
          where: { id: mp4.fileId },
          data: { mimeType: 'video/webm' },
        }),
      () =>
        prisma.file.update({
          where: { id: mp4.fileId },
          data: { mimeType: 'video/mp4' },
        }),
      () => expect(findPlayable(mp4)).resolves.toBeNull(),
    );

    for (const media of [
      {
        mimeType: 'audio/mpeg',
        durationSeconds: 10,
        width: null,
        height: null,
      },
      {
        mimeType: 'image/png',
        durationSeconds: null,
        width: 640,
        height: 360,
      },
      {
        mimeType: 'application/pdf',
        durationSeconds: null,
        width: null,
        height: null,
      },
    ] as const) {
      await prisma.$transaction([
        prisma.file.update({
          where: { id: mp4.fileId },
          data: { mimeType: media.mimeType },
        }),
        prisma.fileUploadSession.update({
          where: { id: mp4.uploadSessionId },
          data: {
            expectedMimeType: media.mimeType,
            verifiedMimeType: media.mimeType,
            durationSeconds: media.durationSeconds,
            width: media.width,
            height: media.height,
          },
        }),
      ]);
      try {
        await expect(findPlayable(mp4)).resolves.toBeNull();
      } finally {
        await prisma.$transaction([
          prisma.file.update({
            where: { id: mp4.fileId },
            data: { mimeType: 'video/mp4' },
          }),
          prisma.fileUploadSession.update({
            where: { id: mp4.uploadSessionId },
            data: {
              expectedMimeType: 'video/mp4',
              verifiedMimeType: 'video/mp4',
              durationSeconds: 10,
              width: 640,
              height: 360,
            },
          }),
        ]);
      }
    }
  });

  it.each([
    FileUploadSessionStatus.CREATED,
    FileUploadSessionStatus.UPLOADING,
    FileUploadSessionStatus.VERIFYING,
    FileUploadSessionStatus.LEGACY,
    FileUploadSessionStatus.FAILED,
    FileUploadSessionStatus.CANCELLED,
    FileUploadSessionStatus.EXPIRED,
    FileUploadSessionStatus.PURGED,
  ])(
    'rejects the database-valid %s upload-session lifecycle shape',
    async (status) => {
      const ready = await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: mp4.uploadSessionId },
      });
      const now = new Date();
      const cleared: Prisma.FileUploadSessionUncheckedUpdateInput = {
        fileId: null,
        completedAt: null,
        failedAt: null,
        cancelledAt: null,
        stagingCleanupEligibleAt: null,
        stagingCleanupClaimedAt: null,
        stagingObjectDeletedAt: null,
        finalCleanupEligibleAt: null,
        finalCleanupClaimedAt: null,
        finalObjectDeletedAt: null,
        failureReason: null,
        verifiedMimeType: null,
        actualSizeBytes: null,
        checksumSha256: null,
        durationSeconds: null,
        width: null,
        height: null,
        verifiedAt: null,
        verificationVersion: null,
      };
      const stateData = lifecycleStateData({
        status,
        ready,
        cleared,
        now,
        fileId: mp4.fileId,
      });

      await prisma.fileUploadSession.update({
        where: { id: mp4.uploadSessionId },
        data: stateData,
      });
      if (status === FileUploadSessionStatus.PURGED) {
        await prisma.file.update({
          where: { id: mp4.fileId },
          data: { deletedAt: now },
        });
      }

      try {
        await expect(findPlayable(mp4)).resolves.toBeNull();
      } finally {
        await prisma.$transaction([
          prisma.file.update({
            where: { id: mp4.fileId },
            data: { deletedAt: null },
          }),
          prisma.fileUploadSession.update({
            where: { id: mp4.uploadSessionId },
            data: restoreReadySessionData(ready),
          }),
        ]);
      }
    },
  );

  it.each([
    [
      'unpublish',
      () =>
        prisma.lessonContentItem.update({
          where: { id: mp4.contentItemId },
          data: {
            publicationStatus: LessonContentPublicationStatus.DRAFT,
            publishedAt: null,
            publishedByUserId: null,
          },
        }),
      restorePublished,
    ],
    [
      'archive',
      () =>
        prisma.lessonContentItem.update({
          where: { id: mp4.contentItemId },
          data: {
            publicationStatus: LessonContentPublicationStatus.ARCHIVED,
            archivedAt: new Date(),
            archivedByUserId: fixture.teacherUserId,
          },
        }),
      restorePublished,
    ],
    [
      'File soft deletion',
      () =>
        prisma.file.update({
          where: { id: mp4.fileId },
          data: { deletedAt: new Date() },
        }),
      () =>
        prisma.file.update({
          where: { id: mp4.fileId },
          data: { deletedAt: null },
        }),
    ],
    [
      'cleanup claim',
      () =>
        prisma.fileUploadSession.update({
          where: { id: mp4.uploadSessionId },
          data: { finalCleanupClaimedAt: new Date() },
        }),
      () =>
        prisma.fileUploadSession.update({
          where: { id: mp4.uploadSessionId },
          data: { finalCleanupClaimedAt: null },
        }),
    ],
  ] as const)(
    'serializes playback first against %s and allows at most one 300-second capability',
    async (_label, mutate, restore) => {
      const signingStarted = deferred<void>();
      const releaseSigning = deferred<void>();
      let signedCount = 0;
      const playback = inStudentScope(() =>
        adapter.withPlayableLessonContent(
          playbackParams(mp4),
          async (record) => {
            signingStarted.resolve();
            await releaseSigning.promise;
            signedCount += 1;
            return record;
          },
        ),
      );
      await signingStarted.promise;

      let mutationSettled = false;
      const mutation = mutate().finally(() => {
        mutationSettled = true;
      });
      await waitUntilAnyBackendIsBlocked();
      expect(mutationSettled).toBe(false);

      releaseSigning.resolve();
      await expect(playback).resolves.toMatchObject({
        mimeType: 'video/mp4',
      });
      await mutation;
      expect(signedCount).toBe(1);
      await expect(findPlayable(mp4)).resolves.toBeNull();
      await restore();
    },
  );

  it.each([
    [
      'unpublish',
      () => ({
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        publishedAt: null,
        publishedByUserId: null,
      }),
      restorePublished,
      'content',
    ],
    [
      'archive',
      () => ({
        publicationStatus: LessonContentPublicationStatus.ARCHIVED,
        archivedAt: new Date(),
        archivedByUserId: fixture.teacherUserId,
      }),
      restorePublished,
      'content',
    ],
    [
      'File soft deletion',
      () => ({ deletedAt: new Date() }),
      () =>
        prisma.file.update({
          where: { id: mp4.fileId },
          data: { deletedAt: null },
        }),
      'file',
    ],
    [
      'cleanup claim',
      () => ({ finalCleanupClaimedAt: new Date() }),
      () =>
        prisma.fileUploadSession.update({
          where: { id: mp4.uploadSessionId },
          data: { finalCleanupClaimedAt: null },
        }),
      'session',
    ],
  ] as const)(
    'produces no URL when %s wins before the final playback check',
    async (_label, data, restore, target) => {
      const mutationHeld = deferred<void>();
      const releaseMutation = deferred<void>();
      const mutation = prisma.$transaction(async (transaction) => {
        if (target === 'content') {
          await transaction.lessonContentItem.update({
            where: { id: mp4.contentItemId },
            data: data(),
          });
        } else if (target === 'file') {
          await transaction.file.update({
            where: { id: mp4.fileId },
            data: data(),
          });
        } else {
          await transaction.fileUploadSession.update({
            where: { id: mp4.uploadSessionId },
            data: data(),
          });
        }
        mutationHeld.resolve();
        await releaseMutation.promise;
      });
      await mutationHeld.promise;

      let signedCount = 0;
      const playback = inStudentScope(() =>
        adapter.withPlayableLessonContent(playbackParams(mp4), (record) => {
          signedCount += 1;
          return Promise.resolve(record);
        }),
      );
      await waitUntilAnyBackendIsBlocked();
      releaseMutation.resolve();
      await mutation;
      await expect(playback).resolves.toBeNull();
      expect(signedCount).toBe(0);
      await restore();
    },
  );

  async function findPlayable(
    media: MediaFixture,
  ): Promise<StudentLessonPlayableContentRecord | null> {
    return findByIds(fixture.lessonPlanItemId, media.contentItemId);
  }

  async function findByIds(
    lessonPlanItemId: string,
    contentItemId: string,
  ): Promise<StudentLessonPlayableContentRecord | null> {
    return inStudentScope(() =>
      adapter.findPlayableLessonContent({
        context: currentStudent().context,
        lessonPlanItemId,
        contentItemId,
      }),
    );
  }

  function inStudentScope<T>(operation: () => Promise<T>): Promise<T> {
    const requestContext = createRequestContext();
    requestContext.actor = {
      id: fixture.studentUserId,
      userType: UserType.STUDENT,
    };
    requestContext.activeMembership = {
      membershipId: fixture.membershipId,
      schoolId: fixture.schoolId,
      organizationId: fixture.organizationId,
      roleId: fixture.roleId,
      permissions: ['academics.lesson_plans.view'],
    };
    return runWithRequestContext(requestContext, operation);
  }

  function currentStudent(): StudentAppCurrentStudentWithEnrollment {
    return {
      context: {
        studentUserId: fixture.studentUserId,
        studentId: fixture.studentId,
        schoolId: fixture.schoolId,
        organizationId: fixture.organizationId,
        membershipId: fixture.membershipId,
        roleId: fixture.roleId,
        permissions: ['academics.lesson_plans.view'],
        enrollmentId: fixture.enrollmentId,
        classroomId: fixture.classroomId,
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
      },
      student: {} as StudentAppCurrentStudentWithEnrollment['student'],
      enrollment: {} as StudentAppCurrentStudentWithEnrollment['enrollment'],
    };
  }

  function playbackParams(media: MediaFixture): {
    context: StudentAppContext;
    lessonPlanItemId: string;
    contentItemId: string;
  } {
    return {
      context: currentStudent().context,
      lessonPlanItemId: fixture.lessonPlanItemId,
      contentItemId: media.contentItemId,
    };
  }

  async function restorePublished(): Promise<unknown> {
    return prisma.lessonContentItem.update({
      where: { id: mp4.contentItemId },
      data: {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: fixture.teacherUserId,
        archivedAt: null,
        archivedByUserId: null,
      },
    });
  }

  function authorizationMutationCases(): Array<{
    label: string;
    mutate: (transaction: Prisma.TransactionClient) => Promise<unknown>;
    restore: () => Promise<unknown>;
  }> {
    return [
      {
        label: 'Enrollment withdrawal',
        mutate: (transaction) =>
          transaction.enrollment.update({
            where: { id: fixture.enrollmentId },
            data: {
              status: StudentEnrollmentStatus.WITHDRAWN,
              endedAt: new Date(),
            },
          }),
        restore: () =>
          prisma.enrollment.update({
            where: { id: fixture.enrollmentId },
            data: {
              status: StudentEnrollmentStatus.ACTIVE,
              endedAt: null,
            },
          }),
      },
      {
        label: 'User deactivation',
        mutate: (transaction) =>
          transaction.user.update({
            where: { id: fixture.studentUserId },
            data: { status: UserStatus.DISABLED },
          }),
        restore: () =>
          prisma.user.update({
            where: { id: fixture.studentUserId },
            data: { status: UserStatus.ACTIVE },
          }),
      },
      {
        label: 'Student deactivation',
        mutate: (transaction) =>
          transaction.student.update({
            where: { id: fixture.studentId },
            data: { status: StudentStatus.SUSPENDED },
          }),
        restore: () =>
          prisma.student.update({
            where: { id: fixture.studentId },
            data: { status: StudentStatus.ACTIVE },
          }),
      },
      {
        label: 'Subject deactivation',
        mutate: (transaction) =>
          transaction.subject.update({
            where: { id: fixture.subjectId },
            data: { isActive: false },
          }),
        restore: () =>
          prisma.subject.update({
            where: { id: fixture.subjectId },
            data: { isActive: true },
          }),
      },
      {
        label: 'LessonPlan archive',
        mutate: (transaction) =>
          transaction.lessonPlan.update({
            where: { id: fixture.lessonPlanId },
            data: {
              status: LessonPlanStatus.ARCHIVED,
              archivedAt: new Date(),
            },
          }),
        restore: () =>
          prisma.lessonPlan.update({
            where: { id: fixture.lessonPlanId },
            data: {
              status: LessonPlanStatus.ACTIVE,
              archivedAt: null,
            },
          }),
      },
      {
        label: 'LessonPlanItem deletion',
        mutate: (transaction) =>
          transaction.lessonPlanItem.update({
            where: { id: fixture.lessonPlanItemId },
            data: { deletedAt: new Date() },
          }),
        restore: () =>
          prisma.lessonPlanItem.update({
            where: { id: fixture.lessonPlanItemId },
            data: { deletedAt: null },
          }),
      },
    ];
  }

  async function waitUntilAnyBackendIsBlocked(): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const rows = await observer.$queryRaw<Array<{ blockedCount: bigint }>>`
        SELECT COUNT(*)::bigint AS "blockedCount"
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND cardinality(pg_blocking_pids(pid)) > 0
      `;
      if ((rows[0]?.blockedCount ?? BigInt(0)) > BigInt(0)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Expected PostgreSQL playback race wait was not observed');
  }
});

function lifecycleStateData(params: {
  status: FileUploadSessionStatus;
  ready: FileUploadSession;
  cleared: Prisma.FileUploadSessionUncheckedUpdateInput;
  now: Date;
  fileId: string;
}): Prisma.FileUploadSessionUncheckedUpdateInput {
  const { status, ready, cleared, now, fileId } = params;
  switch (status) {
    case FileUploadSessionStatus.CREATED:
      return { ...cleared, status, latestUploadUrlExpiresAt: null };
    case FileUploadSessionStatus.UPLOADING:
    case FileUploadSessionStatus.VERIFYING:
      return {
        ...cleared,
        status,
        latestUploadUrlExpiresAt: ready.latestUploadUrlExpiresAt,
      };
    case FileUploadSessionStatus.LEGACY:
      return {
        ...cleared,
        status,
        stagingBucket: null,
        stagingObjectKey: null,
        expiresAt: ready.createdAt,
        latestUploadUrlExpiresAt: null,
        fileId,
        verificationVersion: 'legacy_metadata_v1',
      };
    case FileUploadSessionStatus.FAILED:
      return {
        ...cleared,
        status,
        latestUploadUrlExpiresAt: ready.latestUploadUrlExpiresAt,
        failedAt: now,
        failureReason: 'unsupported_container',
        stagingCleanupEligibleAt: now,
      };
    case FileUploadSessionStatus.CANCELLED:
      return {
        ...cleared,
        status,
        latestUploadUrlExpiresAt: ready.latestUploadUrlExpiresAt,
        cancelledAt: now,
        stagingCleanupEligibleAt: now,
      };
    case FileUploadSessionStatus.EXPIRED:
      return {
        ...cleared,
        status,
        latestUploadUrlExpiresAt: ready.latestUploadUrlExpiresAt,
        stagingCleanupEligibleAt: now,
      };
    case FileUploadSessionStatus.PURGED:
      return {
        status,
        fileId,
        completedAt: ready.completedAt,
        failedAt: null,
        cancelledAt: null,
        stagingCleanupEligibleAt: ready.stagingCleanupEligibleAt,
        stagingCleanupClaimedAt: now,
        stagingObjectDeletedAt: now,
        finalCleanupEligibleAt: ready.finalCleanupEligibleAt,
        finalCleanupClaimedAt: now,
        finalObjectDeletedAt: now,
        failureReason: null,
        verifiedMimeType: ready.verifiedMimeType,
        actualSizeBytes: ready.actualSizeBytes,
        checksumSha256: ready.checksumSha256,
        durationSeconds: ready.durationSeconds,
        width: ready.width,
        height: ready.height,
        verifiedAt: ready.verifiedAt,
        verificationVersion: ready.verificationVersion,
      };
    case FileUploadSessionStatus.READY:
      throw new Error('READY is the eligible control, not a rejection case');
  }
}

function restoreReadySessionData(
  ready: FileUploadSession,
): Prisma.FileUploadSessionUncheckedUpdateInput {
  return {
    status: ready.status,
    expiresAt: ready.expiresAt,
    latestUploadUrlExpiresAt: ready.latestUploadUrlExpiresAt,
    stagingBucket: ready.stagingBucket,
    stagingObjectKey: ready.stagingObjectKey,
    fileId: ready.fileId,
    completedAt: ready.completedAt,
    failedAt: ready.failedAt,
    cancelledAt: ready.cancelledAt,
    stagingCleanupEligibleAt: ready.stagingCleanupEligibleAt,
    stagingCleanupClaimedAt: ready.stagingCleanupClaimedAt,
    stagingObjectDeletedAt: ready.stagingObjectDeletedAt,
    finalCleanupEligibleAt: ready.finalCleanupEligibleAt,
    finalCleanupClaimedAt: ready.finalCleanupClaimedAt,
    finalObjectDeletedAt: ready.finalObjectDeletedAt,
    failureReason: ready.failureReason,
    verifiedMimeType: ready.verifiedMimeType,
    actualSizeBytes: ready.actualSizeBytes,
    checksumSha256: ready.checksumSha256,
    durationSeconds: ready.durationSeconds,
    width: ready.width,
    height: ready.height,
    verifiedAt: ready.verifiedAt,
    verificationVersion: ready.verificationVersion,
  };
}

async function createBaseFixture(
  prisma: PrismaClient,
  marker: string,
): Promise<BaseFixture> {
  const organization = await prisma.organization.create({
    data: {
      slug: `${marker}-org`,
      name: `${marker} Org`,
      status: OrganizationStatus.ACTIVE,
    },
  });
  const school = await prisma.school.create({
    data: {
      organizationId: organization.id,
      slug: `${marker}-school`,
      name: `${marker} School`,
      status: SchoolStatus.ACTIVE,
    },
  });
  const [teacher, studentUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${marker}-teacher@example.test`,
        firstName: 'Playback',
        lastName: 'Teacher',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
    }),
    prisma.user.create({
      data: {
        email: `${marker}-student@example.test`,
        firstName: 'Playback',
        lastName: 'Student',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
      },
    }),
  ]);
  const academicYear = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      nameAr: `${marker}-year-ar`,
      nameEn: `${marker}-year`,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2027-06-30T00:00:00.000Z'),
      isActive: true,
    },
  });
  const term = await prisma.term.create({
    data: {
      schoolId: school.id,
      academicYearId: academicYear.id,
      nameAr: `${marker}-term-ar`,
      nameEn: `${marker}-term`,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      isActive: true,
    },
  });
  const stage = await prisma.stage.create({
    data: {
      schoolId: school.id,
      nameAr: `${marker}-stage-ar`,
      nameEn: `${marker}-stage`,
      sortOrder: 1,
    },
  });
  const grade = await prisma.grade.create({
    data: {
      schoolId: school.id,
      stageId: stage.id,
      nameAr: `${marker}-grade-ar`,
      nameEn: `${marker}-grade`,
      sortOrder: 1,
    },
  });
  const section = await prisma.section.create({
    data: {
      schoolId: school.id,
      gradeId: grade.id,
      nameAr: `${marker}-section-ar`,
      nameEn: `${marker}-section`,
      sortOrder: 1,
    },
  });
  const classroom = await prisma.classroom.create({
    data: {
      schoolId: school.id,
      sectionId: section.id,
      nameAr: `${marker}-classroom-ar`,
      nameEn: `${marker}-classroom`,
      sortOrder: 1,
    },
  });
  const role = await prisma.role.create({
    data: {
      schoolId: school.id,
      key: `${marker}-student-role`,
      name: `${marker} Student Role`,
    },
  });
  const membership = await prisma.membership.create({
    data: {
      userId: studentUser.id,
      organizationId: organization.id,
      schoolId: school.id,
      roleId: role.id,
      userType: UserType.STUDENT,
      status: MembershipStatus.ACTIVE,
    },
  });
  const subject = await prisma.subject.create({
    data: {
      schoolId: school.id,
      nameAr: `${marker}-subject-ar`,
      nameEn: `${marker}-subject`,
      code: marker.slice(0, 30).toUpperCase(),
      isActive: true,
    },
  });
  const allocation = await prisma.teacherSubjectAllocation.create({
    data: {
      schoolId: school.id,
      teacherUserId: teacher.id,
      subjectId: subject.id,
      classroomId: classroom.id,
      termId: term.id,
    },
  });
  const curriculum = await prisma.curriculum.create({
    data: {
      schoolId: school.id,
      academicYearId: academicYear.id,
      termId: term.id,
      gradeId: grade.id,
      subjectId: subject.id,
      title: `${marker}-curriculum`,
      status: CurriculumStatus.ACTIVE,
      createdByUserId: teacher.id,
    },
  });
  const unit = await prisma.curriculumUnit.create({
    data: {
      schoolId: school.id,
      curriculumId: curriculum.id,
      title: `${marker}-unit`,
    },
  });
  const lesson = await prisma.curriculumLesson.create({
    data: {
      schoolId: school.id,
      curriculumId: curriculum.id,
      unitId: unit.id,
      title: `${marker}-lesson`,
    },
  });
  const plan = await prisma.lessonPlan.create({
    data: {
      schoolId: school.id,
      academicYearId: academicYear.id,
      termId: term.id,
      teacherSubjectAllocationId: allocation.id,
      teacherUserId: teacher.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      curriculumId: curriculum.id,
      title: `${marker}-plan`,
      status: LessonPlanStatus.ACTIVE,
      weekStartDate: new Date('2026-09-14T00:00:00.000Z'),
      weekEndDate: new Date('2026-09-20T00:00:00.000Z'),
      createdByUserId: teacher.id,
    },
  });
  const item = await prisma.lessonPlanItem.create({
    data: {
      schoolId: school.id,
      lessonPlanId: plan.id,
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      plannedDate: new Date('2026-09-14T00:00:00.000Z'),
      title: `${marker}-item`,
      status: LessonPlanItemStatus.PLANNED,
      createdByUserId: teacher.id,
    },
  });
  const student = await prisma.student.create({
    data: {
      organizationId: organization.id,
      schoolId: school.id,
      userId: studentUser.id,
      firstName: 'Playback',
      lastName: 'Student',
      status: StudentStatus.ACTIVE,
    },
  });
  const enrollment = await prisma.enrollment.create({
    data: {
      schoolId: school.id,
      studentId: student.id,
      academicYearId: academicYear.id,
      termId: term.id,
      classroomId: classroom.id,
      status: StudentEnrollmentStatus.ACTIVE,
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  });

  return {
    organizationId: organization.id,
    schoolId: school.id,
    teacherUserId: teacher.id,
    studentUserId: studentUser.id,
    academicYearId: academicYear.id,
    termId: term.id,
    stageId: stage.id,
    gradeId: grade.id,
    sectionId: section.id,
    classroomId: classroom.id,
    subjectId: subject.id,
    allocationId: allocation.id,
    curriculumId: curriculum.id,
    unitId: unit.id,
    lessonId: lesson.id,
    lessonPlanId: plan.id,
    lessonPlanItemId: item.id,
    studentId: student.id,
    membershipId: membership.id,
    roleId: role.id,
    enrollmentId: enrollment.id,
  };
}

async function createReadyVideo(
  prisma: PrismaClient,
  fixture: BaseFixture,
  marker: string,
  label: string,
  mimeType: 'video/mp4' | 'video/webm',
): Promise<MediaFixture> {
  const sizeBytes = BigInt(label === 'mp4' ? 4096 : 8192);
  const file = await prisma.file.create({
    data: {
      organizationId: fixture.organizationId,
      schoolId: fixture.schoolId,
      uploaderId: fixture.teacherUserId,
      bucket: `${marker}-final`,
      objectKey: `${marker}/${mimeType}/final`,
      originalName: `${label}.${label}`,
      mimeType,
      sizeBytes,
      checksumSha256: (label === 'mp4' ? 'a' : 'b').repeat(64),
      visibility: FileVisibility.PRIVATE,
    },
  });
  const createdAt = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
  const latestUploadUrlExpiresAt = new Date(
    createdAt.getTime() + 60 * 60 * 1000,
  );
  const completedAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
  const session = await prisma.fileUploadSession.create({
    data: {
      organizationId: fixture.organizationId,
      schoolId: fixture.schoolId,
      createdByUserId: fixture.teacherUserId,
      clientRequestId: randomUUID(),
      purpose: FileUploadPurpose.LESSON_CONTENT,
      originalName: `${label}.${label}`,
      expectedMimeType: mimeType,
      expectedSizeBytes: sizeBytes,
      stagingBucket: `${marker}-staging`,
      stagingObjectKey: `${marker}/${label}/staging`,
      finalBucket: file.bucket,
      finalObjectKey: file.objectKey,
      status: FileUploadSessionStatus.READY,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
      latestUploadUrlExpiresAt,
      completedAt,
      stagingCleanupEligibleAt: latestUploadUrlExpiresAt,
      finalCleanupEligibleAt: new Date(
        completedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
      ),
      verifiedMimeType: mimeType,
      actualSizeBytes: sizeBytes,
      checksumSha256: (label === 'mp4' ? 'a' : 'b').repeat(64),
      durationSeconds: 10,
      width: 640,
      height: 360,
      verifiedAt: completedAt,
      verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
      fileId: file.id,
    },
  });
  const content = await prisma.lessonContentItem.create({
    data: {
      schoolId: fixture.schoolId,
      curriculumId: fixture.curriculumId,
      unitId: fixture.unitId,
      lessonId: fixture.lessonId,
      type: LessonContentItemType.FILE,
      title: `${marker}-${label}`,
      fileId: file.id,
      sortOrder: label === 'mp4' ? 1 : 2,
      createdByUserId: fixture.teacherUserId,
      publicationStatus: LessonContentPublicationStatus.PUBLISHED,
      publishedAt: new Date(),
      publishedByUserId: fixture.teacherUserId,
    },
  });
  return {
    contentItemId: content.id,
    fileId: file.id,
    uploadSessionId: session.id,
    mimeType,
    sizeBytes,
  };
}

async function cleanupFixture(
  prisma: PrismaClient,
  fixture: BaseFixture | undefined,
  media: MediaFixture[],
  extraLessonIds: string[],
): Promise<void> {
  if (!fixture) return;
  await prisma.lessonContentItem.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.fileUploadSession.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.file.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.lessonPlanItem.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.lessonPlan.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.curriculumLesson.deleteMany({
    where: {
      OR: [
        { id: fixture.lessonId },
        ...(extraLessonIds.length > 0 ? [{ id: { in: extraLessonIds } }] : []),
      ],
    },
  });
  await prisma.curriculumUnit.deleteMany({
    where: { id: fixture.unitId },
  });
  await prisma.curriculum.deleteMany({
    where: { id: fixture.curriculumId },
  });
  await prisma.teacherSubjectAllocation.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.subject.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.enrollment.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.student.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.membership.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.role.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.classroom.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.section.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.grade.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.stage.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.term.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.academicYear.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [fixture.teacherUserId, fixture.studentUserId] } },
  });
  await prisma.school.delete({ where: { id: fixture.schoolId } });
  await prisma.organization.delete({
    where: { id: fixture.organizationId },
  });
  void media;
}

async function withRestoredMutation(
  mutate: () => Promise<unknown>,
  restore: () => Promise<unknown>,
  assertion: () => Promise<unknown>,
): Promise<void> {
  await mutate();
  try {
    await assertion();
  } finally {
    await restore();
  }
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function buildObserverDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for Student playback PostgreSQL tests',
    );
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL is malformed for Student playback PostgreSQL tests',
    );
  }
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '10');
  return url.toString();
}
