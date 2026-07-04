import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DismissalGateOperationalStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalCore123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(60_000);

describe('DISMISSAL-CORE-1A settings and gates (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let schoolAId: string;
  let schoolBId: string;
  let organizationAId: string;
  let organizationBId: string;
  let adminAId: string;
  let adminBId: string;
  let adminAToken: string;
  let adminBToken: string;
  let gateAId: string;
  let gateBId: string;
  let secondaryGateAId: string;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdGateIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const schoolAdminRole = await prisma.role.findFirst({
      where: { key: 'school_admin', schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!schoolAdminRole) {
      throw new Error('school_admin system role not found - run `npm run seed`.');
    }

    const fixtureA = await createSchoolFixture('a');
    const fixtureB = await createSchoolFixture('b');
    schoolAId = fixtureA.schoolId;
    schoolBId = fixtureB.schoolId;
    organizationAId = fixtureA.organizationId;
    organizationBId = fixtureB.organizationId;

    await prisma.schoolProfile.upsert({
      where: { schoolId: schoolAId },
      update: {
        timezone: 'Africa/Cairo',
        latitude: 30.123456,
        longitude: 31.654321,
        mapPlaceLabel: 'Dismissal Core Main Entrance',
        formattedAddress: '1 Test Street, Cairo',
      },
      create: {
        schoolId: schoolAId,
        timezone: 'Africa/Cairo',
        latitude: 30.123456,
        longitude: 31.654321,
        mapPlaceLabel: 'Dismissal Core Main Entrance',
        formattedAddress: '1 Test Street, Cairo',
      },
    });

    await prisma.schoolProfile.upsert({
      where: { schoolId: schoolBId },
      update: {
        timezone: 'Europe/Berlin',
        latitude: 52.5,
        longitude: 13.4,
        mapPlaceLabel: 'Tenant B Gate',
      },
      create: {
        schoolId: schoolBId,
        timezone: 'Europe/Berlin',
        latitude: 52.5,
        longitude: 13.4,
        mapPlaceLabel: 'Tenant B Gate',
      },
    });

    const adminA = await createUserWithMembership({
      email: `dismissal-core-${TEST_RUN_ID}-admin-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
    });
    adminAId = adminA.userId;
    const adminB = await createUserWithMembership({
      email: `dismissal-core-${TEST_RUN_ID}-admin-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
    });
    adminBId = adminB.userId;

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

    adminAToken = await login(adminA.email);
    adminBToken = await login(adminB.email);
  });

  afterAll(async () => {
    if (prisma) {
      const schoolIds = [schoolAId, schoolBId].filter(Boolean);
      await prisma.dismissalSettings.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.dismissalGate.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.schoolProfile.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: createdUserIds } },
            { schoolId: { in: schoolIds } },
          ],
          module: 'dismissal',
        },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  it('returns computed default settings from SchoolProfile without persisting', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(response.body).toEqual({
      enabled: false,
      timezone: 'Africa/Cairo',
      schoolZone: {
        latitude: 30.123456,
        longitude: 31.654321,
        label: 'Dismissal Core Main Entrance',
        source: 'school_profile',
      },
      allowedRadiusMeters: 150,
      requestWindow: { startLocal: null, endLocal: null },
      thresholds: { delayMinutes: 15, urgentMinutes: 30 },
      policies: {
        requirePickupCode: true,
        allowDelegatePickup: true,
        allowParentCancelBeforeCalled: true,
      },
      defaultGate: null,
      configured: false,
      updatedAt: null,
    });
    assertNoDismissalLeak(response.body);

    await expect(
      prisma.dismissalSettings.count({ where: { schoolId: schoolAId } }),
    ).resolves.toBe(0);
  });

  it('creates gates in the current school and rejects duplicate same-school codes', async () => {
    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/gates`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        code: 'PRIMARY',
        name: 'Primary Gate',
        campus: 'North Campus',
        status: 'open',
        sortOrder: 1,
        latitude: 30.123,
        longitude: 31.456,
        waitingZones: ['Zone A', ' ', 'Zone B'],
        notes: 'Visible operations note',
      })
      .expect(201);

    gateAId = created.body.id;
    createdGateIds.push(gateAId);
    expect(created.body).toMatchObject({
      id: expect.any(String),
      code: 'PRIMARY',
      name: 'Primary Gate',
      campus: 'North Campus',
      status: 'open',
      isActive: true,
      sortOrder: 1,
      location: { latitude: 30.123, longitude: 31.456 },
      waitingZones: ['Zone A', 'Zone B'],
      notes: 'Visible operations note',
    });
    assertNoDismissalLeak(created.body);

    const duplicate = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/gates`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ code: 'PRIMARY', name: 'Duplicate Gate' })
      .expect(409);

    expect(duplicate.body?.error?.code).toBe('dismissal.gate.duplicate_code');
  });

  it('allows the same gate code in a different school', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/gates`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ code: 'PRIMARY', name: 'Tenant B Primary Gate' })
      .expect(201);

    gateBId = response.body.id;
    createdGateIds.push(gateBId);
    expect(response.body.code).toBe('PRIMARY');
    assertNoDismissalLeak(response.body);
  });

  it('upserts current-school settings and rejects invalid settings inputs', async () => {
    const invalidRadius = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ allowedRadiusMeters: 5 })
      .expect(422);
    expect(invalidRadius.body?.error?.code).toBe(
      'dismissal.settings.invalid_radius',
    );

    const invalidCoordinates = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ schoolLatitude: 91 })
      .expect(422);
    expect(invalidCoordinates.body?.error?.code).toBe(
      'dismissal.settings.invalid_coordinates',
    );

    const invalidThresholds = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ delayThresholdMinutes: 30, urgentThresholdMinutes: 15 })
      .expect(422);
    expect(invalidThresholds.body?.error?.code).toBe(
      'dismissal.settings.invalid_thresholds',
    );

    const crossSchoolGate = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ defaultGateId: gateBId })
      .expect(404);
    expect(crossSchoolGate.body?.error?.code).toBe(
      'dismissal.settings.default_gate_not_found',
    );

    const updated = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        enabled: true,
        timezone: 'Africa/Cairo',
        schoolLatitude: 30.222222,
        schoolLongitude: 31.333333,
        allowedRadiusMeters: 250,
        requestWindowStartLocal: '12:30',
        requestWindowEndLocal: '15:45',
        delayThresholdMinutes: 10,
        urgentThresholdMinutes: 20,
        requirePickupCode: true,
        allowDelegatePickup: false,
        allowParentCancelBeforeCalled: false,
        defaultGateId: gateAId,
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      enabled: true,
      timezone: 'Africa/Cairo',
      schoolZone: {
        latitude: 30.222222,
        longitude: 31.333333,
        label: 'Dismissal Core Main Entrance',
        source: 'settings',
      },
      allowedRadiusMeters: 250,
      requestWindow: { startLocal: '12:30', endLocal: '15:45' },
      thresholds: { delayMinutes: 10, urgentMinutes: 20 },
      policies: {
        requirePickupCode: true,
        allowDelegatePickup: false,
        allowParentCancelBeforeCalled: false,
      },
      defaultGate: {
        id: gateAId,
        code: 'PRIMARY',
        name: 'Primary Gate',
        status: 'open',
      },
      configured: true,
      updatedAt: expect.any(String),
    });
    assertNoDismissalLeak(updated.body);

    const persisted = await prisma.dismissalSettings.findUniqueOrThrow({
      where: { schoolId: schoolAId },
      select: { schoolId: true, updatedById: true, defaultGateId: true },
    });
    expect(persisted).toEqual({
      schoolId: schoolAId,
      updatedById: adminAId,
      defaultGateId: gateAId,
    });
  });

  it('lists only current-school non-deleted gates and supports q/status/active filters', async () => {
    const secondary = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/gates`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        code: 'SECONDARY',
        name: 'Secondary Gate',
        campus: 'South Campus',
        status: 'busy',
        isActive: false,
        sortOrder: 2,
      })
      .expect(201);
    secondaryGateAId = secondary.body.id;
    createdGateIds.push(secondaryGateAId);

    const deletedGate = await prisma.dismissalGate.create({
      data: {
        schoolId: schoolAId,
        code: `DELETED-${TEST_RUN_ID}`,
        name: 'Deleted Gate',
        deletedAt: new Date(),
      },
      select: { id: true },
    });
    createdGateIds.push(deletedGate.id);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/gates`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    const serialized = JSON.stringify(list.body);
    expect(serialized).toContain(gateAId);
    expect(serialized).toContain(secondaryGateAId);
    expect(serialized).not.toContain(gateBId);
    expect(serialized).not.toContain(deletedGate.id);
    expect(list.body.summary).toMatchObject({
      totalCount: 2,
      openCount: 1,
      busyCount: 1,
      closedCount: 0,
      maintenanceCount: 0,
      activeCount: 1,
    });
    assertNoDismissalLeak(list.body);

    const filtered = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/gates`)
      .query({ q: 'secondary', status: 'BUSY', active: 'false' })
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0]).toMatchObject({
      id: secondaryGateAId,
      status: 'busy',
      isActive: false,
    });
    expect(filtered.body.summary).toMatchObject({
      totalCount: 1,
      busyCount: 1,
      activeCount: 0,
    });
    assertNoDismissalLeak(filtered.body);
  });

  it('returns safe 404 for cross-school gates and updates status/waiting zones safely', async () => {
    const crossSchool = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/gates/${gateBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);
    expect(crossSchool.body?.error?.code).toBe('dismissal.gate.not_found');

    const updated = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/gates/${gateAId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        status: 'maintenance',
        waitingZones: ['Zone C', '', 'Zone D'],
        isActive: false,
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: gateAId,
      status: 'maintenance',
      isActive: false,
      waitingZones: ['Zone C', 'Zone D'],
    });
    assertNoDismissalLeak(updated.body);

    const stored = await prisma.dismissalGate.findUniqueOrThrow({
      where: { id: gateAId },
      select: { schoolId: true, status: true, waitingZones: true },
    });
    expect(stored).toEqual({
      schoolId: schoolAId,
      status: DismissalGateOperationalStatus.MAINTENANCE,
      waitingZones: ['Zone C', 'Zone D'],
    });
  });

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-core-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal Core Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-core-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal Core School ${label}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createUserWithMembership(params: {
    email: string;
    schoolId: string;
    organizationId: string;
    roleId: string;
    userType: UserType;
  }): Promise<{ userId: string; email: string }> {
    const passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Dismissal',
        lastName: 'Admin',
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return { userId: user.id, email: params.email };
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }
});

function assertNoDismissalLeak(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'updatedById',
    'deletedAt',
    'actorId',
    'membershipId',
    'roleId',
    'organizationId',
    'updated_by_id',
    'school_id',
    'deleted_at',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
