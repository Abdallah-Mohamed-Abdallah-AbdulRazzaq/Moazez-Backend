/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- focused Jest mocks intentionally inspect generated Prisma call tuples and detached mock methods. */
import {
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
  CreateLessonContentUseCase,
  ReorderLessonContentUseCase,
  UpdateLessonContentUseCase,
} from '../application/lesson-content.use-cases';
import type {
  LessonContentTransactionContext,
  LessonContentUnitOfWork,
} from '../application/lesson-content.unit-of-work';
import {
  LessonContentItemRecord,
  LessonContentRepository,
} from '../infrastructure/lesson-content.repository';
import { presentLessonContentItem } from '../presenters/lesson-content.presenter';

describe('Lesson content use cases', () => {
  const path = {
    curriculumId: 'curriculum-1',
    unitId: 'unit-1',
    lessonId: 'lesson-1',
  };

  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'academics.curriculum.view',
          'academics.curriculum.manage',
        ],
      });

      await testFn();
    });
  }

  function createRepository(
    overrides: Partial<Record<keyof LessonContentRepository, jest.Mock>> = {},
  ): LessonContentRepository {
    const repo = {
      findLessonContentScope: jest.fn().mockResolvedValue({
        curriculum: { id: 'curriculum-1', status: CurriculumStatus.DRAFT },
        unit: { id: 'unit-1', curriculumId: 'curriculum-1' },
        lesson: {
          id: 'lesson-1',
          curriculumId: 'curriculum-1',
          unitId: 'unit-1',
        },
      }),
      listLessonContentItems: jest.fn().mockResolvedValue([]),
      findLessonContentItemById: jest.fn().mockResolvedValue(contentItem()),
      getNextSortOrder: jest.fn().mockResolvedValue(3),
      findFileById: jest.fn().mockResolvedValue(fileRecord()),
      createContentItem: jest.fn().mockImplementation(async (data) =>
        contentItem({
          ...data,
          id: 'content-created',
          file: data.fileId ? fileRecord() : null,
        }),
      ),
      updateContentItemConditionally: jest
        .fn()
        .mockImplementation(async (input) => ({
          status: 'updated',
          contentItem: contentItem({
            id: input.contentItemId,
            ...input.data,
            file: input.data.fileId ? fileRecord() : null,
          }),
        })),
      ...overrides,
    };

    return repo as unknown as LessonContentRepository;
  }

  function createUnitOfWork(
    repository: LessonContentRepository,
  ): LessonContentUnitOfWork {
    const auditMock = jest.fn().mockResolvedValue(undefined);
    return {
      execute: jest.fn(
        async <T>(
          _schoolId: string,
          callback: (context: LessonContentTransactionContext) => Promise<T>,
        ): Promise<T> =>
          callback({
            lockLessonContentScope:
              repository.findLessonContentScope.bind(repository),
            getNextSortOrder: repository.getNextSortOrder.bind(repository),
            lockReadyLearningMediaFile: async (input: { fileId: string }) =>
              (await repository.findFileById(input.fileId))
                ? ({ status: 'ready' } as const)
                : ({ status: 'not_found' } as const),
            createContentItem: repository.createContentItem.bind(repository),
            updateContentItemConditionally:
              repository.updateContentItemConditionally.bind(repository),
            writeSuccessfulAudit: auditMock,
          }),
      ),
    };
  }

  it('creates TEXT content with body text', async () => {
    const repository = createRepository();
    const useCase = new CreateLessonContentUseCase(
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.TEXT,
          title: '  Reading Notes  ',
          bodyText: '  Read pages 1-3.  ',
        }),
      ).resolves.toMatchObject({
        contentItemId: 'content-created',
        type: 'text',
        title: 'Reading Notes',
        bodyText: 'Read pages 1-3.',
        sortOrder: 3,
      });
    });

    expect(repository.createContentItem).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Reading Notes',
        bodyText: 'Read pages 1-3.',
        url: null,
        fileId: null,
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        publishedAt: null,
        publishedByUserId: null,
        archivedAt: null,
        archivedByUserId: null,
      }),
    );
  });

  it('rejects TEXT without body text', async () => {
    const repository = createRepository();
    const useCase = new CreateLessonContentUseCase(
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.TEXT,
          title: 'Reading Notes',
          bodyText: '   ',
        }),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.invalid_type_payload',
      });
    });

    expect(repository.createContentItem).not.toHaveBeenCalled();
  });

  it('creates FILE content only when the file belongs to the scoped school', async () => {
    const repository = createRepository();
    const useCase = new CreateLessonContentUseCase(
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.FILE,
          title: 'Worksheet',
          fileId: 'file-1',
          bodyText: 'Optional worksheet caption',
        }),
      ).resolves.toMatchObject({
        type: 'file',
        file: {
          fileId: 'file-1',
          filename: 'worksheet.pdf',
        },
      });
    });

    expect(repository.findFileById).toHaveBeenCalledWith('file-1');
  });

  it('rejects FILE content with missing or wrong-school file', async () => {
    const repository = createRepository({
      findFileById: jest.fn().mockResolvedValue(null),
    });
    const useCase = new CreateLessonContentUseCase(
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.FILE,
          title: 'Worksheet',
          fileId: 'file-from-another-school',
        }),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.file_not_found',
        details: undefined,
      });
    });
  });

  it('omits nested path identifiers from lesson-content not-found details', async () => {
    const repository = createRepository({
      findLessonContentScope: jest.fn().mockResolvedValue({
        curriculum: null,
        unit: null,
        lesson: null,
      }),
    });
    const useCase = new CreateLessonContentUseCase(
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.TEXT,
          title: 'Hidden path',
          bodyText: 'Hidden path body',
        }),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.not_found',
        details: undefined,
      });
    });
  });

  it('creates VIDEO_LINK and EXTERNAL_LINK content with safe URLs', async () => {
    const repository = createRepository();
    const useCase = new CreateLessonContentUseCase(
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.VIDEO_LINK,
          title: 'Video',
          url: 'https://example.test/video?id=1',
        }),
      ).resolves.toMatchObject({
        type: 'video_link',
        url: 'https://example.test/video?id=1',
      });

      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.EXTERNAL_LINK,
          title: 'Reference',
          url: 'https://example.test/reference',
        }),
      ).resolves.toMatchObject({
        type: 'external_link',
        url: 'https://example.test/reference',
      });
    });
  });

  it.each([
    'https://storage.googleapis.com/bucket/object?X-Goog-Signature=do-not-leak',
    'http://127.0.0.1:9000/bucket/object',
    'https://bucket.s3.amazonaws.com/object',
    'gs://bucket/object',
    's3://bucket/object',
  ])(
    'blocks a provider URL on create without persisting or echoing it: %s',
    async (url) => {
      const repository = createRepository();
      const useCase = new CreateLessonContentUseCase(
        createUnitOfWork(repository),
      );

      await withScope(async () => {
        await expect(
          useCase.execute(path, {
            type: LessonContentItemType.EXTERNAL_LINK,
            title: 'Provider URL',
            url,
          }),
        ).rejects.toMatchObject({
          code: 'academics.lesson_content.invalid_url',
          details: {
            field: 'url',
            reasonCode: 'storage_provider_url_forbidden',
          },
        });
      });
      expect(repository.createContentItem).not.toHaveBeenCalled();
    },
  );

  it('blocks a provider URL on update while preserving ordinary URL behavior', async () => {
    const repository = createRepository({
      findLessonContentItemById: jest.fn().mockResolvedValue(
        contentItem({
          type: LessonContentItemType.EXTERNAL_LINK,
          url: 'https://external.example.test/old',
        }),
      ),
    });
    const useCase = new UpdateLessonContentUseCase(
      repository,
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(
          { ...path, contentItemId: 'content-1' },
          { url: 'https://bucket.storage.googleapis.com/object' },
        ),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.invalid_url',
        details: expect.objectContaining({
          reasonCode: 'storage_provider_url_forbidden',
        }),
      });
    });
    expect(repository.updateContentItemConditionally).not.toHaveBeenCalled();
  });

  it.each([
    'javascript:alert(1)',
    'data:text/plain,hello',
    'file:///tmp/a',
    '/relative',
  ])('rejects unsafe URL scheme %s', async (url) => {
    const repository = createRepository();
    const useCase = new CreateLessonContentUseCase(
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.EXTERNAL_LINK,
          title: 'Unsafe',
          url,
        }),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.invalid_url',
      });
    });
  });

  it('resolves a missing path before validating an unsafe create URL', async () => {
    const repository = createRepository({
      findLessonContentScope: jest.fn().mockResolvedValue({
        curriculum: null,
        unit: null,
        lesson: null,
      }),
    });
    const useCase = new CreateLessonContentUseCase(
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.EXTERNAL_LINK,
          title: 'Hidden unsafe URL',
          url: 'javascript:alert(1)',
        }),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.not_found',
      });
    });
  });

  it('resolves an archived Curriculum before validating an unsafe create URL', async () => {
    const repository = createRepository({
      findLessonContentScope: jest.fn().mockResolvedValue({
        curriculum: { id: 'curriculum-1', status: CurriculumStatus.ARCHIVED },
        unit: { id: 'unit-1', curriculumId: 'curriculum-1' },
        lesson: {
          id: 'lesson-1',
          curriculumId: 'curriculum-1',
          unitId: 'unit-1',
        },
      }),
    });
    const useCase = new CreateLessonContentUseCase(
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.EXTERNAL_LINK,
          title: 'Archived unsafe URL',
          url: 'javascript:alert(1)',
        }),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.read_only',
      });
    });
  });

  it('resolves a missing path before validating an invalid create title/body', async () => {
    const repository = createRepository({
      findLessonContentScope: jest.fn().mockResolvedValue({
        curriculum: null,
        unit: null,
        lesson: null,
      }),
    });
    const useCase = new CreateLessonContentUseCase(
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.TEXT,
          title: '   ',
          bodyText: '   ',
        }),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.not_found',
      });
    });
  });

  it('prevents content mutation when curriculum is archived', async () => {
    const repository = createRepository({
      findLessonContentScope: jest.fn().mockResolvedValue({
        curriculum: { id: 'curriculum-1', status: CurriculumStatus.ARCHIVED },
        unit: { id: 'unit-1', curriculumId: 'curriculum-1' },
        lesson: {
          id: 'lesson-1',
          curriculumId: 'curriculum-1',
          unitId: 'unit-1',
        },
      }),
    });
    const useCase = new CreateLessonContentUseCase(
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(path, {
          type: LessonContentItemType.TEXT,
          title: 'Archived',
          bodyText: 'Cannot add.',
        }),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.read_only',
      });
    });

    expect(repository.createContentItem).not.toHaveBeenCalled();
  });

  it('reorders content inside the same lesson', async () => {
    const repository = createRepository({
      findLessonContentItemById: jest.fn().mockResolvedValue(
        contentItem({
          id: 'content-1',
          lessonId: 'lesson-1',
          sortOrder: 4,
        }),
      ),
      updateContentItemConditionally: jest.fn().mockResolvedValue({
        status: 'updated',
        contentItem: contentItem({
          id: 'content-1',
          lessonId: 'lesson-1',
          sortOrder: 0,
        }),
      }),
    });
    const useCase = new ReorderLessonContentUseCase(
      repository,
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(
          { ...path, contentItemId: 'content-1' },
          { sortOrder: 0 },
        ),
      ).resolves.toMatchObject({
        contentItemId: 'content-1',
        lessonId: 'lesson-1',
        sortOrder: 0,
      });
    });

    expect(repository.findLessonContentItemById).toHaveBeenCalledWith({
      ...path,
      contentItemId: 'content-1',
    });
    expect(repository.updateContentItemConditionally).toHaveBeenCalledWith(
      expect.objectContaining({
        ...path,
        contentItemId: 'content-1',
        expectedPublicationStatus: LessonContentPublicationStatus.DRAFT,
        expectedUpdatedAt: new Date('2026-05-26T10:00:00.000Z'),
        data: expect.objectContaining({
          sortOrder: 0,
          updatedByUserId: 'user-1',
        }),
      }),
    );
  });

  it('resolves a missing path before validating an invalid reorder value', async () => {
    const repository = createRepository({
      findLessonContentScope: jest.fn().mockResolvedValue({
        curriculum: null,
        unit: null,
        lesson: null,
      }),
    });
    const useCase = new ReorderLessonContentUseCase(
      repository,
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(
          { ...path, contentItemId: 'missing-content' },
          { sortOrder: -1 },
        ),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.not_found',
      });
    });
  });

  it('resolves an archived Curriculum before validating an invalid reorder value', async () => {
    const repository = createRepository({
      findLessonContentScope: jest.fn().mockResolvedValue({
        curriculum: { id: 'curriculum-1', status: CurriculumStatus.ARCHIVED },
        unit: { id: 'unit-1', curriculumId: 'curriculum-1' },
        lesson: {
          id: 'lesson-1',
          curriculumId: 'curriculum-1',
          unitId: 'unit-1',
        },
      }),
    });
    const useCase = new ReorderLessonContentUseCase(
      repository,
      createUnitOfWork(repository),
    );

    await withScope(async () => {
      await expect(
        useCase.execute(
          { ...path, contentItemId: 'content-1' },
          { sortOrder: -1 },
        ),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.read_only',
      });
    });
  });

  it('presenter hides tenant fields', () => {
    const result = presentLessonContentItem(
      contentItem({
        fileId: 'file-1',
        file: fileRecord(),
      }),
    );
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      contentItemId: 'content-1',
      publicationStatus: 'draft',
      publishedAt: null,
      publishedByUserId: null,
      archivedAt: null,
      archivedByUserId: null,
      file: {
        fileId: 'file-1',
        filename: 'worksheet.pdf',
        mimeType: 'application/pdf',
      },
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
  });
});

function contentItem(
  overrides: Partial<LessonContentItemRecord> = {},
): LessonContentItemRecord {
  const now = new Date('2026-05-26T10:00:00.000Z');

  return {
    id: 'content-1',
    schoolId: 'school-1',
    curriculumId: 'curriculum-1',
    unitId: 'unit-1',
    lessonId: 'lesson-1',
    type: LessonContentItemType.TEXT,
    title: 'Content Item',
    bodyText: 'Body',
    url: null,
    fileId: null,
    sortOrder: 0,
    isRequired: false,
    estimatedMinutes: null,
    metadata: null,
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
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
  } as LessonContentItemRecord;
}

function fileRecord() {
  return {
    id: 'file-1',
    schoolId: 'school-1',
    originalName: 'worksheet.pdf',
    mimeType: 'application/pdf',
    sizeBytes: BigInt(1234),
    deletedAt: null,
  };
}
