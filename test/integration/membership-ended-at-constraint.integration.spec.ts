import { randomUUID } from 'node:crypto';
import {
  MembershipStatus,
  PrismaClient,
  UserStatus,
  UserType,
} from '@prisma/client';

type ConstraintRow = {
  constraint_name: string;
  definition: string;
};

describe('Membership ended-at CHECK constraint (disposable database)', () => {
  const marker = `membership-constraint-${randomUUID().slice(0, 8)}`;
  const prisma = new PrismaClient();
  const userIds: string[] = [];
  let organizationId: string;
  let schoolId: string;
  let roleId: string;

  beforeAll(async () => {
    assertDisposableDatabase();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        name: `${marker}-organization`,
        slug: `${marker}-organization`,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const school = await prisma.school.create({
      data: {
        organizationId,
        name: `${marker}-school`,
        slug: `${marker}-school`,
      },
      select: { id: true },
    });
    schoolId = school.id;

    const role = await prisma.role.create({
      data: {
        schoolId,
        key: `${marker}-role`,
        name: 'Synthetic constraint-test role',
      },
      select: { id: true },
    });
    roleId = role.id;
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.delete({ where: { id: roleId } });
    await prisma.school.delete({ where: { id: schoolId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('keeps one corrected named constraint in the PostgreSQL catalog', async () => {
    const constraints = await prisma.$queryRaw<ConstraintRow[]>`
      SELECT
        pg_constraint.conname AS constraint_name,
        pg_get_constraintdef(pg_constraint.oid) AS definition
      FROM pg_constraint
      JOIN pg_class
        ON pg_class.oid = pg_constraint.conrelid
      JOIN pg_namespace
        ON pg_namespace.oid = pg_class.relnamespace
      WHERE pg_namespace.nspname = 'public'
        AND pg_class.relname = 'memberships'
        AND pg_constraint.conname =
          'memberships_ended_at_required_when_inactive_check'
    `;

    expect(constraints).toHaveLength(1);
    const normalizedDefinition = constraints[0].definition
      .replaceAll('::membership_status', '')
      .replace(/\s+/gu, ' ')
      .toUpperCase();

    expect(constraints[0].constraint_name).toBe(
      'memberships_ended_at_required_when_inactive_check',
    );
    expect(normalizedDefinition).toContain('ACTIVE');
    expect(normalizedDefinition).toContain('SUSPENDED');
    expect(normalizedDefinition).toContain('ENDED_AT IS NOT NULL');
  });

  it.each([
    [MembershipStatus.ACTIVE, null, true],
    [MembershipStatus.SUSPENDED, null, true],
    [MembershipStatus.INACTIVE, new Date('2026-07-20T12:00:00.000Z'), true],
    [MembershipStatus.TRANSFERRED, new Date('2026-07-20T12:00:00.000Z'), true],
    [MembershipStatus.INACTIVE, null, false],
    [MembershipStatus.TRANSFERRED, null, false],
  ])(
    'enforces %s with the requested endedAt shape',
    async (status, endedAt, accepted) => {
      const user = await createSyntheticUser(status.toLowerCase());
      const operation = prisma.membership.create({
        data: {
          userId: user.id,
          organizationId,
          schoolId,
          roleId,
          userType: UserType.SCHOOL_USER,
          status,
          endedAt,
        },
        select: { id: true },
      });

      if (accepted) {
        await expect(operation).resolves.toEqual({ id: expect.any(String) });
        return;
      }

      await expect(operation).rejects.toBeDefined();
      await expect(
        prisma.membership.count({ where: { userId: user.id } }),
      ).resolves.toBe(0);
    },
  );

  async function createSyntheticUser(label: string) {
    const nonce = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}-${nonce}@example.test`,
        firstName: 'Synthetic',
        lastName: 'Constraint',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user;
  }
});

function assertDisposableDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('Disposable DATABASE_URL is required');
  const databaseName = new URL(raw).pathname.replace(/^\//u, '');
  if (!/^moazez_1b7_closeout_[a-z0-9_]+$/u.test(databaseName)) {
    throw new Error(
      'Constraint tests require the closeout disposable database',
    );
  }
}
