/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- focused Jest mocks intentionally inspect generated Prisma call tuples and detached mock methods. */
import {
  AuditOutcome,
  CurriculumStatus,
  LessonContentItemType,
  LessonContentPublicationStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  ArchiveLessonContentUseCase,
  CreateLessonContentUseCase,
  DeleteLessonContentUseCase,
  PublishLessonContentUseCase,
  ReorderLessonContentUseCase,
  UnpublishLessonContentUseCase,
  UpdateLessonContentUseCase,
} from '../application/lesson-content.use-cases';
import type {
  LessonContentSuccessfulAuditEntry,
  LessonContentTransactionContext,
  LessonContentUnitOfWork,
} from '../application/lesson-content.unit-of-work';
import type { LessonContentPublicationConflictDetails } from '../domain/lesson-content.exceptions';
import type {
  LessonContentItemRecord,
  LessonContentRepository,
} from '../infrastructure/lesson-content.repository';
import { presentLessonContentItem } from '../presenters/lesson-content.presenter';

const PATH = {
  curriculumId: 'curriculum-1',
  unitId: 'unit-1',
  lessonId: 'lesson-1',
  contentItemId: 'content-1',
};

describe('Lesson content publication lifecycle use cases', () => {
  it.each([
    [LessonContentPublicationStatus.DRAFT, 'draft', null, null, null, null],
    [
      LessonContentPublicationStatus.PUBLISHED,
      'published',
      new Date('2026-07-21T08:00:00.000Z'),
      'publisher-1',
      null,
      null,
    ],
    [
      LessonContentPublicationStatus.ARCHIVED,
      'archived',
      new Date('2026-07-21T08:00:00.000Z'),
      'publisher-1',
      new Date('2026-07-21T09:00:00.000Z'),
      'archiver-1',
    ],
  ] as const)(
    'presents %s as lowercase with its lifecycle fields',
    (
      publicationStatus,
      expectedStatus,
      publishedAt,
      publishedByUserId,
      archivedAt,
      archivedByUserId,
    ) => {
      expect(
        presentLessonContentItem(
          contentItem({
            publicationStatus,
            publishedAt,
            publishedByUserId,
            archivedAt,
            archivedByUserId,
          }),
        ),
      ).toMatchObject({
        publicationStatus: expectedStatus,
        publishedAt: publishedAt?.toISOString() ?? null,
        publishedByUserId,
        archivedAt: archivedAt?.toISOString() ?? null,
        archivedByUserId,
      });
    },
  );

  it('creates explicit DRAFT content under an ACTIVE Curriculum', async () => {
    const harness = createHarness(contentItem(), {
      curriculumStatus: CurriculumStatus.ACTIVE,
    });
    const useCase = new CreateLessonContentUseCase(harness.unitOfWork);

    await inScope(() =>
      useCase.execute(PATH, {
        type: LessonContentItemType.TEXT,
        title: 'Draft notes',
        bodyText: 'Review before publishing.',
      }),
    );

    expect(harness.repository.createContentItem).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        publishedAt: null,
        publishedByUserId: null,
        archivedAt: null,
        archivedByUserId: null,
      }),
    );
  });

  it.each([
    [
      'field update',
      contentItem(),
      { title: 'Updated title', isRequired: true },
    ],
    ['TEXT body replacement', contentItem(), { bodyText: 'Updated body' }],
    [
      'VIDEO_LINK URL replacement',
      contentItem({
        type: LessonContentItemType.VIDEO_LINK,
        bodyText: null,
        url: 'https://example.test/old-video',
      }),
      { url: 'https://example.test/new-video' },
    ],
    [
      'EXTERNAL_LINK URL replacement',
      contentItem({
        type: LessonContentItemType.EXTERNAL_LINK,
        bodyText: null,
        url: 'https://example.test/old-reference',
      }),
      { url: 'https://example.test/new-reference' },
    ],
    [
      'FILE replacement',
      contentItem({
        type: LessonContentItemType.FILE,
        bodyText: null,
        fileId: 'file-1',
        file: fileRecord('file-1'),
      }),
      { fileId: 'file-2' },
    ],
    [
      'type change',
      contentItem(),
      { type: LessonContentItemType.FILE, fileId: 'file-2' },
    ],
  ] as const)('allows DRAFT %s', async (_label, existing, command) => {
    const harness = createHarness(existing);
    const useCase = new UpdateLessonContentUseCase(
      harness.repository,
      harness.unitOfWork,
    );

    await expect(
      inScope(() => useCase.execute(PATH, command)),
    ).resolves.toMatchObject({ publicationStatus: 'draft' });
    expect(
      harness.repository.updateContentItemConditionally,
    ).toHaveBeenCalledTimes(1);
  });

  it('allows DRAFT reorder and soft delete', async () => {
    const reorderHarness = createHarness(contentItem());
    const reorder = new ReorderLessonContentUseCase(
      reorderHarness.repository,
      reorderHarness.unitOfWork,
    );
    await expect(
      inScope(() => reorder.execute(PATH, { sortOrder: 7 })),
    ).resolves.toMatchObject({ sortOrder: 7 });

    const deleteHarness = createHarness(contentItem());
    const remove = new DeleteLessonContentUseCase(
      deleteHarness.repository,
      deleteHarness.unitOfWork,
    );
    await expect(inScope(() => remove.execute(PATH))).resolves.toEqual({
      ok: true,
    });
    expect(
      deleteHarness.repository.updateContentItemConditionally,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedPublicationStatus: LessonContentPublicationStatus.DRAFT,
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          updatedByUserId: 'actor-1',
        }),
      }),
    );
  });

  it.each([
    ['field update', { title: 'Blocked' }],
    ['body replacement', { bodyText: 'Blocked' }],
    ['URL replacement', { url: 'https://example.test/blocked' }],
    ['File replacement', { fileId: 'file-2' }],
    ['type change', { type: LessonContentItemType.FILE, fileId: 'file-2' }],
  ] as const)(
    'rejects PUBLISHED %s before mutation',
    async (_label, command) => {
      const harness = createHarness(publishedItem());
      const useCase = new UpdateLessonContentUseCase(
        harness.repository,
        harness.unitOfWork,
      );

      await expectPublicationConflict(
        inScope(() => useCase.execute(PATH, command)),
        {
          from: LessonContentPublicationStatus.PUBLISHED,
          to: LessonContentPublicationStatus.DRAFT,
        },
      );
      expect(
        harness.repository.updateContentItemConditionally,
      ).not.toHaveBeenCalled();
      expect(harness.repository.findFileById).not.toHaveBeenCalled();
      expect(harness.auditMock).not.toHaveBeenCalled();
    },
  );

  it('rejects PUBLISHED reorder and delete with zero mutation/audit', async () => {
    for (const operation of ['reorder', 'delete'] as const) {
      const harness = createHarness(publishedItem());
      const useCase =
        operation === 'reorder'
          ? new ReorderLessonContentUseCase(
              harness.repository,
              harness.unitOfWork,
            )
          : new DeleteLessonContentUseCase(
              harness.repository,
              harness.unitOfWork,
            );
      await expectPublicationConflict(
        inScope(() =>
          operation === 'reorder'
            ? (useCase as ReorderLessonContentUseCase).execute(PATH, {
                sortOrder: 9,
              })
            : (useCase as DeleteLessonContentUseCase).execute(PATH),
        ),
        {
          from: LessonContentPublicationStatus.PUBLISHED,
          to: LessonContentPublicationStatus.DRAFT,
        },
      );
      expect(
        harness.repository.updateContentItemConditionally,
      ).not.toHaveBeenCalled();
      expect(harness.auditMock).not.toHaveBeenCalled();
    }
  });

  it.each(['update', 'reorder', 'delete'] as const)(
    'rejects ARCHIVED %s as terminal',
    async (operation) => {
      const harness = createHarness(archivedItem());
      await expectPublicationConflict(
        inScope(() =>
          operation === 'update'
            ? new UpdateLessonContentUseCase(
                harness.repository,
                harness.unitOfWork,
              ).execute(PATH, { title: 'Blocked' })
            : operation === 'reorder'
              ? new ReorderLessonContentUseCase(
                  harness.repository,
                  harness.unitOfWork,
                ).execute(PATH, { sortOrder: 2 })
              : new DeleteLessonContentUseCase(
                  harness.repository,
                  harness.unitOfWork,
                ).execute(PATH),
        ),
        {
          from: LessonContentPublicationStatus.ARCHIVED,
          to: LessonContentPublicationStatus.DRAFT,
        },
      );
      expect(
        harness.repository.updateContentItemConditionally,
      ).not.toHaveBeenCalled();
      expect(harness.auditMock).not.toHaveBeenCalled();
    },
  );

  it('publishes DRAFT with one safe audit', async () => {
    const harness = createHarness(contentItem());
    const useCase = new PublishLessonContentUseCase(
      harness.repository,
      harness.unitOfWork,
    );

    const result = await inScope(() => useCase.execute(PATH));

    expect(result).toMatchObject({
      publicationStatus: 'published',
      publishedAt: expect.any(String),
      publishedByUserId: 'actor-1',
      archivedAt: null,
      archivedByUserId: null,
    });
    expect(harness.auditMock).toHaveBeenCalledTimes(1);
    expectTransitionAuditIsSafe(harness.auditMock.mock.calls[0]?.[0]);
    expect(harness.repository.findFileById).not.toHaveBeenCalled();
  });

  it('revalidates and locks a FILE dependency when publishing a DRAFT', async () => {
    const fileId = 'file-deleted-before-publish';
    const harness = createHarness(
      contentItem({
        type: LessonContentItemType.FILE,
        bodyText: null,
        fileId,
        file: fileRecord(fileId),
      }),
      { fileAvailable: false },
    );
    const useCase = new PublishLessonContentUseCase(
      harness.repository,
      harness.unitOfWork,
    );

    await expect(inScope(() => useCase.execute(PATH))).rejects.toMatchObject({
      code: 'academics.lesson_content.file_not_found',
      details: undefined,
    });
    expect(harness.repository.findFileById).toHaveBeenCalledWith(fileId);
    expect(
      harness.repository.updateContentItemConditionally,
    ).not.toHaveBeenCalled();
    expect(harness.auditMock).not.toHaveBeenCalled();
  });

  it('unpublishes PUBLISHED and clears the complete published pair', async () => {
    const harness = createHarness(publishedItem());
    const useCase = new UnpublishLessonContentUseCase(
      harness.repository,
      harness.unitOfWork,
    );

    await expect(inScope(() => useCase.execute(PATH))).resolves.toMatchObject({
      publicationStatus: 'draft',
      publishedAt: null,
      publishedByUserId: null,
      archivedAt: null,
      archivedByUserId: null,
    });
    expect(harness.auditMock).toHaveBeenCalledTimes(1);
  });

  it('archives PUBLISHED while retaining its complete published pair', async () => {
    const existing = publishedItem();
    const harness = createHarness(existing);
    const useCase = new ArchiveLessonContentUseCase(
      harness.repository,
      harness.unitOfWork,
    );

    await expect(inScope(() => useCase.execute(PATH))).resolves.toMatchObject({
      publicationStatus: 'archived',
      publishedAt: existing.publishedAt?.toISOString(),
      publishedByUserId: existing.publishedByUserId,
      archivedAt: expect.any(String),
      archivedByUserId: 'actor-1',
    });
    expect(harness.auditMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'DRAFT unpublish',
      contentItem(),
      UnpublishLessonContentUseCase,
      LessonContentPublicationStatus.DRAFT,
      LessonContentPublicationStatus.DRAFT,
    ],
    [
      'DRAFT archive',
      contentItem(),
      ArchiveLessonContentUseCase,
      LessonContentPublicationStatus.DRAFT,
      LessonContentPublicationStatus.ARCHIVED,
    ],
    [
      'PUBLISHED publish',
      publishedItem(),
      PublishLessonContentUseCase,
      LessonContentPublicationStatus.PUBLISHED,
      LessonContentPublicationStatus.PUBLISHED,
    ],
    [
      'ARCHIVED publish',
      archivedItem(),
      PublishLessonContentUseCase,
      LessonContentPublicationStatus.ARCHIVED,
      LessonContentPublicationStatus.PUBLISHED,
    ],
    [
      'ARCHIVED unpublish',
      archivedItem(),
      UnpublishLessonContentUseCase,
      LessonContentPublicationStatus.ARCHIVED,
      LessonContentPublicationStatus.DRAFT,
    ],
    [
      'ARCHIVED archive',
      archivedItem(),
      ArchiveLessonContentUseCase,
      LessonContentPublicationStatus.ARCHIVED,
      LessonContentPublicationStatus.ARCHIVED,
    ],
  ] as const)(
    'rejects invalid transition %s',
    async (_label, existing, UseCase, from, to) => {
      const harness = createHarness(existing);
      const useCase = new UseCase(harness.repository, harness.unitOfWork);

      await expectPublicationConflict(
        inScope(() => useCase.execute(PATH)),
        { from, to },
      );
      expect(
        harness.repository.updateContentItemConditionally,
      ).not.toHaveBeenCalled();
      expect(harness.auditMock).not.toHaveBeenCalled();
    },
  );

  it('maps a zero-row conditional result to the safe conflict without audit', async () => {
    const harness = createHarness(contentItem(), { conditionalConflict: true });
    const useCase = new PublishLessonContentUseCase(
      harness.repository,
      harness.unitOfWork,
    );

    await expectPublicationConflict(
      inScope(() => useCase.execute(PATH)),
      {
        from: LessonContentPublicationStatus.DRAFT,
        to: LessonContentPublicationStatus.PUBLISHED,
      },
    );
    expect(harness.auditMock).not.toHaveBeenCalled();
  });

  it('keeps ARCHIVED Curriculum on the existing read-only contract', async () => {
    const harness = createHarness(contentItem(), {
      curriculumStatus: CurriculumStatus.ARCHIVED,
    });
    const useCase = new PublishLessonContentUseCase(
      harness.repository,
      harness.unitOfWork,
    );

    await expect(inScope(() => useCase.execute(PATH))).rejects.toMatchObject({
      code: 'academics.lesson_content.read_only',
    });
    expect(
      harness.repository.updateContentItemConditionally,
    ).not.toHaveBeenCalled();
  });
});

function createHarness(
  initial: LessonContentItemRecord,
  options: {
    curriculumStatus?: CurriculumStatus;
    conditionalConflict?: boolean;
    fileAvailable?: boolean;
  } = {},
) {
  const auditMock = jest.fn().mockResolvedValue(undefined);
  const repository = {
    findLessonContentScope: jest.fn().mockResolvedValue({
      curriculum: {
        id: PATH.curriculumId,
        status: options.curriculumStatus ?? CurriculumStatus.ACTIVE,
      },
      unit: { id: PATH.unitId, curriculumId: PATH.curriculumId },
      lesson: {
        id: PATH.lessonId,
        curriculumId: PATH.curriculumId,
        unitId: PATH.unitId,
      },
    }),
    findLessonContentItemById: jest.fn().mockResolvedValue(initial),
    findFileById: jest
      .fn()
      .mockImplementation(async (fileId: string) =>
        options.fileAvailable === false ? null : fileRecord(fileId),
      ),
    getNextSortOrder: jest.fn().mockResolvedValue(1),
    createContentItem: jest.fn().mockImplementation(async (data) =>
      contentItem({
        ...data,
        id: 'created-content',
        file: data.fileId ? fileRecord(data.fileId as string) : null,
      }),
    ),
    updateContentItemConditionally: jest
      .fn()
      .mockImplementation(async (input) => {
        if (options.conditionalConflict) return { status: 'conflict' };
        return {
          status: 'updated',
          contentItem: contentItem({
            ...initial,
            ...input.data,
            file:
              input.data.fileId === null
                ? null
                : input.data.fileId
                  ? fileRecord(input.data.fileId as string)
                  : initial.file,
          }),
        };
      }),
  } as unknown as jest.Mocked<LessonContentRepository>;
  const unitOfWork: LessonContentUnitOfWork = {
    execute<T>(
      _schoolId: string,
      callback: (context: LessonContentTransactionContext) => Promise<T>,
    ): Promise<T> {
      return callback({
        lockLessonContentScope: repository.findLessonContentScope,
        lockReadyLearningMediaFile: async (input: { fileId: string }) =>
          (await repository.findFileById(input.fileId))
            ? ({ status: 'ready' } as const)
            : ({ status: 'not_found' } as const),
        getNextSortOrder: repository.getNextSortOrder,
        createContentItem: repository.createContentItem,
        updateContentItemConditionally:
          repository.updateContentItemConditionally,
        writeSuccessfulAudit: async (
          entry: LessonContentSuccessfulAuditEntry,
        ): Promise<void> => {
          await auditMock({
            ...entry,
            module: 'academics',
            resourceType: 'lesson_content_item',
            outcome: AuditOutcome.SUCCESS,
          });
        },
      });
    },
  };
  return { repository, unitOfWork, auditMock };
}

function contentItem(
  overrides: Partial<LessonContentItemRecord> = {},
): LessonContentItemRecord {
  const now = new Date('2026-07-21T07:00:00.000Z');
  return {
    id: PATH.contentItemId,
    schoolId: 'school-1',
    curriculumId: PATH.curriculumId,
    unitId: PATH.unitId,
    lessonId: PATH.lessonId,
    type: LessonContentItemType.TEXT,
    title: 'Review notes',
    bodyText: 'Draft body',
    url: null,
    fileId: null,
    sortOrder: 0,
    isRequired: false,
    estimatedMinutes: null,
    metadata: null,
    createdByUserId: 'actor-1',
    updatedByUserId: 'actor-1',
    publicationStatus: LessonContentPublicationStatus.DRAFT,
    publishedAt: null,
    publishedByUserId: null,
    archivedAt: null,
    archivedByUserId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    file: null,
    ...overrides,
  };
}

function publishedItem(): LessonContentItemRecord {
  return contentItem({
    publicationStatus: LessonContentPublicationStatus.PUBLISHED,
    publishedAt: new Date('2026-07-21T08:00:00.000Z'),
    publishedByUserId: 'publisher-1',
  });
}

function archivedItem(): LessonContentItemRecord {
  return contentItem({
    publicationStatus: LessonContentPublicationStatus.ARCHIVED,
    publishedAt: new Date('2026-07-21T08:00:00.000Z'),
    publishedByUserId: 'publisher-1',
    archivedAt: new Date('2026-07-21T09:00:00.000Z'),
    archivedByUserId: 'archiver-1',
  });
}

function fileRecord(id: string) {
  return {
    id,
    schoolId: 'school-1',
    originalName: 'lesson-resource.pdf',
    mimeType: 'application/pdf',
    sizeBytes: BigInt(2048),
    deletedAt: null,
  };
}

async function expectPublicationConflict(
  promise: Promise<unknown>,
  expectedDetails: LessonContentPublicationConflictDetails,
): Promise<void> {
  let conflict: unknown;

  try {
    await promise;
  } catch (error) {
    conflict = error;
  }

  expect(conflict).toMatchObject({
    code: 'learning.content.publication_conflict',
    httpStatus: 409,
  });
  const details = (conflict as { details?: Record<string, unknown> }).details;
  expect(details).toEqual(expectedDetails);
  expect(Object.keys(details ?? {}).sort()).toEqual(['from', 'to']);
  expect(JSON.stringify(details)).not.toMatch(
    /contentItemId|curriculumId|unitId|lessonId|schoolId|actorId|title|bodyText|url|fileId|timestamp|updatedAt/iu,
  );
}

function expectTransitionAuditIsSafe(audit: unknown): void {
  const serialized = JSON.stringify(audit);
  for (const forbidden of [
    'title',
    'bodyText',
    'url',
    'fileId',
    'metadata',
    'filename',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(audit).toMatchObject({
    action: 'academics.lesson_content.publish',
    resourceType: 'lesson_content_item',
    resourceId: PATH.contentItemId,
    before: {
      publicationStatus: LessonContentPublicationStatus.DRAFT,
      publishedAt: null,
      archivedAt: null,
    },
    after: {
      publicationStatus: LessonContentPublicationStatus.PUBLISHED,
      publishedAt: expect.any(String),
      archivedAt: null,
    },
  });
}

async function inScope<T>(callback: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'actor-1', userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: 'organization-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['academics.curriculum.manage'],
    });
    return callback();
  });
}
