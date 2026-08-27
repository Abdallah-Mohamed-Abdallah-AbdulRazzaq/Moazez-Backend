import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentCredentialAudienceMode,
  StudentCredentialMode,
  UserStatus,
  UserType,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const TEST_SUFFIX = `credential-tenancy-${Date.now()}`;

jest.setTimeout(30_000);

describe('Student credential batch tenancy (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let foreignOrganizationId: string;
  let foreignSchoolId: string;
  let foreignUserId: string;
  let foreignStudentId: string;
  let foreignBatchId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const actor = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    const organization = await prisma.organization.create({
      data: {
        slug: `credential-tenancy-org-${TEST_SUFFIX}`,
        name: `Credential Tenancy ${TEST_SUFFIX}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    foreignOrganizationId = organization.id;
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `credential-tenancy-school-${TEST_SUFFIX}`,
        name: `Credential Tenancy ${TEST_SUFFIX}`,
        status: SchoolStatus.ACTIVE,
      },
    });
    foreignSchoolId = school.id;
    const role = await prisma.role.create({
      data: {
        schoolId: school.id,
        key: 'student',
        name: 'Student',
        isSystem: false,
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `${TEST_SUFFIX}@example.test`,
        firstName: 'Foreign',
        lastName: 'Student',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
      },
    });
    foreignUserId = user.id;
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        schoolId: school.id,
        roleId: role.id,
        userType: UserType.STUDENT,
        status: MembershipStatus.ACTIVE,
      },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        organizationId: organization.id,
        userId: user.id,
        firstName: 'Foreign',
        lastName: 'Student',
      },
    });
    foreignStudentId = student.id;
    const batch = await prisma.studentCredentialBatch.create({
      data: {
        schoolId: school.id,
        organizationId: organization.id,
        audienceMode: StudentCredentialAudienceMode.SELECTED_STUDENTS,
        credentialMode: StudentCredentialMode.UNIQUE_GENERATED,
        createdById: actor.id,
      },
    });
    foreignBatchId = batch.id;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//u, ''));
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
    if (prisma) {
      await prisma.studentCredentialBatch.deleteMany({
        where: { id: foreignBatchId },
      });
      await prisma.student.deleteMany({ where: { id: foreignStudentId } });
      await prisma.membership.deleteMany({ where: { userId: foreignUserId } });
      await prisma.role.deleteMany({ where: { schoolId: foreignSchoolId } });
      await prisma.user.deleteMany({ where: { id: foreignUserId } });
      await prisma.school.deleteMany({ where: { id: foreignSchoolId } });
      await prisma.organization.deleteMany({
        where: { id: foreignOrganizationId },
      });
    }
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('requires authentication for all credential batch APIs', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches/preview`)
      .send({ audienceMode: 'missing_password' })
      .expect(401);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches`)
      .send({
        audienceMode: 'missing_password',
        credentialMode: 'unique_generated',
      })
      .expect(401);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/credential-batches/${foreignBatchId}`,
      )
      .expect(401);
  });

  it('aggregates a foreign selected target without leaking it and returns not found for a foreign batch', async () => {
    const token = await login();
    const preview = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/credential-batches/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        audienceMode: 'selected_students',
        studentIds: [foreignStudentId],
      })
      .expect(200);
    expect(preview.body).toEqual({
      totalMatched: 1,
      eligible: 0,
      skipped: 1,
      skippedReasons: { inaccessible_or_not_found: 1 },
      sample: [],
    });
    expect(JSON.stringify(preview.body)).not.toContain(foreignUserId);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/credential-batches/${foreignBatchId}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }
});
