import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { DashboardAlertsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-alerts.repository';

jest.setTimeout(60000);

describe('Dashboard alerts tenancy/security contracts', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `s16b-security-${suffix}`;

  let prisma: PrismaService;
  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Sprint 16B Security Org ${suffix}`,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-a`,
          name: `Sprint 16B Security School A ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-b`,
          name: `Sprint 16B Security School B ${suffix}`,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;

    await prisma.application.createMany({
      data: [
        {
          organizationId,
          schoolId: schoolAId,
          studentName: `${marker} school-a application`,
          source: AdmissionApplicationSource.WALK_IN,
          status: AdmissionApplicationStatus.SUBMITTED,
          submittedAt: new Date('2026-06-01T08:00:00.000Z'),
        },
        {
          organizationId,
          schoolId: schoolBId,
          studentName: `${marker} school-b application 1`,
          source: AdmissionApplicationSource.WALK_IN,
          status: AdmissionApplicationStatus.SUBMITTED,
          submittedAt: new Date('2026-06-01T08:00:00.000Z'),
        },
        {
          organizationId,
          schoolId: schoolBId,
          studentName: `${marker} school-b application 2`,
          source: AdmissionApplicationSource.WALK_IN,
          status: AdmissionApplicationStatus.UNDER_REVIEW,
          submittedAt: new Date('2026-06-01T08:00:00.000Z'),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;

    await prisma.application.deleteMany({
      where: { organizationId },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.organization.deleteMany({
      where: { id: organizationId },
    });
    await prisma.$disconnect();
  });

  it('registers only a read-only alerts action guarded by dashboard.alerts.view', () => {
    expect(readPermissions('listAlerts')).toEqual(['dashboard.alerts.view']);
    expect(controllerMethods(DashboardController)).toEqual([
      'getSummary',
      'listAlerts',
    ]);
    expect(controllerMethods(DashboardController)).not.toEqual(
      expect.arrayContaining([
        'acknowledgeAlert',
        'dismissAlert',
        'markAlertRead',
        'getActivityFeed',
      ]),
    );
  });

  it('adds dashboard.alerts.view to admin-like seed inheritance only', () => {
    const permissionsSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/01-permissions.seed.ts'),
      'utf8',
    );
    const rolesSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/02-system-roles.seed.ts'),
      'utf8',
    );

    expect(permissionsSeed).toContain("'dashboard.alerts.view'");
    expect(rolesSeed).toContain('const ALL = PERMISSION_CODES;');
    expect(rolesSeed).toContain('const SCHOOL_LEVEL = NON_PLATFORM;');
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.alerts.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.alerts.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.alerts.view',
    );
  });

  it('keeps school A from seeing school B alert counts', async () => {
    const repository = new DashboardAlertsRepository(prisma);
    const window = {
      now: new Date('2026-06-01T12:00:00.000Z'),
      todayStart: new Date('2026-06-01T00:00:00.000Z'),
      last30DaysStart: new Date('2026-05-02T12:00:00.000Z'),
      next7DaysEnd: new Date('2026-06-08T12:00:00.000Z'),
    };

    const schoolASignals = await withSchoolScope(schoolAId, () =>
      repository.loadAlertSignals(
        {
          actorId: 'security-user-a',
          userType: UserType.SCHOOL_USER,
          organizationId,
          schoolId: schoolAId,
          roleId: 'security-role-a',
        },
        window,
      ),
    );
    const schoolBSignals = await withSchoolScope(schoolBId, () =>
      repository.loadAlertSignals(
        {
          actorId: 'security-user-b',
          userType: UserType.SCHOOL_USER,
          organizationId,
          schoolId: schoolBId,
          roleId: 'security-role-b',
        },
        window,
      ),
    );

    expect(schoolASignals.admissions.applicationsWaitingDecision).toBe(1);
    expect(schoolBSignals.admissions.applicationsWaitingDecision).toBe(2);
  });

  async function withSchoolScope<T>(
    schoolId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: `actor-${schoolId}`, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: `membership-${schoolId}`,
        organizationId,
        schoolId,
        roleId: `role-${schoolId}`,
        permissions: ['dashboard.alerts.view'],
      });

      return fn();
    });
  }
});

function readPermissions(methodName: string): string[] | undefined {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS_METADATA,
    DashboardController.prototype[methodName],
  );
}

function controllerMethods(controller: Function): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (method) => method !== 'constructor',
  );
}

function extractArrayLiteral(source: string, arrayName: string): string {
  const match = source.match(
    new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\];`),
  );
  return match?.[1] ?? '';
}
