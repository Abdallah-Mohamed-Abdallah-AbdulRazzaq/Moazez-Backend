import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';

const TEST_PASSWORD = 'RegistrationSecurity123!';
const TEST_SUFFIX = `school-registration-security-${Date.now()}`;

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

describe('School registration wizard tenancy and access (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let demoPlacement: PlacementFixture;
  let tenantBPlacement: PlacementFixture;
  const createdUserIds = new Set<string>();
  const createdMembershipIds = new Set<string>();
  const createdRoleIds = new Set<string>();
  const createdOrganizationIds = new Set<string>();
  const createdSchoolIds = new Set<string>();
  const createdAcademicYearIds = new Set<string>();
  const createdStageIds = new Set<string>();
  const createdGradeIds = new Set<string>();
  const createdSectionIds = new Set<string>();
  const createdClassroomIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

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

    demoPlacement = await createPlacement({
      schoolId: demoSchoolId,
      label: `${TEST_SUFFIX}-demo`,
    });
    const tenantB = await createTenantB();
    tenantBPlacement = await createPlacement({
      schoolId: tenantB.schoolId,
      label: `${TEST_SUFFIX}-tenant-b`,
    });

    await createActor({
      email: `${TEST_SUFFIX}-limited@moazez.local`,
      userType: UserType.SCHOOL_USER,
      roleKey: `${TEST_SUFFIX}-limited-role`,
      roleName: 'Registration Limited',
      withMembership: true,
    });
    await createActor({
      email: `${TEST_SUFFIX}-applicant@moazez.local`,
      userType: UserType.APPLICANT,
      withMembership: false,
    });
    await createActor({
      email: `${TEST_SUFFIX}-parent@moazez.local`,
      userType: UserType.PARENT,
      roleKey: 'parent',
      withMembership: true,
    });
    await createActor({
      email: `${TEST_SUFFIX}-student@moazez.local`,
      userType: UserType.STUDENT,
      roleKey: 'student',
      withMembership: true,
    });
  });

  afterAll(async () => {
    const userIds = [...createdUserIds];

    if (prisma) {
      if (userIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { actorId: { in: userIds } },
        });
        await prisma.session.deleteMany({
          where: { userId: { in: userIds } },
        });
      }
      if (createdMembershipIds.size > 0) {
        await prisma.membership.deleteMany({
          where: { id: { in: [...createdMembershipIds] } },
        });
      }
      if (userIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
      if (createdRoleIds.size > 0) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: { in: [...createdRoleIds] } },
        });
        await prisma.role.deleteMany({
          where: { id: { in: [...createdRoleIds] } },
        });
      }
      if (createdClassroomIds.size > 0) {
        await prisma.classroom.deleteMany({
          where: { id: { in: [...createdClassroomIds] } },
        });
      }
      if (createdSectionIds.size > 0) {
        await prisma.section.deleteMany({
          where: { id: { in: [...createdSectionIds] } },
        });
      }
      if (createdGradeIds.size > 0) {
        await prisma.grade.deleteMany({
          where: { id: { in: [...createdGradeIds] } },
        });
      }
      if (createdStageIds.size > 0) {
        await prisma.stage.deleteMany({
          where: { id: { in: [...createdStageIds] } },
        });
      }
      if (createdAcademicYearIds.size > 0) {
        await prisma.academicYear.deleteMany({
          where: { id: { in: [...createdAcademicYearIds] } },
        });
      }
      if (createdSchoolIds.size > 0) {
        await prisma.school.deleteMany({
          where: { id: { in: [...createdSchoolIds] } },
        });
      }
      if (createdOrganizationIds.size > 0) {
        await prisma.organization.deleteMany({
          where: { id: { in: [...createdOrganizationIds] } },
        });
      }
    }

    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  async function login(
    email: string,
    password = TEST_PASSWORD,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return response.body.accessToken;
  }

  async function createTenantB(): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${TEST_SUFFIX}-org-b`,
        name: 'School Registration Security Org B',
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.add(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `${TEST_SUFFIX}-school-b`,
        name: 'School Registration Security School B',
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.add(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createActor(params: {
    email: string;
    userType: UserType;
    roleKey?: string;
    roleName?: string;
    withMembership: boolean;
  }): Promise<void> {
    const passwordHash = await argon2.hash(TEST_PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Registration',
        lastName: params.userType,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      select: { id: true },
    });
    createdUserIds.add(user.id);

    if (!params.withMembership) {
      return;
    }

    const role = params.roleKey?.startsWith(TEST_SUFFIX)
      ? await prisma.role.create({
          data: {
            schoolId: demoSchoolId,
            key: params.roleKey,
            name: params.roleName ?? params.roleKey,
            isSystem: false,
          },
          select: { id: true },
        })
      : await prisma.role.findFirstOrThrow({
          where: {
            key: params.roleKey,
            schoolId: null,
            isSystem: true,
            deletedAt: null,
          },
          select: { id: true },
        });

    if (params.roleKey?.startsWith(TEST_SUFFIX)) {
      createdRoleIds.add(role.id);
    }

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: role.id,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdMembershipIds.add(membership.id);
  }

  async function createPlacement(params: {
    schoolId: string;
    label: string;
  }): Promise<PlacementFixture> {
    const suffix = randomUUID().split('-')[0];

    const existingAcademicYear = await prisma.academicYear.findFirst({
      where: {
        schoolId: params.schoolId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const academicYear =
      existingAcademicYear ??
      (await prisma.academicYear.create({
        data: {
          schoolId: params.schoolId,
          nameAr: `${params.label}-${suffix}-year-ar`,
          nameEn: `${params.label}-${suffix}-year`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: true,
        },
        select: { id: true },
      }));

    if (!existingAcademicYear) {
      createdAcademicYearIds.add(academicYear.id);
    }

    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${params.label}-${suffix}-stage-ar`,
        nameEn: `${params.label}-${suffix}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${params.label}-${suffix}-grade-ar`,
        nameEn: `${params.label}-${suffix}-grade`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    createdGradeIds.add(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${params.label}-${suffix}-section-ar`,
        nameEn: `${params.label}-${suffix}-section`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    createdSectionIds.add(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        nameAr: `${params.label}-${suffix}-classroom-ar`,
        nameEn: `${params.label}-${suffix}-classroom`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    createdClassroomIds.add(classroom.id);

    return {
      academicYearId: academicYear.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
    };
  }

  function validPayload(placement = demoPlacement): Record<string, unknown> {
    return {
      student: {
        full_name_en: 'Security Registration Student',
        dateOfBirth: '2016-02-14',
      },
      guardians: [
        {
          profile: {
            full_name: 'Security Registration Guardian',
            relation: 'Mother',
            phone_primary: '+201009998877',
          },
        },
      ],
      enrollment: {
        academicYearId: placement.academicYearId,
        gradeId: placement.gradeId,
        sectionId: placement.sectionId,
        classroomId: placement.classroomId,
        enrollmentDate: '2026-09-01',
      },
    };
  }

  it('rejects unauthenticated registration requests', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/registrations`)
      .send(validPayload())
      .expect(401);

    expect(response.body?.error?.code).toBe('auth.token.invalid');
  });

  it('rejects same-school users without all required manage permissions', async () => {
    const token = await login(`${TEST_SUFFIX}-limited@moazez.local`);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/registrations`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload())
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it.each([
    ['applicant', `${TEST_SUFFIX}-applicant@moazez.local`],
    ['parent', `${TEST_SUFFIX}-parent@moazez.local`],
    ['student', `${TEST_SUFFIX}-student@moazez.local`],
  ])('rejects %s actors from school registration', async (_label, email) => {
    const token = await login(email);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/registrations`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload())
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('rejects cross-school placement context', async () => {
    const token = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/registrations`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload(tenantBPlacement))
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });
});

interface PlacementFixture {
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  classroomId: string;
}
