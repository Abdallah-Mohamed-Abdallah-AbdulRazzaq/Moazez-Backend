import {
  LessonContentPublicationStatus,
  LessonPlanStatus,
  MembershipStatus,
  Prisma,
  PrismaClient,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { LessonContentPlaybackCoordinator } from '../../src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.coordinator';
import { ParentChildLessonsReadAdapter } from '../../src/modules/parent-app/lessons/infrastructure/parent-child-lessons-read.adapter';
import type {
  ParentAppAccessibleChild,
  ParentAppContext,
} from '../../src/modules/parent-app/shared/parent-app.types';
import {
  buildObserverDatabaseUrl,
  cleanupPlaybackFixture,
  createPlaybackFixture,
  deferred,
  type PlaybackFixture,
  runInActorScope,
  waitUntilAnyBackendIsBlocked,
} from './support/lesson-playback-fixture';

jest.setTimeout(120_000);

type MutationCase = {
  label: string;
  mutate: (transaction: Prisma.TransactionClient) => Promise<unknown>;
  restore: () => Promise<unknown>;
};

describe('Parent child lesson playback PostgreSQL boundary', () => {
  const prisma = new PrismaService();
  const observer = new PrismaClient({
    datasourceUrl: buildObserverDatabaseUrl('Parent playback tests'),
  });
  const storage = {
    createDownloadUrl: jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/parent-playback',
      expiresAt: new Date('2026-07-24T12:05:00.000Z'),
    }),
  };
  const coordinator = new LessonContentPlaybackCoordinator(
    prisma,
    storage as unknown as StorageService,
  );
  const adapter = new ParentChildLessonsReadAdapter(prisma, coordinator);
  let fixture: PlaybackFixture;

  beforeAll(async () => {
    await prisma.$connect();
    await observer.$connect();
    fixture = await createPlaybackFixture(prisma, 'parent-playback');
  });

  afterAll(async () => {
    try {
      await cleanupPlaybackFixture(prisma, fixture);
    } finally {
      try {
        await observer.$disconnect();
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  beforeEach(() => {
    storage.createDownloadUrl.mockReset().mockResolvedValue({
      url: 'https://storage.invalid/parent-playback',
      expiresAt: new Date('2026-07-24T12:05:00.000Z'),
    });
  });

  it('returns the exact PUBLISHED capability without persistence or audit writes', async () => {
    const auditBefore = await prisma.auditLog.count({
      where: { schoolId: fixture.schoolId },
    });
    const response = await play(fixture.publishedContentItemId);

    expect(response).toEqual({
      url: 'https://storage.invalid/parent-playback',
      expiresAt: '2026-07-24T12:05:00.000Z',
      mimeType: 'video/mp4',
      sizeBytes: fixture.sizeBytes.toString(10),
      disposition: 'inline',
      renewable: true,
    });
    expect(Object.keys(response ?? {}).sort()).toEqual(
      [
        'disposition',
        'expiresAt',
        'mimeType',
        'renewable',
        'sizeBytes',
        'url',
      ].sort(),
    );
    expect(storage.createDownloadUrl).toHaveBeenCalledWith({
      bucket: fixture.bucket,
      objectKey: fixture.objectKey,
      expiresInSeconds: 300,
      disposition: 'inline',
      contentType: 'video/mp4',
    });
    expect(
      await prisma.auditLog.count({ where: { schoolId: fixture.schoolId } }),
    ).toBe(auditBefore);
  });

  it('enforces Parent PUBLISHED-only visibility', async () => {
    await expect(play(fixture.draftContentItemId)).resolves.toBeNull();
    await expect(play(fixture.archivedContentItemId)).resolves.toBeNull();
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });

  it.each(parentMutationCases())(
    'returns no capability when $label wins first',
    async ({ mutate, restore }) => {
      const mutationHeld = deferred<void>();
      const releaseMutation = deferred<void>();
      let playback:
        | ReturnType<ParentChildLessonsReadAdapter['getLessonContentPlayback']>
        | undefined;
      const mutation = prisma.$transaction(async (transaction) => {
        await mutate(transaction);
        mutationHeld.resolve();
        await releaseMutation.promise;
      });

      try {
        await mutationHeld.promise;
        playback = play(fixture.publishedContentItemId);
        await waitUntilAnyBackendIsBlocked(observer);
        releaseMutation.resolve();
        await mutation;
        await expect(playback).resolves.toBeNull();
        expect(storage.createDownloadUrl).not.toHaveBeenCalled();
      } finally {
        releaseMutation.resolve();
        await Promise.allSettled([mutation, ...(playback ? [playback] : [])]);
        await restore();
      }
    },
  );

  it.each(parentMutationCases())(
    'holds $label until protected signing completes',
    async ({ mutate, restore }) => {
      const signingStarted = deferred<void>();
      const releaseSigning = deferred<void>();
      storage.createDownloadUrl.mockImplementationOnce(async () => {
        signingStarted.resolve();
        await releaseSigning.promise;
        return {
          url: 'https://storage.invalid/parent-playback',
          expiresAt: new Date('2026-07-24T12:05:00.000Z'),
        };
      });
      const playback = play(fixture.publishedContentItemId);
      await signingStarted.promise;

      let mutationSettled = false;
      const mutation = prisma
        .$transaction((transaction) => mutate(transaction))
        .finally(() => {
          mutationSettled = true;
        });

      try {
        await waitUntilAnyBackendIsBlocked(observer);
        expect(mutationSettled).toBe(false);
        releaseSigning.resolve();
        await expect(playback).resolves.toMatchObject({
          mimeType: 'video/mp4',
          disposition: 'inline',
        });
        await mutation;
        expect(storage.createDownloadUrl).toHaveBeenCalledTimes(1);
        await expect(play(fixture.publishedContentItemId)).resolves.toBeNull();
      } finally {
        releaseSigning.resolve();
        await Promise.allSettled([playback, mutation]);
        await restore();
      }
    },
  );

  function play(contentItemId: string) {
    return runInActorScope(fixture, 'parent', () =>
      adapter.getLessonContentPlayback({
        context: parentContext(),
        child: parentChild(),
        lessonPlanItemId: fixture.lessonPlanItemId,
        contentItemId,
      }),
    );
  }

  function parentContext(): ParentAppContext {
    return {
      parentUserId: fixture.parentUserId,
      schoolId: fixture.schoolId,
      organizationId: fixture.organizationId,
      membershipId: fixture.parentMembershipId,
      roleId: fixture.parentRoleId,
      permissions: ['academics.lesson_plans.view', 'academics.curriculum.view'],
      guardianIds: [fixture.guardianId],
      children: [parentChild()],
    };
  }

  function parentChild(): ParentAppAccessibleChild {
    return {
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      classroomId: fixture.classroomId,
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
    };
  }

  function parentMutationCases(): MutationCase[] {
    return [
      {
        label: 'StudentGuardian link removal',
        mutate: (transaction) =>
          transaction.studentGuardian.delete({
            where: { id: fixture.guardianLinkId },
          }),
        restore: async () => {
          const link = await prisma.studentGuardian.create({
            data: {
              schoolId: fixture.schoolId,
              studentId: fixture.studentId,
              guardianId: fixture.guardianId,
              isPrimary: true,
            },
          });
          fixture.guardianLinkId = link.id;
        },
      },
      {
        label: 'Parent Membership deactivation',
        mutate: (transaction) =>
          transaction.membership.update({
            where: { id: fixture.parentMembershipId },
            data: { status: MembershipStatus.INACTIVE, endedAt: new Date() },
          }),
        restore: () =>
          prisma.membership.update({
            where: { id: fixture.parentMembershipId },
            data: { status: MembershipStatus.ACTIVE, endedAt: null },
          }),
      },
      {
        label: 'Parent User deactivation',
        mutate: (transaction) =>
          transaction.user.update({
            where: { id: fixture.parentUserId },
            data: { status: UserStatus.DISABLED },
          }),
        restore: () =>
          prisma.user.update({
            where: { id: fixture.parentUserId },
            data: { status: UserStatus.ACTIVE },
          }),
      },
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
        label: 'child Student deactivation',
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
        label: 'LessonPlan archive',
        mutate: (transaction) =>
          transaction.lessonPlan.update({
            where: { id: fixture.lessonPlanId },
            data: { status: LessonPlanStatus.ARCHIVED, archivedAt: new Date() },
          }),
        restore: () =>
          prisma.lessonPlan.update({
            where: { id: fixture.lessonPlanId },
            data: { status: LessonPlanStatus.ACTIVE, archivedAt: null },
          }),
      },
      {
        label: 'content unpublish',
        mutate: (transaction) =>
          transaction.lessonContentItem.update({
            where: { id: fixture.publishedContentItemId },
            data: {
              publicationStatus: LessonContentPublicationStatus.DRAFT,
              publishedAt: null,
              publishedByUserId: null,
            },
          }),
        restore: () =>
          prisma.lessonContentItem.update({
            where: { id: fixture.publishedContentItemId },
            data: {
              publicationStatus: LessonContentPublicationStatus.PUBLISHED,
              publishedAt: new Date(),
              publishedByUserId: fixture.teacherUserId,
            },
          }),
      },
      {
        label: 'File soft deletion',
        mutate: (transaction) =>
          transaction.file.update({
            where: { id: fixture.fileId },
            data: { deletedAt: new Date() },
          }),
        restore: () =>
          prisma.file.update({
            where: { id: fixture.fileId },
            data: { deletedAt: null },
          }),
      },
    ];
  }
});
