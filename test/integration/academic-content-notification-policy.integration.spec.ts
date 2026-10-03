import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Prisma, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  GetAcademicContentNotificationPolicyUseCase,
  UpdateAcademicContentNotificationPolicyUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-notification-policy.use-cases';
import { effectiveAcademicContentNotificationPolicy } from '../../src/modules/academics/academic-content/domain/academic-content-notification.policy';
import { AcademicContentNotificationPolicyRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-notification-policy.repository';

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
describeDatabase('ACC-8A PostgreSQL School notification policy', () => {
  jest.setTimeout(120_000);
  const options = {
    datasources: {
      db: {
        url: databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
      },
    },
  };
  const prisma = new PrismaService(options);
  const second = new PrismaService(options);
  const repository = new AcademicContentNotificationPolicyRepository(prisma);
  const get = new GetAcademicContentNotificationPolicyUseCase(repository);
  const update = new UpdateAcademicContentNotificationPolicyUseCase(repository);
  const ids: Record<string, string> = {};
  const tag = randomUUID();
  const view = ['academics.academic_content.view'];
  const settings = ['academics.academic_content.settings.manage'];
  const action = 'academics.academic_content.notification_policy.update';
  const defaults = effectiveAcademicContentNotificationPolicy();
  const input = (schoolId: string) => ({
    schoolId,
    organizationId: ids.org,
    actorId: ids.user,
  });
  function asSchool<T>(
    school: string,
    permissions: string[],
    work: () => Promise<T>,
  ) {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: ids.user, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId: ids[school],
        organizationId: ids.org,
        roleId: randomUUID(),
        permissions,
      });
      return Promise.resolve().then(work);
    });
  }
  beforeAll(async () => {
    await Promise.all([prisma.$connect(), second.$connect()]);
    ids.org = (
      await prisma.organization.create({
        data: { name: `ACC8A ${tag}`, slug: `acc8a-${tag}` },
      })
    ).id;
    ids.user = (
      await prisma.user.create({
        data: {
          email: `acc8a-${tag}@example.test`,
          firstName: 'ACC',
          lastName: 'Policy',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    for (const label of ['A', 'B', 'C', 'D'])
      ids[label] = (
        await prisma.school.create({
          data: {
            organizationId: ids.org,
            name: `ACC8A ${label}`,
            slug: `acc8a-${label.toLowerCase()}-${tag}`,
          },
        })
      ).id;
  });
  afterAll(async () => {
    const schoolIds = ['A', 'B', 'C', 'D']
      .map((label) => ids[label])
      .filter(Boolean);
    if (schoolIds.length) {
      await prisma.academicContentNotificationPolicy.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
    }
    if (ids.user) await prisma.user.delete({ where: { id: ids.user } });
    if (ids.org) await prisma.organization.delete({ where: { id: ids.org } });
    await Promise.all([prisma.$disconnect(), second.$disconnect()]);
  });

  it('resolves absent defaults, merges partial changes, keeps configured offsets and audits committed changes only', async () => {
    expect(await asSchool('A', view, () => get.execute())).toEqual(defaults);
    expect(
      await asSchool('A', settings, () =>
        update.execute({ notificationsEnabled: true }),
      ),
    ).toEqual(defaults);
    expect(
      await prisma.academicContentNotificationPolicy.count({
        where: { schoolId: ids.A },
      }),
    ).toBe(0);
    const first = await asSchool('A', settings, () =>
      update.execute({
        notificationsEnabled: false,
        onlineSessionRemindersEnabled: true,
        onlineSessionReminderOffsetsMinutes: [1440, 5, 60],
      }),
    );
    expect(first).toEqual({
      ...defaults,
      notificationsEnabled: false,
      onlineSessionRemindersEnabled: true,
      onlineSessionReminderOffsetsMinutes: [5, 60, 1440],
    });
    const after = await asSchool('A', settings, () =>
      update.execute({
        studentNotificationsEnabled: false,
        onlineSessionRemindersEnabled: false,
      }),
    );
    expect(after).toEqual({
      ...first,
      studentNotificationsEnabled: false,
      onlineSessionRemindersEnabled: false,
    });
    expect(
      await asSchool('A', settings, () =>
        update.execute({ onlineSessionReminderOffsetsMinutes: [60, 1440, 5] }),
      ),
    ).toEqual(after);
    expect(await asSchool('B', view, () => get.execute())).toEqual(defaults);
    const audits = await prisma.auditLog.findMany({
      where: { schoolId: ids.A, action },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({
      actorId: ids.user,
      organizationId: ids.org,
      schoolId: ids.A,
      outcome: 'SUCCESS',
      resourceType: 'academic_content_notification_policy',
      before: defaults,
      after: first,
    });
    expect(audits[1]).toMatchObject({ before: first, after });
    expect(Object.keys(after)).toHaveLength(12);
    expect(
      await prisma.academicContentNotificationPolicy.count({
        where: { schoolId: ids.A },
      }),
    ).toBe(1);
    expect(
      await prisma.academicContentNotificationPolicy.count({
        where: { schoolId: ids.B },
      }),
    ).toBe(0);
    const foreignPolicy =
      await prisma.academicContentNotificationPolicy.findUniqueOrThrow({
        where: { schoolId: ids.A },
      });
    expect(
      await asSchool('B', view, () =>
        (
          prisma.scoped as unknown as PrismaService
        ).academicContentNotificationPolicy.findUnique({
          where: { id: foreignPolicy.id },
        }),
      ),
    ).toBeNull();
    expect(
      await asSchool('B', settings, () =>
        (
          prisma.scoped as unknown as PrismaService
        ).academicContentNotificationPolicy.updateMany({
          where: { id: foreignPolicy.id },
          data: { notificationsEnabled: true },
        }),
      ),
    ).toEqual({ count: 0 });
    expect(await repository.findPolicy(ids.A)).toEqual(after);
    await expect(
      asSchool('A', settings, () =>
        update.execute({ notificationsEnabled: true, schoolId: ids.B } as {
          notificationsEnabled: boolean;
        }),
      ),
    ).rejects.toThrow();
    await expect(
      asSchool('A', view, () => update.execute({ notificationsEnabled: true })),
    ).rejects.toThrow();
    await expect(
      asSchool('A', settings, () => get.execute()),
    ).rejects.toThrow();
  });

  it('rolls absent creation and existing update back on audit failure', async () => {
    const schoolId = ids.B;
    await expect(
      repository.updatePolicy({
        ...input(schoolId),
        organizationId: randomUUID(),
        patch: { notificationsEnabled: false },
      }),
    ).rejects.toThrow();
    expect(await repository.findPolicy(schoolId)).toBeNull();
    await repository.updatePolicy({
      ...input(schoolId),
      patch: { notificationsEnabled: false },
    });
    const before =
      await prisma.academicContentNotificationPolicy.findUniqueOrThrow({
        where: { schoolId },
      });
    await expect(
      repository.updatePolicy({
        ...input(schoolId),
        organizationId: randomUUID(),
        patch: { notificationsEnabled: true },
      }),
    ).rejects.toThrow();
    expect(
      await prisma.academicContentNotificationPolicy.findUniqueOrThrow({
        where: { schoolId },
      }),
    ).toEqual(before);
    expect(await prisma.auditLog.count({ where: { schoolId, action } })).toBe(
      1,
    );
  });

  it('serializes two real connections on absent and existing rows, merging and suppressing raced no-ops', async () => {
    for (const existing of [false, true]) {
      const schoolId = existing ? ids.D : ids.C;
      if (existing)
        await repository.updatePolicy({
          ...input(schoolId),
          patch: { notificationsEnabled: false },
        });
      const beforeAudits = await prisma.auditLog.count({
        where: { schoolId, action },
      });
      let reads = 0;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const raceClient = (client: PrismaService) =>
        client.$extends({
          query: {
            academicContentNotificationPolicy: {
              async findUnique({ args, query }) {
                const result = await query(args);
                reads++;
                if (reads === 2) release();
                if (reads <= 2) await barrier;
                return result;
              },
            },
          },
        });
      const left = new AcademicContentNotificationPolicyRepository(
        raceClient(prisma) as unknown as PrismaService,
      );
      const right = new AcademicContentNotificationPolicyRepository(
        raceClient(second) as unknown as PrismaService,
      );
      const patch = existing
        ? { guardianNotificationsEnabled: false }
        : { notificationsEnabled: false };
      const otherPatch = existing
        ? patch
        : { studentNotificationsEnabled: false };
      await Promise.all([
        left.updatePolicy({ ...input(schoolId), patch }),
        right.updatePolicy({ ...input(schoolId), patch: otherPatch }),
      ]);
      expect(reads).toBeGreaterThanOrEqual(3); // Genuine serialization/unique race retried through the production repository.
      expect(
        await prisma.academicContentNotificationPolicy.count({
          where: { schoolId },
        }),
      ).toBe(1);
      expect(await repository.findPolicy(schoolId)).toMatchObject(
        existing
          ? { notificationsEnabled: false, guardianNotificationsEnabled: false }
          : { notificationsEnabled: false, studentNotificationsEnabled: false },
      );
      expect(await prisma.auditLog.count({ where: { schoolId, action } })).toBe(
        beforeAudits + (existing ? 1 : 2),
      );
      expect(await repository.findPolicy(ids.A)).toMatchObject({
        onlineSessionReminderOffsetsMinutes: [5, 60, 1440],
      });
    }
  });

  it('protects enum vocabulary, policy uniqueness/FK, array type/default/nullability and CHECKs in PostgreSQL', async () => {
    const enums = await prisma.$queryRaw<
      { name: string; label: string }[]
    >`SELECT t.typname AS name, e.enumlabel AS label FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname IN ('communication_notification_source_module','communication_notification_type','communication_notification_preference_category')`;
    for (const [name, label] of [
      ['communication_notification_source_module', 'ACADEMICS'],
      ['communication_notification_source_module', 'ANNOUNCEMENTS'],
      ['communication_notification_preference_category', 'ACADEMIC_CONTENT'],
      ...[
        'ACADEMIC_CONTENT_PUBLISHED',
        'ACADEMIC_CONTENT_UPDATED',
        'ACADEMIC_CONTENT_CANCELLED',
        'ONLINE_SESSION_REMINDER',
      ].map((type) => ['communication_notification_type', type]),
    ])
      expect(enums).toContainEqual({ name, label });
    const columns = await prisma.$queryRaw<
      {
        is_nullable: string;
        data_type: string;
        udt_name: string;
        column_default: string;
      }[]
    >`SELECT is_nullable,data_type,udt_name,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='academic_content_notification_policies' AND column_name='online_session_reminder_offsets_minutes'`;
    expect(columns).toEqual([
      {
        is_nullable: 'NO',
        data_type: 'ARRAY',
        udt_name: '_int4',
        column_default: 'ARRAY[]::integer[]',
      },
    ]);
    const constraints = await prisma.$queryRaw<
      { conname: string; definition: string }[]
    >`SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='academic_content_notification_policies'::regclass`;
    for (const name of [
      'acc_notification_policy_offsets_cardinality_check',
      'acc_notification_policy_offsets_bounds_check',
      'academic_content_notification_policies_school_id_fkey',
    ])
      expect(constraints.some((row) => row.conname === name)).toBe(true);
    const inventory = readFileSync(
      'docs/database/migration-custom-sql-inventory.md',
      'utf8',
    );
    for (const name of [
      'acc_notification_policy_offsets_cardinality_check',
      'acc_notification_policy_offsets_bounds_check',
    ])
      expect(inventory).toContain(name);
    const fk = constraints.find((row) =>
      row.conname.endsWith('school_id_fkey'),
    )!;
    expect(fk.definition).toContain('ON DELETE RESTRICT');
    await expect(
      prisma.academicContentNotificationPolicy.create({
        data: { schoolId: ids.A },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.academicContentNotificationPolicy.create({
        data: { schoolId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    // Direct DML proves database integrity independently of DTO/domain validation.
    for (const offsets of [
      Prisma.sql`NULL`,
      Prisma.sql`ARRAY[NULL]::integer[]`,
      Prisma.sql`ARRAY[4]`,
      Prisma.sql`ARRAY[10081]`,
      Prisma.sql`ARRAY[5,6,7,8,9,10]`,
    ])
      await expect(
        prisma.$executeRaw`UPDATE academic_content_notification_policies SET online_session_reminder_offsets_minutes=${offsets} WHERE school_id=${ids.B}::uuid`,
      ).rejects.toThrow();
    await prisma.$executeRaw`UPDATE academic_content_notification_policies SET online_session_reminder_offsets_minutes=ARRAY[5,6,7,8,10080] WHERE school_id=${ids.B}::uuid`;
    expect(
      (await repository.findPolicy(ids.B))?.onlineSessionReminderOffsetsMinutes,
    ).toEqual([5, 6, 7, 8, 10080]);
    await prisma.$executeRaw`UPDATE academic_content_notification_policies SET online_session_reminder_offsets_minutes=DEFAULT WHERE school_id=${ids.B}::uuid`;
    expect(
      (await repository.findPolicy(ids.B))?.onlineSessionReminderOffsetsMinutes,
    ).toEqual([]);
  });
});
