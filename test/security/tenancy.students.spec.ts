import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
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

const LIMITED_ROLE_KEY = 'students_security_limited_role';
const LIMITED_USER_EMAIL = 'students-viewer@security.moazez.local';
const LIMITED_USER_PASSWORD = 'StudentsViewer123!';

const TENANT_B_ORG_SLUG = 'students-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'students-tenancy-school-b';
const TENANT_B_ADMIN_EMAIL = 'admin-b@students-tenancy.moazez.local';
const TENANT_B_ADMIN_PASSWORD = 'StudentsB123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

describe('Students tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let schoolAdminRoleId: string;
  let limitedRoleId: string;
  let limitedUserId: string;

  let tenantBSchoolId: string;
  let tenantBOrganizationId: string;
  let tenantBUserId: string;

  let demoAcademicYearId: string;
  let createdDemoAcademicYearId: string | null = null;
  let demoClassroomId: string;
  let tenantBAcademicYearId: string;
  let tenantBClassroomId: string;

  let demoStudentId: string;
  let demoGuardianId: string;
  let demoEnrollmentId: string;

  let tenantBStudentId: string;
  let tenantBGuardianId: string;
  let tenantBEnrollmentId: string;

  const testSuffix = `students-security-${Date.now()}`;

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
    demoOrganizationId = demoSchool.organizationId;

    const [schoolAdminRole, recordsViewPermission, guardiansViewPermission] =
      await Promise.all([
        prisma.role.findFirst({
          where: { key: 'school_admin', schoolId: null, isSystem: true },
          select: { id: true },
        }),
        prisma.permission.findUnique({
          where: { code: 'students.records.view' },
          select: { id: true },
        }),
        prisma.permission.findUnique({
          where: { code: 'students.guardians.view' },
          select: { id: true },
        }),
      ]);

    if (!schoolAdminRole || !recordsViewPermission || !guardiansViewPermission) {
      throw new Error('Students permissions missing - run `npm run seed` first.');
    }

    schoolAdminRoleId = schoolAdminRole.id;

    const existingLimitedRole = await prisma.role.findFirst({
      where: {
        schoolId: demoSchoolId,
        key: LIMITED_ROLE_KEY,
      },
      select: { id: true },
    });

    if (existingLimitedRole) {
      limitedRoleId = existingLimitedRole.id;
      await prisma.rolePermission.deleteMany({ where: { roleId: limitedRoleId } });
    } else {
      const createdRole = await prisma.role.create({
        data: {
          schoolId: demoSchoolId,
          key: LIMITED_ROLE_KEY,
          name: 'Students Security Limited',
          description: 'Same-school user without students manage permissions',
          isSystem: false,
        },
      });
      limitedRoleId = createdRole.id;
    }

    await prisma.rolePermission.createMany({
      data: [
        {
          roleId: limitedRoleId,
          permissionId: recordsViewPermission.id,
        },
        {
          roleId: limitedRoleId,
          permissionId: guardiansViewPermission.id,
        },
      ],
      skipDuplicates: true,
    });

    const limitedPasswordHash = await argon2.hash(
      LIMITED_USER_PASSWORD,
      ARGON2_OPTIONS,
    );

    const limitedUser = await prisma.user.upsert({
      where: { email: LIMITED_USER_EMAIL },
      update: {
        firstName: 'Students',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: limitedPasswordHash,
      },
      create: {
        email: LIMITED_USER_EMAIL,
        firstName: 'Students',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: limitedPasswordHash,
      },
    });
    limitedUserId = limitedUser.id;

    const existingLimitedMembership = await prisma.membership.findFirst({
      where: {
        userId: limitedUserId,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: limitedRoleId,
      },
      select: { id: true },
    });

    if (existingLimitedMembership) {
      await prisma.membership.update({
        where: { id: existingLimitedMembership.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.SCHOOL_USER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: limitedUserId,
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          roleId: limitedRoleId,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Students Tenancy Org B',
        status: OrganizationStatus.ACTIVE,
      },
    });
    tenantBOrganizationId = orgB.id;

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
        name: 'Students Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;

    const adminBPasswordHash = await argon2.hash(
      TENANT_B_ADMIN_PASSWORD,
      ARGON2_OPTIONS,
    );

    const adminB = await prisma.user.upsert({
      where: { email: TENANT_B_ADMIN_EMAIL },
      update: {
        firstName: 'Tenant',
        lastName: 'Admin B',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: adminBPasswordHash,
      },
      create: {
        email: TENANT_B_ADMIN_EMAIL,
        firstName: 'Tenant',
        lastName: 'Admin B',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: adminBPasswordHash,
      },
    });
    tenantBUserId = adminB.id;

    const existingMembershipB = await prisma.membership.findFirst({
      where: {
        userId: tenantBUserId,
        organizationId: tenantBOrganizationId,
        schoolId: tenantBSchoolId,
        roleId: schoolAdminRoleId,
      },
      select: { id: true },
    });

    if (existingMembershipB) {
      await prisma.membership.update({
        where: { id: existingMembershipB.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.SCHOOL_USER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: tenantBUserId,
          organizationId: tenantBOrganizationId,
          schoolId: tenantBSchoolId,
          roleId: schoolAdminRoleId,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

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

    const demoStudent = await prisma.student.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        firstName: 'Security',
        lastName: 'Student A',
        birthDate: new Date('2014-05-10T00:00:00.000Z'),
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    demoStudentId = demoStudent.id;

    const demoGuardian = await prisma.guardian.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        firstName: 'Security',
        lastName: 'Guardian A',
        phone: '+201001110001',
        email: 'guardian-a@security.moazez.local',
        relation: 'father',
        isPrimary: true,
      },
      select: { id: true },
    });
    demoGuardianId = demoGuardian.id;

    await prisma.studentGuardian.create({
      data: {
        schoolId: demoSchoolId,
        studentId: demoStudentId,
        guardianId: demoGuardianId,
        isPrimary: true,
      },
    });

    const tenantBStudent = await prisma.student.create({
      data: {
        schoolId: tenantBSchoolId,
        organizationId: tenantBOrganizationId,
        firstName: 'Security',
        lastName: 'Student B',
        birthDate: new Date('2015-03-12T00:00:00.000Z'),
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    tenantBStudentId = tenantBStudent.id;

    const tenantBGuardian = await prisma.guardian.create({
      data: {
        schoolId: tenantBSchoolId,
        organizationId: tenantBOrganizationId,
        firstName: 'Security',
        lastName: 'Guardian B',
        phone: '+201001119999',
        email: 'guardian-b@security.moazez.local',
        relation: 'mother',
        isPrimary: true,
      },
      select: { id: true },
    });
    tenantBGuardianId = tenantBGuardian.id;

    await prisma.studentGuardian.create({
      data: {
        schoolId: tenantBSchoolId,
        studentId: tenantBStudentId,
        guardianId: tenantBGuardianId,
        isPrimary: true,
      },
    });

    const demoAcademicYear = await prisma.academicYear.findFirst({
      where: {
        schoolId: demoSchoolId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (demoAcademicYear) {
      demoAcademicYearId = demoAcademicYear.id;
    } else {
      const createdDemoAcademicYear = await prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: `${testSuffix}-year-a-ar`,
          nameEn: `${testSuffix}-year-a`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: true,
        },
        select: { id: true },
      });
      demoAcademicYearId = createdDemoAcademicYear.id;
      createdDemoAcademicYearId = createdDemoAcademicYear.id;
    }

    const demoStage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${testSuffix}-stage-a-ar`,
        nameEn: `${testSuffix}-stage-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });

    const demoGrade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: demoStage.id,
        nameAr: `${testSuffix}-grade-a-ar`,
        nameEn: `${testSuffix}-grade-a`,
        sortOrder: 1,
        capacity: 25,
      },
      select: { id: true },
    });

    const demoSection = await prisma.section.create({
      data: {
        schoolId: demoSchoolId,
        gradeId: demoGrade.id,
        nameAr: `${testSuffix}-section-a-ar`,
        nameEn: `${testSuffix}-section-a`,
        sortOrder: 1,
        capacity: 25,
      },
      select: { id: true },
    });

    const demoClassroom = await prisma.classroom.create({
      data: {
        schoolId: demoSchoolId,
        sectionId: demoSection.id,
        nameAr: `${testSuffix}-classroom-a-ar`,
        nameEn: `${testSuffix}-classroom-a`,
        sortOrder: 1,
        capacity: 25,
      },
      select: { id: true },
    });
    demoClassroomId = demoClassroom.id;

    const tenantBAcademicYear = await prisma.academicYear.create({
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
    tenantBAcademicYearId = tenantBAcademicYear.id;

    const tenantBStage = await prisma.stage.create({
      data: {
        schoolId: tenantBSchoolId,
        nameAr: `${testSuffix}-stage-b-ar`,
        nameEn: `${testSuffix}-stage-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });

    const tenantBGrade = await prisma.grade.create({
      data: {
        schoolId: tenantBSchoolId,
        stageId: tenantBStage.id,
        nameAr: `${testSuffix}-grade-b-ar`,
        nameEn: `${testSuffix}-grade-b`,
        sortOrder: 1,
        capacity: 25,
      },
      select: { id: true },
    });

    const tenantBSection = await prisma.section.create({
      data: {
        schoolId: tenantBSchoolId,
        gradeId: tenantBGrade.id,
        nameAr: `${testSuffix}-section-b-ar`,
        nameEn: `${testSuffix}-section-b`,
        sortOrder: 1,
        capacity: 25,
      },
      select: { id: true },
    });

    const tenantBClassroom = await prisma.classroom.create({
      data: {
        schoolId: tenantBSchoolId,
        sectionId: tenantBSection.id,
        nameAr: `${testSuffix}-classroom-b-ar`,
        nameEn: `${testSuffix}-classroom-b`,
        sortOrder: 1,
        capacity: 25,
      },
      select: { id: true },
    });
    tenantBClassroomId = tenantBClassroom.id;

    const demoEnrollment = await prisma.enrollment.create({
      data: {
        schoolId: demoSchoolId,
        studentId: demoStudentId,
        academicYearId: demoAcademicYearId,
        classroomId: demoClassroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    demoEnrollmentId = demoEnrollment.id;

    const tenantBEnrollment = await prisma.enrollment.create({
      data: {
        schoolId: tenantBSchoolId,
        studentId: tenantBStudentId,
        academicYearId: tenantBAcademicYearId,
        classroomId: tenantBClassroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    tenantBEnrollmentId = tenantBEnrollment.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (prisma) {
      await prisma.enrollment.deleteMany({
        where: {
          id: { in: [demoEnrollmentId, tenantBEnrollmentId].filter(Boolean) },
        },
      });
      await prisma.studentGuardian.deleteMany({
        where: {
          studentId: { in: [demoStudentId, tenantBStudentId].filter(Boolean) },
        },
      });
      await prisma.guardian.deleteMany({
        where: { id: { in: [demoGuardianId, tenantBGuardianId].filter(Boolean) } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: [demoStudentId, tenantBStudentId].filter(Boolean) } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: [limitedUserId, tenantBUserId].filter(Boolean) } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: [limitedUserId, tenantBUserId].filter(Boolean) } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [limitedUserId, tenantBUserId].filter(Boolean) } },
      });
      await prisma.rolePermission.deleteMany({ where: { roleId: limitedRoleId } });
      await prisma.role.deleteMany({ where: { id: limitedRoleId } });
      await prisma.classroom.deleteMany({
        where: {
          id: { in: [demoClassroomId, tenantBClassroomId].filter(Boolean) },
        },
      });
      await prisma.section.deleteMany({
        where: {
          nameEn: {
            in: [`${testSuffix}-section-a`, `${testSuffix}-section-b`],
          },
        },
      });
      await prisma.grade.deleteMany({
        where: {
          nameEn: {
            in: [`${testSuffix}-grade-a`, `${testSuffix}-grade-b`],
          },
        },
      });
      await prisma.stage.deleteMany({
        where: {
          nameEn: {
            in: [`${testSuffix}-stage-a`, `${testSuffix}-stage-b`],
          },
        },
      });
      await prisma.academicYear.deleteMany({
        where: {
          id: {
            in: [createdDemoAcademicYearId, tenantBAcademicYearId].filter(
              Boolean,
            ),
          },
        },
      });
      await prisma.school.deleteMany({ where: { id: tenantBSchoolId } });
      await prisma.organization.deleteMany({ where: { slug: TENANT_B_ORG_SLUG } });
      await prisma.$disconnect();
    }
  });

  async function login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  it('returns 404 when school A admin requests a school B student by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/students/${tenantBStudentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin updates a school B student by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/students-guardians/students/${tenantBStudentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ family_name_en: 'Should Not Work' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin requests a school B guardian by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/students/guardians/${tenantBGuardianId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin updates a school B guardian by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/students-guardians/students/guardians/${tenantBGuardianId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ relation: 'uncle' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin requests guardians for a school B student id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/students/${tenantBStudentId}/guardians`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin links a guardian to a school B student id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/students/${tenantBStudentId}/guardians`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        guardianId: demoGuardianId,
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin requests a school B enrollment by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/enrollments/${tenantBEnrollmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin creates an enrollment for a school B student id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: tenantBStudentId,
        academicYearId: demoAcademicYearId,
        classroomId: demoClassroomId,
        enrollmentDate: '2026-09-01',
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin creates an enrollment into a school B placement context', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: demoStudentId,
        academicYearId: tenantBAcademicYearId,
        classroomId: tenantBClassroomId,
        enrollmentDate: '2026-09-01',
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin unlinks a school B guardian relationship', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/students-guardians/students/${tenantBStudentId}/guardians/${tenantBGuardianId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 when the same-school actor lacks the students manage permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/students-guardians/students/${demoStudentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ family_name_en: 'Viewer' })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the guardians manage permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/students/${demoStudentId}/guardians`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        guardianId: demoGuardianId,
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the enrollments view permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/enrollments/${demoEnrollmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the enrollments manage permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: demoStudentId,
        academicYearId: demoAcademicYearId,
        classroomId: demoClassroomId,
        enrollmentDate: '2026-09-02',
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });
});
