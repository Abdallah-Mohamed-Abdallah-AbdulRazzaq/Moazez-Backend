import { randomUUID } from 'node:crypto';
import {
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePublicationStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { BulkSaveSubjectAllocationsUseCase } from '../../src/modules/academics/subject-allocation/application/bulk-save-subject-allocations.use-case';
import { SubjectAllocationRepository } from '../../src/modules/academics/subject-allocation/infrastructure/subject-allocation.repository';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

jest.setTimeout(60000);

const LOCAL_DISPOSABLE_DATABASE_PATTERN =
  /^moazez_test(?:_[a-z0-9]+(?:[_-][a-z0-9]+)*)?$/u;
const CI_DISPOSABLE_DATABASE_PATTERN = /^ci_[0-9a-f]{14}$/u;

describe('Curriculum mutation persistence and school isolation', () => {
  let prisma: PrismaService;
  let useCase: BulkSaveSubjectAllocationsUseCase;
  let schoolA: Awaited<ReturnType<typeof createSchool>>;
  let schoolB: Awaited<ReturnType<typeof createSchool>>;
  const schoolIds: string[] = [];
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (databaseName) =>
        LOCAL_DISPOSABLE_DATABASE_PATTERN.test(databaseName) ||
        CI_DISPOSABLE_DATABASE_PATTERN.test(databaseName),
      errorMessage:
        'Curriculum integrity tests require a disposable test database',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    useCase = new BulkSaveSubjectAllocationsUseCase(
      new SubjectAllocationRepository(prisma),
    );
    schoolA = await createSchool('a');
    schoolB = await createSchool('b');
  });

  beforeEach(async () => {
    await clearDependentRows();
    await prisma.subjectAllocation.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    for (const school of [schoolA, schoolB]) {
      await prisma.subjectAllocation.createMany({
        data: [
          { ...curriculumKey(school, school.subjects[0]), weeklyHours: 5 },
          { ...curriculumKey(school, school.subjects[1]), weeklyHours: 3 },
        ],
      });
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await clearDependentRows();
      const where = { schoolId: { in: schoolIds } };
      await prisma.subjectAllocation.deleteMany({ where });
      await prisma.classroom.deleteMany({ where });
      await prisma.section.deleteMany({ where });
      await prisma.grade.deleteMany({ where });
      await prisma.stage.deleteMany({ where });
      await prisma.term.deleteMany({ where });
      await prisma.academicYear.deleteMany({ where });
      await prisma.subject.deleteMany({ where });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('adds rows, activates zero, and deactivates without dependencies while retaining zero-row persistence', async () => {
    await save(schoolA, [
      [2, 0],
      [0, 0],
    ]);
    expect(await hours(schoolA)).toEqual([0, 3, 0]);
    await addDependency(schoolA, 2, 'teacher');
    await save(schoolA, [[2, 5]]);
    expect(await hours(schoolA)).toEqual([0, 3, 5]);
  });

  it('restores a soft-deleted row through the existing partial upsert contract', async () => {
    await prisma.subjectAllocation.updateMany({
      where: curriculumKey(schoolA, schoolA.subjects[0]),
      data: { deletedAt: new Date() },
    });
    await save(schoolA, [[0, 4]]);
    expect(await hours(schoolA)).toEqual([4, 3, null]);
    expect(
      await prisma.subjectAllocation.count({
        where: {
          ...curriculumKey(schoolA, schoolA.subjects[0]),
          deletedAt: null,
        },
      }),
    ).toBe(1);
  });

  it.each(['teacher', 'draft', 'published'] as const)(
    'preserves omitted pairs and their %s dependencies',
    async (dependency) => {
      await addDependency(schoolA, 1, dependency);
      const omittedBefore = await prisma.subjectAllocation.findFirstOrThrow({
        where: curriculumKey(schoolA, schoolA.subjects[1]),
      });
      const dependenciesBefore = await dependencySnapshot(schoolA);
      await save(schoolA, [[0, 8]]);
      expect(await hours(schoolA)).toEqual([8, 3, null]);
      expect(
        await prisma.subjectAllocation.findFirstOrThrow({
          where: curriculumKey(schoolA, schoolA.subjects[1]),
        }),
      ).toEqual(omittedBefore);
      expect(await dependencySnapshot(schoolA)).toEqual(dependenciesBefore);
    },
  );

  it('does not block an unchanged pair with a published dependency', async () => {
    await addDependency(schoolA, 0, 'published');
    await save(schoolA, [[0, 5]]);
    expect(await hours(schoolA)).toEqual([5, 3, null]);
  });

  it.each(['teacher', 'draft', 'published'] as const)(
    'blocks deactivation with %s dependencies and returns exact bounded counts',
    async (dependency) => {
      await addDependency(schoolA, 0, dependency);
      await expect(save(schoolA, [[0, 0]])).rejects.toMatchObject({
        code: 'academics.subject_allocation.dependency_conflict',
        httpStatus: 409,
        details: {
          termId: schoolA.termId,
          gradeId: schoolA.gradeId,
          subjectId: schoolA.subjects[0],
          mutation: 'DEACTIVATE',
          teacherAllocationCount: 1,
          draftTimetableEntryCount: dependency === 'draft' ? 1 : 0,
          publishedTimetableEntryCount: dependency === 'published' ? 1 : 0,
          publishedTimetableConfigCount: dependency === 'published' ? 1 : 0,
        },
      });
      expect(await hours(schoolA)).toEqual([5, 3, null]);
    },
  );

  it.each(['teacher', 'draft'] as const)(
    'allows positive changes with %s dependencies and leaves those rows untouched',
    async (dependency) => {
      await addDependency(schoolA, 0, dependency);
      const before = await dependencySnapshot(schoolA);
      await save(schoolA, [[0, 4]]);
      await save(schoolA, [[0, 7]]);
      expect(await hours(schoolA)).toEqual([7, 3, null]);
      expect(await dependencySnapshot(schoolA)).toEqual(before);
    },
  );

  it.each([4, 7])(
    'blocks positive changes to %s when published entries depend on the pair',
    async (proposed) => {
      await addDependency(schoolA, 0, 'published');
      await expect(save(schoolA, [[0, proposed]])).rejects.toMatchObject({
        code: 'academics.subject_allocation.dependency_conflict',
        details: {
          mutation: 'POSITIVE_REQUIREMENT_CHANGE',
          publishedTimetableEntryCount: 1,
          publishedTimetableConfigCount: 1,
        },
      });
      expect(await hours(schoolA)).toEqual([5, 3, null]);
    },
  );

  it.each(['active-config', 'published-publication'] as const)(
    'detects concrete %s dependency even if its entry is still draft',
    async (state) => {
      const dependency = await addDependency(schoolA, 0, 'draft');
      if (state === 'active-config') {
        await prisma.timetableConfig.update({
          where: { id: dependency.configId! },
          data: { status: TimetableConfigStatus.ACTIVE },
        });
      } else {
        await prisma.timetablePublication.create({
          data: {
            schoolId: schoolA.schoolId,
            academicYearId: schoolA.yearId,
            termId: schoolA.termId,
            timetableConfigId: dependency.configId!,
            status: TimetablePublicationStatus.PUBLISHED,
          },
        });
      }
      await expect(save(schoolA, [[0, 4]])).rejects.toMatchObject({
        code: 'academics.subject_allocation.dependency_conflict',
        details: {
          draftTimetableEntryCount: 0,
          publishedTimetableEntryCount: 1,
          publishedTimetableConfigCount: 1,
        },
      });
    },
  );

  it('does not infer a concrete published dependency from cancelled entries', async () => {
    const dependency = await addDependency(schoolA, 0, 'published');
    await prisma.timetableEntry.update({
      where: { id: dependency.entryId! },
      data: { status: TimetableEntryStatus.CANCELLED },
    });
    await save(schoolA, [[0, 4]]);
    expect(await hours(schoolA)).toEqual([4, 3, null]);
  });

  it('writes nothing when a later submitted pair conflicts, including an earlier add', async () => {
    await addDependency(schoolA, 1, 'draft');
    const before = await prisma.subjectAllocation.findMany({
      where: { schoolId: schoolA.schoolId },
      orderBy: { id: 'asc' },
    });
    await expect(
      save(schoolA, [
        [0, 8],
        [2, 6],
        [1, 0],
      ]),
    ).rejects.toMatchObject({
      code: 'academics.subject_allocation.dependency_conflict',
    });
    expect(
      await prisma.subjectAllocation.findMany({
        where: { schoolId: schoolA.schoolId },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(before);
  });

  it('counts only the requested school and pair, leaving foreign school rows untouched', async () => {
    await addDependency(schoolB, 0, 'published');
    const foreignBefore = await dependencySnapshot(schoolB);
    await save(schoolA, [[0, 0]]);
    expect(await hours(schoolA)).toEqual([0, 3, null]);
    expect(await hours(schoolB)).toEqual([5, 3, null]);
    expect(await dependencySnapshot(schoolB)).toEqual(foreignBefore);
  });

  it('does not reveal foreign dependency counts when foreign resource IDs are submitted', async () => {
    await addDependency(schoolB, 0, 'published');
    for (const override of [
      { termId: schoolB.termId },
      { gradeId: schoolB.gradeId },
      { subjectId: schoolB.subjects[0] },
    ]) {
      const command = {
        termId: override.termId ?? schoolA.termId,
        items: [
          {
            gradeId: override.gradeId ?? schoolA.gradeId,
            subjectId: override.subjectId ?? schoolA.subjects[0],
            weeklyHours: 0,
          },
        ],
      };
      const error: unknown = await inSchool(schoolA, () =>
        useCase.execute(command),
      ).catch((caught: unknown) => caught);
      expect(error).toMatchObject({
        code: 'academics.subject_allocation.invalid_scope',
        httpStatus: 422,
      });
      expect((error as { details: unknown }).details).not.toHaveProperty(
        'teacherAllocationCount',
      );
      expect((error as { details: unknown }).details).not.toHaveProperty(
        'publishedTimetableEntryCount',
      );
    }
    expect(await hours(schoolA)).toEqual([5, 3, null]);
  });

  it.each(['term', 'grade', 'subject'] as const)(
    'ignores published dependencies for a different %s in the same school',
    async (dimension) => {
      let dependencySchool = schoolA;
      if (dimension === 'term') {
        const term = await prisma.term.create({
          data: {
            schoolId: schoolA.schoolId,
            academicYearId: schoolA.yearId,
            nameAr: 'Other term',
            nameEn: 'Other term',
            isActive: true,
            startDate: new Date('2027-01-01'),
            endDate: new Date('2027-06-01'),
          },
        });
        dependencySchool = { ...schoolA, termId: term.id };
      } else if (dimension === 'grade') {
        const originalGrade = await prisma.grade.findUniqueOrThrow({
          where: { id: schoolA.gradeId },
        });
        const names = { nameAr: 'Other grade', nameEn: 'Other grade' };
        const grade = await prisma.grade.create({
          data: {
            schoolId: schoolA.schoolId,
            stageId: originalGrade.stageId,
            ...names,
          },
        });
        const section = await prisma.section.create({
          data: { schoolId: schoolA.schoolId, gradeId: grade.id, ...names },
        });
        const classroom = await prisma.classroom.create({
          data: { schoolId: schoolA.schoolId, sectionId: section.id, ...names },
        });
        dependencySchool = {
          ...schoolA,
          gradeId: grade.id,
          sectionId: section.id,
          classroomId: classroom.id,
        };
      }
      await addDependency(
        dependencySchool,
        dimension === 'subject' ? 1 : 0,
        'published',
      );
      const before = await dependencySnapshot(schoolA);
      await save(schoolA, [[0, 0]]);
      expect(await hours(schoolA)).toEqual([0, 3, null]);
      expect(await dependencySnapshot(schoolA)).toEqual(before);
    },
  );

  function inSchool<T>(
    school: typeof schoolA,
    work: () => Promise<T>,
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: school.teacherId, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId: school.schoolId,
        organizationId: school.organizationId,
        roleId: randomUUID(),
        permissions: ['academics.structure.manage'],
      });
      return work();
    });
  }

  function save(school: typeof schoolA, items: Array<[number, number]>) {
    return inSchool(school, () =>
      useCase.execute({
        termId: school.termId,
        items: items.map(([index, weeklyHours]) => ({
          gradeId: school.gradeId,
          subjectId: school.subjects[index],
          weeklyHours,
        })),
      }),
    );
  }

  function curriculumKey(school: typeof schoolA, subjectId: string) {
    return {
      schoolId: school.schoolId,
      academicYearId: school.yearId,
      termId: school.termId,
      gradeId: school.gradeId,
      subjectId,
    };
  }

  async function hours(school: typeof schoolA) {
    const rows = await prisma.subjectAllocation.findMany({
      where: {
        schoolId: school.schoolId,
        termId: school.termId,
        deletedAt: null,
      },
    });
    return school.subjects.map(
      (subjectId) =>
        rows.find((row) => row.subjectId === subjectId)?.weeklyHours ?? null,
    );
  }

  async function dependencySnapshot(school: typeof schoolA) {
    const where = { schoolId: school.schoolId };
    return {
      teachers: await prisma.teacherSubjectAllocation.findMany({ where }),
      entries: await prisma.timetableEntry.findMany({ where }),
      configs: await prisma.timetableConfig.findMany({ where }),
      publications: await prisma.timetablePublication.findMany({ where }),
    };
  }

  async function addDependency(
    school: typeof schoolA,
    subjectIndex: number,
    kind: 'teacher' | 'draft' | 'published',
  ) {
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: school.schoolId,
        termId: school.termId,
        classroomId: school.classroomId,
        teacherUserId: school.teacherId,
        subjectId: school.subjects[subjectIndex],
      },
    });
    if (kind === 'teacher')
      return { allocationId: allocation.id, configId: null, entryId: null };
    const config = await prisma.timetableConfig.create({
      data: {
        schoolId: school.schoolId,
        academicYearId: school.yearId,
        termId: school.termId,
        name: 'Schedule',
        scopeKey: randomUUID(),
        activeDays: [0],
        status:
          kind === 'published'
            ? TimetableConfigStatus.ACTIVE
            : TimetableConfigStatus.DRAFT,
      },
    });
    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId: school.schoolId,
        timetableConfigId: config.id,
        periodIndex: 1,
        label: 'One',
        startTime: '08:00',
        endTime: '08:45',
      },
    });
    const entry = await prisma.timetableEntry.create({
      data: {
        schoolId: school.schoolId,
        academicYearId: school.yearId,
        termId: school.termId,
        gradeId: school.gradeId,
        sectionId: school.sectionId,
        classroomId: school.classroomId,
        subjectId: school.subjects[subjectIndex],
        teacherUserId: school.teacherId,
        teacherSubjectAllocationId: allocation.id,
        timetableConfigId: config.id,
        periodId: period.id,
        dayOfWeek: 0,
        status:
          kind === 'published'
            ? TimetableEntryStatus.ACTIVE
            : TimetableEntryStatus.DRAFT,
      },
    });
    return {
      allocationId: allocation.id,
      configId: config.id,
      entryId: entry.id,
    };
  }

  async function clearDependentRows() {
    const where = { schoolId: { in: schoolIds } };
    await prisma.timetablePublication.deleteMany({ where });
    await prisma.timetableEntry.deleteMany({ where });
    await prisma.timetablePeriod.deleteMany({ where });
    await prisma.timetableConfig.deleteMany({ where });
    await prisma.teacherSubjectAllocation.deleteMany({ where });
  }

  async function createSchool(label: string) {
    const marker = `curriculum-integrity-${label}-${randomUUID()}`;
    const organization = await prisma.organization.create({
      data: { name: marker, slug: marker },
    });
    organizationIds.push(organization.id);
    const school = await prisma.school.create({
      data: { organizationId: organization.id, name: marker, slug: marker },
    });
    schoolIds.push(school.id);
    const names = { nameAr: 'Fixture', nameEn: 'Fixture' };
    const dates = {
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-01'),
      isActive: true,
    };
    const year = await prisma.academicYear.create({
      data: { schoolId: school.id, ...names, ...dates },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        ...names,
        ...dates,
      },
    });
    const stage = await prisma.stage.create({
      data: { schoolId: school.id, ...names },
    });
    const grade = await prisma.grade.create({
      data: { schoolId: school.id, stageId: stage.id, ...names },
    });
    const section = await prisma.section.create({
      data: { schoolId: school.id, gradeId: grade.id, ...names },
    });
    const classroom = await prisma.classroom.create({
      data: { schoolId: school.id, sectionId: section.id, ...names },
    });
    const subjects: string[] = [];
    for (const name of ['Math', 'Science', 'New']) {
      const subject = await prisma.subject.create({
        data: {
          schoolId: school.id,
          nameAr: name,
          nameEn: name,
          isActive: true,
        },
      });
      subjects.push(subject.id);
    }
    const teacher = await prisma.user.create({
      data: {
        email: `${marker}@example.test`,
        firstName: 'Fixture',
        lastName: 'Teacher',
        userType: UserType.TEACHER,
      },
    });
    userIds.push(teacher.id);
    return {
      organizationId: organization.id,
      schoolId: school.id,
      yearId: year.id,
      termId: term.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjects,
      teacherId: teacher.id,
    };
  }
});
