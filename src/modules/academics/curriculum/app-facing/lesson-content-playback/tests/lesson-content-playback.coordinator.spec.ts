import { LessonContentPublicationStatus, Prisma } from '@prisma/client';
import { StorageService } from '../../../../../../infrastructure/storage/storage.service';
import { LessonContentPlaybackCoordinator } from '../lesson-content-playback.coordinator';
import { LessonContentPlaybackPresenter } from '../lesson-content-playback.presenter';

describe('LessonContentPlaybackCoordinator', () => {
  it('signs outside the database transactions and returns only after final revalidation', async () => {
    const {
      coordinator,
      findFirst,
      prisma,
      storageService,
      lockAuthorization,
      transactionDepth,
    } = createHarness();

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

    expect(findFirst).toHaveBeenCalledTimes(3);
    expect(lockAuthorization).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(transactionDepth.atSigning).toBe(0);
    expect(transactionDepth.locksAtSigning).toBe(0);
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

  it('does not authorize or sign when no initial playable candidate exists', async () => {
    const { coordinator, findFirst, storageService, lockAuthorization } =
      createHarness();
    findFirst.mockResolvedValueOnce(null);

    await expect(
      coordinator.execute(request(lockAuthorization)),
    ).resolves.toBeNull();
    expect(lockAuthorization).not.toHaveBeenCalled();
    expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
  });

  it('does not expose a signed capability when the final authorization changes', async () => {
    const { coordinator, storageService, lockAuthorization } = createHarness();
    lockAuthorization.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      coordinator.execute(request(lockAuthorization)),
    ).resolves.toBeNull();
    expect(storageService.createDownloadUrl).toHaveBeenCalledTimes(1);
    expect(lockAuthorization).toHaveBeenCalledTimes(2);
  });

  it('returns null when the candidate changes while signing is pending', async () => {
    let resolveSigning!: (value: {
      url: string;
      expiresAt: Date;
    }) => void;
    const signing = new Promise<{ url: string; expiresAt: Date }>((resolve) => {
      resolveSigning = resolve;
    });
    const { coordinator, findFirst, storageService, lockAuthorization } =
      createHarness({ signing });

    const result = coordinator.execute(request(lockAuthorization));
    await signingStarted(storageService);
    const changed = candidateFixture();
    changed.lesson.contentItems[0].file.objectKey = 'final/replaced.mp4';
    changed.lesson.contentItems[0].file.uploadSession.finalObjectKey =
      'final/replaced.mp4';
    findFirst.mockResolvedValue(changed);
    resolveSigning({
      url: 'https://storage.invalid/replaced',
      expiresAt: new Date('2026-07-24T12:05:00.000Z'),
    });

    await expect(result).resolves.toBeNull();
  });

  it('returns null when publication changes while signing is pending', async () => {
    const { result, resolveSigning, findFirst } = pendingSigningHarness();
    const changed = candidateFixture();
    changed.lesson.contentItems[0].publicationStatus =
      LessonContentPublicationStatus.DRAFT;
    findFirst.mockResolvedValue(changed);
    resolveSigning();
    await expect(result).resolves.toBeNull();
  });

  it('returns null when file and upload-session identity changes while signing is pending', async () => {
    const { result, resolveSigning, findFirst } = pendingSigningHarness();
    const changed = candidateFixture();
    changed.lesson.contentItems[0].file.uploadSession.id = 'session-2';
    findFirst.mockResolvedValue(changed);
    resolveSigning();
    await expect(result).resolves.toBeNull();
  });

  it('returns null when media is removed while signing is pending', async () => {
    const { result, resolveSigning, findFirst } = pendingSigningHarness();
    findFirst.mockResolvedValue(null);
    resolveSigning();
    await expect(result).resolves.toBeNull();
  });

  it('propagates storage signing rejection without a final transaction', async () => {
    const signingFailure = new Error('provider unavailable');
    const { coordinator, prisma, storageService, lockAuthorization } =
      createHarness({ signing: Promise.reject(signingFailure) });

    await expect(
      coordinator.execute(request(lockAuthorization)),
    ).rejects.toBe(signingFailure);
    expect(storageService.createDownloadUrl).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('never exposes the generated capability after final candidate rejection', async () => {
    const { coordinator, findFirst, storageService, lockAuthorization } =
      createHarness();
    findFirst
      .mockResolvedValueOnce(candidateFixture())
      .mockResolvedValueOnce(candidateFixture())
      .mockResolvedValueOnce(null);

    await expect(
      coordinator.execute(request(lockAuthorization)),
    ).resolves.toBeNull();
    expect(storageService.createDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it('invokes a pure withPlayableMedia callback exactly once', async () => {
    const { coordinator, lockAuthorization } = createHarness();
    const operation = jest.fn().mockResolvedValue({ playable: true });

    await expect(
      coordinator.withPlayableMedia(request(lockAuthorization), operation),
    ).resolves.toEqual({ playable: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('propagates a withPlayableMedia callback rejection exactly once', async () => {
    const { coordinator, lockAuthorization } = createHarness();
    const callbackFailure = new Error('read-only provider failed');
    const operation = jest.fn().mockRejectedValue(callbackFailure);

    await expect(
      coordinator.withPlayableMedia(request(lockAuthorization), operation),
    ).rejects.toBe(callbackFailure);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('keeps both the transaction and playback locks closed for the entire provider wait', async () => {
    let release!: () => void;
    const provider = new Promise<{ url: string; expiresAt: Date }>((resolve) => {
      release = () =>
        resolve({
          url: 'https://storage.invalid/video',
          expiresAt: new Date('2026-07-24T12:05:00.000Z'),
        });
    });
    const { coordinator, storageService, lockAuthorization, transactionDepth } =
      createHarness({ signing: provider });

    const result = coordinator.execute(request(lockAuthorization));
    await signingStarted(storageService);
    expect(transactionDepth.current).toBe(0);
    expect(transactionDepth.locksHeld).toBe(0);
    release();
    await expect(result).resolves.not.toBeNull();
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

function createHarness(options: {
  signing?: Promise<{ url: string; expiresAt: Date }>;
} = {}) {
  const findFirst = jest
    .fn<
      Promise<ReturnType<typeof candidateFixture> | null>,
      [{ where: unknown }]
    >()
    .mockResolvedValue(candidateFixture());
  const transaction = {
    lessonPlanItem: { findFirst },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'locked' }]),
  };
  const transactionDepth = {
    current: 0,
    atSigning: -1,
    locksHeld: 0,
    locksAtSigning: -1,
  };
  transaction.$queryRaw.mockImplementation(async () => {
    transactionDepth.locksHeld += 1;
    return [{ id: 'locked' }];
  });
  const prisma = {
    scoped: { lessonPlanItem: { findFirst } },
    $transaction: jest.fn(async (callback: (client: typeof transaction) => Promise<unknown>) => {
      transactionDepth.current += 1;
      try {
        return await callback(transaction);
      } finally {
        transactionDepth.locksHeld = 0;
        transactionDepth.current -= 1;
      }
    }),
  };
  const storageService = {
    createDownloadUrl: jest.fn().mockImplementation(async () => {
      transactionDepth.atSigning = transactionDepth.current;
      transactionDepth.locksAtSigning = transactionDepth.locksHeld;
      if (options.signing) return options.signing;
      return {
        url: 'https://storage.invalid/video',
        expiresAt: new Date('2026-07-24T12:05:00.000Z'),
      };
    }),
  };
  const lockAuthorization = jest.fn().mockResolvedValue(true);

  return {
    coordinator: new LessonContentPlaybackCoordinator(
      prisma as never,
      storageService as unknown as StorageService,
    ),
    findFirst,
    prisma,
    storageService,
    lockAuthorization,
    transactionDepth,
  };
}

function pendingSigningHarness() {
  let resolvePromise!: (value: { url: string; expiresAt: Date }) => void;
  const signing = new Promise<{ url: string; expiresAt: Date }>((resolve) => {
    resolvePromise = resolve;
  });
  const harness = createHarness({ signing });
  harness.findFirst
    .mockResolvedValueOnce(candidateFixture())
    .mockResolvedValueOnce(candidateFixture());
  const result = harness.coordinator.execute(request(harness.lockAuthorization));
  return {
    ...harness,
    result,
    resolveSigning: () =>
      resolvePromise({
        url: 'https://storage.invalid/video',
        expiresAt: new Date('2026-07-24T12:05:00.000Z'),
      }),
  };
}

async function signingStarted(storageService: {
  createDownloadUrl: jest.Mock;
}): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (storageService.createDownloadUrl.mock.calls.length > 0) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('storage signing did not start');
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
