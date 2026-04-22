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

const TENANT_B_ORG_SLUG = 'academics-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'academics-tenancy-school-b';
const TENANT_B_ADMIN_EMAIL = 'admin-b@academics-tenancy.moazez.local';
const TENANT_B_ADMIN_PASSWORD = 'AcademicsB123!';
const TENANT_B_TEACHER_EMAIL = 'teacher-b@academics-tenancy.moazez.local';

const VIEWER_EMAIL = 'viewer@academics-tenancy.moazez.local';
const VIEWER_PASSWORD = 'Viewer123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

describe('Academics tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;

  let tenantBSchoolId: string;
  let tenantBUserId: string;
  let tenantBTeacherUserId: string;
  let tenantBYearId: string;
  let tenantBTermId: string;
  let tenantBStageId: string;
  let tenantBGradeId: string;
  let tenantBSectionId: string;
  let tenantBClassroomId: string;
  let tenantBSubjectId: string;
  let tenantBRoomId: string;
  let tenantBAllocationId: string;

  let demoViewerRoleId: string;
  let demoViewerUserId: string;
  let demoYearId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found — run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const [schoolAdminRole, teacherRole, structureViewPermission] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'teacher', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'academics.structure.view' },
        select: { id: true },
      }),
    ]);

    if (!schoolAdminRole || !teacherRole || !structureViewPermission) {
      throw new Error('Required roles or permissions missing — run `npm run seed` first.');
    }

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo admin not found.');
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

    const demoYear = await prisma.academicYear.findFirst({
      where: {
        schoolId: demoSchoolId,
        nameEn: 'Academics Scope A 2026/2027',
      },
      select: { id: true },
    });
    if (demoYear) {
      demoYearId = demoYear.id;
    } else {
      const createdYear = await prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: 'Academics Scope A 2026/2027',
          nameEn: 'Academics Scope A 2026/2027',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-06-30'),
          isActive: false,
        },
      });
      demoYearId = createdYear.id;
    }

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Academics Tenancy Org B',
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
        name: 'Academics Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;

    const passwordHashB = await argon2.hash(
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
        passwordHash: passwordHashB,
      },
      create: {
        email: TENANT_B_ADMIN_EMAIL,
        firstName: 'Tenant',
        lastName: 'Admin B',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: passwordHashB,
      },
    });
    tenantBUserId = adminB.id;

    const existingMembershipB = await prisma.membership.findFirst({
      where: {
        userId: adminB.id,
        organizationId: orgB.id,
        schoolId: schoolB.id,
        roleId: schoolAdminRole.id,
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
          userId: adminB.id,
          organizationId: orgB.id,
          schoolId: schoolB.id,
          roleId: schoolAdminRole.id,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    const yearB = await prisma.academicYear.findFirst({
      where: {
        schoolId: schoolB.id,
        nameEn: 'Academics Scope B 2026/2027',
      },
      select: { id: true },
    });
    if (yearB) {
      tenantBYearId = yearB.id;
    } else {
      const createdYear = await prisma.academicYear.create({
        data: {
          schoolId: schoolB.id,
          nameAr: 'Academics Scope B 2026/2027',
          nameEn: 'Academics Scope B 2026/2027',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-06-30'),
          isActive: true,
        },
      });
      tenantBYearId = createdYear.id;
    }

    const termB = await prisma.term.findFirst({
      where: {
        schoolId: schoolB.id,
        academicYearId: tenantBYearId,
        nameEn: 'Academics Scope B Term 1',
      },
      select: { id: true },
    });
    if (termB) {
      tenantBTermId = termB.id;
    } else {
      const createdTerm = await prisma.term.create({
        data: {
          schoolId: schoolB.id,
          academicYearId: tenantBYearId,
          nameAr: 'Academics Scope B Term 1',
          nameEn: 'Academics Scope B Term 1',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-12-31'),
          isActive: true,
        },
      });
      tenantBTermId = createdTerm.id;
    }

    const stageB = await prisma.stage.findFirst({
      where: {
        schoolId: schoolB.id,
        nameEn: 'Academics Scope B Stage',
      },
      select: { id: true },
    });
    if (stageB) {
      tenantBStageId = stageB.id;
    } else {
      const createdStage = await prisma.stage.create({
        data: {
          schoolId: schoolB.id,
          nameAr: 'Academics Scope B Stage',
          nameEn: 'Academics Scope B Stage',
          sortOrder: 1,
        },
      });
      tenantBStageId = createdStage.id;
    }

    const subjectB = await prisma.subject.findFirst({
      where: {
        schoolId: schoolB.id,
        nameEn: 'Academics Scope B Subject',
      },
      select: { id: true },
    });
    if (subjectB) {
      tenantBSubjectId = subjectB.id;
    } else {
      const createdSubject = await prisma.subject.create({
        data: {
          schoolId: schoolB.id,
          nameAr: 'Academics Scope B Subject',
          nameEn: 'Academics Scope B Subject',
          code: 'ACAD-B-SUBJECT',
          isActive: true,
        },
      });
      tenantBSubjectId = createdSubject.id;
    }

    const gradeB = await prisma.grade.findFirst({
      where: {
        schoolId: schoolB.id,
        stageId: tenantBStageId,
        nameEn: 'Academics Scope B Grade',
      },
      select: { id: true },
    });
    if (gradeB) {
      tenantBGradeId = gradeB.id;
    } else {
      const createdGrade = await prisma.grade.create({
        data: {
          schoolId: schoolB.id,
          stageId: tenantBStageId,
          nameAr: 'Academics Scope B Grade',
          nameEn: 'Academics Scope B Grade',
          sortOrder: 1,
          capacity: 24,
        },
      });
      tenantBGradeId = createdGrade.id;
    }

    const sectionB = await prisma.section.findFirst({
      where: {
        schoolId: schoolB.id,
        gradeId: tenantBGradeId,
        nameEn: 'Academics Scope B Section',
      },
      select: { id: true },
    });
    if (sectionB) {
      tenantBSectionId = sectionB.id;
    } else {
      const createdSection = await prisma.section.create({
        data: {
          schoolId: schoolB.id,
          gradeId: tenantBGradeId,
          nameAr: 'Academics Scope B Section',
          nameEn: 'Academics Scope B Section',
          sortOrder: 1,
          capacity: 24,
        },
      });
      tenantBSectionId = createdSection.id;
    }

    const roomB = await prisma.room.findFirst({
      where: {
        schoolId: schoolB.id,
        nameEn: 'Academics Scope B Room',
      },
      select: { id: true },
    });
    if (roomB) {
      tenantBRoomId = roomB.id;
    } else {
      const createdRoom = await prisma.room.create({
        data: {
          schoolId: schoolB.id,
          nameAr: 'Academics Scope B Room',
          nameEn: 'Academics Scope B Room',
          building: 'Block B',
          floor: '1',
          isActive: true,
        },
      });
      tenantBRoomId = createdRoom.id;
    }

    const classroomB = await prisma.classroom.findFirst({
      where: {
        schoolId: schoolB.id,
        sectionId: tenantBSectionId,
        nameEn: 'Academics Scope B Classroom',
      },
      select: { id: true },
    });
    if (classroomB) {
      tenantBClassroomId = classroomB.id;
    } else {
      const createdClassroom = await prisma.classroom.create({
        data: {
          schoolId: schoolB.id,
          sectionId: tenantBSectionId,
          nameAr: 'Academics Scope B Classroom',
          nameEn: 'Academics Scope B Classroom',
          sortOrder: 1,
          capacity: 24,
        },
      });
      tenantBClassroomId = createdClassroom.id;
    }

    const teacherB = await prisma.user.upsert({
      where: { email: TENANT_B_TEACHER_EMAIL },
      update: {
        firstName: 'Tenant',
        lastName: 'Teacher B',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: TENANT_B_TEACHER_EMAIL,
        firstName: 'Tenant',
        lastName: 'Teacher B',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
    });
    tenantBTeacherUserId = teacherB.id;

    const existingTeacherMembershipB = await prisma.membership.findFirst({
      where: {
        userId: teacherB.id,
        organizationId: orgB.id,
        schoolId: schoolB.id,
        roleId: teacherRole.id,
      },
      select: { id: true },
    });

    if (existingTeacherMembershipB) {
      await prisma.membership.update({
        where: { id: existingTeacherMembershipB.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.TEACHER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: teacherB.id,
          organizationId: orgB.id,
          schoolId: schoolB.id,
          roleId: teacherRole.id,
          userType: UserType.TEACHER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    const allocationB = await prisma.teacherSubjectAllocation.findFirst({
      where: {
        schoolId: schoolB.id,
        teacherUserId: teacherB.id,
        subjectId: tenantBSubjectId,
        classroomId: tenantBClassroomId,
        termId: tenantBTermId,
      },
      select: { id: true },
    });
    if (allocationB) {
      tenantBAllocationId = allocationB.id;
    } else {
      const createdAllocation = await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: schoolB.id,
          teacherUserId: teacherB.id,
          subjectId: tenantBSubjectId,
          classroomId: tenantBClassroomId,
          termId: tenantBTermId,
        },
      });
      tenantBAllocationId = createdAllocation.id;
    }

    const viewerRole = await prisma.role.findFirst({
      where: {
        schoolId: demoSchoolId,
        key: 'academics_structure_viewer',
      },
      select: { id: true },
    });

    if (viewerRole) {
      demoViewerRoleId = viewerRole.id;
      await prisma.rolePermission.deleteMany({ where: { roleId: viewerRole.id } });
    } else {
      const createdRole = await prisma.role.create({
        data: {
          schoolId: demoSchoolId,
          key: 'academics_structure_viewer',
          name: 'Academics Structure Viewer',
          description: 'Can view academic structure only',
          isSystem: false,
        },
      });
      demoViewerRoleId = createdRole.id;
    }

    await prisma.rolePermission.create({
      data: {
        roleId: demoViewerRoleId,
        permissionId: structureViewPermission.id,
      },
    });

    const viewerPasswordHash = await argon2.hash(
      VIEWER_PASSWORD,
      ARGON2_OPTIONS,
    );
    const viewerUser = await prisma.user.upsert({
      where: { email: VIEWER_EMAIL },
      update: {
        firstName: 'Academics',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: viewerPasswordHash,
      },
      create: {
        email: VIEWER_EMAIL,
        firstName: 'Academics',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: viewerPasswordHash,
      },
    });
    demoViewerUserId = viewerUser.id;

    const existingViewerMembership = await prisma.membership.findFirst({
      where: {
        userId: viewerUser.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: demoViewerRoleId,
      },
      select: { id: true },
    });

    if (existingViewerMembership) {
      await prisma.membership.update({
        where: { id: existingViewerMembership.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.SCHOOL_USER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: viewerUser.id,
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          roleId: demoViewerRoleId,
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
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { id: tenantBAllocationId },
      });
      await prisma.classroom.deleteMany({ where: { id: tenantBClassroomId } });
      await prisma.section.deleteMany({ where: { id: tenantBSectionId } });
      await prisma.grade.deleteMany({ where: { id: tenantBGradeId } });
      await prisma.subject.deleteMany({ where: { id: tenantBSubjectId } });
      await prisma.room.deleteMany({ where: { id: tenantBRoomId } });
      await prisma.stage.deleteMany({ where: { id: tenantBStageId } });
      await prisma.term.deleteMany({ where: { id: tenantBTermId } });
      await prisma.academicYear.deleteMany({
        where: {
          id: tenantBYearId,
        },
      });
      await prisma.membership.deleteMany({ where: { userId: demoViewerUserId } });
      await prisma.user.deleteMany({ where: { id: demoViewerUserId } });
      await prisma.rolePermission.deleteMany({ where: { roleId: demoViewerRoleId } });
      await prisma.role.deleteMany({ where: { id: demoViewerRoleId } });
      await prisma.membership.deleteMany({ where: { userId: tenantBTeacherUserId } });
      await prisma.user.deleteMany({ where: { id: tenantBTeacherUserId } });
      await prisma.membership.deleteMany({ where: { userId: tenantBUserId } });
      await prisma.user.deleteMany({ where: { id: tenantBUserId } });
      await prisma.school.deleteMany({ where: { id: tenantBSchoolId } });
      await prisma.organization.deleteMany({ where: { slug: TENANT_B_ORG_SLUG } });
      await prisma.academicYear.deleteMany({
        where: {
          schoolId: demoSchoolId,
          nameEn: 'Academics Scope A 2026/2027',
          id: demoYearId,
        },
      });
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

  it('school A years endpoint returns only school A data', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/structure/years`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const names = response.body.items.map((item: { nameEn: string }) => item.nameEn);
    expect(names).toContain('Academics Scope A 2026/2027');
    expect(names).not.toContain('Academics Scope B 2026/2027');
  });

  it('returns 404 when school A requests a school B tree context by year and term id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/structure/tree?yearId=${tenantBYearId}&termId=${tenantBTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A tries to update a school B stage by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/structure/stages/${tenantBStageId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn: 'Should Not Work' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 for a protected academics mutation when the permission is missing', async () => {
    const { accessToken } = await login(VIEWER_EMAIL, VIEWER_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/structure/stages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nameEn: 'Viewer Forbidden Stage',
        nameAr: 'Viewer Forbidden Stage',
        sortOrder: 1,
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 404 when school A tries to update a school B subject by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/subjects/${tenantBSubjectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn: 'Should Not Work' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A tries to delete a school B subject by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/subjects/${tenantBSubjectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A tries to update a school B room by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/rooms/${tenantBRoomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn: 'Should Not Work' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A tries to delete a school B room by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/rooms/${tenantBRoomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 when a view-only user attempts a room mutation', async () => {
    const { accessToken } = await login(VIEWER_EMAIL, VIEWER_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/rooms`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nameEn: 'Viewer Forbidden Room',
        nameAr: 'Viewer Forbidden Room',
        capacity: 12,
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 404 when school A requests allocations using school B filters', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/academics/allocations?termId=${tenantBTermId}&classroomId=${tenantBClassroomId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A tries to delete a school B allocation by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/allocations/${tenantBAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 when a view-only user attempts an allocation mutation', async () => {
    const { accessToken } = await login(VIEWER_EMAIL, VIEWER_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        teacherUserId: tenantBTeacherUserId,
        subjectId: tenantBSubjectId,
        classroomId: tenantBClassroomId,
        termId: tenantBTermId,
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });
});
