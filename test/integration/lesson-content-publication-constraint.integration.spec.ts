import { randomUUID } from 'node:crypto';
import {
  CurriculumStatus,
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
import { LessonContentRepository } from '../../src/modules/academics/curriculum/infrastructure/lesson-content.repository';

jest.setTimeout(120000);

describe('Lesson content publication PostgreSQL constraint', () => {
  const prisma = new PrismaClient();
  const repository = new LessonContentRepository({
    $transaction: <T>(
      callback: (transaction: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> => prisma.$transaction(callback),
  } as unknown as PrismaService);
  const suffix = randomUUID().split('-')[0];
  const created = {
    organizationId: '',
    schoolId: '',
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
    const organization = await prisma.organization.create({
      data: {
        slug: `publication-check-org-${suffix}`,
        name: `Publication Check Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    created.organizationId = organization.id;
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `publication-check-school-${suffix}`,
        name: `Publication Check School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    created.schoolId = school.id;
    const user = await prisma.user.create({
      data: {
        email: `publication-check-${suffix}@example.test`,
        firstName: 'Publication',
        lastName: 'Actor',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    created.userId = user.id;
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        nameAr: `عام-${suffix}`,
        nameEn: `Year-${suffix}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    created.academicYearId = academicYear.id;
    const term = await prisma.term.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        nameAr: `فصل-${suffix}`,
        nameEn: `Term-${suffix}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    created.termId = term.id;
    const stage = await prisma.stage.create({
      data: {
        schoolId: school.id,
        nameAr: `مرحلة-${suffix}`,
        nameEn: `Stage-${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    created.stageId = stage.id;
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
    created.gradeId = grade.id;
    const subject = await prisma.subject.create({
      data: {
        schoolId: school.id,
        nameAr: `مادة-${suffix}`,
        nameEn: `Subject-${suffix}`,
        code: `PUB-CHK-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });
    created.subjectId = subject.id;
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        termId: term.id,
        gradeId: grade.id,
        subjectId: subject.id,
        title: `Publication Check Curriculum ${suffix}`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: user.id,
        updatedByUserId: user.id,
      },
      select: { id: true },
    });
    created.curriculumId = curriculum.id;
    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: school.id,
        curriculumId: curriculum.id,
        title: `Publication Check Unit ${suffix}`,
      },
      select: { id: true },
    });
    created.unitId = unit.id;
    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: school.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `Publication Check Lesson ${suffix}`,
      },
      select: { id: true },
    });
    created.lessonId = lesson.id;
  });

  afterAll(async () => {
    try {
      await prisma.lessonContentItem.deleteMany({
        where: { schoolId: created.schoolId },
      });
      await prisma.curriculumLesson.deleteMany({
        where: { id: created.lessonId },
      });
      await prisma.curriculumUnit.deleteMany({ where: { id: created.unitId } });
      await prisma.curriculum.deleteMany({
        where: { id: created.curriculumId },
      });
      await prisma.subject.deleteMany({ where: { id: created.subjectId } });
      await prisma.grade.deleteMany({ where: { id: created.gradeId } });
      await prisma.stage.deleteMany({ where: { id: created.stageId } });
      await prisma.term.deleteMany({ where: { id: created.termId } });
      await prisma.academicYear.deleteMany({
        where: { id: created.academicYearId },
      });
      await prisma.school.deleteMany({ where: { id: created.schoolId } });
      await prisma.organization.deleteMany({
        where: { id: created.organizationId },
      });
      await prisma.user.deleteMany({ where: { id: created.userId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it.each([
    [
      'DRAFT with all lifecycle fields null',
      {
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        publishedAt: null,
        publishedByUserId: null,
        archivedAt: null,
        archivedByUserId: null,
      },
    ],
    [
      'PUBLISHED with the complete published pair',
      {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: new Date('2026-07-21T10:00:00.000Z'),
        publishedByUserId: () => created.userId,
        archivedAt: null,
        archivedByUserId: null,
      },
    ],
    [
      'ARCHIVED from PUBLISHED with both actor/time pairs',
      {
        publicationStatus: LessonContentPublicationStatus.ARCHIVED,
        publishedAt: new Date('2026-07-21T10:00:00.000Z'),
        publishedByUserId: () => created.userId,
        archivedAt: new Date('2026-07-21T11:00:00.000Z'),
        archivedByUserId: () => created.userId,
      },
    ],
    [
      'ARCHIVED legacy history with null published pair and archive actor',
      {
        publicationStatus: LessonContentPublicationStatus.ARCHIVED,
        publishedAt: null,
        publishedByUserId: null,
        archivedAt: new Date('2026-07-21T11:00:00.000Z'),
        archivedByUserId: null,
        deletedAt: new Date('2026-07-21T11:00:00.000Z'),
      },
    ],
  ] as const)('accepts %s', async (_label, lifecycle) => {
    await expect(
      createContent(resolveActors(lifecycle)),
    ).resolves.toMatchObject({
      publicationStatus: lifecycle.publicationStatus,
    });
  });

  it.each([
    [
      'DRAFT with publishedAt',
      {
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        publishedAt: timestamp(),
      },
    ],
    [
      'DRAFT with publishedByUserId',
      {
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        publishedByUserId: () => created.userId,
      },
    ],
    [
      'DRAFT with archivedAt',
      {
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        archivedAt: timestamp(),
      },
    ],
    [
      'DRAFT with archivedByUserId',
      {
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        archivedByUserId: () => created.userId,
      },
    ],
    [
      'PUBLISHED without publishedAt',
      {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedByUserId: () => created.userId,
      },
    ],
    [
      'PUBLISHED without publishedByUserId',
      {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: timestamp(),
      },
    ],
    [
      'PUBLISHED with archivedAt',
      {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: timestamp(),
        publishedByUserId: () => created.userId,
        archivedAt: timestamp(),
      },
    ],
    [
      'PUBLISHED with archivedByUserId',
      {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: timestamp(),
        publishedByUserId: () => created.userId,
        archivedByUserId: () => created.userId,
      },
    ],
    [
      'PUBLISHED with deletedAt',
      {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: timestamp(),
        publishedByUserId: () => created.userId,
        deletedAt: timestamp(),
      },
    ],
    [
      'ARCHIVED without archivedAt',
      { publicationStatus: LessonContentPublicationStatus.ARCHIVED },
    ],
    [
      'ARCHIVED with publishedAt but no publishedByUserId',
      {
        publicationStatus: LessonContentPublicationStatus.ARCHIVED,
        publishedAt: timestamp(),
        archivedAt: timestamp(),
      },
    ],
    [
      'ARCHIVED with publishedByUserId but no publishedAt',
      {
        publicationStatus: LessonContentPublicationStatus.ARCHIVED,
        publishedByUserId: () => created.userId,
        archivedAt: timestamp(),
      },
    ],
  ] as const)('rejects %s on the named CHECK', async (_label, lifecycle) => {
    let databaseError: unknown;

    try {
      await createContent(resolveActors(lifecycle));
    } catch (error) {
      databaseError = error;
    }

    expect(databaseErrorText(databaseError)).toContain(
      'lesson_content_items_publication_state_check',
    );
  });

  it('defaults an insert that omits publicationStatus to DRAFT', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ publication_status: LessonContentPublicationStatus }>
    >`
      INSERT INTO "lesson_content_items" (
        "id", "school_id", "curriculum_id", "unit_id", "lesson_id",
        "type", "title", "body_text", "created_by_user_id", "updated_at"
      ) VALUES (
        ${randomUUID()}::uuid,
        ${created.schoolId}::uuid,
        ${created.curriculumId}::uuid,
        ${created.unitId}::uuid,
        ${created.lessonId}::uuid,
        'TEXT'::lesson_content_item_type,
        'Default proof',
        'Synthetic',
        ${created.userId}::uuid,
        ${new Date()}
      )
      RETURNING "publication_status"
    `;

    expect(rows).toEqual([
      { publication_status: LessonContentPublicationStatus.DRAFT },
    ]);
  });

  it('allows exactly one conditional DRAFT update versus publish winner', async () => {
    const original = await createContent({
      publicationStatus: LessonContentPublicationStatus.DRAFT,
    });
    const operationAt = nextVersion(original.updatedAt);
    const results = await inFixtureSchool(() =>
      Promise.all([
        repository.updateContentItemConditionally({
          ...contentPath(original.id),
          expectedPublicationStatus: LessonContentPublicationStatus.DRAFT,
          expectedUpdatedAt: original.updatedAt,
          data: {
            title: 'Reviewed concurrent update',
            updatedAt: operationAt,
            updatedByUserId: created.userId,
          },
        }),
        repository.updateContentItemConditionally({
          ...contentPath(original.id),
          expectedPublicationStatus: LessonContentPublicationStatus.DRAFT,
          expectedUpdatedAt: original.updatedAt,
          data: publishData(operationAt),
        }),
      ]),
    );

    expectOneUpdatedOneConflict(results);
    const final = await prisma.lessonContentItem.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(
      (final.publicationStatus === LessonContentPublicationStatus.DRAFT &&
        final.title === 'Reviewed concurrent update') ||
        (final.publicationStatus === LessonContentPublicationStatus.PUBLISHED &&
          final.title === original.title),
    ).toBe(true);
    expect(
      final.publicationStatus === LessonContentPublicationStatus.PUBLISHED &&
        final.title === 'Reviewed concurrent update',
    ).toBe(false);
  });

  it('allows exactly one conditional DRAFT delete versus publish winner', async () => {
    const original = await createContent({
      publicationStatus: LessonContentPublicationStatus.DRAFT,
    });
    const operationAt = nextVersion(original.updatedAt);
    const results = await inFixtureSchool(() =>
      Promise.all([
        repository.updateContentItemConditionally({
          ...contentPath(original.id),
          expectedPublicationStatus: LessonContentPublicationStatus.DRAFT,
          expectedUpdatedAt: original.updatedAt,
          data: {
            deletedAt: operationAt,
            updatedAt: operationAt,
            updatedByUserId: created.userId,
          },
        }),
        repository.updateContentItemConditionally({
          ...contentPath(original.id),
          expectedPublicationStatus: LessonContentPublicationStatus.DRAFT,
          expectedUpdatedAt: original.updatedAt,
          data: publishData(operationAt),
        }),
      ]),
    );

    expectOneUpdatedOneConflict(results);
    const final = await prisma.lessonContentItem.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(
      (final.publicationStatus === LessonContentPublicationStatus.DRAFT &&
        final.deletedAt !== null) ||
        (final.publicationStatus === LessonContentPublicationStatus.PUBLISHED &&
          final.deletedAt === null),
    ).toBe(true);
    expect(
      final.publicationStatus === LessonContentPublicationStatus.PUBLISHED &&
        final.deletedAt !== null,
    ).toBe(false);
  });

  it('allows exactly one conditional publish winner from one DRAFT version', async () => {
    const original = await createContent({
      publicationStatus: LessonContentPublicationStatus.DRAFT,
    });
    const operationAt = nextVersion(original.updatedAt);
    const publishAttempt = () =>
      repository.updateContentItemConditionally({
        ...contentPath(original.id),
        expectedPublicationStatus: LessonContentPublicationStatus.DRAFT,
        expectedUpdatedAt: original.updatedAt,
        data: publishData(operationAt),
      });

    const results = await inFixtureSchool(() =>
      Promise.all([publishAttempt(), publishAttempt()]),
    );

    expectOneUpdatedOneConflict(results);
    await expectFinalStatus(
      original.id,
      LessonContentPublicationStatus.PUBLISHED,
    );
  });

  it('allows exactly one conditional archive winner from one PUBLISHED version', async () => {
    const original = await createContent(publishedLifecycle());
    const operationAt = nextVersion(original.updatedAt);
    const archiveAttempt = () =>
      repository.updateContentItemConditionally({
        ...contentPath(original.id),
        expectedPublicationStatus: LessonContentPublicationStatus.PUBLISHED,
        expectedUpdatedAt: original.updatedAt,
        data: archiveData(operationAt),
      });

    const results = await inFixtureSchool(() =>
      Promise.all([archiveAttempt(), archiveAttempt()]),
    );

    expectOneUpdatedOneConflict(results);
    await expectFinalStatus(
      original.id,
      LessonContentPublicationStatus.ARCHIVED,
    );
  });

  it('archives PUBLISHED while the invalid concurrent publish attempt conflicts', async () => {
    const original = await createContent(publishedLifecycle());
    const operationAt = nextVersion(original.updatedAt);
    const [publishResult, archiveResult] = await inFixtureSchool(() =>
      Promise.all([
        repository.updateContentItemConditionally({
          ...contentPath(original.id),
          expectedPublicationStatus: LessonContentPublicationStatus.DRAFT,
          expectedUpdatedAt: original.updatedAt,
          data: publishData(operationAt),
        }),
        repository.updateContentItemConditionally({
          ...contentPath(original.id),
          expectedPublicationStatus: LessonContentPublicationStatus.PUBLISHED,
          expectedUpdatedAt: original.updatedAt,
          data: archiveData(operationAt),
        }),
      ]),
    );

    expect(publishResult).toEqual({ status: 'conflict' });
    expect(archiveResult.status).toBe('updated');
    await expectFinalStatus(
      original.id,
      LessonContentPublicationStatus.ARCHIVED,
    );
  });

  function contentPath(contentItemId: string) {
    return {
      curriculumId: created.curriculumId,
      unitId: created.unitId,
      lessonId: created.lessonId,
      contentItemId,
    };
  }

  function publishData(
    operationAt: Date,
  ): Prisma.LessonContentItemUncheckedUpdateManyInput {
    return {
      publicationStatus: LessonContentPublicationStatus.PUBLISHED,
      publishedAt: operationAt,
      publishedByUserId: created.userId,
      archivedAt: null,
      archivedByUserId: null,
      updatedAt: operationAt,
      updatedByUserId: created.userId,
    };
  }

  function archiveData(
    operationAt: Date,
  ): Prisma.LessonContentItemUncheckedUpdateManyInput {
    return {
      publicationStatus: LessonContentPublicationStatus.ARCHIVED,
      archivedAt: operationAt,
      archivedByUserId: created.userId,
      updatedAt: operationAt,
      updatedByUserId: created.userId,
    };
  }

  function publishedLifecycle(): Partial<Prisma.LessonContentItemUncheckedCreateInput> {
    return {
      publicationStatus: LessonContentPublicationStatus.PUBLISHED,
      publishedAt: timestamp(),
      publishedByUserId: created.userId,
      archivedAt: null,
      archivedByUserId: null,
    };
  }

  function inFixtureSchool<T>(callback: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: created.userId, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: `publication-check-membership-${suffix}`,
        organizationId: created.organizationId,
        schoolId: created.schoolId,
        roleId: `publication-check-role-${suffix}`,
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

  async function expectFinalStatus(
    contentItemId: string,
    publicationStatus: LessonContentPublicationStatus,
  ): Promise<void> {
    await expect(
      prisma.lessonContentItem.findUniqueOrThrow({
        where: { id: contentItemId },
        select: { publicationStatus: true },
      }),
    ).resolves.toEqual({ publicationStatus });
  }

  function createContent(
    lifecycle: Partial<Prisma.LessonContentItemUncheckedCreateInput>,
  ) {
    return prisma.lessonContentItem.create({
      data: {
        schoolId: created.schoolId,
        curriculumId: created.curriculumId,
        unitId: created.unitId,
        lessonId: created.lessonId,
        type: LessonContentItemType.TEXT,
        title: `Constraint case ${randomUUID()}`,
        bodyText: 'Synthetic',
        createdByUserId: created.userId,
        updatedByUserId: created.userId,
        ...lifecycle,
      },
    });
  }
});

function nextVersion(updatedAt: Date): Date {
  return new Date(updatedAt.getTime() + 1_000);
}

type ActorValue = string | null | (() => string);
type LifecycleFixture = {
  publicationStatus: LessonContentPublicationStatus;
  publishedAt?: Date | null;
  publishedByUserId?: ActorValue;
  archivedAt?: Date | null;
  archivedByUserId?: ActorValue;
  deletedAt?: Date | null;
};

function resolveActors(
  lifecycle: LifecycleFixture,
): Partial<Prisma.LessonContentItemUncheckedCreateInput> {
  return {
    ...lifecycle,
    publishedByUserId: resolveActor(lifecycle.publishedByUserId),
    archivedByUserId: resolveActor(lifecycle.archivedByUserId),
  };
}

function resolveActor(
  value: ActorValue | undefined,
): string | null | undefined {
  return typeof value === 'function' ? value() : value;
}

function timestamp(): Date {
  return new Date('2026-07-21T10:00:00.000Z');
}

function databaseErrorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const prismaError = error as Error & { meta?: unknown };
  return `${prismaError.message} ${JSON.stringify(prismaError.meta ?? {})}`;
}
