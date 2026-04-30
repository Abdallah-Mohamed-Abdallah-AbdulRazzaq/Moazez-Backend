import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BehaviorRecordType,
  BehaviorSeverity,
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
const TENANT_B_ORG_SLUG = 'behavior-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'behavior-tenancy-school-b';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(45000);

describe('Behavior category tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let tenantBSchoolId: string;
  let tenantBOrganizationId: string;

  let demoCategoryId: string;
  let demoSoftDeletedCategoryId: string;
  let tenantBCategoryId: string;
  let tenantBSharedCodeCategoryId: string;

  let noAccessEmail: string;
  let viewOnlyEmail: string;
  let teacherEmail: string;
  let parentEmail: string;
  let studentEmail: string;

  const password = 'BehaviorSecurity123!';
  const testSuffix = `behavior-security-${Date.now()}`;
  const codeToken = Date.now().toString(36).toUpperCase();
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdCategoryIds: string[] = [];

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

    const [
      schoolAdminRole,
      teacherRole,
      parentRole,
      studentRole,
      categoriesViewPermission,
      categoriesManagePermission,
    ] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'teacher', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'parent', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'student', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'behavior.categories.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'behavior.categories.manage' },
        select: { id: true },
      }),
    ]);

    if (
      !schoolAdminRole ||
      !teacherRole ||
      !parentRole ||
      !studentRole ||
      !categoriesViewPermission ||
      !categoriesManagePermission
    ) {
      throw new Error('Behavior roles or permissions missing - run seed.');
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

    const noAccessRoleId = await createCustomRole('no-access', []);
    const viewOnlyRoleId = await createCustomRole('view-only', [
      categoriesViewPermission.id,
    ]);

    noAccessEmail = `${testSuffix}-no-access@security.moazez.local`;
    viewOnlyEmail = `${testSuffix}-view-only@security.moazez.local`;
    teacherEmail = `${testSuffix}-teacher@security.moazez.local`;
    parentEmail = `${testSuffix}-parent@security.moazez.local`;
    studentEmail = `${testSuffix}-student@security.moazez.local`;

    await createUserWithMembership(
      noAccessEmail,
      UserType.SCHOOL_USER,
      noAccessRoleId,
    );
    await createUserWithMembership(
      viewOnlyEmail,
      UserType.SCHOOL_USER,
      viewOnlyRoleId,
    );
    await createUserWithMembership(
      teacherEmail,
      UserType.TEACHER,
      teacherRole.id,
    );
    await createUserWithMembership(parentEmail, UserType.PARENT, parentRole.id);
    await createUserWithMembership(
      studentEmail,
      UserType.STUDENT,
      studentRole.id,
    );

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Behavior Tenancy Org B',
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
        name: 'Behavior Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;
    await cleanupBehaviorTenantSchool(tenantBSchoolId);

    demoCategoryId = await createCategoryFixture({
      schoolId: demoSchoolId,
      code: `B_${codeToken}_A`,
      suffix: 'category-a',
      type: BehaviorRecordType.POSITIVE,
      defaultPoints: 2,
    });
    demoSoftDeletedCategoryId = await createCategoryFixture({
      schoolId: demoSchoolId,
      code: `B_${codeToken}_DELETED_A`,
      suffix: 'deleted-category-a',
      type: BehaviorRecordType.NEGATIVE,
      defaultPoints: -1,
      deletedAt: new Date(),
    });
    tenantBCategoryId = await createCategoryFixture({
      schoolId: tenantBSchoolId,
      code: `B_${codeToken}_B`,
      suffix: 'category-b',
      type: BehaviorRecordType.NEGATIVE,
      defaultPoints: -2,
    });
    tenantBSharedCodeCategoryId = await createCategoryFixture({
      schoolId: tenantBSchoolId,
      code: `B_${codeToken}_SHARED`,
      suffix: 'shared-code-category-b',
      type: BehaviorRecordType.POSITIVE,
      defaultPoints: 1,
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
      await prisma.behaviorPointLedger.deleteMany({
        where: { categoryId: { in: createdCategoryIds } },
      });
      await prisma.behaviorRecord.deleteMany({
        where: { categoryId: { in: createdCategoryIds } },
      });
      await prisma.behaviorCategory.deleteMany({
        where: { id: { in: createdCategoryIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      await prisma.$disconnect();
    }
  });

  it('school A cannot read school B behavior category details', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories/${tenantBCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A category list does not include school B categories', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories`)
      .query({ search: testSuffix, includeDeleted: true })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoCategoryId);
    expect(ids).toContain(demoSoftDeletedCategoryId);
    expect(ids).not.toContain(tenantBCategoryId);
    expect(ids).not.toContain(tenantBSharedCodeCategoryId);
  });

  it('school A cannot update or delete school B categories', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/behavior/categories/${tenantBCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn: 'Leaked category' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/behavior/categories/${tenantBCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('same-school actors without view permission get 403 for list and detail', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories/${demoCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('same-school actors without manage permission get 403 for create, update, and delete', async () => {
    const { accessToken } = await login(viewOnlyEmail);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/categories`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(categoryPayload({ code: `B_${codeToken}_VIEW_ONLY_CREATE` }))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/behavior/categories/${demoCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn: 'Forbidden update' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/behavior/categories/${demoCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('admin/school role can create, update, and delete categories', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/categories`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(categoryPayload({ code: `B_${codeToken}_ADMIN_CRUD` }))
      .expect(201);
    createdCategoryIds.push(created.body.id);

    expect(created.body).toMatchObject({
      code: `B_${codeToken}_ADMIN_CRUD`,
      type: 'positive',
      defaultPoints: 1,
    });
    expect(created.body).not.toHaveProperty('schoolId');

    const updated = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/behavior/categories/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn: `${testSuffix}-admin-updated`, defaultPoints: 3 })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: created.body.id,
      nameEn: `${testSuffix}-admin-updated`,
      defaultPoints: 3,
    });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/behavior/categories/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true });
      });
  });

  it('teacher can view categories but cannot manage them', async () => {
    const { accessToken } = await login(teacherEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories/${demoCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/categories`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(categoryPayload({ code: `B_${codeToken}_TEACHER_CREATE` }))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/behavior/categories/${demoCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn: 'Teacher forbidden update' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/behavior/categories/${demoCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('parent and student actors cannot access core dashboard behavior category endpoints', async () => {
    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/behavior/categories`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/behavior/categories/${demoCategoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/behavior/categories`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(
          categoryPayload({
            code: `B_${codeToken}_${email.includes('parent') ? 'PARENT' : 'STUDENT'}`,
          }),
        )
        .expect(403);
    }
  });

  it('duplicate category code is tenant-scoped', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const allowed = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/categories`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(categoryPayload({ code: `B_${codeToken}_SHARED` }))
      .expect(201);
    createdCategoryIds.push(allowed.body.id);

    expect(allowed.body.code).toBe(`B_${codeToken}_SHARED`);

    const duplicate = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/categories`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(categoryPayload({ code: `B_${codeToken}_A` }))
      .expect(400);

    expect(duplicate.body?.error?.code).toBe('validation.failed');
  });

  it('category mutations do not create behavior records, behavior point ledger rows, or XP ledger rows', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const before = await mutationSideEffectCounts();

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/categories`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(categoryPayload({ code: `B_${codeToken}_SIDE_EFFECTS` }))
      .expect(201);
    createdCategoryIds.push(created.body.id);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/behavior/categories/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/behavior/categories/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const after = await mutationSideEffectCounts();
    expect(after.behaviorRecords).toBe(before.behaviorRecords);
    expect(after.behaviorPointLedger).toBe(before.behaviorPointLedger);
    expect(after.xpLedger).toBe(before.xpLedger);
  });

  it('cross-school resource existence is not leaked', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    for (const method of ['get', 'patch', 'delete'] as const) {
      const http = request(app.getHttpServer())
        [method](`${GLOBAL_PREFIX}/behavior/categories/${tenantBCategoryId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      if (method === 'patch') {
        await http.send({ nameEn: 'No leak' }).expect(404);
      } else {
        await http.expect(404);
      }
    }
  });

  it('soft-deleted categories are hidden from default list and detail', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories`)
      .query({ search: 'deleted-category-a' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = list.body.items.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(demoSoftDeletedCategoryId);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories/${demoSoftDeletedCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({
        email,
        password: email === DEMO_ADMIN_EMAIL ? DEMO_ADMIN_PASSWORD : password,
      })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function createCustomRole(
    keySuffix: string,
    permissionIds: string[],
  ): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: demoSchoolId,
        key: `${testSuffix}-${keySuffix}`,
        name: `${testSuffix} ${keySuffix}`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }

    return role.id;
  }

  async function createUserWithMembership(
    email: string,
    userType: UserType,
    roleId: string,
  ): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Behavior',
        lastName: 'Security',
        userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(password, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId,
        userType,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  async function createCategoryFixture(params: {
    schoolId: string;
    code: string;
    suffix: string;
    type: BehaviorRecordType;
    defaultPoints: number;
    deletedAt?: Date | null;
  }): Promise<string> {
    const category = await prisma.behaviorCategory.create({
      data: {
        schoolId: params.schoolId,
        code: params.code,
        nameEn: `${testSuffix}-${params.suffix}`,
        type: params.type,
        defaultSeverity: BehaviorSeverity.LOW,
        defaultPoints: params.defaultPoints,
        deletedAt: params.deletedAt ?? null,
      },
      select: { id: true },
    });
    createdCategoryIds.push(category.id);
    return category.id;
  }

  function categoryPayload(
    overrides?: Partial<{
      code: string;
      nameEn: string;
      type: 'positive' | 'negative';
      defaultPoints: number;
    }>,
  ) {
    return {
      code: overrides?.code ?? `B_${codeToken}_API_CATEGORY`,
      nameEn: overrides?.nameEn ?? `${testSuffix}-api-category`,
      type: overrides?.type ?? 'positive',
      defaultSeverity: 'low',
      defaultPoints: overrides?.defaultPoints ?? 1,
    };
  }

  async function mutationSideEffectCounts() {
    const [behaviorRecords, behaviorPointLedger, xpLedger] = await Promise.all([
      prisma.behaviorRecord.count(),
      prisma.behaviorPointLedger.count(),
      prisma.xpLedger.count(),
    ]);

    return { behaviorRecords, behaviorPointLedger, xpLedger };
  }

  async function cleanupBehaviorTenantSchool(schoolId: string): Promise<void> {
    await prisma.behaviorPointLedger.deleteMany({ where: { schoolId } });
    await prisma.behaviorRecord.deleteMany({ where: { schoolId } });
    await prisma.behaviorCategory.deleteMany({ where: { schoolId } });
  }
});
