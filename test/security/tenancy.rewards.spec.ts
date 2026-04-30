import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FileVisibility,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
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
const TENANT_B_ORG_SLUG = 'rewards-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'rewards-tenancy-school-b';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(45000);

describe('Rewards catalog tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let tenantBSchoolId: string;
  let tenantBOrganizationId: string;

  let demoYearId: string;
  let demoTermId: string;
  let demoFileId: string;
  let demoRewardId: string;
  let demoPublishedRewardId: string;

  let tenantBYearId: string;
  let tenantBTermId: string;
  let tenantBFileId: string;
  let tenantBRewardId: string;
  let tenantBArchivedRewardId: string;
  let tenantBDeletedRewardId: string;

  let noAccessEmail: string;
  let viewOnlyEmail: string;
  let teacherEmail: string;
  let parentEmail: string;
  let studentEmail: string;

  const password = 'RewardsSecurity123!';
  const testSuffix = `rewards-security-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdAcademicYearIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdRewardIds: string[] = [];

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
      rewardsViewPermission,
      rewardsManagePermission,
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
        where: { code: 'reinforcement.rewards.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.rewards.manage' },
        select: { id: true },
      }),
    ]);

    if (
      !schoolAdminRole ||
      !teacherRole ||
      !parentRole ||
      !studentRole ||
      !rewardsViewPermission ||
      !rewardsManagePermission
    ) {
      throw new Error('Rewards roles or permissions missing - run seed.');
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
      rewardsViewPermission.id,
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
    await createUserWithMembership(teacherEmail, UserType.TEACHER, teacherRole.id);
    await createUserWithMembership(parentEmail, UserType.PARENT, parentRole.id);
    await createUserWithMembership(studentEmail, UserType.STUDENT, studentRole.id);

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Rewards Tenancy Org B',
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
        name: 'Rewards Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;
    await cleanupTenantSchool(tenantBSchoolId);

    const demo = await createAcademicFixture('a', demoSchoolId);
    demoYearId = demo.yearId;
    demoTermId = demo.termId;
    demoFileId = await createFileFixture(
      demoSchoolId,
      demoOrganizationId,
      'reward-a.png',
    );

    const tenantB = await createAcademicFixture('b', tenantBSchoolId);
    tenantBYearId = tenantB.yearId;
    tenantBTermId = tenantB.termId;
    tenantBFileId = await createFileFixture(
      tenantBSchoolId,
      tenantBOrganizationId,
      'reward-b.png',
    );

    demoRewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'draft-a',
      status: RewardCatalogItemStatus.DRAFT,
    });
    demoPublishedRewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'published-a',
      status: RewardCatalogItemStatus.PUBLISHED,
    });
    tenantBRewardId = await createRewardFixture({
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      imageFileId: tenantBFileId,
      suffix: 'draft-b',
      status: RewardCatalogItemStatus.DRAFT,
    });
    tenantBArchivedRewardId = await createRewardFixture({
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      imageFileId: tenantBFileId,
      suffix: 'archived-b',
      status: RewardCatalogItemStatus.ARCHIVED,
    });
    tenantBDeletedRewardId = await createRewardFixture({
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      imageFileId: tenantBFileId,
      suffix: 'deleted-b',
      status: RewardCatalogItemStatus.PUBLISHED,
      deletedAt: new Date(),
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
      await prisma.rewardRedemption.deleteMany({
        where: { catalogItemId: { in: createdRewardIds } },
      });
      await prisma.rewardCatalogItem.deleteMany({
        where: { id: { in: createdRewardIds } },
      });
      await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
      await prisma.term.deleteMany({ where: { id: { in: createdTermIds } } });
      await prisma.academicYear.deleteMany({
        where: { id: { in: createdAcademicYearIds } },
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

  it('school A cannot read school B reward catalog items', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBRewardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A catalog list does not include school B items', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .query({
        search: testSuffix,
        includeArchived: true,
        includeDeleted: true,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoRewardId);
    expect(ids).toContain(demoPublishedRewardId);
    expect(ids).not.toContain(tenantBRewardId);
    expect(ids).not.toContain(tenantBArchivedRewardId);
    expect(ids).not.toContain(tenantBDeletedRewardId);
  });

  it('school A cannot create rewards using school B references', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(catalogPayload({ academicYearId: tenantBYearId, termId: null }))
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(catalogPayload({ academicYearId: null, termId: tenantBTermId }))
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(catalogPayload({ imageFileId: tenantBFileId }))
      .expect(404);
  });

  it('school A cannot update, publish, or archive school B rewards', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBRewardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: 'Leaked reward' })
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBRewardId}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBRewardId}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'No leak' })
      .expect(404);
  });

  it('same-school actors without view permission get 403 for list and detail', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${demoRewardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('same-school actors without manage permission get 403 for catalog mutations', async () => {
    const { accessToken } = await login(viewOnlyEmail);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(catalogPayload({ titleEn: `${testSuffix}-view-only-create` }))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${demoRewardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: `${testSuffix}-view-only-update` })
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${demoRewardId}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${demoPublishedRewardId}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Forbidden' })
      .expect(403);
  });

  it('admin can create, update, publish, and archive a reward without redemption or XP writes', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const before = await catalogSideEffectCounts();

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        catalogPayload({
          titleEn: `${testSuffix}-api-admin-catalog`,
          isUnlimited: false,
          stockQuantity: 3,
          stockRemaining: 3,
        }),
      )
      .expect(201);
    createdRewardIds.push(created.body.id);

    expect(created.body).toMatchObject({
      status: 'draft',
      type: 'physical',
      stockQuantity: 3,
      stockRemaining: 3,
      isAvailable: false,
    });

    const updated = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ stockRemaining: 2, sortOrder: 7 })
      .expect(200);
    expect(updated.body).toMatchObject({
      stockRemaining: 2,
      sortOrder: 7,
    });

    const published = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${created.body.id}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
    expect(published.body).toMatchObject({
      status: 'published',
      publishedById: expect.any(String),
      isAvailable: true,
    });

    const archived = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${created.body.id}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Security closeout' })
      .expect(201);
    expect(archived.body).toMatchObject({
      status: 'archived',
      archivedById: expect.any(String),
      isAvailable: false,
    });

    const after = await catalogSideEffectCounts();
    expect(after.rewardRedemptions).toBe(before.rewardRedemptions);
    expect(after.xpLedger).toBe(before.xpLedger);
  });

  it('teacher can view catalog but cannot manage it', async () => {
    const { accessToken } = await login(teacherEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${demoRewardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(catalogPayload({ titleEn: `${testSuffix}-teacher-forbidden` }))
      .expect(403);
  });

  it('parent and student actors cannot access dashboard reward catalog endpoints', async () => {
    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    }
  });

  it('cross-school archived and soft-deleted rewards do not leak existence', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBArchivedRewardId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBDeletedRewardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .query({ status: 'archived', includeDeleted: true, search: testSuffix })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(tenantBArchivedRewardId);
    expect(ids).not.toContain(tenantBDeletedRewardId);
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
        firstName: 'Rewards',
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

  async function createAcademicFixture(suffix: string, schoolId: string) {
    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-year-${suffix}-ar`,
        nameEn: `${testSuffix}-year-${suffix}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    createdAcademicYearIds.push(year.id);

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        nameAr: `${testSuffix}-term-${suffix}-ar`,
        nameEn: `${testSuffix}-term-${suffix}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

    return { yearId: year.id, termId: term.id };
  }

  async function createFileFixture(
    schoolId: string,
    organizationId: string,
    name: string,
  ): Promise<string> {
    const file = await prisma.file.create({
      data: {
        schoolId,
        organizationId,
        bucket: 'rewards-security',
        objectKey: `${testSuffix}-${name}`,
        originalName: name,
        mimeType: 'image/png',
        sizeBytes: BigInt(256),
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    createdFileIds.push(file.id);
    return file.id;
  }

  async function createRewardFixture(params: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    imageFileId: string;
    suffix: string;
    status: RewardCatalogItemStatus;
    deletedAt?: Date | null;
  }): Promise<string> {
    const item = await prisma.rewardCatalogItem.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        imageFileId: params.imageFileId,
        titleEn: `${testSuffix}-${params.suffix}`,
        type: RewardCatalogItemType.PHYSICAL,
        status: params.status,
        minTotalXp: 10,
        isUnlimited: true,
        deletedAt: params.deletedAt ?? null,
        ...(params.status === RewardCatalogItemStatus.PUBLISHED
          ? { publishedAt: new Date() }
          : {}),
        ...(params.status === RewardCatalogItemStatus.ARCHIVED
          ? { archivedAt: new Date() }
          : {}),
      },
      select: { id: true },
    });
    createdRewardIds.push(item.id);
    return item.id;
  }

  function catalogPayload(
    overrides?: Partial<{
      academicYearId: string | null;
      termId: string | null;
      titleEn: string;
      imageFileId: string | null;
      isUnlimited: boolean;
      stockQuantity: number;
      stockRemaining: number;
    }>,
  ) {
    return {
      academicYearId:
        overrides && 'academicYearId' in overrides
          ? overrides.academicYearId
          : demoYearId,
      termId:
        overrides && 'termId' in overrides ? overrides.termId : demoTermId,
      titleEn: overrides?.titleEn ?? `${testSuffix}-api-reward`,
      type: 'physical',
      minTotalXp: 10,
      isUnlimited: overrides?.isUnlimited ?? true,
      stockQuantity: overrides?.stockQuantity,
      stockRemaining: overrides?.stockRemaining,
      imageFileId:
        overrides && 'imageFileId' in overrides
          ? overrides.imageFileId
          : demoFileId,
    };
  }

  async function catalogSideEffectCounts() {
    const [rewardRedemptions, xpLedger] = await Promise.all([
      prisma.rewardRedemption.count(),
      prisma.xpLedger.count(),
    ]);

    return { rewardRedemptions, xpLedger };
  }

  async function cleanupTenantSchool(schoolId: string): Promise<void> {
    await prisma.rewardRedemption.deleteMany({ where: { schoolId } });
    await prisma.rewardCatalogItem.deleteMany({ where: { schoolId } });
    await prisma.xpLedger.deleteMany({ where: { schoolId } });
    await prisma.file.deleteMany({ where: { schoolId } });
    await prisma.term.deleteMany({ where: { schoolId } });
    await prisma.academicYear.deleteMany({ where: { schoolId } });
  }
});
