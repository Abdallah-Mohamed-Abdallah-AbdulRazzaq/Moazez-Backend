import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FileVisibility,
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
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';

const LIMITED_USER_EMAIL = 'files-viewer@security.moazez.local';
const LIMITED_USER_PASSWORD = 'FilesViewer123!';
const LIMITED_ROLE_KEY = 'files_security_limited_role';
const ATTACHMENT_RESOURCE_TYPE = 'admissions.application';
const IMPORT_JOB_TYPE = 'students_basic';
const DEMO_ATTACHMENT_RESOURCE_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_B_ATTACHMENT_RESOURCE_ID = '22222222-2222-4222-8222-222222222222';

const TENANT_B_ORG_SLUG = 'files-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'files-tenancy-school-b';
const TENANT_B_ADMIN_EMAIL = 'admin-b@files-tenancy.moazez.local';
const TENANT_B_ADMIN_PASSWORD = 'FilesB123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

describe('Files tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let schoolAdminRoleId: string;
  let limitedRoleId: string;
  let limitedUserId: string;

  let tenantBSchoolId: string;
  let tenantBUserId: string;

  let demoFileId: string;
  let demoFileBucket: string;
  let demoFileObjectKey: string;

  let tenantBFileId: string;
  let tenantBFileBucket: string;
  let tenantBFileObjectKey: string;
  let demoAttachmentId: string;
  let tenantBAttachmentId: string;
  let demoImportJobId: string;
  let tenantBImportJobId: string;

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

    const [schoolAdminRole, downloadPermission, importManagePermission, importViewPermission] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.permission.upsert({
        where: { code: 'files.downloads.view' },
        update: {
          module: 'files',
          resource: 'downloads',
          action: 'view',
          description: 'Download private files through the secure files endpoint',
        },
        create: {
          code: 'files.downloads.view',
          module: 'files',
          resource: 'downloads',
          action: 'view',
          description: 'Download private files through the secure files endpoint',
        },
        select: { id: true },
      }),
      prisma.permission.upsert({
        where: { code: 'files.imports.manage' },
        update: {
          module: 'files',
          resource: 'imports',
          action: 'manage',
          description: 'Create file import jobs',
        },
        create: {
          code: 'files.imports.manage',
          module: 'files',
          resource: 'imports',
          action: 'manage',
          description: 'Create file import jobs',
        },
        select: { id: true },
      }),
      prisma.permission.upsert({
        where: { code: 'files.imports.view' },
        update: {
          module: 'files',
          resource: 'imports',
          action: 'view',
          description: 'View import job status and validation reports',
        },
        create: {
          code: 'files.imports.view',
          module: 'files',
          resource: 'imports',
          action: 'view',
          description: 'View import job status and validation reports',
        },
        select: { id: true },
      }),
    ]);

    if (!schoolAdminRole) {
      throw new Error('school_admin system role not found - run `npm run seed` first.');
    }
    schoolAdminRoleId = schoolAdminRole.id;

    await prisma.rolePermission.createMany({
      data: [
        {
          roleId: schoolAdminRoleId,
          permissionId: downloadPermission.id,
        },
        {
          roleId: schoolAdminRoleId,
          permissionId: importManagePermission.id,
        },
        {
          roleId: schoolAdminRoleId,
          permissionId: importViewPermission.id,
        },
      ],
      skipDuplicates: true,
    });

    const existingLimitedRole = await prisma.role.findFirst({
      where: {
        schoolId: demoSchoolId,
        key: LIMITED_ROLE_KEY,
      },
      select: { id: true },
    });

    if (existingLimitedRole) {
      limitedRoleId = existingLimitedRole.id;
      await prisma.rolePermission.deleteMany({
        where: { roleId: limitedRoleId },
      });
    } else {
      const createdRole = await prisma.role.create({
        data: {
          schoolId: demoSchoolId,
          key: LIMITED_ROLE_KEY,
          name: 'Files Security Limited',
          description: 'Same-school user without file download access',
          isSystem: false,
        },
      });
      limitedRoleId = createdRole.id;
    }

    const limitedUserPasswordHash = await argon2.hash(
      LIMITED_USER_PASSWORD,
      ARGON2_OPTIONS,
    );
    const limitedUser = await prisma.user.upsert({
      where: { email: LIMITED_USER_EMAIL },
      update: {
        firstName: 'Files',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: limitedUserPasswordHash,
      },
      create: {
        email: LIMITED_USER_EMAIL,
        firstName: 'Files',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: limitedUserPasswordHash,
      },
    });
    limitedUserId = limitedUser.id;

    const existingLimitedMembership = await prisma.membership.findFirst({
      where: {
        userId: limitedUser.id,
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
          userId: limitedUser.id,
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
        name: 'Files Tenancy Org B',
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
        name: 'Files Tenancy School B',
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
        userId: adminB.id,
        organizationId: orgB.id,
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
          userId: adminB.id,
          organizationId: orgB.id,
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

    storageService = app.get(StorageService);

    const demoObject = await storageService.saveObject({
      objectKey: `security/${demoSchoolId}/file-a.txt`,
      body: Buffer.from('tenant-a-file'),
      visibility: FileVisibility.PRIVATE,
      contentType: 'text/plain',
    });
    demoFileBucket = demoObject.bucket;
    demoFileObjectKey = `security/${demoSchoolId}/file-a.txt`;

    const demoFile = await prisma.file.create({
      data: {
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        uploaderId: null,
        bucket: demoFileBucket,
        objectKey: demoFileObjectKey,
        originalName: 'tenant-a-file.txt',
        mimeType: 'text/plain',
        sizeBytes: BigInt(Buffer.byteLength('tenant-a-file')),
        checksumSha256: null,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    demoFileId = demoFile.id;
    const demoAttachment = await prisma.attachment.create({
      data: {
        fileId: demoFileId,
        schoolId: demoSchoolId,
        resourceType: ATTACHMENT_RESOURCE_TYPE,
        resourceId: DEMO_ATTACHMENT_RESOURCE_ID,
        createdById: null,
      },
      select: { id: true },
    });
    demoAttachmentId = demoAttachment.id;

    const tenantBObject = await storageService.saveObject({
      objectKey: `security/${tenantBSchoolId}/file-b.txt`,
      body: Buffer.from('tenant-b-file'),
      visibility: FileVisibility.PRIVATE,
      contentType: 'text/plain',
    });
    tenantBFileBucket = tenantBObject.bucket;
    tenantBFileObjectKey = `security/${tenantBSchoolId}/file-b.txt`;

    const tenantBFile = await prisma.file.create({
      data: {
        organizationId: orgB.id,
        schoolId: tenantBSchoolId,
        uploaderId: tenantBUserId,
        bucket: tenantBFileBucket,
        objectKey: tenantBFileObjectKey,
        originalName: 'tenant-b-file.txt',
        mimeType: 'text/plain',
        sizeBytes: BigInt(Buffer.byteLength('tenant-b-file')),
        checksumSha256: null,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    tenantBFileId = tenantBFile.id;
    const tenantBAttachment = await prisma.attachment.create({
      data: {
        fileId: tenantBFileId,
        schoolId: tenantBSchoolId,
        resourceType: ATTACHMENT_RESOURCE_TYPE,
        resourceId: TENANT_B_ATTACHMENT_RESOURCE_ID,
        createdById: tenantBUserId,
      },
      select: { id: true },
    });
    tenantBAttachmentId = tenantBAttachment.id;

    const demoImportJob = await prisma.importJob.create({
      data: {
        schoolId: demoSchoolId,
        uploadedFileId: demoFileId,
        type: IMPORT_JOB_TYPE,
        status: 'COMPLETED',
        reportJson: {
          status: 'COMPLETED',
          summary: { rowCount: null, warningCount: 1, errorCount: 0 },
          file: {
            uploadedFileId: demoFileId,
            originalName: 'tenant-a-file.txt',
            mimeType: 'text/plain',
            sizeBytes: String(Buffer.byteLength('tenant-a-file')),
          },
          rowCount: null,
          warnings: ['Stub validation only. No domain rows were created.'],
          errors: [],
          updatedAt: new Date().toISOString(),
        },
        createdById: null,
      },
      select: { id: true },
    });
    demoImportJobId = demoImportJob.id;

    const tenantBImportJob = await prisma.importJob.create({
      data: {
        schoolId: tenantBSchoolId,
        uploadedFileId: tenantBFileId,
        type: IMPORT_JOB_TYPE,
        status: 'COMPLETED',
        reportJson: {
          status: 'COMPLETED',
          summary: { rowCount: null, warningCount: 1, errorCount: 0 },
          file: {
            uploadedFileId: tenantBFileId,
            originalName: 'tenant-b-file.txt',
            mimeType: 'text/plain',
            sizeBytes: String(Buffer.byteLength('tenant-b-file')),
          },
          rowCount: null,
          warnings: ['Stub validation only. No domain rows were created.'],
          errors: [],
          updatedAt: new Date().toISOString(),
        },
        createdById: tenantBUserId,
      },
      select: { id: true },
    });
    tenantBImportJobId = tenantBImportJob.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.importJob.deleteMany({
        where: {
          id: { in: [demoImportJobId, tenantBImportJobId].filter(Boolean) },
        },
      });
      await prisma.attachment.deleteMany({
        where: {
          id: { in: [demoAttachmentId, tenantBAttachmentId].filter(Boolean) },
        },
      });
      await prisma.file.deleteMany({
        where: { id: { in: [demoFileId, tenantBFileId].filter(Boolean) } },
      });
    }

    if (storageService) {
      await Promise.allSettled([
        demoFileBucket && demoFileObjectKey
          ? storageService.deleteObject({
              bucket: demoFileBucket,
              objectKey: demoFileObjectKey,
            })
          : Promise.resolve(),
        tenantBFileBucket && tenantBFileObjectKey
          ? storageService.deleteObject({
              bucket: tenantBFileBucket,
              objectKey: tenantBFileObjectKey,
            })
          : Promise.resolve(),
      ]);
    }

    if (app) {
      await app.close();
    }

    if (prisma) {
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

  it('returns 404 when school A admin requests a school B file UUID', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${tenantBFileId}/download`)
      .set('Authorization', `Bearer ${accessToken}`)
      .redirects(0)
      .expect(404);

    expect(response.body?.error?.code).toBe('files.not_found');
  });

  it('returns 403 when the same-school actor lacks the download permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${demoFileId}/download`)
      .set('Authorization', `Bearer ${accessToken}`)
      .redirects(0)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 404 when school A admin lists attachments for a school B preview target', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/files/attachments?resourceType=${ATTACHMENT_RESOURCE_TYPE}&resourceId=${TENANT_B_ATTACHMENT_RESOURCE_ID}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin deletes a school B attachment link by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/files/attachments/${tenantBAttachmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 when the same-school actor lacks the admissions preview permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/files/attachments?resourceType=${ATTACHMENT_RESOURCE_TYPE}&resourceId=${DEMO_ATTACHMENT_RESOURCE_ID}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 404 when school A admin requests a school B import job UUID', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/imports/${tenantBImportJobId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin requests a school B import report UUID', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/imports/${tenantBImportJobId}/report`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 when the same-school actor lacks the import view permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/imports/${demoImportJobId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });
});
