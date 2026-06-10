import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationStatus, PrismaClient, SchoolStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const APPLICANT_PASSWORD = 'Applicant18EPass!';

jest.setTimeout(30000);

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

describe('Applicant Portal required documents (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let activeSchoolId = '';
  let emptySchoolId = '';
  let suspendedSchoolId = '';
  let archivedSchoolId = '';
  let deletedSchoolId = '';
  let suspendedOrganizationSchoolId = '';
  let archivedOrganizationSchoolId = '';
  let deletedOrganizationSchoolId = '';

  const suffix = randomUUID().split('-')[0];
  const marker = `s18e-documents-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const activeOrganization = await createOrganization({
      slug: `${marker}-active-org`,
      name: `Sprint 18E Active Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
    });
    const suspendedOrganization = await createOrganization({
      slug: `${marker}-suspended-org`,
      name: `Sprint 18E Suspended Org ${suffix}`,
      status: OrganizationStatus.SUSPENDED,
    });
    const archivedOrganization = await createOrganization({
      slug: `${marker}-archived-org`,
      name: `Sprint 18E Archived Org ${suffix}`,
      status: OrganizationStatus.ARCHIVED,
    });
    const deletedOrganization = await createOrganization({
      slug: `${marker}-deleted-org`,
      name: `Sprint 18E Deleted Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
      deletedAt: new Date(),
    });

    activeSchoolId = await createSchoolWithProfile({
      organizationId: activeOrganization.id,
      slug: `${marker}-active`,
      name: `${marker} Active Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Active Public`,
      city: 'Cairo',
    });
    emptySchoolId = await createSchoolWithProfile({
      organizationId: activeOrganization.id,
      slug: `${marker}-empty`,
      name: `${marker} Empty Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Empty Public`,
      city: 'Cairo',
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
    archivedOrganizationSchoolId = await createSchoolWithProfile({
      organizationId: archivedOrganization.id,
      slug: `${marker}-archived-org-school`,
      name: `${marker} Archived Org Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Archived Org Public`,
      city: 'Cairo',
    });
    deletedOrganizationSchoolId = await createSchoolWithProfile({
      organizationId: deletedOrganization.id,
      slug: `${marker}-deleted-org-school`,
      name: `${marker} Deleted Org Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Deleted Org Public`,
      city: 'Cairo',
    });

    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId: activeOrganization.id,
      title: 'Transfer form',
      description: 'Signed by previous school',
      acceptedFileTypes: ['application/pdf'],
      maxFiles: 1,
      sortOrder: 20,
    });
    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId: activeOrganization.id,
      title: 'Family ID',
      description: null,
      acceptedFileTypes: ['image/jpeg', 'image/png'],
      maxFiles: 2,
      sortOrder: 10,
    });
    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId: activeOrganization.id,
      title: 'Birth certificate',
      description: 'Clear scanned copy',
      acceptedFileTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      maxFiles: 1,
      sortOrder: 10,
    });
    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId: activeOrganization.id,
      title: `${marker} Inactive Hidden`,
      isActive: false,
      sortOrder: 1,
    });
    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId: activeOrganization.id,
      title: `${marker} Deleted Hidden`,
      deletedAt: new Date(),
      sortOrder: 2,
    });
    await createRequiredDocument({
      schoolId: suspendedSchoolId,
      organizationId: activeOrganization.id,
      title: `${marker} Suspended School Hidden`,
    });
    await createRequiredDocument({
      schoolId: suspendedOrganizationSchoolId,
      organizationId: suspendedOrganization.id,
      title: `${marker} Suspended Org Hidden`,
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

  it('registers required documents and keeps later document routes absent', async () => {
    const routes = listRegisteredRoutes();

    expect(routes).toContain(
      'GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents',
    );
    expect(routes).toContain('POST /api/v1/applicant-portal/requests');
    expect(routes).toContain('GET /api/v1/applicant-portal/requests');
    expect(routes).toContain(
      'GET /api/v1/applicant-portal/requests/:requestId',
    );
    expect(routes).toContain(
      'POST /api/v1/applicant-portal/requests/:requestId/submit',
    );

    for (const deferredRoute of [
      'POST /api/v1/applicant-portal/requests/:requestId/documents',
      'GET /api/v1/applicant-portal/requests/:requestId/documents',
    ]) {
      expect(routes).not.toContain(deferredRoute);
    }

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .send({ schoolId: activeSchoolId })
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

  it('allows anonymous callers to read active required documents safely', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/schools/${activeSchoolId}/admission-required-documents`,
      )
      .expect(200);

    expect(response.body.data).toEqual([
      {
        id: expect.any(String),
        title: 'Birth certificate',
        description: 'Clear scanned copy',
        isMandatory: true,
        acceptedFileTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        maxFiles: 1,
        sortOrder: 10,
      },
      {
        id: expect.any(String),
        title: 'Family ID',
        description: null,
        isMandatory: true,
        acceptedFileTypes: ['image/jpeg', 'image/png'],
        maxFiles: 2,
        sortOrder: 10,
      },
      {
        id: expect.any(String),
        title: 'Transfer form',
        description: 'Signed by previous school',
        isMandatory: true,
        acceptedFileTypes: ['application/pdf'],
        maxFiles: 1,
        sortOrder: 20,
      },
    ]);
    expectNoForbiddenDocumentFields(response.body);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(`${marker} Inactive Hidden`);
    expect(serialized).not.toContain(`${marker} Deleted Hidden`);
  });

  it('returns an empty list for an active school with no required documents', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/schools/${emptySchoolId}/admission-required-documents`,
      )
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ data: [] });
      });
  });

  it('returns validation errors or 404 for unsafe school targets', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/schools/not-a-uuid/admission-required-documents`,
      )
      .expect(400);

    for (const schoolId of [
      suspendedSchoolId,
      archivedSchoolId,
      deletedSchoolId,
      suspendedOrganizationSchoolId,
      archivedOrganizationSchoolId,
      deletedOrganizationSchoolId,
      randomUUID(),
    ]) {
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/applicant-portal/schools/${schoolId}/admission-required-documents`,
        )
        .expect(404);
    }
  });

  it('keeps Applicant Portal account, profile, and school discovery routes working', async () => {
    const schoolsResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools`)
      .query({ search: marker, limit: 100 })
      .expect(200);

    expect(
      schoolsResponse.body.data.map((item: { id: string }) => item.id),
    ).toEqual([activeSchoolId, emptySchoolId]);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools/${activeSchoolId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: activeSchoolId,
          name: `${marker} Active Public`,
        });
      });

    const email = `${marker}-applicant@example.test`;
    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: 'Sprint 18E Applicant',
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

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/profile`)
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          applicantId: createResponse.body.applicantId,
          userId: createResponse.body.userId,
          userType: 'applicant',
        });
      });
  });

  async function createOrganization(input: {
    slug: string;
    name: string;
    status: OrganizationStatus;
    deletedAt?: Date | null;
  }): Promise<{ id: string }> {
    const organization = await prisma.organization.create({
      data: {
        slug: input.slug,
        name: input.name,
        status: input.status,
        deletedAt: input.deletedAt ?? null,
      },
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
    city: string;
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
        city: input.city,
      },
    });

    return school.id;
  }

  async function createRequiredDocument(input: {
    schoolId: string;
    organizationId: string;
    title: string;
    description?: string | null;
    isMandatory?: boolean;
    acceptedFileTypes?: string[];
    maxFiles?: number;
    sortOrder?: number;
    isActive?: boolean;
    deletedAt?: Date | null;
  }): Promise<void> {
    const document = await prisma.admissionRequiredDocument.create({
      data: {
        schoolId: input.schoolId,
        organizationId: input.organizationId,
        title: input.title,
        description: input.description ?? null,
        isMandatory: input.isMandatory ?? true,
        acceptedFileTypes: input.acceptedFileTypes ?? [],
        maxFiles: input.maxFiles ?? 1,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        deletedAt: input.deletedAt ?? null,
      },
      select: { id: true },
    });
    createdDocumentIds.push(document.id);
  }

  function expectNoForbiddenDocumentFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'gradeId',
      'isActive',
      'deletedAt',
      'createdAt',
      'updatedAt',
      'tenant',
      'featureControl',
      'featureControls',
      'entitlement',
      'billing',
      'subscription',
      'plan',
      'quota',
      'staff',
      'count',
      'storageKey',
      'objectKey',
      'bucket',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    for (const item of (body as { data: Record<string, unknown>[] }).data) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'acceptedFileTypes',
          'description',
          'id',
          'isMandatory',
          'maxFiles',
          'sortOrder',
          'title',
        ].sort(),
      );
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
    await prisma.admissionRequiredDocument.deleteMany({
      where: { id: { in: createdDocumentIds } },
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
