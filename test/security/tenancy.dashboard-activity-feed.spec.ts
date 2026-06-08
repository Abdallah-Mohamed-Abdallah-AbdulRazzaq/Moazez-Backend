import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuditOutcome, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { ListDashboardActivityFeedUseCase } from '../../src/modules/dashboard/application/list-dashboard-activity-feed.use-case';
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { ListDashboardActivityFeedQueryDto } from '../../src/modules/dashboard/dto/dashboard-activity-feed.dto';
import { DashboardActivityFeedRepository } from '../../src/modules/dashboard/infrastructure/dashboard-activity-feed.repository';

jest.setTimeout(60000);

describe('Dashboard activity feed tenancy/security contracts', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `s16c-security-${suffix}`;

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
        name: `Sprint 16C Security Org ${suffix}`,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-a`,
          name: `Sprint 16C Security School A ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-b`,
          name: `Sprint 16C Security School B ${suffix}`,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;

    await prisma.auditLog.createMany({
      data: [
        {
          organizationId,
          schoolId: schoolAId,
          userType: UserType.SERVICE_ACCOUNT,
          module: 'homework',
          action: 'homework.submission.review',
          resourceType: 'homework_submission',
          resourceId: `${marker}-school-a-homework`,
          outcome: AuditOutcome.SUCCESS,
          createdAt: new Date('2026-06-01T09:00:00.000Z'),
        },
        {
          organizationId,
          schoolId: schoolBId,
          userType: UserType.SERVICE_ACCOUNT,
          module: 'homework',
          action: 'homework.submission.review',
          resourceType: 'homework_submission',
          resourceId: `${marker}-school-b-homework`,
          outcome: AuditOutcome.SUCCESS,
          createdAt: new Date('2026-06-01T10:00:00.000Z'),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;

    await prisma.auditLog.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.organization.deleteMany({
      where: { id: organizationId },
    });
    await prisma.$disconnect();
  });

  it('requires dashboard.activity_feed.view on the activity feed route', () => {
    expect(readPermissions('listActivityFeed')).toEqual([
      'dashboard.activity_feed.view',
    ]);
    expect(controllerMethods(DashboardController)).toEqual([
      'getSummary',
      'listAlerts',
      'listActivityFeed',
    ]);
  });

  it('keeps teacher, student, and parent seeds out of activity feed permission', () => {
    const permissionsSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/01-permissions.seed.ts'),
      'utf8',
    );
    const rolesSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/02-system-roles.seed.ts'),
      'utf8',
    );

    expect(permissionsSeed).toContain("'dashboard.activity_feed.view'");
    expect(rolesSeed).toContain('const ALL = PERMISSION_CODES;');
    expect(rolesSeed).toContain('const SCHOOL_LEVEL = NON_PLATFORM;');
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.activity_feed.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.activity_feed.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.activity_feed.view',
    );
  });

  it('keeps school A from seeing school B activity and hides tenant ids', async () => {
    const repository = new DashboardActivityFeedRepository(prisma);
    const useCase = new ListDashboardActivityFeedUseCase(repository);

    const response = await withSchoolScope(schoolAId, () =>
      useCase.execute(query({ source: 'homework' })),
    );

    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      source: 'homework',
      eventType: 'homework.submission.review',
      subject: {
        id: `${marker}-school-a-homework`,
      },
    });
    expect(JSON.stringify(response)).not.toContain(
      `${marker}-school-b-homework`,
    );
    expectNoTenantIds(response);
  });

  it('keeps activity and alerts lifecycle methods absent', () => {
    expect(controllerMethods(DashboardController)).not.toEqual(
      expect.arrayContaining([
        'markActivityRead',
        'dismissActivity',
        'pinActivity',
        'unpinActivity',
        'acknowledgeAlert',
        'dismissAlert',
        'markAlertRead',
      ]),
    );
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
        permissions: ['dashboard.activity_feed.view'],
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

function query(
  overrides: Partial<ListDashboardActivityFeedQueryDto>,
): ListDashboardActivityFeedQueryDto {
  return Object.assign(new ListDashboardActivityFeedQueryDto(), overrides);
}

function expectNoTenantIds(body: unknown): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('schoolId');
  expect(serialized).not.toContain('organizationId');
}
