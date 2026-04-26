import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceMode,
  AttendanceScopeType,
  DailyComputationStrategy,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserType,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';

const TENANT_B_ORG_SLUG = 'attendance-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'attendance-tenancy-school-b';

jest.setTimeout(30000);

describe('Attendance policies tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let tenantBSchoolId: string;
  let demoYearId: string;
  let demoTermId: string;
  let demoPolicyId: string;
  let tenantBYearId: string;
  let tenantBTermId: string;
  let tenantBPolicyId: string;

  const testSuffix = `attendance-security-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;

    const schoolAdminRole = await prisma.role.findFirst({
      where: { key: 'school_admin', schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!schoolAdminRole) {
      throw new Error(
        'school_admin system role not found - run `npm run seed` first.',
      );
    }

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo admin not found - run `npm run seed` first.');
    }

    await prisma.membership.updateMany({
      where: {
        userId: demoAdmin.id,
        schoolId: demoSchoolId,
        deletedAt: null,
      },
      data: {
        roleId: schoolAdminRole.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
      },
    });

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Attendance Tenancy Org B',
        status: OrganizationStatus.ACTIVE,
      },
    });

    const schoolB = await prisma.school.upsert({
      where: {
        organizationId_slug: {
          organizationId: orgB.id,
          slug: TENANT_B_SCHOOL_SLUG,
        },
      },
      update: { status: SchoolStatus.ACTIVE },
      create: {
        organizationId: orgB.id,
        slug: TENANT_B_SCHOOL_SLUG,
        name: 'Attendance Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;

    const demoYear = await prisma.academicYear.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${testSuffix}-year-a-ar`,
        nameEn: `${testSuffix}-year-a`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    demoYearId = demoYear.id;

    const demoTerm = await prisma.term.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        nameAr: `${testSuffix}-term-a-ar`,
        nameEn: `${testSuffix}-term-a`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    demoTermId = demoTerm.id;

    const tenantBYear = await prisma.academicYear.create({
      data: {
        schoolId: tenantBSchoolId,
        nameAr: `${testSuffix}-year-b-ar`,
        nameEn: `${testSuffix}-year-b`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    tenantBYearId = tenantBYear.id;

    const tenantBTerm = await prisma.term.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        nameAr: `${testSuffix}-term-b-ar`,
        nameEn: `${testSuffix}-term-b`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    tenantBTermId = tenantBTerm.id;

    const demoPolicy = await prisma.attendancePolicy.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        scopeType: AttendanceScopeType.SCHOOL,
        scopeKey: 'school',
        nameAr: `${testSuffix}-policy-a-ar`,
        nameEn: `${testSuffix}-policy-a`,
        mode: AttendanceMode.DAILY,
        dailyComputationStrategy: DailyComputationStrategy.MANUAL,
      },
      select: { id: true },
    });
    demoPolicyId = demoPolicy.id;

    const tenantBPolicy = await prisma.attendancePolicy.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        scopeType: AttendanceScopeType.SCHOOL,
        scopeKey: 'school',
        nameAr: `${testSuffix}-policy-b-ar`,
        nameEn: `${testSuffix}-policy-b`,
        mode: AttendanceMode.DAILY,
        dailyComputationStrategy: DailyComputationStrategy.MANUAL,
      },
      select: { id: true },
    });
    tenantBPolicyId = tenantBPolicy.id;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      await prisma.attendancePolicy.deleteMany({
        where: { id: { in: [demoPolicyId, tenantBPolicyId].filter(Boolean) } },
      });
      await prisma.term.deleteMany({
        where: { id: { in: [demoTermId, tenantBTermId].filter(Boolean) } },
      });
      await prisma.academicYear.deleteMany({
        where: { id: { in: [demoYearId, tenantBYearId].filter(Boolean) } },
      });
      await prisma.school.deleteMany({ where: { id: tenantBSchoolId } });
      await prisma.organization.deleteMany({
        where: { slug: TENANT_B_ORG_SLUG },
      });
      await prisma.$disconnect();
    }
  });

  async function login(): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  it('lists only policies from the active school scope', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoPolicyId);
    expect(ids).not.toContain(tenantBPolicyId);
  });

  it('returns 404 when school A resolves effective policy for school B context', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/policies/effective`)
      .query({
        yearId: tenantBYearId,
        termId: tenantBTermId,
        scopeType: AttendanceScopeType.SCHOOL,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A updates a school B attendance policy', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/attendance/policies/${tenantBPolicyId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A deletes a school B attendance policy', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/attendance/policies/${tenantBPolicyId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });
});
