import {
  LessonContentPublicationStatus,
  LessonPlanStatus,
  MembershipStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { LessonContentPlaybackCoordinator } from '../../src/modules/academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback.coordinator';
import { TeacherLessonPreparationReadAdapter } from '../../src/modules/teacher-app/lesson-preparation/infrastructure/teacher-lesson-preparation-read.adapter';
import type { TeacherAppContext } from '../../src/modules/teacher-app/shared/teacher-app-context';
import {
  cleanupPlaybackFixture,
  createPlaybackFixture,
  deferred,
  expectPromiseToRemainPending,
  type PlaybackFixture,
  runInActorScope,
} from './support/lesson-playback-fixture';

jest.setTimeout(120_000);

type MutationCase = {
  label: string;
  mutate: (transaction: Prisma.TransactionClient) => Promise<unknown>;
  restore: () => Promise<unknown>;
};

describe('Teacher lesson preparation playback PostgreSQL boundary', () => {
  const prisma = new PrismaService();
  const storage = {
    createDownloadUrl: jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/teacher-playback',
      expiresAt: new Date('2026-07-24T12:05:00.000Z'),
    }),
  };
  const coordinator = new LessonContentPlaybackCoordinator(
    prisma,
    storage as unknown as StorageService,
  );
  const adapter = new TeacherLessonPreparationReadAdapter(prisma, coordinator);
  let fixture: PlaybackFixture;

  beforeAll(async () => {
    await prisma.$connect();
    fixture = await createPlaybackFixture(prisma, 'teacher-playback');
  });

  afterAll(async () => {
    try {
      await cleanupPlaybackFixture(prisma, fixture);
    } finally {
      await prisma.$disconnect();
    }
  });

  beforeEach(() => {
    storage.createDownloadUrl.mockReset().mockResolvedValue({
      url: 'https://storage.invalid/teacher-playback',
      expiresAt: new Date('2026-07-24T12:05:00.000Z'),
    });
  });

  it.each([
    ['DRAFT', () => fixture.draftContentItemId],
    ['PUBLISHED', () => fixture.publishedContentItemId],
  ] as const)(
    'returns the exact %s preview capability without persistence or audit writes',
    async (_status, contentId) => {
      const auditBefore = await prisma.auditLog.count({
        where: { schoolId: fixture.schoolId },
      });
      const response = await play(contentId());

      expect(response).toEqual({
        url: 'https://storage.invalid/teacher-playback',
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
    },
  );

  it('rejects ARCHIVED content, plan, and curriculum states', async () => {
    await expect(play(fixture.archivedContentItemId)).resolves.toBeNull();

    await prisma.lessonPlan.update({
      where: { id: fixture.lessonPlanId },
      data: { status: LessonPlanStatus.ARCHIVED, archivedAt: new Date() },
    });
    try {
      await expect(play(fixture.publishedContentItemId)).resolves.toBeNull();
    } finally {
      await prisma.lessonPlan.update({
        where: { id: fixture.lessonPlanId },
        data: { status: LessonPlanStatus.ACTIVE, archivedAt: null },
      });
    }

    await prisma.curriculum.update({
      where: { id: fixture.curriculumId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    try {
      await expect(play(fixture.publishedContentItemId)).resolves.toBeNull();
    } finally {
      await prisma.curriculum.update({
        where: { id: fixture.curriculumId },
        data: { status: 'ACTIVE', archivedAt: null },
      });
    }
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });

  it.each(teacherMutationCases())(
    'returns no capability when $label wins first',
    async ({ mutate, restore }) => {
      const mutationHeld = deferred<void>();
      const releaseMutation = deferred<void>();
      let playback:
        | ReturnType<
            TeacherLessonPreparationReadAdapter['getLessonContentPlayback']
          >
        | undefined;
      const mutation = prisma.$transaction(async (transaction) => {
        await mutate(transaction);
        mutationHeld.resolve();
        await releaseMutation.promise;
      });

      try {
        await mutationHeld.promise;
        playback = play(fixture.publishedContentItemId);
        await expectPromiseToRemainPending(playback);
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

  it.each(teacherMutationCases())(
    'withholds the capability when $label changes during signing',
    async ({ mutate, restore }) => {
      const signingStarted = deferred<void>();
      const releaseSigning = deferred<void>();
      storage.createDownloadUrl.mockImplementationOnce(async () => {
        signingStarted.resolve();
        await releaseSigning.promise;
        return {
          url: 'https://storage.invalid/teacher-playback',
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
        await mutation;
        expect(mutationSettled).toBe(true);
        releaseSigning.resolve();
        await expect(playback).resolves.toBeNull();
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
    return runInActorScope(fixture, 'teacher', () =>
      adapter.getLessonContentPlayback({
        context: teacherContext(),
        lessonPlanItemId: fixture.lessonPlanItemId,
        contentItemId,
      }),
    );
  }

  function teacherContext(): TeacherAppContext {
    return {
      teacherUserId: fixture.teacherUserId,
      schoolId: fixture.schoolId,
      organizationId: fixture.organizationId,
      membershipId: fixture.teacherMembershipId,
      roleId: fixture.teacherRoleId,
      permissions: [
        'teacher.lesson_preparation.view',
        'academics.lesson_plans.view',
        'academics.curriculum.view',
      ],
    };
  }

  function teacherMutationCases(): MutationCase[] {
    return [
      {
        label: 'Teacher Membership deactivation',
        mutate: (transaction) =>
          transaction.membership.update({
            where: { id: fixture.teacherMembershipId },
            data: { status: MembershipStatus.INACTIVE, endedAt: new Date() },
          }),
        restore: () =>
          prisma.membership.update({
            where: { id: fixture.teacherMembershipId },
            data: { status: MembershipStatus.ACTIVE, endedAt: null },
          }),
      },
      {
        label: 'Teacher User deactivation',
        mutate: (transaction) =>
          transaction.user.update({
            where: { id: fixture.teacherUserId },
            data: { status: UserStatus.DISABLED },
          }),
        restore: () =>
          prisma.user.update({
            where: { id: fixture.teacherUserId },
            data: { status: UserStatus.ACTIVE },
          }),
      },
      {
        label: 'TeacherSubjectAllocation ownership reassignment',
        mutate: (transaction) =>
          transaction.teacherSubjectAllocation.update({
            where: { id: fixture.allocationId },
            data: { teacherUserId: fixture.parentUserId },
          }),
        restore: () =>
          prisma.teacherSubjectAllocation.update({
            where: { id: fixture.allocationId },
            data: { teacherUserId: fixture.teacherUserId },
          }),
      },
      {
        label: 'LessonPlan teacher and allocation reassignment',
        mutate: (transaction) =>
          transaction.lessonPlan.update({
            where: { id: fixture.lessonPlanId },
            data: {
              teacherUserId: fixture.otherTeacherUserId,
              teacherSubjectAllocationId: fixture.otherAllocationId,
            },
          }),
        restore: () =>
          prisma.lessonPlan.update({
            where: { id: fixture.lessonPlanId },
            data: {
              teacherUserId: fixture.teacherUserId,
              teacherSubjectAllocationId: fixture.allocationId,
            },
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
        label: 'content archive',
        mutate: (transaction) =>
          transaction.lessonContentItem.update({
            where: { id: fixture.publishedContentItemId },
            data: {
              publicationStatus: LessonContentPublicationStatus.ARCHIVED,
              archivedAt: new Date(),
              archivedByUserId: fixture.teacherUserId,
            },
          }),
        restore: () =>
          prisma.lessonContentItem.update({
            where: { id: fixture.publishedContentItemId },
            data: {
              publicationStatus: LessonContentPublicationStatus.PUBLISHED,
              archivedAt: null,
              archivedByUserId: null,
            },
          }),
      },
      {
        label: 'final cleanup claim',
        mutate: (transaction) =>
          transaction.fileUploadSession.update({
            where: { id: fixture.uploadSessionId },
            data: { finalCleanupClaimedAt: new Date() },
          }),
        restore: () =>
          prisma.fileUploadSession.update({
            where: { id: fixture.uploadSessionId },
            data: { finalCleanupClaimedAt: null },
          }),
      },
    ];
  }
});
