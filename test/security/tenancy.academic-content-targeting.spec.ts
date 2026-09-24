import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType as Audience,
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
import { AcademicContentAudienceResolver } from '../../src/modules/academics/academic-content/application/academic-content-audience.resolver';
import { AcademicContentContextValidator } from '../../src/modules/academics/academic-content/application/academic-content-context-validator';
import { AcademicContentTargetValidator } from '../../src/modules/academics/academic-content/application/academic-content-target-validator';
import { ReplaceAcademicContentTargetsUseCase } from '../../src/modules/academics/academic-content/application/replace-academic-content-targets.use-case';
import { ClearTeacherAllocationsBySubjectUseCase } from '../../src/modules/academics/teacher-allocation/application/clear-teacher-allocations-by-subject.use-case';
import { DeleteTeacherAllocationUseCase } from '../../src/modules/academics/teacher-allocation/application/delete-teacher-allocation.use-case';
import { TeacherAllocationRepository } from '../../src/modules/academics/teacher-allocation/infrastructure/teacher-allocation.repository';
import { AcademicContentAudienceRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-audience.repository';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';
import { AcademicContentTargetRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-target.repository';
import { AcademicContentValidationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-validation.repository';

describe('ACC-2 database tenancy, replacement, and audience', () => {
  let prisma: PrismaService;
  let replace: ReplaceAcademicContentTargetsUseCase;
  let resolve: AcademicContentAudienceResolver;
  const ids: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const validation = new AcademicContentValidationRepository(prisma);
    replace = new ReplaceAcademicContentTargetsUseCase(
      new AcademicContentRepository(prisma),
      new AcademicContentContextValidator(validation),
      new AcademicContentTargetValidator(validation),
      new AcademicContentTargetRepository(prisma),
    );
    resolve = new AcademicContentAudienceResolver(
      new AcademicContentAudienceRepository(prisma),
    );
    ids.org = (
      await prisma.organization.create({
        data: { name: `ACC2 ${suffix}`, slug: `acc2-${suffix}` },
      })
    ).id;
    ids.school = (
      await prisma.school.create({
        data: {
          organizationId: ids.org,
          name: `ACC2 ${suffix}`,
          slug: `acc2-${suffix}`,
        },
      })
    ).id;
    ids.admin = (
      await prisma.user.create({
        data: {
          email: `acc2-admin-${suffix}@example.test`,
          firstName: 'ACC',
          lastName: 'Admin',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    ids.orgAdmin = (
      await prisma.user.create({
        data: {
          email: `acc2-org-admin-${suffix}@example.test`,
          firstName: 'ACC',
          lastName: 'Org Admin',
          userType: UserType.ORGANIZATION_USER,
        },
      })
    ).id;
    ids.teacherA = (
      await prisma.user.create({
        data: {
          email: `acc2-teacher-a-${suffix}@example.test`,
          firstName: 'ACC',
          lastName: 'Teacher',
          userType: UserType.TEACHER,
        },
      })
    ).id;
    ids.teacherB = (
      await prisma.user.create({
        data: {
          email: `acc2-teacher-b-${suffix}@example.test`,
          firstName: 'ACC',
          lastName: 'Teacher',
          userType: UserType.TEACHER,
        },
      })
    ).id;
    ids.year = (
      await prisma.academicYear.create({
        data: {
          schoolId: ids.school,
          nameAr: `سنة ${suffix}`,
          nameEn: `Year ${suffix}`,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-06-30'),
        },
      })
    ).id;
    ids.term = (
      await prisma.term.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          nameAr: `فصل ${suffix}`,
          nameEn: `Term ${suffix}`,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-12-31'),
        },
      })
    ).id;
    ids.stage = (
      await prisma.stage.create({
        data: {
          schoolId: ids.school,
          nameAr: `مرحلة ${suffix}`,
          nameEn: `Stage ${suffix}`,
        },
      })
    ).id;
    ids.grade = (
      await prisma.grade.create({
        data: {
          schoolId: ids.school,
          stageId: ids.stage,
          nameAr: `صف ${suffix}`,
          nameEn: `Grade ${suffix}`,
        },
      })
    ).id;
    ids.section = (
      await prisma.section.create({
        data: {
          schoolId: ids.school,
          gradeId: ids.grade,
          nameAr: `شعبة ${suffix}`,
          nameEn: `Section ${suffix}`,
        },
      })
    ).id;
    ids.classroom = (
      await prisma.classroom.create({
        data: {
          schoolId: ids.school,
          sectionId: ids.section,
          nameAr: `فصل ${suffix}`,
          nameEn: `Classroom ${suffix}`,
        },
      })
    ).id;
    ids.subject = (
      await prisma.subject.create({
        data: {
          schoolId: ids.school,
          nameAr: `مادة ${suffix}`,
          nameEn: `Subject ${suffix}`,
        },
      })
    ).id;
    ids.subjectAllocation = (
      await prisma.subjectAllocation.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          gradeId: ids.grade,
          subjectId: ids.subject,
          weeklyHours: 4,
        },
      })
    ).id;
    ids.allocationA = (
      await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: ids.school,
          teacherUserId: ids.teacherA,
          termId: ids.term,
          classroomId: ids.classroom,
          subjectId: ids.subject,
        },
      })
    ).id;
    ids.allocationB = (
      await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: ids.school,
          teacherUserId: ids.teacherB,
          termId: ids.term,
          classroomId: ids.classroom,
          subjectId: ids.subject,
        },
      })
    ).id;
    ids.content = (
      await prisma.academicContent.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          type: ContentType.GENERAL_RESOURCE,
          audience: Audience.STUDENTS_AND_GUARDIANS,
          createdByUserId: ids.admin,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (ids.school) {
      await prisma.studentGuardian.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.enrollment.deleteMany({ where: { schoolId: ids.school } });
      await prisma.guardian.deleteMany({ where: { schoolId: ids.school } });
      await prisma.student.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicContentTarget.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.academicContent.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.subjectAllocation.deleteMany({
        where: { schoolId: ids.school },
      });
      await prisma.subject.deleteMany({ where: { schoolId: ids.school } });
      await prisma.classroom.deleteMany({ where: { schoolId: ids.school } });
      await prisma.section.deleteMany({ where: { schoolId: ids.school } });
      await prisma.grade.deleteMany({ where: { schoolId: ids.school } });
      await prisma.stage.deleteMany({ where: { schoolId: ids.school } });
      await prisma.term.deleteMany({ where: { schoolId: ids.school } });
      await prisma.academicYear.deleteMany({ where: { schoolId: ids.school } });
      await prisma.school.delete({ where: { id: ids.school } });
    }
    for (const id of [
      ids.teacherA,
      ids.teacherB,
      ids.admin,
      ids.orgAdmin,
    ].filter(Boolean))
      await prisma.user.delete({ where: { id } });
    if (ids.org) await prisma.organization.delete({ where: { id: ids.org } });
    await prisma.$disconnect();
  });

  function asActor<T>(
    actorId: string,
    userType: UserType,
    permissions: string[],
    operation: () => Promise<T>,
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: actorId, userType });
      setActiveMembership({
        membershipId: randomUUID(),
        organizationId: ids.org,
        schoolId: ids.school,
        roleId: randomUUID(),
        permissions,
      });
      return operation();
    });
  }

  it('enforces DB type/audience, shape, teacher-allocation shape, and fingerprint uniqueness', async () => {
    await expect(
      prisma.academicContent.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          type: ContentType.TEACHER_PREPARATION,
          audience: Audience.STUDENTS,
          createdByUserId: ids.admin,
        },
      }),
    ).rejects.toThrow();
    const base = {
      schoolId: ids.school,
      academicContentId: ids.content,
      createdByUserId: ids.admin,
    };
    await expect(
      prisma.academicContentTarget.create({
        data: {
          ...base,
          scopeType: Scope.SCHOOL,
          gradeId: ids.grade,
          identityFingerprint: 'a'.repeat(64),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentTarget.create({
        data: {
          ...base,
          scopeType: Scope.GRADE,
          gradeId: ids.grade,
          subjectId: ids.subject,
          teacherSubjectAllocationId: ids.allocationA,
          identityFingerprint: 'b'.repeat(64),
        },
      }),
    ).rejects.toThrow();
    const first = await prisma.academicContentTarget.create({
      data: {
        ...base,
        scopeType: Scope.SCHOOL,
        identityFingerprint: 'c'.repeat(64),
      },
    });
    await expect(
      prisma.academicContentTarget.create({
        data: {
          ...base,
          scopeType: Scope.SCHOOL,
          identityFingerprint: first.identityFingerprint,
        },
      }),
    ).rejects.toThrow();
    await prisma.academicContentTarget.delete({ where: { id: first.id } });
  });

  it('requires management permission and rejects another teacher allocation without deleting the old set', async () => {
    await expect(
      asActor(ids.admin, UserType.SCHOOL_USER, [], () =>
        replace.execute(ids.content, [{ scopeType: Scope.SCHOOL }]),
      ),
    ).rejects.toThrow();
    const old = await asActor(
      ids.admin,
      UserType.SCHOOL_USER,
      ['academics.academic_content.manage'],
      () =>
        replace.execute(ids.content, [
          { scopeType: Scope.GRADE, gradeId: ids.grade },
        ]),
    );
    expect(old).toHaveLength(1);
    await expect(
      asActor(ids.teacherA, UserType.TEACHER, [], () =>
        replace.execute(ids.content, [
          {
            scopeType: Scope.CLASSROOM,
            classroomId: ids.classroom,
            subjectId: ids.subject,
            teacherSubjectAllocationId: ids.allocationB,
          },
        ]),
      ),
    ).rejects.toThrow();
    expect(
      await prisma.academicContentTarget.findMany({
        where: { schoolId: ids.school, academicContentId: ids.content },
      }),
    ).toMatchObject([{ identityFingerprint: old[0].identityFingerprint }]);
    const owned = await asActor(ids.teacherA, UserType.TEACHER, [], () =>
      replace.execute(ids.content, [
        {
          scopeType: Scope.CLASSROOM,
          classroomId: ids.classroom,
          subjectId: ids.subject,
          teacherSubjectAllocationId: ids.allocationA,
        },
      ]),
    );
    expect(owned).toHaveLength(1);
  });

  it('allows only school and organization managers to replace targets', async () => {
    for (const [actorId, userType] of [
      [ids.admin, UserType.SCHOOL_USER],
      [ids.orgAdmin, UserType.ORGANIZATION_USER],
    ] as const) {
      await expect(
        asActor(actorId, userType, ['academics.academic_content.manage'], () =>
          replace.execute(ids.content, [{ scopeType: Scope.SCHOOL }]),
        ),
      ).resolves.toHaveLength(1);
      await expect(
        asActor(actorId, userType, [], () =>
          replace.execute(ids.content, [{ scopeType: Scope.SCHOOL }]),
        ),
      ).rejects.toMatchObject({ code: 'auth.scope.missing', httpStatus: 403 });
    }
    for (const userType of [
      UserType.PARENT,
      UserType.STUDENT,
      UserType.DISMISSAL_STAFF,
    ]) {
      await expect(
        asActor(
          ids.admin,
          userType,
          ['academics.academic_content.manage'],
          () => replace.execute(ids.content, [{ scopeType: Scope.SCHOOL }]),
        ),
      ).rejects.toMatchObject({ code: 'auth.scope.missing', httpStatus: 403 });
    }
  });

  it('classifies FK-backed ACC targets as delete and clear conflicts before deletion', async () => {
    const repository = new TeacherAllocationRepository(prisma);
    const deleteAllocation = new DeleteTeacherAllocationUseCase(repository);
    const clearAllocations = new ClearTeacherAllocationsBySubjectUseCase(
      repository,
    );
    await prisma.term.update({
      where: { id: ids.term },
      data: { isActive: true },
    });
    try {
      await asActor(
        ids.admin,
        UserType.SCHOOL_USER,
        ['academics.academic_content.manage'],
        () =>
          replace.execute(ids.content, [
            {
              scopeType: Scope.CLASSROOM,
              classroomId: ids.classroom,
              subjectId: ids.subject,
              teacherSubjectAllocationId: ids.allocationA,
            },
          ]),
      );
      await asActor(
        ids.admin,
        UserType.SCHOOL_USER,
        ['academics.structure.manage'],
        async () => {
          const counts = await repository.countAllocationDependencies([
            ids.allocationA,
          ]);
          expect(counts.academicContentTargets).toBe(1);
          await expect(
            deleteAllocation.execute(ids.allocationA),
          ).rejects.toMatchObject({
            code: 'academics.allocation.delete_conflict',
            httpStatus: 409,
            details: { academicContentTargets: 1 },
          });
          await expect(
            clearAllocations.execute({
              termId: ids.term,
              subjectId: ids.subject,
            }),
          ).rejects.toMatchObject({
            code: 'academics.allocation.clear_conflict',
            httpStatus: 409,
            details: { academicContentTargets: 1 },
          });
        },
      );
      expect(
        await prisma.teacherSubjectAllocation.findUnique({
          where: { id: ids.allocationA },
        }),
      ).not.toBeNull();
      expect(
        await prisma.academicContentTarget.count({
          where: {
            schoolId: ids.school,
            academicContentId: ids.content,
            teacherSubjectAllocationId: ids.allocationA,
          },
        }),
      ).toBe(1);
    } finally {
      await prisma.academicContentTarget.deleteMany({
        where: { schoolId: ids.school, academicContentId: ids.content },
      });
      await prisma.term.update({
        where: { id: ids.term },
        data: { isActive: false },
      });
    }
  });

  it('rejects foreign school academic context and hierarchy without changing targets', async () => {
    const foreign: Record<string, string> = {};
    try {
      foreign.school = (
        await prisma.school.create({
          data: {
            organizationId: ids.org,
            name: `Foreign ACC2 ${suffix}`,
            slug: `acc2-foreign-${suffix}`,
          },
        })
      ).id;
      foreign.year = (
        await prisma.academicYear.create({
          data: {
            schoolId: foreign.school,
            nameAr: `سنة أجنبية ${suffix}`,
            nameEn: `Foreign year ${suffix}`,
            startDate: new Date('2026-09-01'),
            endDate: new Date('2027-06-30'),
          },
        })
      ).id;
      foreign.term = (
        await prisma.term.create({
          data: {
            schoolId: foreign.school,
            academicYearId: foreign.year,
            nameAr: `فصل أجنبي ${suffix}`,
            nameEn: `Foreign term ${suffix}`,
            startDate: new Date('2026-09-01'),
            endDate: new Date('2026-12-31'),
          },
        })
      ).id;
      foreign.stage = (
        await prisma.stage.create({
          data: {
            schoolId: foreign.school,
            nameAr: `مرحلة أجنبية ${suffix}`,
            nameEn: `Foreign stage ${suffix}`,
          },
        })
      ).id;
      foreign.grade = (
        await prisma.grade.create({
          data: {
            schoolId: foreign.school,
            stageId: foreign.stage,
            nameAr: `صف أجنبي ${suffix}`,
            nameEn: `Foreign grade ${suffix}`,
          },
        })
      ).id;
      foreign.section = (
        await prisma.section.create({
          data: {
            schoolId: foreign.school,
            gradeId: foreign.grade,
            nameAr: `شعبة أجنبية ${suffix}`,
            nameEn: `Foreign section ${suffix}`,
          },
        })
      ).id;
      foreign.classroom = (
        await prisma.classroom.create({
          data: {
            schoolId: foreign.school,
            sectionId: foreign.section,
            nameAr: `فصل أجنبي ${suffix}`,
            nameEn: `Foreign classroom ${suffix}`,
          },
        })
      ).id;
      foreign.subject = (
        await prisma.subject.create({
          data: {
            schoolId: foreign.school,
            nameAr: `مادة أجنبية ${suffix}`,
            nameEn: `Foreign subject ${suffix}`,
          },
        })
      ).id;
      foreign.allocation = (
        await prisma.teacherSubjectAllocation.create({
          data: {
            schoolId: foreign.school,
            teacherUserId: ids.teacherA,
            termId: foreign.term,
            classroomId: foreign.classroom,
            subjectId: foreign.subject,
          },
        })
      ).id;

      const contexts = new AcademicContentContextValidator(
        new AcademicContentValidationRepository(prisma),
      );
      await expect(
        contexts.validate({
          schoolId: ids.school,
          academicYearId: foreign.year,
          termId: ids.term,
        }),
      ).rejects.toThrow();
      await expect(
        contexts.validate({
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: foreign.term,
        }),
      ).rejects.toThrow();
      const otherYear = await prisma.academicYear.create({
        data: {
          schoolId: ids.school,
          nameAr: `سنة أخرى ${suffix}`,
          nameEn: `Other year ${suffix}`,
          startDate: new Date('2027-09-01'),
          endDate: new Date('2028-06-30'),
        },
      });
      const otherTerm = await prisma.term.create({
        data: {
          schoolId: ids.school,
          academicYearId: otherYear.id,
          nameAr: `فصل آخر ${suffix}`,
          nameEn: `Other term ${suffix}`,
          startDate: new Date('2027-09-01'),
          endDate: new Date('2027-12-31'),
        },
      });
      await expect(
        contexts.validate({
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: otherTerm.id,
        }),
      ).rejects.toThrow();
      await expect(
        resolve.resolve(ids.content, foreign.school),
      ).rejects.toThrow();

      const before = await prisma.academicContentTarget.findMany({
        where: { schoolId: ids.school, academicContentId: ids.content },
      });
      const foreignTargets = [
        { scopeType: Scope.STAGE, stageId: foreign.stage },
        { scopeType: Scope.GRADE, gradeId: foreign.grade },
        { scopeType: Scope.SECTION, sectionId: foreign.section },
        { scopeType: Scope.CLASSROOM, classroomId: foreign.classroom },
        {
          scopeType: Scope.GRADE,
          gradeId: ids.grade,
          subjectId: foreign.subject,
        },
        {
          scopeType: Scope.CLASSROOM,
          classroomId: ids.classroom,
          subjectId: ids.subject,
          teacherSubjectAllocationId: foreign.allocation,
        },
      ];
      for (const target of foreignTargets) {
        await expect(
          asActor(
            ids.admin,
            UserType.SCHOOL_USER,
            ['academics.academic_content.manage'],
            () => replace.execute(ids.content, [target]),
          ),
        ).rejects.toThrow();
      }
      expect(
        await prisma.academicContentTarget.findMany({
          where: { schoolId: ids.school, academicContentId: ids.content },
        }),
      ).toEqual(before);
    } finally {
      if (foreign.school) {
        await prisma.teacherSubjectAllocation.deleteMany({
          where: { schoolId: foreign.school },
        });
        await prisma.subject.deleteMany({
          where: { schoolId: foreign.school },
        });
        await prisma.classroom.deleteMany({
          where: { schoolId: foreign.school },
        });
        await prisma.section.deleteMany({
          where: { schoolId: foreign.school },
        });
        await prisma.grade.deleteMany({ where: { schoolId: foreign.school } });
        await prisma.stage.deleteMany({ where: { schoolId: foreign.school } });
        await prisma.term.deleteMany({ where: { schoolId: foreign.school } });
        await prisma.academicYear.deleteMany({
          where: { schoolId: foreign.school },
        });
        await prisma.school.delete({ where: { id: foreign.school } });
      }
    }
  });

  it('requires a taught subject with positive weekly hours in the exact context', async () => {
    const missing = await prisma.subject.create({
      data: {
        schoolId: ids.school,
        nameAr: `غير مخصص ${suffix}`,
        nameEn: `Unallocated ${suffix}`,
      },
    });
    const zero = await prisma.subject.create({
      data: {
        schoolId: ids.school,
        nameAr: `صفر ${suffix}`,
        nameEn: `Zero hours ${suffix}`,
      },
    });
    const zeroAllocation = await prisma.subjectAllocation.create({
      data: {
        schoolId: ids.school,
        academicYearId: ids.year,
        termId: ids.term,
        gradeId: ids.grade,
        subjectId: zero.id,
        weeklyHours: 0,
      },
    });
    for (const subjectId of [missing.id, zero.id]) {
      await expect(
        asActor(
          ids.admin,
          UserType.SCHOOL_USER,
          ['academics.academic_content.manage'],
          () =>
            replace.execute(ids.content, [
              { scopeType: Scope.GRADE, gradeId: ids.grade, subjectId },
            ]),
        ),
      ).rejects.toThrow();
    }
    await prisma.subjectAllocation.update({
      where: { id: zeroAllocation.id },
      data: { weeklyHours: 2, deletedAt: new Date() },
    });
    await expect(
      asActor(
        ids.admin,
        UserType.SCHOOL_USER,
        ['academics.academic_content.manage'],
        () =>
          replace.execute(ids.content, [
            { scopeType: Scope.GRADE, gradeId: ids.grade, subjectId: zero.id },
          ]),
      ),
    ).rejects.toThrow();
    await prisma.subjectAllocation.update({
      where: { id: zeroAllocation.id },
      data: { deletedAt: null },
    });
    const valid = await asActor(
      ids.admin,
      UserType.SCHOOL_USER,
      ['academics.academic_content.manage'],
      () =>
        replace.execute(ids.content, [
          { scopeType: Scope.STAGE, stageId: ids.stage, subjectId: zero.id },
        ]),
    );
    expect(valid).toHaveLength(1);
  });

  it('serializes concurrent complete replacements without union or partial state', async () => {
    await asActor(
      ids.admin,
      UserType.SCHOOL_USER,
      ['academics.academic_content.manage'],
      () => replace.execute(ids.content, []),
    );
    expect(
      await prisma.academicContentTarget.count({
        where: { schoolId: ids.school, academicContentId: ids.content },
      }),
    ).toBe(0);
    const choices = [
      [{ scopeType: Scope.GRADE, gradeId: ids.grade }],
      [{ scopeType: Scope.CLASSROOM, classroomId: ids.classroom }],
    ];
    const results = await asActor(
      ids.admin,
      UserType.SCHOOL_USER,
      ['academics.academic_content.manage'],
      () =>
        Promise.all(
          choices.map((choice) => replace.execute(ids.content, choice)),
        ),
    );
    expect(results.every((result) => result.length === 1)).toBe(true);
    const final = await prisma.academicContentTarget.findMany({
      where: { schoolId: ids.school, academicContentId: ids.content },
    });
    expect(final).toHaveLength(1);
    expect([Scope.GRADE, Scope.CLASSROOM]).toContain(final[0].scopeType);
  });

  it('resolves exact-term students and guardian business contexts without requiring app users', async () => {
    const student = await prisma.student.create({
      data: {
        schoolId: ids.school,
        organizationId: ids.org,
        firstName: 'Student',
        lastName: 'ACC',
      },
    });
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: ids.school,
        organizationId: ids.org,
        firstName: 'Guardian',
        lastName: 'ACC',
        phone: `+201${suffix}`,
        relation: 'guardian',
        canReceiveNotifications: false,
      },
    });
    await prisma.studentGuardian.create({
      data: {
        schoolId: ids.school,
        studentId: student.id,
        guardianId: guardian.id,
      },
    });
    const exact = await prisma.enrollment.create({
      data: {
        schoolId: ids.school,
        studentId: student.id,
        academicYearId: ids.year,
        termId: ids.term,
        classroomId: ids.classroom,
        enrolledAt: new Date('2026-09-01'),
      },
    });
    await prisma.enrollment.create({
      data: {
        schoolId: ids.school,
        studentId: student.id,
        academicYearId: ids.year,
        termId: null,
        classroomId: ids.classroom,
        enrolledAt: new Date('2026-09-01'),
      },
    });
    await asActor(
      ids.admin,
      UserType.SCHOOL_USER,
      ['academics.academic_content.manage'],
      () =>
        replace.execute(ids.content, [
          { scopeType: Scope.SCHOOL, subjectId: ids.subject },
        ]),
    );
    const result = await resolve.resolve(ids.content, ids.school);
    expect(result.students).toMatchObject([
      { studentId: student.id, enrollmentId: exact.id, studentUserId: null },
    ]);
    expect(result.guardians).toMatchObject([
      {
        guardianId: guardian.id,
        studentId: student.id,
        enrollmentId: exact.id,
        recipientUserId: null,
        canReceiveNotifications: false,
      },
    ]);
    expect(await resolve.resolve(ids.content, ids.school)).toEqual(result);
  });

  it('filters inactive and deleted relationships while retaining a guardian context per eligible child', async () => {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: ids.school,
        organizationId: ids.org,
        firstName: 'Shared',
        lastName: 'Guardian',
        phone: `+202${suffix}`,
        relation: 'guardian',
        canReceiveNotifications: false,
      },
    });
    const activeIds: string[] = [];
    for (const label of ['second', 'third']) {
      const student = await prisma.student.create({
        data: {
          schoolId: ids.school,
          organizationId: ids.org,
          firstName: label,
          lastName: 'ACC',
        },
      });
      await prisma.studentGuardian.create({
        data: {
          schoolId: ids.school,
          studentId: student.id,
          guardianId: guardian.id,
        },
      });
      const enrollment = await prisma.enrollment.create({
        data: {
          schoolId: ids.school,
          studentId: student.id,
          academicYearId: ids.year,
          termId: ids.term,
          classroomId: ids.classroom,
          enrolledAt: new Date('2026-09-01'),
        },
      });
      activeIds.push(enrollment.id);
    }
    const inactiveStudent = await prisma.student.create({
      data: {
        schoolId: ids.school,
        organizationId: ids.org,
        firstName: 'Inactive',
        lastName: 'ACC',
        status: 'SUSPENDED',
      },
    });
    const inactiveStudentEnrollment = await prisma.enrollment.create({
      data: {
        schoolId: ids.school,
        studentId: inactiveStudent.id,
        academicYearId: ids.year,
        termId: ids.term,
        classroomId: ids.classroom,
        enrolledAt: new Date('2026-09-01'),
      },
    });
    const inactiveEnrollment = await prisma.enrollment.create({
      data: {
        schoolId: ids.school,
        studentId: inactiveStudent.id,
        academicYearId: ids.year,
        termId: ids.term,
        classroomId: ids.classroom,
        status: 'WITHDRAWN',
        enrolledAt: new Date('2026-09-01'),
      },
    });
    const deletedEnrollment = await prisma.enrollment.create({
      data: {
        schoolId: ids.school,
        studentId: inactiveStudent.id,
        academicYearId: ids.year,
        termId: ids.term,
        classroomId: ids.classroom,
        deletedAt: new Date(),
        enrolledAt: new Date('2026-09-01'),
      },
    });
    await asActor(
      ids.admin,
      UserType.SCHOOL_USER,
      ['academics.academic_content.manage'],
      () => replace.execute(ids.content, [{ scopeType: Scope.SCHOOL }]),
    );
    const result = await resolve.resolve(ids.content, ids.school);
    expect(
      activeIds.every((id) =>
        result.students.some((row) => row.enrollmentId === id),
      ),
    ).toBe(true);
    for (const id of [
      inactiveStudentEnrollment.id,
      inactiveEnrollment.id,
      deletedEnrollment.id,
    ]) {
      expect(result.students.some((row) => row.enrollmentId === id)).toBe(
        false,
      );
    }
    const shared = result.guardians.filter(
      (row) => row.guardianId === guardian.id,
    );
    expect(shared).toHaveLength(2);
    expect(new Set(shared.map((row) => row.studentId)).size).toBe(2);
  });

  it('resolves a broad Stage+Subject only for grades where that subject is taught', async () => {
    const otherGrade = await prisma.grade.create({
      data: {
        schoolId: ids.school,
        stageId: ids.stage,
        nameAr: `صف غير مؤهل ${suffix}`,
        nameEn: `Untaught grade ${suffix}`,
      },
    });
    const otherSection = await prisma.section.create({
      data: {
        schoolId: ids.school,
        gradeId: otherGrade.id,
        nameAr: `شعبة غير مؤهلة ${suffix}`,
        nameEn: `Untaught section ${suffix}`,
      },
    });
    const otherClassroom = await prisma.classroom.create({
      data: {
        schoolId: ids.school,
        sectionId: otherSection.id,
        nameAr: `فصل غير مؤهل ${suffix}`,
        nameEn: `Untaught classroom ${suffix}`,
      },
    });
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: ids.school,
        organizationId: ids.org,
        firstName: 'Untaught',
        lastName: 'ACC',
      },
    });
    const otherEnrollment = await prisma.enrollment.create({
      data: {
        schoolId: ids.school,
        studentId: otherStudent.id,
        academicYearId: ids.year,
        termId: ids.term,
        classroomId: otherClassroom.id,
        enrolledAt: new Date('2026-09-01'),
      },
    });
    await asActor(
      ids.admin,
      UserType.SCHOOL_USER,
      ['academics.academic_content.manage'],
      () =>
        replace.execute(ids.content, [
          {
            scopeType: Scope.STAGE,
            stageId: ids.stage,
            subjectId: ids.subject,
          },
        ]),
    );
    const result = await resolve.resolve(ids.content, ids.school);
    expect(result.students.length).toBeGreaterThan(0);
    expect(
      result.students.some((row) => row.enrollmentId === otherEnrollment.id),
    ).toBe(false);
  });
});
