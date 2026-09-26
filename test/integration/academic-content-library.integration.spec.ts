import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentStatus as Status,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as ContentType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { ListAcademicContentForManagementUseCase } from '../../src/modules/academics/academic-content/application/academic-content-management-read.use-cases';
import type { AcademicContentLibraryQuery } from '../../src/modules/academics/academic-content/domain/academic-content-library.query';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('ACC-4D PostgreSQL Academic Content Library', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService({
    datasources: {
      db: {
        url: databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
      },
    },
  });
  const listUseCase = new ListAcademicContentForManagementUseCase(
    new AcademicContentRepository(prisma),
  );
  const id: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 8);
  const date = (value: string) => new Date(value);

  function list(query: AcademicContentLibraryQuery = {}) {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: id.manager, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: randomUUID(),
        organizationId: id.organization,
        schoolId: id.school,
        roleId: randomUUID(),
        permissions: ['academics.academic_content.view'],
      });
      return listUseCase.execute(query);
    });
  }

  async function content(
    title: string,
    overrides: Partial<{
      schoolId: string;
      academicYearId: string;
      termId: string;
      type: ContentType;
      status: Status;
      audience: Audience;
      description: string;
      deletedAt: Date;
    }> = {},
  ) {
    return prisma.academicContent.create({
      data: {
        schoolId: overrides.schoolId ?? id.school,
        academicYearId: overrides.academicYearId ?? id.year,
        termId: overrides.termId ?? id.term,
        type: overrides.type ?? ContentType.GENERAL_RESOURCE,
        status: overrides.status ?? Status.DRAFT,
        archivedAt: overrides.status === Status.ARCHIVED ? new Date() : null,
        audience: overrides.audience ?? Audience.STUDENTS,
        title,
        description: overrides.description,
        deletedAt: overrides.deletedAt,
        createdByUserId: id.manager,
      },
    });
  }

  async function target(
    academicContentId: string,
    scopeType: Scope,
    options: Partial<{
      stageId: string;
      gradeId: string;
      sectionId: string;
      classroomId: string;
      subjectId: string;
      teacherSubjectAllocationId: string;
    }> = {},
  ) {
    return prisma.academicContentTarget.create({
      data: {
        schoolId: id.school,
        academicContentId,
        scopeType,
        identityFingerprint: randomUUID(),
        createdByUserId: id.manager,
        ...options,
      },
    });
  }

  const titles = (rows: { items: { title: string }[] }) =>
    rows.items.map((item) => item.title).sort();

  beforeAll(async () => {
    await prisma.$connect();
    id.organization = (
      await prisma.organization.create({
        data: {
          name: `ACC4D ${suffix}`,
          slug: `acc4d-${suffix}`,
        },
      })
    ).id;
    id.school = (
      await prisma.school.create({
        data: {
          organizationId: id.organization,
          name: `ACC4D ${suffix}`,
          slug: `acc4d-${suffix}`,
        },
      })
    ).id;
    id.foreignOrganization = (
      await prisma.organization.create({
        data: {
          name: `ACC4D Foreign ${suffix}`,
          slug: `acc4d-foreign-${suffix}`,
        },
      })
    ).id;
    id.foreignSchool = (
      await prisma.school.create({
        data: {
          organizationId: id.foreignOrganization,
          name: `ACC4D Foreign ${suffix}`,
          slug: `acc4d-foreign-${suffix}`,
        },
      })
    ).id;
    id.manager = (
      await prisma.user.create({
        data: {
          email: `acc4d-manager-${suffix}@example.test`,
          firstName: 'ACC',
          lastName: 'Manager',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    id.teacher1 = (
      await prisma.user.create({
        data: {
          email: `acc4d-teacher1-${suffix}@example.test`,
          firstName: 'ACC',
          lastName: 'Teacher1',
          userType: UserType.TEACHER,
        },
      })
    ).id;
    id.teacher2 = (
      await prisma.user.create({
        data: {
          email: `acc4d-teacher2-${suffix}@example.test`,
          firstName: 'ACC',
          lastName: 'Teacher2',
          userType: UserType.TEACHER,
        },
      })
    ).id;
    id.year = (
      await prisma.academicYear.create({
        data: {
          schoolId: id.school,
          nameAr: `سنة ${suffix}`,
          nameEn: `Year ${suffix}`,
          startDate: date('2028-01-01'),
          endDate: date('2029-12-31'),
        },
      })
    ).id;
    id.term = (
      await prisma.term.create({
        data: {
          schoolId: id.school,
          academicYearId: id.year,
          nameAr: `فصل ${suffix}`,
          nameEn: `Term ${suffix}`,
          startDate: date('2028-01-01'),
          endDate: date('2028-12-31'),
          isActive: false,
        },
      })
    ).id;
    id.year2 = (
      await prisma.academicYear.create({
        data: {
          schoolId: id.school,
          nameAr: `سنة ثانية ${suffix}`,
          nameEn: `Year Two ${suffix}`,
          startDate: date('2030-01-01'),
          endDate: date('2031-12-31'),
        },
      })
    ).id;
    id.term2 = (
      await prisma.term.create({
        data: {
          schoolId: id.school,
          academicYearId: id.year2,
          nameAr: `فصل ثاني ${suffix}`,
          nameEn: `Term Two ${suffix}`,
          startDate: date('2030-01-01'),
          endDate: date('2030-12-31'),
        },
      })
    ).id;
    id.otherTerm = (
      await prisma.term.create({
        data: {
          schoolId: id.school,
          academicYearId: id.year,
          nameAr: `فصل آخر ${suffix}`,
          nameEn: `Other Term ${suffix}`,
          startDate: date('2029-01-01'),
          endDate: date('2029-12-31'),
        },
      })
    ).id;
    id.foreignYear = (
      await prisma.academicYear.create({
        data: {
          schoolId: id.foreignSchool,
          nameAr: `سنة أجنبية ${suffix}`,
          nameEn: `Foreign Year ${suffix}`,
          startDate: date('2028-01-01'),
          endDate: date('2029-12-31'),
        },
      })
    ).id;
    id.foreignTerm = (
      await prisma.term.create({
        data: {
          schoolId: id.foreignSchool,
          academicYearId: id.foreignYear,
          nameAr: `فصل أجنبي ${suffix}`,
          nameEn: `Foreign Term ${suffix}`,
          startDate: date('2028-01-01'),
          endDate: date('2028-12-31'),
        },
      })
    ).id;
    for (const key of ['s1', 's2'])
      id[key] = (
        await prisma.stage.create({
          data: {
            schoolId: id.school,
            nameAr: `${key} ${suffix}`,
            nameEn: `${key} ${suffix}`,
          },
        })
      ).id;
    id.deletedStage = (
      await prisma.stage.create({
        data: {
          schoolId: id.school,
          nameAr: `deleted ${suffix}`,
          nameEn: `deleted ${suffix}`,
          deletedAt: new Date(),
        },
      })
    ).id;
    for (const [key, stage] of [
      ['g1', 's1'],
      ['g2', 's1'],
      ['g3', 's2'],
    ])
      id[key] = (
        await prisma.grade.create({
          data: {
            schoolId: id.school,
            stageId: id[stage],
            nameAr: `${key} ${suffix}`,
            nameEn: `${key} ${suffix}`,
          },
        })
      ).id;
    for (const [key, grade] of [
      ['x1', 'g1'],
      ['x2', 'g1'],
      ['x3', 'g2'],
    ])
      id[key] = (
        await prisma.section.create({
          data: {
            schoolId: id.school,
            gradeId: id[grade],
            nameAr: `${key} ${suffix}`,
            nameEn: `${key} ${suffix}`,
          },
        })
      ).id;
    for (const [key, section] of [
      ['c1', 'x1'],
      ['c2', 'x1'],
      ['c3', 'x2'],
      ['c4', 'x3'],
    ])
      id[key] = (
        await prisma.classroom.create({
          data: {
            schoolId: id.school,
            sectionId: id[section],
            nameAr: `${key} ${suffix}`,
            nameEn: `${key} ${suffix}`,
          },
        })
      ).id;
    id.deletedGrade = (
      await prisma.grade.create({
        data: {
          schoolId: id.school,
          stageId: id.s1,
          nameAr: `deleted grade ${suffix}`,
          nameEn: `deleted grade ${suffix}`,
          deletedAt: new Date(),
        },
      })
    ).id;
    id.deletedSection = (
      await prisma.section.create({
        data: {
          schoolId: id.school,
          gradeId: id.g1,
          nameAr: `deleted section ${suffix}`,
          nameEn: `deleted section ${suffix}`,
          deletedAt: new Date(),
        },
      })
    ).id;
    id.deletedClassroom = (
      await prisma.classroom.create({
        data: {
          schoolId: id.school,
          sectionId: id.x1,
          nameAr: `deleted classroom ${suffix}`,
          nameEn: `deleted classroom ${suffix}`,
          deletedAt: new Date(),
        },
      })
    ).id;
    for (const key of [
      'math',
      'science',
      'zero',
      'deleted',
      'wrongYear',
      'wrongTerm',
    ])
      id[key] = (
        await prisma.subject.create({
          data: {
            schoolId: id.school,
            nameAr: `${key} ${suffix}`,
            nameEn: `${key} ${suffix}`,
            code: `${key}-${suffix}`,
          },
        })
      ).id;
    for (const [subject, grade, year, term, hours, deletedAt] of [
      ['math', 'g1', 'year', 'term', 4, null],
      ['science', 'g2', 'year', 'term', 4, null],
      ['zero', 'g1', 'year', 'term', 0, null],
      ['deleted', 'g1', 'year', 'term', 4, date('2028-06-01')],
      ['wrongYear', 'g1', 'year2', 'term2', 4, null],
      ['wrongTerm', 'g1', 'year', 'otherTerm', 4, null],
    ] as const)
      await prisma.subjectAllocation.create({
        data: {
          schoolId: id.school,
          subjectId: id[subject],
          gradeId: id[grade],
          academicYearId: id[year],
          termId: id[term],
          weeklyHours: hours,
          deletedAt,
        },
      });
    id.allocation1 = (
      await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: id.school,
          teacherUserId: id.teacher1,
          subjectId: id.math,
          classroomId: id.c1,
          termId: id.term,
        },
      })
    ).id;
    id.allocation2 = (
      await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: id.school,
          teacherUserId: id.teacher2,
          subjectId: id.science,
          classroomId: id.c2,
          termId: id.term,
        },
      })
    ).id;
    id.foreignStage = (
      await prisma.stage.create({
        data: {
          schoolId: id.foreignSchool,
          nameAr: `أجنبي ${suffix}`,
          nameEn: `Foreign ${suffix}`,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (id.school) {
      await prisma.academicContentRevisionTag.deleteMany({
        where: { schoolId: id.school },
      });
      await prisma.academicContentRevision.deleteMany({
        where: { schoolId: id.school },
      });
      await prisma.academicContentTag.deleteMany({
        where: { schoolId: id.school },
      });
      await prisma.academicContentTarget.deleteMany({
        where: { schoolId: id.school },
      });
      await prisma.academicContent.deleteMany({
        where: { schoolId: id.school },
      });
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { schoolId: id.school },
      });
      await prisma.subjectAllocation.deleteMany({
        where: { schoolId: id.school },
      });
      await prisma.classroom.deleteMany({ where: { schoolId: id.school } });
      await prisma.section.deleteMany({ where: { schoolId: id.school } });
      await prisma.grade.deleteMany({ where: { schoolId: id.school } });
      await prisma.stage.deleteMany({
        where: { schoolId: { in: [id.school, id.foreignSchool] } },
      });
      await prisma.subject.deleteMany({ where: { schoolId: id.school } });
      await prisma.term.deleteMany({
        where: { schoolId: { in: [id.school, id.foreignSchool] } },
      });
      await prisma.academicYear.deleteMany({
        where: { schoolId: { in: [id.school, id.foreignSchool] } },
      });
      await prisma.school.deleteMany({
        where: { id: { in: [id.school, id.foreignSchool] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [id.manager, id.teacher1, id.teacher2] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [id.organization, id.foreignOrganization] } },
      });
    }
    await prisma.$disconnect();
  });

  it('composes scalar filters, retains archived historical content, and excludes deleted rows', async () => {
    const old = await content('scalar-old', {
      type: ContentType.WEEKLY_PLAN,
      status: Status.ARCHIVED,
      audience: Audience.GUARDIANS,
    });
    const current = await content('scalar-current', {
      academicYearId: id.year2,
      termId: id.term2,
      type: ContentType.GENERAL_RESOURCE,
      audience: Audience.STUDENTS,
    });
    await content('scalar-deleted', { deletedAt: new Date() });
    expect(
      titles(await list({ search: 'scalar-', academicYearId: id.year })),
    ).toEqual(['scalar-old']);
    expect(titles(await list({ search: 'scalar-', termId: id.term2 }))).toEqual(
      ['scalar-current'],
    );
    expect(
      titles(await list({ search: 'scalar-', type: ContentType.WEEKLY_PLAN })),
    ).toEqual(['scalar-old']);
    expect(
      titles(await list({ search: 'scalar-', status: Status.ARCHIVED })),
    ).toEqual(['scalar-old']);
    expect(
      titles(await list({ search: 'scalar-', audience: Audience.GUARDIANS })),
    ).toEqual(['scalar-old']);
    expect(
      titles(
        await list({
          search: 'scalar-',
          academicYearId: id.year,
          termId: id.term,
          type: ContentType.WEEKLY_PLAN,
          status: Status.ARCHIVED,
          audience: Audience.GUARDIANS,
        }),
      ),
    ).toEqual(['scalar-old']);
    expect(
      (
        await list({
          search: 'scalar-',
          academicYearId: id.year,
          status: Status.DRAFT,
        })
      ).total,
    ).toBe(0);
    expect(old.id).not.toBe(current.id);
  });

  it('searches current title, description and tags case-insensitively, with exact canonical tags', async () => {
    const row = await content('search-Geometry', {
      description: 'Zebras in DESCription',
    });
    await prisma.academicContentTag.create({
      data: {
        schoolId: id.school,
        academicContentId: row.id,
        displayValue: 'Weekly Plan',
        normalizedValue: 'weekly plan',
        sortOrder: 0,
        createdByUserId: id.manager,
      },
    });
    await prisma.academicContentRevision.create({
      data: {
        schoolId: id.school,
        academicContentId: row.id,
        revisionNumber: 1,
        snapshotContractVersion: 1,
        academicYearId: id.year,
        termId: id.term,
        type: ContentType.GENERAL_RESOURCE,
        audience: Audience.STUDENTS,
        title: 'revision-only-phantom',
        description: null,
        sourceStatus: Status.DRAFT,
        capturedByUserId: id.manager,
      },
    });
    expect(titles(await list({ search: 'geometry' }))).toContain(
      'search-Geometry',
    );
    expect(titles(await list({ search: 'descRIPTION' }))).toContain(
      'search-Geometry',
    );
    expect(titles(await list({ search: 'weekLY' }))).toContain(
      'search-Geometry',
    );
    expect((await list({ search: 'revision-only-phantom' })).total).toBe(0);
    expect((await list({ search: 'no-such-library-string' })).total).toBe(0);
    expect(titles(await list({ tag: '  WEEKLY   Plan ' }))).toContain(
      'search-Geometry',
    );
    expect((await list({ tag: 'Weekly' })).total).toBe(0);
    expect(
      titles(await list({ tag: 'Weekly Plan', search: 'zebras' })),
    ).toContain('search-Geometry');
    expect(titles(await list({ search: '   ' }))).toContain('search-Geometry');
    const foreign = await content('foreign-search-token', {
      schoolId: id.foreignSchool,
      academicYearId: id.foreignYear,
      termId: id.foreignTerm,
    });
    expect((await list({ search: 'foreign-search-token' })).total).toBe(0);
    await prisma.academicContent.delete({ where: { id: foreign.id } });
  });

  it('applies each target anchor downward and rejects inconsistent or unavailable scope', async () => {
    const cases: [string, Scope, Record<string, string>][] = [
      ['scope-school', Scope.SCHOOL, {}],
      ['scope-stage', Scope.STAGE, { stageId: id.s1 }],
      ['scope-grade', Scope.GRADE, { gradeId: id.g1 }],
      ['scope-section', Scope.SECTION, { sectionId: id.x1 }],
      ['scope-classroom', Scope.CLASSROOM, { classroomId: id.c1 }],
    ];
    for (const [title, type, anchor] of cases) {
      const row = await content(title);
      await target(row.id, type, anchor);
    }
    const expected = (scope: AcademicContentLibraryQuery, names: string[]) =>
      list({ ...scope, search: 'scope-' }).then((result) =>
        expect(titles(result)).toEqual(names.sort()),
      );
    await expected({ stageId: id.s1 }, ['scope-school', 'scope-stage']);
    await expected({ gradeId: id.g1 }, [
      'scope-school',
      'scope-stage',
      'scope-grade',
    ]);
    await expected({ sectionId: id.x1 }, [
      'scope-school',
      'scope-stage',
      'scope-grade',
      'scope-section',
    ]);
    await expected({ classroomId: id.c1 }, [
      'scope-school',
      'scope-stage',
      'scope-grade',
      'scope-section',
      'scope-classroom',
    ]);
    await expected({ classroomId: id.c2 }, [
      'scope-school',
      'scope-stage',
      'scope-grade',
      'scope-section',
    ]);
    await expected({ sectionId: id.x2 }, [
      'scope-school',
      'scope-stage',
      'scope-grade',
    ]);
    await expected({ gradeId: id.g2 }, ['scope-school', 'scope-stage']);
    await expected({ stageId: id.s2 }, ['scope-school']);
    await expected({ gradeId: id.g1, stageId: id.s1 }, [
      'scope-school',
      'scope-stage',
      'scope-grade',
    ]);
    await expected({ sectionId: id.x1, gradeId: id.g1 }, [
      'scope-school',
      'scope-stage',
      'scope-grade',
      'scope-section',
    ]);
    await expected({ classroomId: id.c1, sectionId: id.x1 }, [
      'scope-school',
      'scope-stage',
      'scope-grade',
      'scope-section',
      'scope-classroom',
    ]);
    for (const scope of [
      { gradeId: id.g1, stageId: id.s2 },
      { sectionId: id.x1, gradeId: id.g2 },
      { classroomId: id.c1, sectionId: id.x2 },
      { stageId: id.foreignStage },
    ])
      expect((await list({ ...scope, search: 'scope-' })).total).toBe(0);
    expect(
      (await list({ stageId: id.deletedStage, search: 'scope-' })).total,
    ).toBe(0);
    for (const scope of [
      { gradeId: id.deletedGrade },
      { sectionId: id.deletedSection },
      { classroomId: id.deletedClassroom },
    ])
      expect((await list({ ...scope, search: 'scope-' })).total).toBe(0);
  });

  it('requires live same-year/term Grade allocations for subject-qualified targets', async () => {
    const broad = await content('subject-broad');
    await target(broad.id, Scope.SCHOOL, { subjectId: id.math });
    for (const scope of [
      { gradeId: id.g1 },
      { sectionId: id.x1 },
      { classroomId: id.c1 },
      { stageId: id.s1 },
    ])
      expect(titles(await list({ ...scope, search: 'subject-broad' }))).toEqual(
        ['subject-broad'],
      );
    for (const scope of [{ gradeId: id.g2 }, { stageId: id.s2 }])
      expect((await list({ ...scope, search: 'subject-broad' })).total).toBe(0);
    expect(
      titles(await list({ subjectId: id.math, search: 'subject-broad' })),
    ).toEqual(['subject-broad']);
    expect(
      (await list({ subjectId: id.science, search: 'subject-broad' })).total,
    ).toBe(0);
    for (const subject of ['zero', 'deleted', 'wrongYear', 'wrongTerm']) {
      const row = await content(`subject-invalid-${subject}`);
      await target(row.id, Scope.SCHOOL, { subjectId: id[subject] });
      expect((await list({ gradeId: id.g1, search: row.title })).total).toBe(0);
      expect(
        (await list({ subjectId: id[subject], search: row.title })).total,
      ).toBe(0);
    }
    for (const [name, kind, anchor] of [
      ['stage', Scope.STAGE, { stageId: id.s2 }],
      ['grade', Scope.GRADE, { gradeId: id.g2 }],
      ['section', Scope.SECTION, { sectionId: id.x3 }],
      ['classroom', Scope.CLASSROOM, { classroomId: id.c4 }],
    ] as const) {
      const row = await content(`subject-own-invalid-${name}`);
      await target(row.id, kind, { ...anchor, subjectId: id.math });
      expect(
        (await list({ subjectId: id.math, search: row.title })).total,
      ).toBe(0);
    }
    for (const [name, kind, anchor] of [
      ['stage', Scope.STAGE, { stageId: id.s1 }],
      ['grade', Scope.GRADE, { gradeId: id.g1 }],
      ['section', Scope.SECTION, { sectionId: id.x1 }],
      ['classroom', Scope.CLASSROOM, { classroomId: id.c1 }],
    ] as const) {
      const row = await content(`subject-own-valid-${name}`);
      await target(row.id, kind, { ...anchor, subjectId: id.math });
      expect(
        titles(await list({ subjectId: id.math, search: row.title })),
      ).toEqual([row.title]);
    }
  });

  it('correlates scope, subject and teacher to one target, never the creator', async () => {
    const split = await content('correlation-split');
    await target(split.id, Scope.GRADE, { gradeId: id.g1, subjectId: id.math });
    await target(split.id, Scope.GRADE, {
      gradeId: id.g2,
      subjectId: id.science,
    });
    expect(
      (
        await list({
          search: split.title,
          gradeId: id.g1,
          subjectId: id.science,
        })
      ).total,
    ).toBe(0);
    expect(
      titles(
        await list({ search: split.title, gradeId: id.g1, subjectId: id.math }),
      ),
    ).toEqual([split.title]);
    const teacher = await content('correlation-teacher');
    await target(teacher.id, Scope.CLASSROOM, {
      classroomId: id.c1,
      subjectId: id.math,
      teacherSubjectAllocationId: id.allocation1,
    });
    await target(teacher.id, Scope.CLASSROOM, {
      classroomId: id.c2,
      subjectId: id.science,
      teacherSubjectAllocationId: id.allocation2,
    });
    expect(
      titles(
        await list({
          search: teacher.title,
          classroomId: id.c1,
          subjectId: id.math,
          teacherUserId: id.teacher1,
        }),
      ),
    ).toEqual([teacher.title]);
    for (const query of [
      { classroomId: id.c1, teacherUserId: id.teacher2 },
      { classroomId: id.c1, subjectId: id.science },
      { classroomId: id.c1, subjectId: id.science, teacherUserId: id.teacher2 },
    ])
      expect((await list({ search: teacher.title, ...query })).total).toBe(0);
    const creator = await content('correlation-creator');
    await target(creator.id, Scope.SCHOOL);
    expect(
      (await list({ search: creator.title, teacherUserId: id.manager })).total,
    ).toBe(0);
  });

  it('deduplicates parents before deterministic pagination and counts all matches', async () => {
    const rows = [];
    for (let index = 0; index < 3; index++) {
      const row = await content(`pagination-${index}`);
      rows.push(row);
      await target(row.id, Scope.SCHOOL);
      await target(row.id, Scope.STAGE, { stageId: id.s1 });
      await prisma.academicContent.update({
        where: { id: row.id },
        data: { updatedAt: date(`2030-01-0${index + 1}`) },
      });
    }
    const pages = await Promise.all(
      [1, 2, 3, 4].map((page) =>
        list({ stageId: id.s1, search: 'pagination-', page, limit: 1 }),
      ),
    );
    expect(pages.map((page) => page.total)).toEqual([3, 3, 3, 3]);
    expect(pages.map((page) => page.items.map((item) => item.id))).toEqual([
      [rows[2].id],
      [rows[1].id],
      [rows[0].id],
      [],
    ]);
    expect(
      (await list({ stageId: id.s1, search: 'pagination-', limit: 2 })).items,
    ).toHaveLength(2);
    const tied: string[] = [];
    for (let index = 0; index < 2; index++) {
      const row = await content(`tie-${index}`);
      tied.push(row.id);
      await prisma.academicContent.update({
        where: { id: row.id },
        data: { updatedAt: date('2031-01-01') },
      });
    }
    const tieOrder = (await list({ search: 'tie-' })).items.map(
      (row) => row.id,
    );
    expect(tieOrder).toEqual(tied.sort().reverse());
  });
});
