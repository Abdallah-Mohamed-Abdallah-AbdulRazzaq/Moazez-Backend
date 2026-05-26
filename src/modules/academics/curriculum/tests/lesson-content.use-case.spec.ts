import {
  CurriculumStatus,
  LessonContentItemType,
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
} from '../application/lesson-content.use-cases';
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
      updateContentItem: jest.fn().mockImplementation(async (id, data) =>
        contentItem({
          id,
          ...data,
          file: data.fileId ? fileRecord() : null,
        }),
      ),
      reorderContentItem: jest.fn(),
      softDeleteContentItem: jest.fn().mockResolvedValue({
        status: 'deleted',
        contentItem: contentItem({
          deletedAt: new Date('2026-05-26T12:00:00.000Z'),
        }),
      }),
      ...overrides,
    };

    return repo as unknown as LessonContentRepository;
  }

  function createAuthRepository() {
    return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  }

  it('creates TEXT content with body text', async () => {
    const repository = createRepository();
    const useCase = new CreateLessonContentUseCase(
      repository,
      createAuthRepository() as never,
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
      }),
    );
  });

  it('rejects TEXT without body text', async () => {
    const repository = createRepository();
    const useCase = new CreateLessonContentUseCase(
      repository,
      createAuthRepository() as never,
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
      repository,
      createAuthRepository() as never,
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
      repository,
      createAuthRepository() as never,
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
      });
    });
  });

  it('creates VIDEO_LINK and EXTERNAL_LINK content with safe URLs', async () => {
    const repository = createRepository();
    const useCase = new CreateLessonContentUseCase(
      repository,
      createAuthRepository() as never,
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
    'javascript:alert(1)',
    'data:text/plain,hello',
    'file:///tmp/a',
    '/relative',
  ])('rejects unsafe URL scheme %s', async (url) => {
    const repository = createRepository();
    const useCase = new CreateLessonContentUseCase(
      repository,
      createAuthRepository() as never,
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
      repository,
      createAuthRepository() as never,
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
      updateContentItem: jest.fn().mockResolvedValue(
        contentItem({
          id: 'content-1',
          lessonId: 'lesson-1',
          sortOrder: 0,
        }),
      ),
    });
    const useCase = new ReorderLessonContentUseCase(
      repository,
      createAuthRepository() as never,
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
    expect(repository.updateContentItem).toHaveBeenCalledWith('content-1', {
      sortOrder: 0,
      updatedByUserId: 'user-1',
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
