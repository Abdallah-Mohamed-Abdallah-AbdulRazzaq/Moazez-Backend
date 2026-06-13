import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationStatus, PrismaClient, SchoolStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const APPLICANT_PASSWORD = 'Applicant18CPass!';

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

describe('Applicant Portal school discovery (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let activeNorthSchoolId = '';
  let activeEastSchoolId = '';
  let activeWestSchoolId = '';
  let suspendedSchoolId = '';
  let archivedSchoolId = '';
  let deletedSchoolId = '';
  let suspendedOrganizationSchoolId = '';

  const suffix = randomUUID().split('-')[0];
  const marker = `s18c-discovery-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const activeOrganization = await createOrganization(
      `${marker}-active-org`,
      `Sprint 18C Active Org ${suffix}`,
      OrganizationStatus.ACTIVE,
    );
    const suspendedOrganization = await createOrganization(
      `${marker}-suspended-org`,
      `Sprint 18C Suspended Org ${suffix}`,
      OrganizationStatus.SUSPENDED,
    );

    activeEastSchoolId = await createSchoolWithProfile({
      organizationId: activeOrganization.id,
      slug: `${marker}-east`,
      name: `${marker} East Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} East Public`,
      shortName: `${marker} East`,
      formattedAddress: `East Road, Cairo, Egypt ${suffix}`,
      addressLine: `East Road ${suffix}`,
      city: 'Cairo',
      country: 'Egypt',
      logoUrl: `raw-storage-key/${marker}/east-logo.png`,
    });
    activeNorthSchoolId = await createSchoolWithProfile({
      organizationId: activeOrganization.id,
      slug: `${marker}-north`,
      name: `${marker} North Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} North Public`,
      shortName: `${marker} North`,
      formattedAddress: `North Road, Cairo, Egypt ${suffix}`,
      addressLine: `North Road ${suffix}`,
      city: 'Cairo',
      country: 'Egypt',
      logoUrl: `https://assets.example.test/${marker}/north-logo.png`,
    });
    activeWestSchoolId = await createSchoolWithProfile({
      organizationId: activeOrganization.id,
      slug: `${marker}-west`,
      name: `${marker} West Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} West Public`,
      shortName: `${marker} West`,
      formattedAddress: `West Road, Alexandria, Egypt ${suffix}`,
      addressLine: `West Road ${suffix}`,
      city: 'Alexandria',
      country: 'Egypt',
      logoUrl: null,
    });
    suspendedSchoolId = await createSchoolWithProfile({
      organizationId: activeOrganization.id,
      slug: `${marker}-suspended`,
      name: `${marker} Suspended Academy`,
      status: SchoolStatus.SUSPENDED,
      schoolName: `${marker} Suspended Public`,
      city: 'Cairo',
    });
    archivedSchoolId = await createSchoolWithProfile({
      organizationId: activeOrganization.id,
      slug: `${marker}-archived`,
      name: `${marker} Archived Academy`,
      status: SchoolStatus.ARCHIVED,
      schoolName: `${marker} Archived Public`,
      city: 'Cairo',
    });
    deletedSchoolId = await createSchoolWithProfile({
      organizationId: activeOrganization.id,
      slug: `${marker}-deleted`,
      name: `${marker} Deleted Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Deleted Public`,
      city: 'Cairo',
      deletedAt: new Date(),
    });
    suspendedOrganizationSchoolId = await createSchoolWithProfile({
      organizationId: suspendedOrganization.id,
      slug: `${marker}-suspended-org-school`,
      name: `${marker} Suspended Org Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Suspended Org Public`,
      city: 'Cairo',
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers public discovery and current applicant document routes while keeping deferred actions absent', async () => {
    const routes = listRegisteredRoutes();

    for (const implementedRoute of [
      'POST /api/v1/applicant-portal/accounts',
      'GET /api/v1/applicant-portal/profile',
      'GET /api/v1/applicant-portal/schools',
      'GET /api/v1/applicant-portal/schools/:schoolId',
      'GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents',
      'POST /api/v1/applicant-portal/requests',
      'GET /api/v1/applicant-portal/requests',
      'GET /api/v1/applicant-portal/requests/:requestId',
      'POST /api/v1/applicant-portal/requests/:requestId/submit',
      'POST /api/v1/applicant-portal/requests/:requestId/documents',
      'GET /api/v1/applicant-portal/requests/:requestId/documents',
      'GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
      'GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download',
      'POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replacements',
      'DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
    ]) {
      expect(routes).toContain(implementedRoute);
    }
    expect(routes).toContain(
      'GET /api/v1/admissions/applications/:applicationId/documents',
    );
    for (const reviewRoute of [
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/accept',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/reject',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/request-replacement',
    ]) {
      expect(routes).toContain(reviewRoute);
    }

    for (const deferredRoute of [
      'PATCH /api/v1/applicant-portal/requests/:requestId',
      'PATCH /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
      'POST /api/v1/applicant-portal/uploads',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-parent',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-guardian',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-student',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-enrollment',
      'POST /api/v1/applicant-portal/conversions',
      'GET /api/v1/admissions/applications/:applicationId/documents/:documentId',
      'PATCH /api/v1/admissions/applications/:applicationId/documents/:documentId',
      'POST /api/v1/admissions/applications/:applicationId/documents/reopen-collection',
    ]) {
      expect(routes).not.toContain(deferredRoute);
    }

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/schools/${activeNorthSchoolId}/admission-required-documents`,
      )
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ data: [] });
      });
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .send({ schoolId: activeNorthSchoolId })
      .expect(401);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}/submit`)
      .expect(401);
  });

  it('lists only active discoverable schools without authentication', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools`)
      .query({ search: marker, limit: 100 })
      .expect(200);

    expect(response.body.meta).toEqual({
      page: 1,
      limit: 100,
      total: 3,
      totalPages: 1,
      hasNextPage: false,
    });
    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
      activeEastSchoolId,
      activeNorthSchoolId,
      activeWestSchoolId,
    ]);
    expectNoForbiddenPublicFields(response.body);
    for (const item of response.body.data) {
      expectPublicSchoolItem(item);
    }

    expect(JSON.stringify(response.body)).not.toContain(suspendedSchoolId);
    expect(JSON.stringify(response.body)).not.toContain(archivedSchoolId);
    expect(JSON.stringify(response.body)).not.toContain(deletedSchoolId);
    expect(JSON.stringify(response.body)).not.toContain(
      suspendedOrganizationSchoolId,
    );
  });

  it('supports deterministic pagination', async () => {
    const firstPage = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools`)
      .query({ search: marker, page: 1, limit: 2 })
      .expect(200);

    expect(firstPage.body.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
    });
    expect(firstPage.body.data).toHaveLength(2);

    const secondPage = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools`)
      .query({ search: marker, page: 2, limit: 2 })
      .expect(200);

    expect(secondPage.body.meta).toEqual({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: false,
    });
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.data[0].id).toBe(activeWestSchoolId);
  });

  it('supports search and city filters over safe public display fields', async () => {
    const searchResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools`)
      .query({ search: `${marker} North Public` })
      .expect(200);

    expect(searchResponse.body.data).toHaveLength(1);
    expect(searchResponse.body.data[0]).toMatchObject({
      id: activeNorthSchoolId,
      name: `${marker} North Public`,
      city: 'Cairo',
      logoUrl: `https://assets.example.test/${marker}/north-logo.png`,
    });

    const cityResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools`)
      .query({ search: marker, city: 'cairo', limit: 100 })
      .expect(200);

    expect(
      cityResponse.body.data.map((item: { id: string }) => item.id),
    ).toEqual([activeEastSchoolId, activeNorthSchoolId]);
    expect(cityResponse.body.data[0].logoUrl).toBeNull();
    expectNoForbiddenPublicFields(cityResponse.body);
  });

  it('returns safe public detail for an active school', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools/${activeNorthSchoolId}`)
      .expect(200);

    expect(response.body).toEqual({
      id: activeNorthSchoolId,
      name: `${marker} North Public`,
      shortName: `${marker} North`,
      city: 'Cairo',
      country: 'Egypt',
      address: `North Road, Cairo, Egypt ${suffix}`,
      logoUrl: `https://assets.example.test/${marker}/north-logo.png`,
    });
    expectNoForbiddenPublicFields(response.body);
  });

  it('returns 404 for inactive, deleted, suspended-organization, and nonexistent schools', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools/not-a-uuid`)
      .expect(400);

    for (const schoolId of [
      suspendedSchoolId,
      archivedSchoolId,
      deletedSchoolId,
      suspendedOrganizationSchoolId,
      randomUUID(),
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/applicant-portal/schools/${schoolId}`)
        .expect(404);
    }
  });

  it('keeps Sprint 18B applicant account and profile routes working', async () => {
    const email = `${marker}-applicant@example.test`;
    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: 'Sprint 18C Applicant',
        email,
        password: APPLICANT_PASSWORD,
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      })
      .expect(201);

    createdUserIds.push(createResponse.body.userId);
    createdProfileIds.push(createResponse.body.applicantId);

    const loginResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: APPLICANT_PASSWORD })
      .expect(200);

    const profileResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/profile`)
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200);

    expect(profileResponse.body).toMatchObject({
      applicantId: createResponse.body.applicantId,
      userId: createResponse.body.userId,
      fullName: 'Sprint 18C Applicant',
      userType: 'applicant',
    });
  });

  async function createOrganization(
    slug: string,
    name: string,
    status: OrganizationStatus,
  ): Promise<{ id: string }> {
    const organization = await prisma.organization.create({
      data: { slug, name, status },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization;
  }

  async function createSchoolWithProfile(input: {
    organizationId: string;
    slug: string;
    name: string;
    status: SchoolStatus;
    schoolName: string;
    shortName?: string | null;
    formattedAddress?: string | null;
    addressLine?: string | null;
    city?: string | null;
    country?: string | null;
    logoUrl?: string | null;
    deletedAt?: Date | null;
  }): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: input.organizationId,
        slug: input.slug,
        name: input.name,
        status: input.status,
        deletedAt: input.deletedAt ?? null,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        schoolName: input.schoolName,
        shortName: input.shortName ?? null,
        formattedAddress: input.formattedAddress ?? null,
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        logoUrl: input.logoUrl ?? null,
      },
    });

    return school.id;
  }

  function expectPublicSchoolItem(item: Record<string, unknown>): void {
    expect(Object.keys(item).sort()).toEqual(
      [
        'address',
        'city',
        'country',
        'id',
        'logoUrl',
        'name',
        'shortName',
      ].sort(),
    );
    expect(typeof item.id).toBe('string');
    expect(typeof item.name).toBe('string');
  }

  function expectNoForbiddenPublicFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'organizationId',
      'schoolId',
      'status',
      'deletedAt',
      'createdAt',
      'updatedAt',
      'entitlement',
      'featureControl',
      'featureControls',
      'billing',
      'subscription',
      'plan',
      'quota',
      'staff',
      'studentCount',
      'applicantCount',
      'raw-storage-key',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function listRegisteredRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes.sort();
  }

  function collectRoutes(layers: ExpressLayer[], routes: string[]): void {
    for (const layer of layers) {
      if (layer.route?.path && layer.route.methods) {
        const paths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        const methods = Object.entries(layer.route.methods)
          .filter(([, enabled]) => enabled)
          .map(([method]) => method.toUpperCase());

        for (const path of paths) {
          for (const method of methods) {
            routes.push(`${method} ${normalizeRoutePath(path)}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }

  function normalizeRoutePath(path: string): string {
    return `/${path}`.replace(/\/{2,}/g, '/');
  }

  async function cleanupData(): Promise<void> {
    if (!prisma) return;

    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { resourceId: { in: createdProfileIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.applicantProfile.deleteMany({
      where: { id: { in: createdProfileIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.schoolProfile.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
