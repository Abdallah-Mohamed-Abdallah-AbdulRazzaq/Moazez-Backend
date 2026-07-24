import { LessonContentPublicationStatus, Prisma } from '@prisma/client';
import { StorageService } from '../../../../../../infrastructure/storage/storage.service';
import { LessonContentPlaybackCoordinator } from '../lesson-content-playback.coordinator';
import { LessonContentPlaybackPresenter } from '../lesson-content-playback.presenter';

describe('LessonContentPlaybackCoordinator', () => {
  it('locks, revalidates, and signs the exact final video inside one transaction', async () => {
    const { coordinator, findFirst, storageService, lockAuthorization } =
      createHarness();

    await expect(
      coordinator.execute(request(lockAuthorization)),
    ).resolves.toEqual({
      url: 'https://storage.invalid/video',
      expiresAt: '2026-07-24T12:05:00.000Z',
      mimeType: 'video/mp4',
      sizeBytes: '4096',
      disposition: 'inline',
      renewable: true,
    });

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(lockAuthorization).toHaveBeenCalledTimes(1);
    expect(storageService.createDownloadUrl).toHaveBeenCalledWith({
      bucket: 'final-bucket',
      objectKey: 'final/video.mp4',
      expiresInSeconds: 300,
      disposition: 'inline',
      contentType: 'video/mp4',
    });

    const whereJson = JSON.stringify(findFirst.mock.calls[0]?.[0]?.where);
    for (const required of [
      'content-1',
      'PUBLISHED',
      'FILE',
      'LESSON_CONTENT',
      'READY',
      'video/mp4',
      'video/webm',
    ]) {
      expect(whereJson).toContain(required);
    }
  });

  it('does not sign after actor authorization fails', async () => {
    const { coordinator, storageService } = createHarness();
    const lockAuthorization = jest.fn().mockResolvedValue(false);

    await expect(
      coordinator.execute(request(lockAuthorization)),
    ).resolves.toBeNull();
    expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
  });

  it('rejects a candidate that changes before the final read', async () => {
    const { coordinator, findFirst, storageService, lockAuthorization } =
      createHarness();
    const changed = candidateFixture();
    changed.lesson.contentItems[0].file.objectKey = 'final/changed.mp4';
    changed.lesson.contentItems[0].file.uploadSession.finalObjectKey =
      'final/changed.mp4';
    findFirst
      .mockResolvedValueOnce(candidateFixture())
      .mockResolvedValueOnce(changed);

    await expect(
      coordinator.execute(request(lockAuthorization)),
    ).resolves.toBeNull();
    expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
  });
});

describe('LessonContentPlaybackPresenter', () => {
  it('returns only the six public fields', () => {
    const response = LessonContentPlaybackPresenter.present({
      url: 'https://storage.invalid/video',
      expiresAt: new Date('2026-07-24T12:05:00.000Z'),
      mimeType: 'video/webm',
      sizeBytes: BigInt(2048),
    });

    expect(Object.keys(response).sort()).toEqual([
      'disposition',
      'expiresAt',
      'mimeType',
      'renewable',
      'sizeBytes',
      'url',
    ]);
    expect(JSON.stringify(response)).not.toMatch(
      /fileId|uploadSessionId|schoolId|organizationId|bucket|objectKey|checksum|filename/,
    );
  });
});

function createHarness() {
  const findFirst = jest
    .fn<Promise<ReturnType<typeof candidateFixture>>, [{ where: unknown }]>()
    .mockResolvedValue(candidateFixture());
  const transaction = {
    lessonPlanItem: { findFirst },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'locked' }]),
  };
  const prisma = {
    scoped: { lessonPlanItem: { findFirst } },
    $transaction: jest.fn(
      (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const storageService = {
    createDownloadUrl: jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/video',
      expiresAt: new Date('2026-07-24T12:05:00.000Z'),
    }),
  };
  const lockAuthorization = jest.fn().mockResolvedValue(true);

  return {
    coordinator: new LessonContentPlaybackCoordinator(
      prisma as never,
      storageService as unknown as StorageService,
    ),
    findFirst,
    storageService,
    lockAuthorization,
  };
}

function request(
  lockAuthorization: (
    transaction: Prisma.TransactionClient,
    candidate: unknown,
  ) => Promise<boolean>,
) {
  return {
    schoolId: 'school-1',
    organizationId: 'organization-1',
    lessonPlanItemId: 'item-1',
    contentItemId: 'content-1',
    visibilityWhere: { schoolId: 'school-1' },
    policy: {
      curriculum: 'ACTIVE' as const,
      content: 'PUBLISHED' as const,
    },
    lockAuthorization,
  };
}

function candidateFixture() {
  return {
    id: 'item-1',
    lessonPlanId: 'plan-1',
    curriculumId: 'curriculum-1',
    unitId: 'unit-1',
    lessonId: 'lesson-1',
    lessonPlan: {
      id: 'plan-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      teacherSubjectAllocationId: 'allocation-1',
      teacherUserId: 'teacher-1',
      subjectId: 'subject-1',
      classroomId: 'classroom-1',
      classroom: {
        sectionId: 'section-1',
        section: {
          gradeId: 'grade-1',
          grade: { stageId: 'stage-1' },
        },
      },
    },
    lesson: {
      contentItems: [
        {
          id: 'content-1',
          curriculumId: 'curriculum-1',
          unitId: 'unit-1',
          lessonId: 'lesson-1',
          publicationStatus: LessonContentPublicationStatus.PUBLISHED,
          fileId: 'file-1',
          file: {
            id: 'file-1',
            bucket: 'final-bucket',
            objectKey: 'final/video.mp4',
            mimeType: 'video/mp4',
            sizeBytes: BigInt(4096),
            schoolId: 'school-1',
            organizationId: 'organization-1',
            uploadSession: {
              id: 'session-1',
              purpose: 'LESSON_CONTENT',
              status: 'READY',
              fileId: 'file-1',
              schoolId: 'school-1',
              organizationId: 'organization-1',
              finalBucket: 'final-bucket',
              finalObjectKey: 'final/video.mp4',
              finalCleanupClaimedAt: null,
              finalObjectDeletedAt: null,
              verifiedMimeType: 'video/mp4',
              actualSizeBytes: BigInt(4096),
              durationSeconds: 12,
              width: 640,
              height: 360,
              verifiedAt: new Date('2026-07-24T12:00:00.000Z'),
            },
          },
        },
      ],
    },
  };
}
