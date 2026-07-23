import { randomUUID } from 'node:crypto';
import {
  CurriculumStatus,
  FileVisibility,
  LessonContentItemType,
  LessonContentPublicationStatus,
  OrganizationStatus,
  Prisma,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AuthRepository } from '../../src/modules/iam/auth/infrastructure/auth.repository';
import {
  ArchiveCurriculumUseCase,
  DeleteCurriculumLessonUseCase,
  DeleteCurriculumUnitUseCase,
  DeleteCurriculumUseCase,
} from '../../src/modules/academics/curriculum/application/curriculum.use-cases';
import {
  ArchiveLessonContentUseCase,
  CreateLessonContentUseCase,
  DeleteLessonContentUseCase,
  PublishLessonContentUseCase,
  ReorderLessonContentUseCase,
  UnpublishLessonContentUseCase,
  UpdateLessonContentUseCase,
} from '../../src/modules/academics/curriculum/application/lesson-content.use-cases';
import type {
  LessonContentItemPath,
  LessonContentUnitOfWork,
  LessonContentSuccessfulAuditEntry,
  LessonContentTransactionContext,
} from '../../src/modules/academics/curriculum/application/lesson-content.unit-of-work';
import { CurriculumRepository } from '../../src/modules/academics/curriculum/infrastructure/curriculum.repository';
import { LessonContentRepository } from '../../src/modules/academics/curriculum/infrastructure/lesson-content.repository';
import { PrismaLessonContentUnitOfWork } from '../../src/modules/academics/curriculum/infrastructure/prisma-lesson-content.unit-of-work';
import { FilesRepository } from '../../src/modules/files/uploads/infrastructure/files.repository';

jest.setTimeout(120_000);

function buildObserverDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error(
      'DATABASE_URL is required for PostgreSQL lock observation tests',
    );
  }

  try {
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('pool_timeout', '10');
    return url.toString();
  } catch {
    throw new Error(
      'DATABASE_URL must be a valid URL for PostgreSQL lock observation tests',
    );
  }
}

describe('Lesson Content publication atomicity and parent-state locking', () => {
  const prisma = new PrismaService();
  const observerPrisma = new PrismaClient({
    datasourceUrl: buildObserverDatabaseUrl(),
  });
  const curriculumRepository = new CurriculumRepository(prisma);
  const authRepository = new AuthRepository(prisma);
  const filesRepository = new FilesRepository(prisma);
  const repository = new LessonContentRepository(prisma);
  const unitOfWork = new PrismaLessonContentUnitOfWork(prisma, repository);
  const createUseCase = new CreateLessonContentUseCase(unitOfWork);
  const updateUseCase = new UpdateLessonContentUseCase(repository, unitOfWork);
  const deleteUseCase = new DeleteLessonContentUseCase(repository, unitOfWork);
  const publishUseCase = new PublishLessonContentUseCase(
    repository,
    unitOfWork,
  );
  const deleteCurriculumUseCase = new DeleteCurriculumUseCase(
    curriculumRepository,
    authRepository,
  );
  const deleteUnitUseCase = new DeleteCurriculumUnitUseCase(
    curriculumRepository,
    authRepository,
  );
  const deleteLessonUseCase = new DeleteCurriculumLessonUseCase(
    curriculumRepository,
    authRepository,
  );
  const archiveCurriculumUseCase = new ArchiveCurriculumUseCase(
    curriculumRepository,
    authRepository,
  );
  const auditFailingUnitOfWork = createAuditFailingUnitOfWork(unitOfWork);
  const auditFailingCreateUseCase = new CreateLessonContentUseCase(
    auditFailingUnitOfWork,
  );
  const auditFailingUpdateUseCase = new UpdateLessonContentUseCase(
    repository,
    auditFailingUnitOfWork,
  );
  const auditFailingReorderUseCase = new ReorderLessonContentUseCase(
    repository,
    auditFailingUnitOfWork,
  );
  const auditFailingDeleteUseCase = new DeleteLessonContentUseCase(
    repository,
    auditFailingUnitOfWork,
  );
  const auditFailingPublishUseCase = new PublishLessonContentUseCase(
    repository,
    auditFailingUnitOfWork,
  );
  const auditFailingUnpublishUseCase = new UnpublishLessonContentUseCase(
    repository,
    auditFailingUnitOfWork,
  );
  const auditFailingArchiveUseCase = new ArchiveLessonContentUseCase(
    repository,
    auditFailingUnitOfWork,
  );
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    organizationId: '',
    schoolId: '',
    foreignSchoolId: '',
    userId: '',
    academicYearId: '',
    termId: '',
    stageId: '',
    gradeId: '',
    subjectId: '',
    curriculumId: '',
    unitId: '',
    lessonId: '',
  };

  beforeAll(async () => {
    await prisma.$connect();
    await observerPrisma.$connect();
    const organization = await prisma.organization.create({
      data: {
        slug: `lc-h1-org-${suffix}`,
        name: `LC H1 Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    ids.organizationId = organization.id;
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `lc-h1-school-${suffix}`,
        name: `LC H1 School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    ids.schoolId = school.id;
    const foreignSchool = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `lc-h1-foreign-${suffix}`,
        name: `LC H1 Foreign ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    ids.foreignSchoolId = foreignSchool.id;
    const user = await prisma.user.create({
      data: {
        email: `lc-h1-${suffix}@example.test`,
        firstName: 'Atomicity',
        lastName: 'Actor',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    ids.userId = user.id;
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        nameAr: `عام-${suffix}`,
        nameEn: `Year-${suffix}`,
        startDate: new Date('2031-09-01T00:00:00.000Z'),
        endDate: new Date('2032-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    ids.academicYearId = academicYear.id;
    const term = await prisma.term.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        nameAr: `فصل-${suffix}`,
        nameEn: `Term-${suffix}`,
        startDate: new Date('2031-09-01T00:00:00.000Z'),
        endDate: new Date('2031-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    ids.termId = term.id;
    const stage = await prisma.stage.create({
      data: {
        schoolId: school.id,
        nameAr: `مرحلة-${suffix}`,
        nameEn: `Stage-${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    ids.stageId = stage.id;
    const grade = await prisma.grade.create({
      data: {
        schoolId: school.id,
        stageId: stage.id,
        nameAr: `صف-${suffix}`,
        nameEn: `Grade-${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    ids.gradeId = grade.id;
    const subject = await prisma.subject.create({
      data: {
        schoolId: school.id,
        nameAr: `مادة-${suffix}`,
        nameEn: `Subject-${suffix}`,
        code: `LC-H1-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });
    ids.subjectId = subject.id;
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        termId: term.id,
        gradeId: grade.id,
        subjectId: subject.id,
        title: `LC H1 Curriculum ${suffix}`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: user.id,
        updatedByUserId: user.id,
      },
      select: { id: true },
    });
    ids.curriculumId = curriculum.id;
    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: school.id,
        curriculumId: curriculum.id,
        title: `LC H1 Unit ${suffix}`,
      },
      select: { id: true },
    });
    ids.unitId = unit.id;
    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: school.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `LC H1 Lesson ${suffix}`,
      },
      select: { id: true },
    });
    ids.lessonId = lesson.id;
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { schoolId: ids.schoolId } });
    await prisma.lessonContentItem.deleteMany({
      where: { schoolId: ids.schoolId },
    });
    await prisma.fileUploadSession.deleteMany({
      where: { schoolId: { in: [ids.schoolId, ids.foreignSchoolId] } },
    });
    await prisma.file.deleteMany({
      where: { schoolId: { in: [ids.schoolId, ids.foreignSchoolId] } },
    });
    await prisma.curriculumLesson.update({
      where: { id: ids.lessonId },
      data: { deletedAt: null },
    });
    await prisma.curriculumUnit.update({
      where: { id: ids.unitId },
      data: { deletedAt: null },
    });
    await prisma.curriculum.update({
      where: { id: ids.curriculumId },
      data: { status: CurriculumStatus.ACTIVE, deletedAt: null },
    });
  });

  afterAll(async () => {
    try {
      await prisma.auditLog.deleteMany({ where: { schoolId: ids.schoolId } });
      await prisma.lessonContentItem.deleteMany({
        where: { schoolId: ids.schoolId },
      });
      await prisma.fileUploadSession.deleteMany({
        where: { schoolId: { in: [ids.schoolId, ids.foreignSchoolId] } },
      });
      await prisma.file.deleteMany({
        where: { schoolId: { in: [ids.schoolId, ids.foreignSchoolId] } },
      });
      await prisma.curriculumLesson.delete({ where: { id: ids.lessonId } });
      await prisma.curriculumUnit.delete({ where: { id: ids.unitId } });
      await prisma.curriculum.delete({ where: { id: ids.curriculumId } });
      await prisma.subject.delete({ where: { id: ids.subjectId } });
      await prisma.grade.delete({ where: { id: ids.gradeId } });
      await prisma.stage.delete({ where: { id: ids.stageId } });
      await prisma.term.delete({ where: { id: ids.termId } });
      await prisma.academicYear.delete({
        where: { id: ids.academicYearId },
      });
      await prisma.school.delete({ where: { id: ids.foreignSchoolId } });
      await prisma.school.delete({ where: { id: ids.schoolId } });
      await prisma.user.delete({ where: { id: ids.userId } });
      await prisma.organization.delete({ where: { id: ids.organizationId } });
    } finally {
      try {
        await observerPrisma.$disconnect();
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  describe('transaction-context success-audit rollback', () => {
    it.each([
      ['publish', LessonContentPublicationStatus.DRAFT],
      ['unpublish', LessonContentPublicationStatus.PUBLISHED],
      ['archive', LessonContentPublicationStatus.PUBLISHED],
    ] as const)(
      'rolls back %s when the success audit violates its actor FK',
      async (operation, initialStatus) => {
        const item = await createContent(initialStatus);
        await expect(
          mutateThenFailAudit(item, operation),
        ).rejects.toBeDefined();

        const persisted = await prisma.lessonContentItem.findUniqueOrThrow({
          where: { id: item.id },
        });
        expect(persisted.publicationStatus).toBe(initialStatus);
        expect(persisted.updatedAt).toEqual(item.updatedAt);
        await expectAuditCount(item.id, 0);
      },
    );

    it('rolls back a field update after audit failure', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT, {
        title: 'Original atomic title',
      });
      await expect(mutateThenFailAudit(item, 'update')).rejects.toBeDefined();
      await expectPersisted(item.id, {
        title: 'Original atomic title',
        updatedAt: item.updatedAt,
      });
      await expectAuditCount(item.id, 0);
    });

    it('rolls back reorder after audit failure', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT, {
        sortOrder: 4,
      });
      await expect(mutateThenFailAudit(item, 'reorder')).rejects.toBeDefined();
      await expectPersisted(item.id, {
        sortOrder: 4,
        updatedAt: item.updatedAt,
      });
      await expectAuditCount(item.id, 0);
    });

    it('rolls back soft delete after audit failure', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT);
      await expect(mutateThenFailAudit(item, 'delete')).rejects.toBeDefined();
      await expectPersisted(item.id, {
        deletedAt: null,
        updatedAt: item.updatedAt,
      });
      await expectAuditCount(item.id, 0);
    });

    it('rolls back create after audit failure', async () => {
      const title = `Rolled back create ${randomUUID()}`;
      await expect(
        unitOfWork.execute(ids.schoolId, async (tx) => {
          await expectLockedScope(tx);
          const content = await tx.createContentItem({
            schoolId: ids.schoolId,
            curriculumId: ids.curriculumId,
            unitId: ids.unitId,
            lessonId: ids.lessonId,
            type: LessonContentItemType.TEXT,
            title,
            bodyText: 'This row must roll back.',
            createdByUserId: ids.userId,
            updatedByUserId: ids.userId,
          });
          await writeInvalidAudit(tx, content.id, 'create');
        }),
      ).rejects.toBeDefined();

      await expect(
        prisma.lessonContentItem.count({ where: { title } }),
      ).resolves.toBe(0);
      await expect(
        prisma.auditLog.count({
          where: {
            schoolId: ids.schoolId,
            action: 'academics.lesson_content.create',
          },
        }),
      ).resolves.toBe(0);
    });
  });

  describe('actual use-case success-audit rollback', () => {
    it('rolls back CreateLessonContentUseCase when its audit insert fails', async () => {
      const title = `Use-case rollback create ${randomUUID()}`;

      await expect(
        inScope(() =>
          auditFailingCreateUseCase.execute(pathFor(), {
            type: LessonContentItemType.TEXT,
            title,
            bodyText: 'This use-case create must roll back.',
          }),
        ),
      ).rejects.toMatchObject({ code: 'P2003' });

      await expect(
        prisma.lessonContentItem.count({ where: { title } }),
      ).resolves.toBe(0);
      await expectActionAuditCountForSchool('create', 0);
    });

    it('rolls back UpdateLessonContentUseCase when its audit insert fails', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT, {
        title: 'Original use-case rollback title',
      });

      await expect(
        inScope(() =>
          auditFailingUpdateUseCase.execute(pathFor(item.id), {
            title: 'Rejected use-case rollback title',
          }),
        ),
      ).rejects.toMatchObject({ code: 'P2003' });

      await expectPersisted(item.id, {
        title: 'Original use-case rollback title',
        updatedAt: item.updatedAt,
      });
      await expectAuditCount(item.id, 0);
    });

    it('rolls back ReorderLessonContentUseCase when its audit insert fails', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT, {
        sortOrder: 8,
      });

      await expect(
        inScope(() =>
          auditFailingReorderUseCase.execute(pathFor(item.id), {
            sortOrder: 2,
          }),
        ),
      ).rejects.toMatchObject({ code: 'P2003' });

      await expectPersisted(item.id, {
        sortOrder: 8,
        updatedAt: item.updatedAt,
      });
      await expectAuditCount(item.id, 0);
    });

    it('rolls back DeleteLessonContentUseCase when its audit insert fails', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT);

      await expect(
        inScope(() => auditFailingDeleteUseCase.execute(pathFor(item.id))),
      ).rejects.toMatchObject({ code: 'P2003' });

      await expectPersisted(item.id, {
        deletedAt: null,
        updatedAt: item.updatedAt,
      });
      await expectAuditCount(item.id, 0);
    });

    it('rolls back PublishLessonContentUseCase when its audit insert fails', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT);

      await expect(
        inScope(() => auditFailingPublishUseCase.execute(pathFor(item.id))),
      ).rejects.toMatchObject({ code: 'P2003' });

      await expectPersisted(item.id, {
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        publishedAt: null,
        publishedByUserId: null,
        updatedAt: item.updatedAt,
      });
      await expectAuditCount(item.id, 0);
    });

    it('rolls back UnpublishLessonContentUseCase when its audit insert fails', async () => {
      const item = await createContent(
        LessonContentPublicationStatus.PUBLISHED,
      );

      await expect(
        inScope(() => auditFailingUnpublishUseCase.execute(pathFor(item.id))),
      ).rejects.toMatchObject({ code: 'P2003' });

      await expectPersisted(item.id, {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: item.publishedAt,
        publishedByUserId: item.publishedByUserId,
        updatedAt: item.updatedAt,
      });
      await expectAuditCount(item.id, 0);
    });

    it('rolls back ArchiveLessonContentUseCase when its audit insert fails', async () => {
      const item = await createContent(
        LessonContentPublicationStatus.PUBLISHED,
      );

      await expect(
        inScope(() => auditFailingArchiveUseCase.execute(pathFor(item.id))),
      ).rejects.toMatchObject({ code: 'P2003' });

      await expectPersisted(item.id, {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: item.publishedAt,
        publishedByUserId: item.publishedByUserId,
        archivedAt: null,
        archivedByUserId: null,
        updatedAt: item.updatedAt,
      });
      await expectAuditCount(item.id, 0);
    });
  });

  describe('one conditional winner and one success audit', () => {
    it('serializes two publish attempts to one updated and one conflict', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT);
      const results = await Promise.all([
        conditionalAttempt(item, 'publish'),
        conditionalAttempt(item, 'publish'),
      ]);
      expectOneUpdatedOneConflict(results);
      await expectFinalState(item.id, {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
      });
      await expectActionAuditCount(item.id, ['publish'], 1);
    });

    it('serializes update versus publish with one winner and one audit', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT, {
        title: 'Original race title',
      });
      const results = await Promise.all([
        conditionalAttempt(item, 'update'),
        conditionalAttempt(item, 'publish'),
      ]);
      expectOneUpdatedOneConflict(results);
      const final = await prisma.lessonContentItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(
        (final.publicationStatus === LessonContentPublicationStatus.DRAFT &&
          final.title === 'Conditional update winner') ||
          (final.publicationStatus ===
            LessonContentPublicationStatus.PUBLISHED &&
            final.title === 'Original race title'),
      ).toBe(true);
      await expectActionAuditCount(item.id, ['update', 'publish'], 1);
    });

    it('serializes delete versus publish with one winner and one audit', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT);
      const results = await Promise.all([
        conditionalAttempt(item, 'delete'),
        conditionalAttempt(item, 'publish'),
      ]);
      expectOneUpdatedOneConflict(results);
      const final = await prisma.lessonContentItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(
        (final.publicationStatus === LessonContentPublicationStatus.DRAFT &&
          final.deletedAt !== null) ||
          (final.publicationStatus ===
            LessonContentPublicationStatus.PUBLISHED &&
            final.deletedAt === null),
      ).toBe(true);
      await expectActionAuditCount(item.id, ['delete', 'publish'], 1);
    });

    it('serializes two archive attempts to one updated and one conflict', async () => {
      const item = await createContent(
        LessonContentPublicationStatus.PUBLISHED,
      );
      const results = await Promise.all([
        conditionalAttempt(item, 'archive'),
        conditionalAttempt(item, 'archive'),
      ]);
      expectOneUpdatedOneConflict(results);
      await expectFinalState(item.id, {
        publicationStatus: LessonContentPublicationStatus.ARCHIVED,
      });
      await expectActionAuditCount(item.id, ['archive'], 1);
    });
  });

  describe('actual production cascade correction contract', () => {
    it.each([
      ['curriculum', 'DRAFT', [LessonContentPublicationStatus.DRAFT], true],
      [
        'curriculum',
        'PUBLISHED',
        [LessonContentPublicationStatus.PUBLISHED],
        false,
      ],
      [
        'curriculum',
        'ARCHIVED',
        [LessonContentPublicationStatus.ARCHIVED],
        true,
      ],
      [
        'curriculum',
        'DRAFT + PUBLISHED',
        [
          LessonContentPublicationStatus.DRAFT,
          LessonContentPublicationStatus.PUBLISHED,
        ],
        false,
      ],
      [
        'curriculum',
        'DRAFT + ARCHIVED',
        [
          LessonContentPublicationStatus.DRAFT,
          LessonContentPublicationStatus.ARCHIVED,
        ],
        true,
      ],
      [
        'curriculum',
        'PUBLISHED + ARCHIVED',
        [
          LessonContentPublicationStatus.PUBLISHED,
          LessonContentPublicationStatus.ARCHIVED,
        ],
        false,
      ],
      ['unit', 'DRAFT', [LessonContentPublicationStatus.DRAFT], true],
      ['unit', 'PUBLISHED', [LessonContentPublicationStatus.PUBLISHED], false],
      ['unit', 'ARCHIVED', [LessonContentPublicationStatus.ARCHIVED], true],
      [
        'unit',
        'DRAFT + PUBLISHED',
        [
          LessonContentPublicationStatus.DRAFT,
          LessonContentPublicationStatus.PUBLISHED,
        ],
        false,
      ],
      [
        'unit',
        'DRAFT + ARCHIVED',
        [
          LessonContentPublicationStatus.DRAFT,
          LessonContentPublicationStatus.ARCHIVED,
        ],
        true,
      ],
      [
        'unit',
        'PUBLISHED + ARCHIVED',
        [
          LessonContentPublicationStatus.PUBLISHED,
          LessonContentPublicationStatus.ARCHIVED,
        ],
        false,
      ],
      ['lesson', 'DRAFT', [LessonContentPublicationStatus.DRAFT], true],
      [
        'lesson',
        'PUBLISHED',
        [LessonContentPublicationStatus.PUBLISHED],
        false,
      ],
      ['lesson', 'ARCHIVED', [LessonContentPublicationStatus.ARCHIVED], true],
      [
        'lesson',
        'DRAFT + PUBLISHED',
        [
          LessonContentPublicationStatus.DRAFT,
          LessonContentPublicationStatus.PUBLISHED,
        ],
        false,
      ],
      [
        'lesson',
        'DRAFT + ARCHIVED',
        [
          LessonContentPublicationStatus.DRAFT,
          LessonContentPublicationStatus.ARCHIVED,
        ],
        true,
      ],
      [
        'lesson',
        'PUBLISHED + ARCHIVED',
        [
          LessonContentPublicationStatus.PUBLISHED,
          LessonContentPublicationStatus.ARCHIVED,
        ],
        false,
      ],
    ] as const)(
      '%s cascade enforces the %s publication-state contract',
      async (scope, _label, states, succeeds) => {
        const items: Array<Awaited<ReturnType<typeof createContent>>> = [];
        for (const [sortOrder, status] of states.entries()) {
          items.push(
            await createContent(status, {
              sortOrder,
              ...(status === LessonContentPublicationStatus.ARCHIVED
                ? {
                    archivedAt: new Date('2031-10-01T12:00:00.000Z'),
                    archivedByUserId: ids.userId,
                  }
                : {}),
            }),
          );
        }

        const operation = runParentDeleteUseCase(scope);
        if (succeeds) {
          await expect(operation).resolves.toEqual({ ok: true });
        } else {
          const error = await operation.catch((caught: unknown) => caught);
          expect(error).toMatchObject({
            code: 'learning.content.publication_conflict',
            details: {
              from: LessonContentPublicationStatus.PUBLISHED,
              to: LessonContentPublicationStatus.DRAFT,
            },
          });
          expect(
            Object.keys(
              (error as { details: Record<string, unknown> }).details,
            ).sort(),
          ).toEqual(['from', 'to']);
        }

        for (const item of items) {
          const persisted = await prisma.lessonContentItem.findUniqueOrThrow({
            where: { id: item.id },
          });
          if (
            succeeds &&
            item.publicationStatus === LessonContentPublicationStatus.DRAFT
          ) {
            expect(persisted.deletedAt).toBeInstanceOf(Date);
          } else {
            expect(persisted).toMatchObject({
              publicationStatus: item.publicationStatus,
              deletedAt: null,
              updatedAt: item.updatedAt,
              publishedAt: item.publishedAt,
              publishedByUserId: item.publishedByUserId,
              archivedAt: item.archivedAt,
              archivedByUserId: item.archivedByUserId,
            });
          }
          expect(
            persisted.publicationStatus ===
              LessonContentPublicationStatus.PUBLISHED &&
              persisted.deletedAt !== null,
          ).toBe(false);
        }

        await expectParentStructure(scope, succeeds);
        await expectParentDeleteAuditCount(scope, succeeds ? 1 : 0);
      },
    );

    it('returns the bounded publication conflict without partially deleting a PUBLISHED lesson', async () => {
      const item = await createContent(
        LessonContentPublicationStatus.PUBLISHED,
      );

      await expect(
        inScope(() =>
          curriculumRepository.softDeleteLesson({
            curriculumId: ids.curriculumId,
            unitId: ids.unitId,
            lessonId: ids.lessonId,
          }),
        ),
      ).resolves.toEqual({ status: 'publication_conflict' });

      await expectUnchanged(item);
      await expect(
        prisma.curriculumLesson.findUniqueOrThrow({
          where: { id: ids.lessonId },
        }),
      ).resolves.toMatchObject({ deletedAt: null });
    });

    it('preserves terminal ARCHIVED content while deleting its Lesson structure', async () => {
      const archivedAt = new Date('2031-10-01T12:00:00.000Z');
      const item = await createContent(
        LessonContentPublicationStatus.ARCHIVED,
        {
          archivedAt,
          archivedByUserId: ids.userId,
        },
      );

      await expect(
        inScope(() =>
          curriculumRepository.softDeleteLesson({
            curriculumId: ids.curriculumId,
            unitId: ids.unitId,
            lessonId: ids.lessonId,
          }),
        ),
      ).resolves.toMatchObject({ status: 'deleted' });

      await expectPersisted(item.id, {
        publicationStatus: LessonContentPublicationStatus.ARCHIVED,
        archivedAt,
        archivedByUserId: ids.userId,
        deletedAt: null,
        updatedAt: item.updatedAt,
      });
    });

    it('does not miss a create that commits before the actual Lesson cascade', async () => {
      const control = createLockHoldingUnitOfWork('parent');
      const title = `Create before Lesson delete ${randomUUID()}`;
      let parentSettled = false;
      const creating = inScope(() =>
        new CreateLessonContentUseCase(control.unitOfWork).execute(pathFor(), {
          type: LessonContentItemType.TEXT,
          title,
          bodyText: 'Must be observed by the later cascade.',
        }),
      );
      await control.locked;
      const deleting = inScope(() =>
        curriculumRepository.softDeleteLesson({
          curriculumId: ids.curriculumId,
          unitId: ids.unitId,
          lessonId: ids.lessonId,
        }),
      ).finally(() => {
        parentSettled = true;
      });

      try {
        await waitUntilAnyBackendIsBlocked(() => parentSettled);
      } finally {
        control.release();
      }

      const [created, parentResult] = await Promise.all([creating, deleting]);
      expect(parentResult).toMatchObject({ status: 'deleted' });
      await expectPersisted(created.contentItemId, {
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        deletedAt: expect.any(Date),
      });
      await expectActionAuditCount(created.contentItemId, ['create'], 1);
    });

    it('serializes actual Lesson deletion after publish without a deadlock victim', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT);
      const control = createLockHoldingUnitOfWork('parent');
      let parentSettled = false;
      const publishing = inScope(() =>
        new PublishLessonContentUseCase(repository, control.unitOfWork).execute(
          pathFor(item.id),
        ),
      );
      await control.locked;
      const deleting = inScope(() =>
        curriculumRepository.softDeleteLesson({
          curriculumId: ids.curriculumId,
          unitId: ids.unitId,
          lessonId: ids.lessonId,
        }),
      ).finally(() => {
        parentSettled = true;
      });

      try {
        await waitUntilAnyBackendIsBlocked(() => parentSettled);
      } finally {
        control.release();
      }

      await expect(publishing).resolves.toMatchObject({
        publicationStatus: 'published',
      });
      await expect(deleting).resolves.toEqual({
        status: 'publication_conflict',
      });
      await expectPersisted(item.id, {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        deletedAt: null,
      });
      await expectActionAuditCount(item.id, ['publish'], 1);
    });
  });

  describe('actual production parent/content serialization', () => {
    it.each(['curriculum', 'unit', 'lesson'] as const)(
      '%s delete first blocks publish, commits the cascade, and leaves no orphan',
      async (scope) => {
        const item = await createContent(LessonContentPublicationStatus.DRAFT);
        const { parent, content } = await runActualParentFirst(
          scope,
          item.id,
          () => runMutationUseCase('publish', item.id),
        );

        expect(parent).toMatchObject({ ok: true, value: { ok: true } });
        expectFailureCode(content, 'academics.lesson_content.not_found');
        await expectPersisted(item.id, {
          publicationStatus: LessonContentPublicationStatus.DRAFT,
          deletedAt: expect.any(Date),
        });
        await expectParentStructure(scope, true);
        await expectParentDeleteAuditCount(scope, 1);
        await expectAuditCount(item.id, 0);
      },
    );

    it.each([
      ['curriculum', 'publish'],
      ['unit', 'update'],
      ['lesson', 'delete'],
    ] as const)(
      '%s cascade serializes after the actual %s mutation',
      async (scope, operation) => {
        const item = await createContent(LessonContentPublicationStatus.DRAFT);
        const { content, parent } = await runActualContentFirst(
          scope,
          (holdingUnitOfWork) =>
            runMutationWithUnitOfWork(operation, item.id, holdingUnitOfWork),
        );

        expect(content.ok).toBe(true);
        if (operation === 'publish') {
          expect(parent.ok).toBe(false);
          expect(parent.error).toMatchObject({
            code: 'learning.content.publication_conflict',
            details: {
              from: LessonContentPublicationStatus.PUBLISHED,
              to: LessonContentPublicationStatus.DRAFT,
            },
          });
          await expectPersisted(item.id, {
            publicationStatus: LessonContentPublicationStatus.PUBLISHED,
            deletedAt: null,
          });
          await expectParentStructure(scope, false);
          await expectParentDeleteAuditCount(scope, 0);
        } else {
          expect(parent).toMatchObject({ ok: true, value: { ok: true } });
          await expectPersisted(item.id, {
            publicationStatus: LessonContentPublicationStatus.DRAFT,
            deletedAt: expect.any(Date),
            ...(operation === 'update'
              ? { title: 'Actual content-first update' }
              : {}),
          });
          await expectParentStructure(scope, true);
          await expectParentDeleteAuditCount(scope, 1);
        }
        await expectActionAuditCount(item.id, [operation], 1);
      },
    );

    it.each(['curriculum', 'unit', 'lesson'] as const)(
      'create first commits before the actual %s cascade and is then deleted',
      async (scope) => {
        const title = `Actual create-first ${scope} ${randomUUID()}`;
        const { content, parent } = await runActualContentFirst(
          scope,
          (holdingUnitOfWork) =>
            inScope(() =>
              new CreateLessonContentUseCase(holdingUnitOfWork).execute(
                pathFor(),
                {
                  type: LessonContentItemType.TEXT,
                  title,
                  bodyText: 'The later cascade must observe this row.',
                },
              ),
            ),
        );

        expect(content.ok).toBe(true);
        expect(parent).toMatchObject({ ok: true, value: { ok: true } });
        const created = (
          content as { ok: true; value: { contentItemId: string } }
        ).value;
        await expectPersisted(created.contentItemId, {
          publicationStatus: LessonContentPublicationStatus.DRAFT,
          deletedAt: expect.any(Date),
        });
        await expectActionAuditCount(created.contentItemId, ['create'], 1);
        await expectParentDeleteAuditCount(scope, 1);
        await expectParentStructure(scope, true);
      },
    );

    it.each(['curriculum', 'unit', 'lesson'] as const)(
      'actual %s delete first prevents a later create',
      async (scope) => {
        const title = `Rejected parent-first create ${scope} ${randomUUID()}`;
        const { parent, content } = await runActualParentFirst(
          scope,
          undefined,
          () =>
            inScope(() =>
              createUseCase.execute(pathFor(), {
                type: LessonContentItemType.TEXT,
                title,
                bodyText: 'Must never be persisted.',
              }),
            ),
        );

        expect(parent).toMatchObject({ ok: true, value: { ok: true } });
        expectFailureCode(content, 'academics.lesson_content.not_found');
        await expect(
          prisma.lessonContentItem.count({
            where: { schoolId: ids.schoolId, title },
          }),
        ).resolves.toBe(0);
        await expectActionAuditCountForSchool('create', 0);
        await expectParentDeleteAuditCount(scope, 1);
        await expectParentStructure(scope, true);
      },
    );
  });

  describe('actual Curriculum archive serialization', () => {
    it('archive first makes the later content update read-only', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT);
      await expect(
        inScope(() => archiveCurriculumUseCase.execute(ids.curriculumId)),
      ).resolves.toMatchObject({ status: 'archived' });
      await expect(runMutationUseCase('update', item.id)).rejects.toMatchObject(
        { code: 'academics.lesson_content.read_only' },
      );
      await expectUnchanged(item);
      await expectCurriculumArchiveAuditCount(1);
      await expectAuditCount(item.id, 0);
    });

    it('content update first commits before the actual Curriculum archive', async () => {
      const item = await createContent(LessonContentPublicationStatus.DRAFT);
      const { content, parent } = await runContentFirstAgainstOperation(
        (holdingUnitOfWork) =>
          runMutationWithUnitOfWork('update', item.id, holdingUnitOfWork),
        () => inScope(() => archiveCurriculumUseCase.execute(ids.curriculumId)),
      );
      expect(content.ok).toBe(true);
      expect(parent.ok).toBe(true);
      await expectPersisted(item.id, {
        title: 'Actual content-first update',
        publicationStatus: LessonContentPublicationStatus.DRAFT,
      });
      await expect(
        prisma.curriculum.findUniqueOrThrow({
          where: { id: ids.curriculumId },
        }),
      ).resolves.toMatchObject({ status: CurriculumStatus.ARCHIVED });
      await expectActionAuditCount(item.id, ['update'], 1);
      await expectCurriculumArchiveAuditCount(1);
    });
  });

  describe('actual File soft-delete serialization', () => {
    it('File deletion first makes the later FILE publish reject safely', async () => {
      const file = await createFile(ids.schoolId, false);
      const item = await createContent(LessonContentPublicationStatus.DRAFT, {
        type: LessonContentItemType.FILE,
        bodyText: null,
        fileId: file.id,
      });
      await filesRepository.softDeleteFile(file.id);
      await expect(
        inScope(() => publishUseCase.execute(pathFor(item.id))),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.file_not_found',
        details: undefined,
      });
      await expectUnchanged(item);
      await expectAuditCount(item.id, 0);
    });

    it('FILE publish first commits while live before the actual later deletion', async () => {
      const file = await createFile(ids.schoolId, false);
      const item = await createContent(LessonContentPublicationStatus.DRAFT, {
        type: LessonContentItemType.FILE,
        bodyText: null,
        fileId: file.id,
      });
      const { content, parent } = await runContentFirstAgainstOperation(
        (holdingUnitOfWork) =>
          inScope(() =>
            new PublishLessonContentUseCase(
              repository,
              holdingUnitOfWork,
            ).execute(pathFor(item.id)),
          ),
        () => filesRepository.softDeleteFile(file.id),
        'file',
      );
      expect(content.ok).toBe(true);
      expect(parent.ok).toBe(true);
      await expectPersisted(item.id, {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        deletedAt: null,
      });
      expect(
        (await prisma.file.findUniqueOrThrow({ where: { id: file.id } }))
          .deletedAt,
      ).toBeInstanceOf(Date);
      await expectActionAuditCount(item.id, ['publish'], 1);
    });
  });

  describe('FILE validity and locking', () => {
    it('rejects publish when the DRAFT File is already soft-deleted', async () => {
      const file = await createFile(ids.schoolId, true);
      const item = await createContent(LessonContentPublicationStatus.DRAFT, {
        type: LessonContentItemType.FILE,
        bodyText: null,
        fileId: file.id,
      });
      await expect(
        inScope(() => publishUseCase.execute(pathFor(item.id))),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.file_not_found',
        details: undefined,
      });
      await expectUnchanged(item);
      await expectAuditCount(item.id, 0);
    });

    it('rejects replacement with a soft-deleted File', async () => {
      const file = await createFile(ids.schoolId, true);
      const item = await createContent(LessonContentPublicationStatus.DRAFT);
      await expect(
        inScope(() =>
          updateUseCase.execute(pathFor(item.id), {
            type: LessonContentItemType.FILE,
            fileId: file.id,
            bodyText: null,
          }),
        ),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.file_not_found',
        details: undefined,
      });
      await expectUnchanged(item);
      await expectAuditCount(item.id, 0);
    });

    it('rejects create with a soft-deleted File', async () => {
      const file = await createFile(ids.schoolId, true);
      await expect(
        inScope(() =>
          createUseCase.execute(pathFor(), {
            type: LessonContentItemType.FILE,
            title: 'Deleted File create',
            fileId: file.id,
          }),
        ),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.file_not_found',
        details: undefined,
      });
      await expect(
        prisma.lessonContentItem.count({
          where: { schoolId: ids.schoolId, title: 'Deleted File create' },
        }),
      ).resolves.toBe(0);
    });

    it('treats a foreign-school File as missing without identifiers', async () => {
      const file = await createFile(ids.foreignSchoolId, false);
      await expect(
        inScope(() =>
          createUseCase.execute(pathFor(), {
            type: LessonContentItemType.FILE,
            title: 'Foreign File create',
            fileId: file.id,
          }),
        ),
      ).rejects.toMatchObject({
        code: 'academics.lesson_content.file_not_found',
        details: undefined,
      });
    });
  });

  function createAuditFailingUnitOfWork(
    delegate: LessonContentUnitOfWork,
  ): LessonContentUnitOfWork {
    return {
      execute<T>(
        schoolId: string,
        callback: (context: LessonContentTransactionContext) => Promise<T>,
      ): Promise<T> {
        return delegate.execute(schoolId, (context) =>
          callback({
            ...context,
            writeSuccessfulAudit: (entry: LessonContentSuccessfulAuditEntry) =>
              context.writeSuccessfulAudit({
                ...entry,
                actorId: randomUUID(),
              }),
          }),
        );
      },
    };
  }

  function createLockHoldingUnitOfWork(holdAt: 'parent' | 'file'): {
    unitOfWork: LessonContentUnitOfWork;
    locked: Promise<void>;
    release: () => void;
  } {
    let signalLocked!: () => void;
    let releaseLock!: () => void;
    let held = false;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const hold = async (): Promise<void> => {
      if (held) return;
      held = true;
      signalLocked();
      await released;
    };

    return {
      locked,
      release: releaseLock,
      unitOfWork: {
        execute<T>(
          schoolId: string,
          callback: (context: LessonContentTransactionContext) => Promise<T>,
        ): Promise<T> {
          return unitOfWork.execute(schoolId, (context) =>
            callback({
              ...context,
              lockLessonContentScope: async (path) => {
                const scope = await context.lockLessonContentScope(path);
                if (holdAt === 'parent') await hold();
                return scope;
              },
              lockReadyLearningMediaFile: async (input) => {
                const available =
                  await context.lockReadyLearningMediaFile(input);
                if (holdAt === 'file') await hold();
                return available;
              },
            }),
          );
        },
      },
    };
  }

  type OperationOutcome =
    | { ok: true; value: unknown }
    | { ok: false; error: unknown };

  function settle(operation: Promise<unknown>): Promise<OperationOutcome> {
    return operation
      .then((value) => ({ ok: true as const, value }))
      .catch((error: unknown) => ({ ok: false as const, error }));
  }

  async function runContentFirstAgainstOperation(
    contentOperation: (
      holdingUnitOfWork: LessonContentUnitOfWork,
    ) => Promise<unknown>,
    competingOperation: () => Promise<unknown>,
    holdAt: 'parent' | 'file' = 'parent',
  ): Promise<{ content: OperationOutcome; parent: OperationOutcome }> {
    const control = createLockHoldingUnitOfWork(holdAt);
    const content = settle(contentOperation(control.unitOfWork));
    await control.locked;

    let competingSettled = false;
    const parent = settle(competingOperation()).finally(() => {
      competingSettled = true;
    });

    try {
      await waitUntilAnyBackendIsBlocked(() => competingSettled);
    } finally {
      control.release();
    }

    return { content: await content, parent: await parent };
  }

  function runActualContentFirst(
    scope: ParentDeleteScope,
    contentOperation: (
      holdingUnitOfWork: LessonContentUnitOfWork,
    ) => Promise<unknown>,
  ): Promise<{ content: OperationOutcome; parent: OperationOutcome }> {
    return runContentFirstAgainstOperation(contentOperation, () =>
      runParentDeleteUseCase(scope),
    );
  }

  function runMutationWithUnitOfWork(
    operation: 'publish' | 'update' | 'delete',
    contentItemId: string,
    holdingUnitOfWork: LessonContentUnitOfWork,
  ): Promise<unknown> {
    return inScope(() => {
      if (operation === 'publish') {
        return new PublishLessonContentUseCase(
          repository,
          holdingUnitOfWork,
        ).execute(pathFor(contentItemId));
      }
      if (operation === 'update') {
        return new UpdateLessonContentUseCase(
          repository,
          holdingUnitOfWork,
        ).execute(pathFor(contentItemId), {
          title: 'Actual content-first update',
        });
      }
      return new DeleteLessonContentUseCase(
        repository,
        holdingUnitOfWork,
      ).execute(pathFor(contentItemId));
    });
  }

  async function runActualParentFirst(
    scope: ParentDeleteScope,
    contentItemId: string | undefined,
    contentOperation: () => Promise<unknown>,
  ): Promise<{ parent: OperationOutcome; content: OperationOutcome }> {
    let releaseGate!: () => void;
    let signalGateStarted!: (backendPid: number) => void;
    const released = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const gateStarted = new Promise<number>((resolve) => {
      signalGateStarted = resolve;
    });
    const gate = prisma.$transaction(
      async (tx) => {
        const [{ backendPid }] = await tx.$queryRaw<
          Array<{ backendPid: number }>
        >(Prisma.sql`SELECT pg_backend_pid() AS "backendPid"`);
        await lockParentDeleteGate(tx, scope, contentItemId);
        signalGateStarted(backendPid);
        await released;
      },
      { timeout: 30_000 },
    );
    const gatePid = await gateStarted;

    let parentSettled = false;
    const parent = settle(runParentDeleteUseCase(scope)).finally(() => {
      parentSettled = true;
    });
    await waitUntilBlockedBy(gatePid, () => parentSettled);

    let contentSettled = false;
    const content = settle(contentOperation()).finally(() => {
      contentSettled = true;
    });
    try {
      await waitUntilBlockedBackendCount(
        2,
        () => parentSettled || contentSettled,
      );
    } finally {
      releaseGate();
    }
    await gate;
    return { parent: await parent, content: await content };
  }

  async function lockParentDeleteGate(
    tx: Prisma.TransactionClient,
    scope: ParentDeleteScope,
    contentItemId?: string,
  ): Promise<void> {
    if (scope === 'curriculum') {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "curriculum_units"
        WHERE "id" = ${ids.unitId}::uuid FOR UPDATE
      `);
      return;
    }
    if (scope === 'unit') {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "curriculum_lessons"
        WHERE "id" = ${ids.lessonId}::uuid FOR UPDATE
      `);
      return;
    }
    if (contentItemId) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "lesson_content_items"
        WHERE "id" = ${contentItemId}::uuid FOR UPDATE
      `);
      return;
    }
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "curriculum_lessons"
      WHERE "id" = ${ids.lessonId}::uuid FOR UPDATE
    `);
  }

  async function waitUntilBlockedBackendCount(
    expectedCount: number,
    operationSettled: () => boolean,
  ): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [{ blockedCount }] = await observerPrisma.$queryRaw<
        Array<{ blockedCount: bigint }>
      >(Prisma.sql`
        SELECT COUNT(*)::bigint AS "blockedCount"
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND cardinality(pg_blocking_pids(pid)) > 0
      `);
      if (Number(blockedCount) >= expectedCount) return;
      if (operationSettled()) {
        throw new Error(
          'Production operation settled before the expected lock chain formed',
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      'Timed out waiting for deterministic PostgreSQL lock chain',
    );
  }

  async function waitUntilAnyBackendIsBlocked(
    competingSettled: () => boolean,
  ): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [{ blocked }] = await observerPrisma.$queryRaw<
        Array<{ blocked: boolean }>
      >(Prisma.sql`
          SELECT EXISTS (
            SELECT 1
            FROM pg_stat_activity
            WHERE pid <> pg_backend_pid()
              AND cardinality(pg_blocking_pids(pid)) > 0
          ) AS "blocked"
      `);
      if (blocked) return;
      if (competingSettled()) {
        throw new Error(
          'Production cascade completed before the expected PostgreSQL lock wait',
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for production cascade lock');
  }

  async function mutateThenFailAudit(
    item: Awaited<ReturnType<typeof createContent>>,
    operation:
      | 'publish'
      | 'unpublish'
      | 'archive'
      | 'update'
      | 'reorder'
      | 'delete',
  ): Promise<void> {
    await unitOfWork.execute(ids.schoolId, async (tx) => {
      await expectLockedScope(tx);
      const data = mutationData(operation, item.updatedAt);
      const result = await tx.updateContentItemConditionally({
        ...pathFor(item.id),
        expectedPublicationStatus: item.publicationStatus,
        expectedUpdatedAt: item.updatedAt,
        data,
      });
      expect(result.status).toBe('updated');
      await writeInvalidAudit(tx, item.id, operation);
    });
  }

  async function conditionalAttempt(
    item: Awaited<ReturnType<typeof createContent>>,
    operation: 'publish' | 'archive' | 'update' | 'delete',
  ) {
    return inScope(() =>
      unitOfWork.execute(ids.schoolId, async (tx) => {
        await expectLockedScope(tx);
        const result = await tx.updateContentItemConditionally({
          ...pathFor(item.id),
          expectedPublicationStatus: item.publicationStatus,
          expectedUpdatedAt: item.updatedAt,
          data: mutationData(operation, item.updatedAt),
        });
        if (result.status === 'updated') {
          await tx.writeSuccessfulAudit({
            actorId: ids.userId,
            userType: UserType.SCHOOL_USER,
            organizationId: ids.organizationId,
            schoolId: ids.schoolId,
            action: `academics.lesson_content.${operation}`,
            resourceId: item.id,
            before: { publicationStatus: item.publicationStatus },
            after: {
              publicationStatus: result.contentItem.publicationStatus,
            },
          });
        }
        return result;
      }),
    );
  }

  function mutationData(
    operation:
      | 'publish'
      | 'unpublish'
      | 'archive'
      | 'update'
      | 'reorder'
      | 'delete',
    updatedAt: Date,
  ): Prisma.LessonContentItemUncheckedUpdateManyInput {
    const at = new Date(updatedAt.getTime() + 1_000);
    const common = { updatedAt: at, updatedByUserId: ids.userId };
    switch (operation) {
      case 'publish':
        return {
          ...common,
          publicationStatus: LessonContentPublicationStatus.PUBLISHED,
          publishedAt: at,
          publishedByUserId: ids.userId,
          archivedAt: null,
          archivedByUserId: null,
        };
      case 'unpublish':
        return {
          ...common,
          publicationStatus: LessonContentPublicationStatus.DRAFT,
          publishedAt: null,
          publishedByUserId: null,
          archivedAt: null,
          archivedByUserId: null,
        };
      case 'archive':
        return {
          ...common,
          publicationStatus: LessonContentPublicationStatus.ARCHIVED,
          archivedAt: at,
          archivedByUserId: ids.userId,
        };
      case 'update':
        return { ...common, title: 'Conditional update winner' };
      case 'reorder':
        return { ...common, sortOrder: 19 };
      case 'delete':
        return { ...common, deletedAt: at };
    }
  }

  async function writeInvalidAudit(
    tx: LessonContentTransactionContext,
    resourceId: string,
    action: string,
  ): Promise<void> {
    await tx.writeSuccessfulAudit({
      actorId: randomUUID(),
      userType: UserType.SCHOOL_USER,
      organizationId: ids.organizationId,
      schoolId: ids.schoolId,
      action: `academics.lesson_content.${action}`,
      resourceId,
      before: { publicationStatus: 'before' },
      after: { publicationStatus: 'after' },
    });
  }

  async function expectLockedScope(
    tx: LessonContentTransactionContext,
  ): Promise<void> {
    const scope = await tx.lockLessonContentScope(pathFor());
    expect(scope).toMatchObject({
      curriculum: { id: ids.curriculumId },
      unit: { id: ids.unitId },
      lesson: { id: ids.lessonId },
    });
  }

  async function runMutationUseCase(
    operation: 'publish' | 'update' | 'delete',
    contentItemId: string,
  ): Promise<unknown> {
    return inScope(() => {
      if (operation === 'publish') {
        return publishUseCase.execute(pathFor(contentItemId));
      }
      if (operation === 'update') {
        return updateUseCase.execute(pathFor(contentItemId), {
          title: 'Parent race update',
        });
      }
      return deleteUseCase.execute(pathFor(contentItemId));
    });
  }

  async function waitUntilBlockedBy(
    blockerPid: number,
    contentSettled: () => boolean,
  ): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [{ blocked }] = await observerPrisma.$queryRaw<
        Array<{ blocked: boolean }>
      >(Prisma.sql`
          SELECT EXISTS (
            SELECT 1
            FROM pg_stat_activity
            WHERE ${blockerPid} = ANY(pg_blocking_pids(pid))
          ) AS "blocked"
      `);
      if (blocked) return;
      if (contentSettled()) {
        throw new Error(
          'Lesson Content operation completed before the parent/File lock released',
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for deterministic PostgreSQL lock');
  }

  function expectFailureCode(
    outcome: { ok: boolean; error?: unknown },
    code: string,
  ): void {
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatchObject({ code });
    if (
      code === 'academics.lesson_content.not_found' ||
      code === 'academics.lesson_content.file_not_found'
    ) {
      expect(outcome.error).toMatchObject({ details: undefined });
    }
  }

  type ParentDeleteScope = 'curriculum' | 'unit' | 'lesson';

  function runParentDeleteUseCase(
    scope: ParentDeleteScope,
  ): Promise<{ ok: true }> {
    return inScope(() => {
      switch (scope) {
        case 'curriculum':
          return deleteCurriculumUseCase.execute(ids.curriculumId);
        case 'unit':
          return deleteUnitUseCase.execute(ids.curriculumId, ids.unitId);
        case 'lesson':
          return deleteLessonUseCase.execute(
            ids.curriculumId,
            ids.unitId,
            ids.lessonId,
          );
      }
    });
  }

  async function expectParentStructure(
    scope: ParentDeleteScope,
    deleted: boolean,
  ): Promise<void> {
    const [curriculum, unit, lesson] = await Promise.all([
      prisma.curriculum.findUniqueOrThrow({ where: { id: ids.curriculumId } }),
      prisma.curriculumUnit.findUniqueOrThrow({ where: { id: ids.unitId } }),
      prisma.curriculumLesson.findUniqueOrThrow({
        where: { id: ids.lessonId },
      }),
    ]);
    expect(curriculum.deletedAt instanceof Date).toBe(
      deleted && scope === 'curriculum',
    );
    expect(unit.deletedAt instanceof Date).toBe(
      deleted && (scope === 'curriculum' || scope === 'unit'),
    );
    expect(lesson.deletedAt instanceof Date).toBe(deleted);
  }

  async function expectParentDeleteAuditCount(
    scope: ParentDeleteScope,
    count: number,
  ): Promise<void> {
    const contract = {
      curriculum: {
        action: 'academics.curriculum.delete',
        resourceType: 'curriculum',
        resourceId: ids.curriculumId,
      },
      unit: {
        action: 'academics.curriculum.unit.delete',
        resourceType: 'curriculum_unit',
        resourceId: ids.unitId,
      },
      lesson: {
        action: 'academics.curriculum.lesson.delete',
        resourceType: 'curriculum_lesson',
        resourceId: ids.lessonId,
      },
    }[scope];
    await expect(
      prisma.auditLog.count({
        where: {
          schoolId: ids.schoolId,
          action: contract.action,
          resourceType: contract.resourceType,
          resourceId: contract.resourceId,
          outcome: 'SUCCESS',
        },
      }),
    ).resolves.toBe(count);
  }

  async function expectCurriculumArchiveAuditCount(
    count: number,
  ): Promise<void> {
    await expect(
      prisma.auditLog.count({
        where: {
          schoolId: ids.schoolId,
          action: 'academics.curriculum.archive',
          resourceType: 'curriculum',
          resourceId: ids.curriculumId,
          outcome: 'SUCCESS',
        },
      }),
    ).resolves.toBe(count);
  }

  async function createContent(
    publicationStatus: LessonContentPublicationStatus,
    overrides: Partial<Prisma.LessonContentItemUncheckedCreateInput> = {},
  ) {
    const published =
      publicationStatus === LessonContentPublicationStatus.PUBLISHED;
    return prisma.lessonContentItem.create({
      data: {
        schoolId: ids.schoolId,
        curriculumId: ids.curriculumId,
        unitId: ids.unitId,
        lessonId: ids.lessonId,
        type: LessonContentItemType.TEXT,
        title: `LC H1 content ${randomUUID()}`,
        bodyText: 'Atomicity fixture body',
        sortOrder: 0,
        createdByUserId: ids.userId,
        updatedByUserId: ids.userId,
        publicationStatus,
        publishedAt: published ? new Date() : null,
        publishedByUserId: published ? ids.userId : null,
        archivedAt: null,
        archivedByUserId: null,
        ...overrides,
      },
    });
  }

  async function createFile(schoolId: string, deleted: boolean) {
    const objectKey = `lesson-content/${randomUUID()}`;
    const now = new Date();
    const file = await prisma.file.create({
      data: {
        organizationId: ids.organizationId,
        schoolId,
        uploaderId: ids.userId,
        bucket: `lc-h1-${suffix}`,
        objectKey,
        originalName: 'atomicity-fixture.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024n,
        visibility: FileVisibility.PRIVATE,
        deletedAt: deleted ? new Date() : null,
      },
    });
    await prisma.fileUploadSession.create({
      data: {
        organizationId: ids.organizationId,
        schoolId,
        createdByUserId: ids.userId,
        clientRequestId: randomUUID(),
        purpose: 'LESSON_CONTENT',
        originalName: 'atomicity-fixture.pdf',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: 1024n,
        stagingBucket: file.bucket,
        stagingObjectKey: `${objectKey}-staging`,
        finalBucket: file.bucket,
        finalObjectKey: objectKey,
        status: 'READY',
        expiresAt: new Date(now.getTime() + 7_200_000),
        latestUploadUrlExpiresAt: new Date(now.getTime() + 3_600_000),
        completedAt: now,
        stagingCleanupEligibleAt: new Date(now.getTime() + 3_600_000),
        finalCleanupEligibleAt: new Date(
          now.getTime() + 7 * 24 * 60 * 60 * 1000,
        ),
        verifiedMimeType: 'application/pdf',
        actualSizeBytes: 1024n,
        checksumSha256: 'a'.repeat(64),
        durationSeconds: null,
        width: null,
        height: null,
        verifiedAt: now,
        verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
        fileId: file.id,
        createdAt: now,
      },
    });
    return file;
  }

  function pathFor(contentItemId?: string): LessonContentItemPath {
    return {
      curriculumId: ids.curriculumId,
      unitId: ids.unitId,
      lessonId: ids.lessonId,
      ...(contentItemId ? { contentItemId } : {}),
    } as LessonContentItemPath;
  }

  function inScope<T>(callback: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ids.userId, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: `lc-h1-membership-${suffix}`,
        organizationId: ids.organizationId,
        schoolId: ids.schoolId,
        roleId: `lc-h1-role-${suffix}`,
        permissions: ['academics.curriculum.manage'],
      });
      return callback();
    });
  }

  function expectOneUpdatedOneConflict(
    results: Array<{ status: 'updated' | 'conflict' }>,
  ): void {
    expect(results.map(({ status }) => status).sort()).toEqual([
      'conflict',
      'updated',
    ]);
  }

  async function expectAuditCount(
    resourceId: string,
    count: number,
  ): Promise<void> {
    await expect(
      prisma.auditLog.count({
        where: {
          schoolId: ids.schoolId,
          resourceType: 'lesson_content_item',
          resourceId,
          outcome: 'SUCCESS',
        },
      }),
    ).resolves.toBe(count);
  }

  async function expectActionAuditCount(
    resourceId: string,
    actions: string[],
    count: number,
  ): Promise<void> {
    await expect(
      prisma.auditLog.count({
        where: {
          schoolId: ids.schoolId,
          resourceType: 'lesson_content_item',
          resourceId,
          action: {
            in: actions.map((action) => `academics.lesson_content.${action}`),
          },
          outcome: 'SUCCESS',
        },
      }),
    ).resolves.toBe(count);
  }

  async function expectActionAuditCountForSchool(
    action: string,
    count: number,
  ): Promise<void> {
    await expect(
      prisma.auditLog.count({
        where: {
          schoolId: ids.schoolId,
          resourceType: 'lesson_content_item',
          action: `academics.lesson_content.${action}`,
          outcome: 'SUCCESS',
        },
      }),
    ).resolves.toBe(count);
  }

  async function expectPersisted(
    contentItemId: string,
    expected: Record<string, unknown>,
  ): Promise<void> {
    await expect(
      prisma.lessonContentItem.findUniqueOrThrow({
        where: { id: contentItemId },
      }),
    ).resolves.toMatchObject(expected);
  }

  async function expectFinalState(
    contentItemId: string,
    expected: Record<string, unknown>,
  ): Promise<void> {
    await expectPersisted(contentItemId, expected);
  }

  async function expectUnchanged(
    item: Awaited<ReturnType<typeof createContent>>,
  ): Promise<void> {
    await expectPersisted(item.id, {
      publicationStatus: item.publicationStatus,
      title: item.title,
      deletedAt: item.deletedAt,
      updatedAt: item.updatedAt,
    });
  }
});
