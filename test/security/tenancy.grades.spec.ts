import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GradeRoundingMode,
  GradeRuleScale,
  GradeScopeType,
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

const TENANT_B_ORG_SLUG = 'grades-rules-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'grades-rules-tenancy-school-b';

const VIEW_ONLY_EMAIL = 'grades-rules-viewer@security.moazez.local';
const VIEW_ONLY_PASSWORD = 'GradesView123!';
const MANAGE_ONLY_EMAIL = 'grades-rules-manager@security.moazez.local';
const MANAGE_ONLY_PASSWORD = 'GradesManage123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

describe('Grades rules tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let tenantBSchoolId: string;
  let tenantBOrganizationId: string;

  let demoYearId: string;
  let demoTermId: string;
  let demoStageId: string;
  let demoGradeId: string;
  let demoSectionId: string;
  let demoClassroomId: string;
  let demoSchoolRuleId: string;
  let demoGradeRuleId: string;

  let tenantBYearId: string;
  let tenantBTermId: string;
  let tenantBStageId: string;
  let tenantBGradeId: string;
  let tenantBSectionId: string;
  let tenantBClassroomId: string;
  let tenantBSchoolRuleId: string;
  let tenantBGradeRuleId: string;

  let viewOnlyRoleId: string;
  let manageOnlyRoleId: string;
  let viewOnlyUserId: string;
  let manageOnlyUserId: string;

  const testSuffix = `grades-rules-security-${Date.now()}`;

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

    const [schoolAdminRole, rulesViewPermission, rulesManagePermission] =
      await Promise.all([
        prisma.role.findFirst({
          where: { key: 'school_admin', schoolId: null, isSystem: true },
          select: { id: true },
        }),
        prisma.permission.findUnique({
          where: { code: 'grades.rules.view' },
          select: { id: true },
        }),
        prisma.permission.findUnique({
          where: { code: 'grades.rules.manage' },
          select: { id: true },
        }),
      ]);

    if (!schoolAdminRole || !rulesViewPermission || !rulesManagePermission) {
      throw new Error(
        'Grades rules permissions missing - run `npm run seed` first.',
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
        name: 'Grades Rules Tenancy Org B',
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
        name: 'Grades Rules Tenancy School B',
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
        isActive: true,
      },
      select: { id: true },
    });
    demoTermId = demoTerm.id;

    const demoStage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${testSuffix}-stage-a-ar`,
        nameEn: `${testSuffix}-stage-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoStageId = demoStage.id;

    const demoGrade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: demoStageId,
        nameAr: `${testSuffix}-grade-a-ar`,
        nameEn: `${testSuffix}-grade-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoGradeId = demoGrade.id;

    const demoSection = await prisma.section.create({
      data: {
        schoolId: demoSchoolId,
        gradeId: demoGradeId,
        nameAr: `${testSuffix}-section-a-ar`,
        nameEn: `${testSuffix}-section-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoSectionId = demoSection.id;

    const demoClassroom = await prisma.classroom.create({
      data: {
        schoolId: demoSchoolId,
        sectionId: demoSectionId,
        nameAr: `${testSuffix}-classroom-a-ar`,
        nameEn: `${testSuffix}-classroom-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoClassroomId = demoClassroom.id;

    const tenantBYear = await prisma.academicYear.create({
      data: {
        schoolId: tenantBSchoolId,
        nameAr: `${testSuffix}-year-b-ar`,
        nameEn: `${testSuffix}-year-b`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: false,
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

    const tenantBStage = await prisma.stage.create({
      data: {
        schoolId: tenantBSchoolId,
        nameAr: `${testSuffix}-stage-b-ar`,
        nameEn: `${testSuffix}-stage-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBStageId = tenantBStage.id;

    const tenantBGrade = await prisma.grade.create({
      data: {
        schoolId: tenantBSchoolId,
        stageId: tenantBStageId,
        nameAr: `${testSuffix}-grade-b-ar`,
        nameEn: `${testSuffix}-grade-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBGradeId = tenantBGrade.id;

    const tenantBSection = await prisma.section.create({
      data: {
        schoolId: tenantBSchoolId,
        gradeId: tenantBGradeId,
        nameAr: `${testSuffix}-section-b-ar`,
        nameEn: `${testSuffix}-section-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBSectionId = tenantBSection.id;

    const tenantBClassroom = await prisma.classroom.create({
      data: {
        schoolId: tenantBSchoolId,
        sectionId: tenantBSectionId,
        nameAr: `${testSuffix}-classroom-b-ar`,
        nameEn: `${testSuffix}-classroom-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBClassroomId = tenantBClassroom.id;

    const demoSchoolRule = await prisma.gradeRule.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        scopeType: GradeScopeType.SCHOOL,
        scopeKey: demoSchoolId,
        gradingScale: GradeRuleScale.PERCENTAGE,
        passMark: 51,
        rounding: GradeRoundingMode.DECIMAL_2,
      },
      select: { id: true },
    });
    demoSchoolRuleId = demoSchoolRule.id;

    const demoGradeRule = await prisma.gradeRule.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        scopeType: GradeScopeType.GRADE,
        scopeKey: demoGradeId,
        gradeId: demoGradeId,
        gradingScale: GradeRuleScale.PERCENTAGE,
        passMark: 61,
        rounding: GradeRoundingMode.DECIMAL_1,
      },
      select: { id: true },
    });
    demoGradeRuleId = demoGradeRule.id;

    const tenantBSchoolRule = await prisma.gradeRule.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        scopeType: GradeScopeType.SCHOOL,
        scopeKey: tenantBSchoolId,
        gradingScale: GradeRuleScale.PERCENTAGE,
        passMark: 49,
        rounding: GradeRoundingMode.DECIMAL_2,
      },
      select: { id: true },
    });
    tenantBSchoolRuleId = tenantBSchoolRule.id;

    const tenantBGradeRule = await prisma.gradeRule.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        scopeType: GradeScopeType.GRADE,
        scopeKey: tenantBGradeId,
        gradeId: tenantBGradeId,
        gradingScale: GradeRuleScale.PERCENTAGE,
        passMark: 59,
        rounding: GradeRoundingMode.DECIMAL_1,
      },
      select: { id: true },
    });
    tenantBGradeRuleId = tenantBGradeRule.id;

    viewOnlyRoleId = await createPermissionRole({
      key: 'grades_rules_view_only',
      name: 'Grades Rules View Only',
      permissionIds: [rulesViewPermission.id],
    });
    manageOnlyRoleId = await createPermissionRole({
      key: 'grades_rules_manage_only',
      name: 'Grades Rules Manage Only',
      permissionIds: [rulesManagePermission.id],
    });

    viewOnlyUserId = await createScopedUser({
      email: VIEW_ONLY_EMAIL,
      password: VIEW_ONLY_PASSWORD,
      roleId: viewOnlyRoleId,
    });
    manageOnlyUserId = await createScopedUser({
      email: MANAGE_ONLY_EMAIL,
      password: MANAGE_ONLY_PASSWORD,
      roleId: manageOnlyRoleId,
    });

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
      await prisma.gradeRule.deleteMany({
        where: {
          id: {
            in: [
              demoSchoolRuleId,
              demoGradeRuleId,
              tenantBSchoolRuleId,
              tenantBGradeRuleId,
            ].filter(Boolean),
          },
        },
      });
      await prisma.auditLog.deleteMany({
        where: {
          resourceId: {
            in: [
              demoSchoolRuleId,
              demoGradeRuleId,
              tenantBSchoolRuleId,
              tenantBGradeRuleId,
            ].filter(Boolean),
          },
        },
      });
      await prisma.classroom.deleteMany({
        where: {
          id: { in: [demoClassroomId, tenantBClassroomId].filter(Boolean) },
        },
      });
      await prisma.section.deleteMany({
        where: {
          id: { in: [demoSectionId, tenantBSectionId].filter(Boolean) },
        },
      });
      await prisma.grade.deleteMany({
        where: { id: { in: [demoGradeId, tenantBGradeId].filter(Boolean) } },
      });
      await prisma.stage.deleteMany({
        where: { id: { in: [demoStageId, tenantBStageId].filter(Boolean) } },
      });
      await prisma.term.deleteMany({
        where: { id: { in: [demoTermId, tenantBTermId].filter(Boolean) } },
      });
      await prisma.academicYear.deleteMany({
        where: { id: { in: [demoYearId, tenantBYearId].filter(Boolean) } },
      });
      await prisma.session.deleteMany({
        where: {
          userId: { in: [viewOnlyUserId, manageOnlyUserId].filter(Boolean) },
        },
      });
      await prisma.membership.deleteMany({
        where: {
          userId: { in: [viewOnlyUserId, manageOnlyUserId].filter(Boolean) },
        },
      });
      await prisma.user.deleteMany({
        where: {
          id: { in: [viewOnlyUserId, manageOnlyUserId].filter(Boolean) },
        },
      });
      await prisma.rolePermission.deleteMany({
        where: {
          roleId: { in: [viewOnlyRoleId, manageOnlyRoleId].filter(Boolean) },
        },
      });
      await prisma.role.deleteMany({
        where: {
          id: { in: [viewOnlyRoleId, manageOnlyRoleId].filter(Boolean) },
        },
      });
      await prisma.school.deleteMany({ where: { id: tenantBSchoolId } });
      await prisma.organization.deleteMany({
        where: { id: tenantBOrganizationId },
      });
      await prisma.$disconnect();
    }
  });

  async function createPermissionRole(params: {
    key: string;
    name: string;
    permissionIds: string[];
  }): Promise<string> {
    const existing = await prisma.role.findFirst({
      where: { schoolId: demoSchoolId, key: params.key },
      select: { id: true },
    });

    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: {
            name: params.name,
            description: params.name,
            isSystem: false,
          },
          select: { id: true },
        })
      : await prisma.role.create({
          data: {
            schoolId: demoSchoolId,
            key: params.key,
            name: params.name,
            description: params.name,
            isSystem: false,
          },
          select: { id: true },
        });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: params.permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
      skipDuplicates: true,
    });

    return role.id;
  }

  async function createScopedUser(params: {
    email: string;
    password: string;
    roleId: string;
  }): Promise<string> {
    const passwordHash = await argon2.hash(params.password, ARGON2_OPTIONS);
    const user = await prisma.user.upsert({
      where: { email: params.email },
      update: {
        firstName: 'Grades',
        lastName: 'Rules',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      create: {
        email: params.email,
        firstName: 'Grades',
        lastName: 'Rules',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      select: { id: true },
    });

    const existingMembership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
      },
      select: { id: true },
    });

    if (existingMembership) {
      await prisma.membership.update({
        where: { id: existingMembership.id },
        data: {
          roleId: params.roleId,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
          endedAt: null,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          roleId: params.roleId,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    return user.id;
  }

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

  it('school A list does not include school B grade rules', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoSchoolRuleId);
    expect(ids).toContain(demoGradeRuleId);
    expect(ids).not.toContain(tenantBSchoolRuleId);
    expect(ids).not.toContain(tenantBGradeRuleId);
  });

  it('returns 404 when school A updates a school B grade rule', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/rules/${tenantBGradeRuleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ passMark: 62 })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A creates a rule using a school B grade id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: tenantBGradeId,
        passMark: 54,
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it.each([
    ['grade', 'gradeId', () => tenantBGradeId],
    ['section', 'sectionId', () => tenantBSectionId],
    ['classroom', 'classroomId', () => tenantBClassroomId],
  ])(
    'returns 404 when school A resolves effective rule for school B %s',
    async (scopeType, idField, resolveId) => {
      const { accessToken } = await login(
        DEMO_ADMIN_EMAIL,
        DEMO_ADMIN_PASSWORD,
      );

      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/grades/rules/effective`)
        .query({
          yearId: demoYearId,
          termId: demoTermId,
          scopeType,
          [idField]: resolveId(),
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body?.error?.code).toBe('not_found');
    },
  );

  it('returns 403 when the same-school actor lacks grades.rules.view', async () => {
    const { accessToken } = await login(
      MANAGE_ONLY_EMAIL,
      MANAGE_ONLY_PASSWORD,
    );

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules/effective`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: demoGradeId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks grades.rules.manage', async () => {
    const { accessToken } = await login(VIEW_ONLY_EMAIL, VIEW_ONLY_PASSWORD);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'school',
        passMark: 53,
      })
      .expect(403);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/rules/${demoSchoolRuleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ passMark: 53 })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('school admin can list, upsert, update, and resolve allowed rules', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const upsertResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'school',
        passMark: 57,
      })
      .expect(201);

    expect(upsertResponse.body).toMatchObject({
      id: demoSchoolRuleId,
      scopeType: 'school',
      scopeKey: demoSchoolId,
      passMark: 57,
    });

    const patchResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/rules/${demoSchoolRuleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        passMark: 58,
        rounding: 'decimal_1',
      })
      .expect(200);

    expect(patchResponse.body).toMatchObject({
      id: demoSchoolRuleId,
      passMark: 58,
      rounding: 'decimal_1',
    });

    const effectiveResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules/effective`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'classroom',
        classroomId: demoClassroomId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(effectiveResponse.body).toMatchObject({
      source: 'GRADE',
      ruleId: demoGradeRuleId,
      scopeType: 'grade',
      gradeId: demoGradeId,
    });
  });
});
