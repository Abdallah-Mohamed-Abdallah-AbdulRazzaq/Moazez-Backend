import { randomUUID } from 'node:crypto';
import {
  AcademicContentApprovalStatus,
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentType,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  GetAcademicContentWorkflowPolicyUseCase,
  UpdateAcademicContentWorkflowPolicyUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-workflow-policy.use-cases';
import { AcademicContentWorkflowPolicyRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-workflow-policy.repository';

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('ACC-6A PostgreSQL workflow foundation', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService({
    datasources: {
      db: {
        url: databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
      },
    },
  });
  const repository = new AcademicContentWorkflowPolicyRepository(prisma);
  const getPolicy = new GetAcademicContentWorkflowPolicyUseCase(repository);
  const updatePolicy = new UpdateAcademicContentWorkflowPolicyUseCase(
    repository,
  );
  const ids: Record<string, string> = {};
  const tag = randomUUID().slice(0, 8);

  function asActor<T>(
    school: 'A' | 'B',
    permissions: string[],
    action: () => Promise<T>,
    userType = UserType.SCHOOL_USER,
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: ids.user, userType });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId: ids[`school${school}`],
        organizationId: ids.organization,
        roleId: randomUUID(),
        permissions,
      });
      return Promise.resolve().then(action);
    });
  }

  async function content(school: 'A' | 'B') {
    return prisma.academicContent.create({
      data: {
        schoolId: ids[`school${school}`],
        academicYearId: ids[`year${school}`],
        termId: ids[`term${school}`],
        type: AcademicContentType.TEACHER_PREPARATION,
        audience: AcademicContentAudienceType.INTERNAL_STAFF,
        title: `Approval ${randomUUID()}`,
        status: AcademicContentStatus.DRAFT,
        createdByUserId: ids.user,
      },
    });
  }

  async function revision(parent: Awaited<ReturnType<typeof content>>) {
    return prisma.academicContentRevision.create({
      data: {
        schoolId: parent.schoolId,
        academicContentId: parent.id,
        revisionNumber: 1,
        snapshotContractVersion: 2,
        academicYearId: parent.academicYearId,
        termId: parent.termId,
        type: parent.type,
        audience: parent.audience,
        title: parent.title,
        sourceStatus: parent.status,
        capturedByUserId: ids.user,
      },
    });
  }

  function approval(
    parent: Awaited<ReturnType<typeof content>>,
    snapshot: Awaited<ReturnType<typeof revision>>,
    overrides: Partial<Prisma.AcademicContentApprovalUncheckedCreateInput> = {},
  ) {
    return prisma.academicContentApproval.create({
      data: {
        schoolId: parent.schoolId,
        academicContentId: parent.id,
        revisionId: snapshot.id,
        roundNumber: 1,
        status: AcademicContentApprovalStatus.PENDING,
        submittedByUserId: ids.user,
        ...overrides,
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    ids.organization = (
      await prisma.organization.create({
        data: { name: `ACC6A ${tag}`, slug: `acc6a-${tag}` },
      })
    ).id;
    ids.user = (
      await prisma.user.create({
        data: {
          email: `acc6a-${tag}@example.test`,
          firstName: 'ACC',
          lastName: 'Reviewer',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    for (const school of ['A', 'B'] as const) {
      ids[`school${school}`] = (
        await prisma.school.create({
          data: {
            organizationId: ids.organization,
            name: `ACC6A ${school} ${tag}`,
            slug: `acc6a-${school.toLowerCase()}-${tag}`,
          },
        })
      ).id;
      ids[`year${school}`] = (
        await prisma.academicYear.create({
          data: {
            schoolId: ids[`school${school}`],
            nameAr: `سنة ${school} ${tag}`,
            nameEn: `Year ${school} ${tag}`,
            startDate: new Date('2030-01-01'),
            endDate: new Date('2030-12-31'),
          },
        })
      ).id;
      ids[`term${school}`] = (
        await prisma.term.create({
          data: {
            schoolId: ids[`school${school}`],
            academicYearId: ids[`year${school}`],
            nameAr: `فصل ${school} ${tag}`,
            nameEn: `Term ${school} ${tag}`,
            startDate: new Date('2030-01-01'),
            endDate: new Date('2030-06-30'),
          },
        })
      ).id;
    }
  });

  afterAll(async () => {
    if (ids.schoolA) {
      await prisma.academicContentApproval.deleteMany({
        where: { schoolId: { in: [ids.schoolA, ids.schoolB] } },
      });
      await prisma.academicContentWorkflowPolicy.deleteMany({
        where: { schoolId: { in: [ids.schoolA, ids.schoolB] } },
      });
      await prisma.auditLog.deleteMany({
        where: { schoolId: { in: [ids.schoolA, ids.schoolB] } },
      });
      await prisma.academicContentRevision.deleteMany({
        where: { schoolId: { in: [ids.schoolA, ids.schoolB] } },
      });
      await prisma.academicContent.deleteMany({
        where: { schoolId: { in: [ids.schoolA, ids.schoolB] } },
      });
      await prisma.term.deleteMany({
        where: { schoolId: { in: [ids.schoolA, ids.schoolB] } },
      });
      await prisma.academicYear.deleteMany({
        where: { schoolId: { in: [ids.schoolA, ids.schoolB] } },
      });
      await prisma.school.deleteMany({
        where: { id: { in: [ids.schoolA, ids.schoolB] } },
      });
      await prisma.user.delete({ where: { id: ids.user } });
      await prisma.organization.delete({ where: { id: ids.organization } });
    }
    await prisma.$disconnect();
  });

  it('keeps absent defaults read-only and audits exactly once per effective change', async () => {
    const view = ['academics.academic_content.view'];
    const settings = ['academics.academic_content.settings.manage'];
    expect(await asActor('A', view, () => getPolicy.execute())).toEqual({
      preparationApprovalRequired: false,
    });
    expect(
      await prisma.academicContentWorkflowPolicy.count({
        where: { schoolId: ids.schoolA },
      }),
    ).toBe(0);
    await expect(
      asActor('A', view, () =>
        updatePolicy.execute({ preparationApprovalRequired: true }),
      ),
    ).rejects.toThrow();
    await expect(
      asActor('A', ['academics.academic_content.manage'], () =>
        updatePolicy.execute({ preparationApprovalRequired: true }),
      ),
    ).rejects.toThrow();
    await expect(
      asActor('A', settings, () => getPolicy.execute()),
    ).rejects.toThrow();
    await expect(
      asActor('A', settings, () => updatePolicy.execute({})),
    ).rejects.toThrow();
    await expect(
      asActor('A', settings, () =>
        updatePolicy.execute({
          preparationApprovalRequired: 'true' as unknown as boolean,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      asActor('A', settings, () =>
        updatePolicy.execute({
          preparationApprovalRequired: true,
          schoolId: ids.schoolB,
        } as { preparationApprovalRequired: boolean }),
      ),
    ).rejects.toThrow();
    await expect(
      asActor(
        'A',
        [...view, ...settings],
        () => updatePolicy.execute({ preparationApprovalRequired: true }),
        UserType.TEACHER,
      ),
    ).rejects.toThrow();
    expect(
      await asActor('A', settings, () =>
        updatePolicy.execute({ preparationApprovalRequired: false }),
      ),
    ).toEqual({ preparationApprovalRequired: false });
    expect(
      await prisma.academicContentWorkflowPolicy.count({
        where: { schoolId: ids.schoolA },
      }),
    ).toBe(0);
    expect(
      await asActor('A', settings, () =>
        updatePolicy.execute({ preparationApprovalRequired: true }),
      ),
    ).toEqual({ preparationApprovalRequired: true });
    expect(
      await asActor('A', settings, () =>
        updatePolicy.execute({ preparationApprovalRequired: true }),
      ),
    ).toEqual({ preparationApprovalRequired: true });
    expect(
      await asActor('A', settings, () =>
        updatePolicy.execute({ preparationApprovalRequired: false }),
      ),
    ).toEqual({ preparationApprovalRequired: false });
    const audits = await prisma.auditLog.findMany({
      where: {
        schoolId: ids.schoolA,
        action: 'academics.academic_content.workflow_policy.update',
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits).toHaveLength(2);
    expect(audits.map(({ before, after }) => [before, after])).toEqual([
      [
        { preparationApprovalRequired: false },
        { preparationApprovalRequired: true },
      ],
      [
        { preparationApprovalRequired: true },
        { preparationApprovalRequired: false },
      ],
    ]);
    expect(
      await prisma.academicContentWorkflowPolicy.count({
        where: { schoolId: ids.schoolA },
      }),
    ).toBe(1);
    expect(await asActor('B', view, () => getPolicy.execute())).toEqual({
      preparationApprovalRequired: false,
    });
    expect(
      await prisma.academicContentWorkflowPolicy.count({
        where: { schoolId: ids.schoolB },
      }),
    ).toBe(0);
  });

  it('rolls policy creation back when the audit cannot commit', async () => {
    const schoolId = ids.schoolB;
    await expect(
      repository.updatePolicy({
        schoolId,
        organizationId: randomUUID(),
        actorId: ids.user,
        preparationApprovalRequired: true,
      }),
    ).rejects.toThrow();
    expect(
      await prisma.academicContentWorkflowPolicy.count({ where: { schoolId } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          schoolId,
          action: 'academics.academic_content.workflow_policy.update',
        },
      }),
    ).toBe(0);
  });

  it('enforces approval round, pairing, tenant, pending, and decision constraints', async () => {
    const a = await content('A');
    const aRevision = await revision(a);
    const another = await content('A');
    const anotherRevision = await revision(another);
    const b = await content('B');
    const bRevision = await revision(b);
    await expect(approval(a, aRevision, { roundNumber: 0 })).rejects.toThrow();
    await expect(
      approval(a, aRevision, { academicContentId: b.id }),
    ).rejects.toThrow();
    await expect(
      approval(a, aRevision, { revisionId: bRevision.id }),
    ).rejects.toThrow();
    await expect(approval(a, anotherRevision)).rejects.toThrow();
    await expect(
      approval(a, aRevision, { decidedByUserId: ids.user }),
    ).rejects.toThrow();
    await expect(
      approval(a, aRevision, {
        status: AcademicContentApprovalStatus.APPROVED,
      }),
    ).rejects.toThrow();
    await expect(
      approval(a, aRevision, {
        status: AcademicContentApprovalStatus.CHANGES_REQUESTED,
        decidedByUserId: ids.user,
        decidedAt: new Date(),
        decisionNote: '  ',
      }),
    ).rejects.toThrow();
    await approval(a, aRevision);
    await expect(approval(a, aRevision)).rejects.toThrow();
    await expect(
      approval(a, aRevision, {
        roundNumber: 2,
        status: AcademicContentApprovalStatus.APPROVED,
        decidedByUserId: ids.user,
        decidedAt: new Date(),
      }),
    ).rejects.toThrow();
    const nextRevision = await prisma.academicContentRevision.create({
      data: {
        schoolId: a.schoolId,
        academicContentId: a.id,
        revisionNumber: 2,
        snapshotContractVersion: 2,
        academicYearId: a.academicYearId,
        termId: a.termId,
        type: a.type,
        audience: a.audience,
        title: a.title,
        sourceStatus: a.status,
        capturedByUserId: ids.user,
      },
    });
    await expect(
      approval(a, nextRevision, {
        roundNumber: 1,
        status: AcademicContentApprovalStatus.APPROVED,
        decidedByUserId: ids.user,
        decidedAt: new Date(),
      }),
    ).rejects.toThrow();
    await expect(
      approval(a, nextRevision, { roundNumber: 2 }),
    ).rejects.toThrow();
    expect(
      await prisma.academicContentApproval.count({
        where: { academicContentId: a.id },
      }),
    ).toBe(1);
    await prisma.academicContentApproval.updateMany({
      where: {
        schoolId: a.schoolId,
        academicContentId: a.id,
        status: AcademicContentApprovalStatus.PENDING,
      },
      data: {
        status: AcademicContentApprovalStatus.CHANGES_REQUESTED,
        decidedByUserId: ids.user,
        decidedAt: new Date(),
        decisionNote: 'Revise the draft',
      },
    });
    await approval(a, nextRevision, { roundNumber: 2 });
    expect(
      await prisma.academicContentApproval.count({
        where: { academicContentId: a.id },
      }),
    ).toBe(2);
    await approval(another, anotherRevision, {
      status: AcademicContentApprovalStatus.APPROVED,
      decidedByUserId: ids.user,
      decidedAt: new Date(),
    });
    await approval(b, bRevision, {
      status: AcademicContentApprovalStatus.CHANGES_REQUESTED,
      decidedByUserId: ids.user,
      decidedAt: new Date(),
      decisionNote: 'Add a source',
    });
  });
});
