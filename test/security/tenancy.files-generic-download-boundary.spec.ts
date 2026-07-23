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
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { FilesRepository } from '../../src/modules/files/uploads/infrastructure/files.repository';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'FilesBoundary0B123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type ActorLabel =
  | 'school-admin'
  | 'organization-admin'
  | 'custom-management'
  | 'student'
  | 'parent'
  | 'teacher'
  | 'applicant'
  | 'platform';

jest.setTimeout(60000);

describe('Generic Files download actor boundary (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let filesRepository: FilesRepository;
  let findScopedFileByIdSpy: jest.SpyInstance;
  let createDownloadUrlMock: jest.MockedFunction<
    StorageService['createDownloadUrl']
  >;

  const marker = `files-0b-${randomUUID().slice(0, 8)}`;
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const fileIds: string[] = [];
  const schoolIds: string[] = [];
  const organizationIds: string[] = [];
  const emails = new Map<ActorLabel, string>();
  const tokens = new Map<ActorLabel, string>();

  let schoolAId = '';
  let organizationAId = '';
  let liveSchoolAFileId = '';
  let crossSchoolFileId = '';
  let deletedSchoolAFileId = '';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [downloadPermission, schoolAdminRole, organizationAdminRole] =
      await Promise.all([
        prisma.permission.findUnique({
          where: { code: 'files.downloads.view' },
          select: { id: true },
        }),
        prisma.role.findFirst({
          where: { key: 'school_admin', schoolId: null, isSystem: true },
          select: {
            id: true,
            rolePermissions: {
              where: { permission: { code: 'files.downloads.view' } },
              select: { permissionId: true },
            },
          },
        }),
        prisma.role.findFirst({
          where: {
            key: 'organization_admin',
            schoolId: null,
            isSystem: true,
          },
          select: {
            id: true,
            rolePermissions: {
              where: { permission: { code: 'files.downloads.view' } },
              select: { permissionId: true },
            },
          },
        }),
      ]);

    if (
      !downloadPermission ||
      !schoolAdminRole ||
      schoolAdminRole.rolePermissions.length !== 1 ||
      !organizationAdminRole ||
      organizationAdminRole.rolePermissions.length !== 1
    ) {
      throw new Error('Required seeded Files roles and permission are missing');
    }

    const organizationA = await prisma.organization.create({
      data: {
        name: `${marker} Organization A`,
        slug: `${marker}-organization-a`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationAId = organizationA.id;
    organizationIds.push(organizationA.id);

    const organizationB = await prisma.organization.create({
      data: {
        name: `${marker} Organization B`,
        slug: `${marker}-organization-b`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationIds.push(organizationB.id);

    const schoolA = await prisma.school.create({
      data: {
        organizationId: organizationA.id,
        name: `${marker} School A`,
        slug: `${marker}-school-a`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolAId = schoolA.id;
    schoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: {
        organizationId: organizationB.id,
        name: `${marker} School B`,
        slug: `${marker}-school-b`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolIds.push(schoolB.id);

    const downloadOnlyRole = await prisma.role.create({
      data: {
        schoolId: schoolA.id,
        key: `${marker}-download-only`,
        name: `${marker} Download Only`,
        isSystem: false,
        rolePermissions: {
          create: { permissionId: downloadPermission.id },
        },
      },
      select: { id: true },
    });
    roleIds.push(downloadOnlyRole.id);

    const passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
    await createUser({
      label: 'school-admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      passwordHash,
    });
    await createUser({
      label: 'organization-admin',
      userType: UserType.ORGANIZATION_USER,
      roleId: organizationAdminRole.id,
      passwordHash,
    });
    await createUser({
      label: 'custom-management',
      userType: UserType.SCHOOL_USER,
      roleId: downloadOnlyRole.id,
      passwordHash,
    });
    await createUser({
      label: 'student',
      userType: UserType.STUDENT,
      roleId: downloadOnlyRole.id,
      passwordHash,
    });
    await createUser({
      label: 'parent',
      userType: UserType.PARENT,
      roleId: downloadOnlyRole.id,
      passwordHash,
    });
    await createUser({
      label: 'teacher',
      userType: UserType.TEACHER,
      roleId: downloadOnlyRole.id,
      passwordHash,
    });
    await createUser({
      label: 'applicant',
      userType: UserType.APPLICANT,
      roleId: downloadOnlyRole.id,
      passwordHash,
    });
    await createUser({
      label: 'platform',
      userType: UserType.PLATFORM_USER,
      passwordHash,
    });

    liveSchoolAFileId = await createFile({
      organizationId: organizationA.id,
      schoolId: schoolA.id,
      objectKey: `${marker}/school-a/live`,
    });
    crossSchoolFileId = await createFile({
      organizationId: organizationB.id,
      schoolId: schoolB.id,
      objectKey: `${marker}/school-b/live`,
    });
    deletedSchoolAFileId = await createFile({
      organizationId: organizationA.id,
      schoolId: schoolA.id,
      objectKey: `${marker}/school-a/deleted`,
      deletedAt: new Date(),
    });

    createDownloadUrlMock = jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/signed-download',
      expiresAt: new Date('2026-07-23T12:05:00.000Z'),
    });
    const storageService = {
      createDownloadUrl: createDownloadUrlMock,
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(storageService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    filesRepository = moduleRef.get(FilesRepository);
    findScopedFileByIdSpy = jest.spyOn(filesRepository, 'findScopedFileById');

    for (const label of emails.keys()) {
      tokens.set(label, await login(label));
    }
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: userIds } },
              { schoolId: { in: schoolIds } },
              { organizationId: { in: organizationIds } },
            ],
          },
        });
        await prisma.file.deleteMany({ where: { id: { in: fileIds } } });
        await prisma.membership.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
        await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
        await prisma.organization.deleteMany({
          where: { id: { in: organizationIds } },
        });
      }
      if (app) await app.close();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it.each<ActorLabel>([
    'school-admin',
    'organization-admin',
    'custom-management',
  ])('allows %s with a selected school and permission', async (label) => {
    createDownloadUrlMock.mockClear();
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${liveSchoolAFileId}/download`)
      .set('Authorization', bearer(label))
      .redirects(0)
      .expect(307);

    expect(response.headers.location).toBe(
      'https://storage.invalid/signed-download',
    );
    expect(createDownloadUrlMock).toHaveBeenCalledTimes(1);
    expect(createDownloadUrlMock).toHaveBeenCalledWith({
      bucket: `${marker}-private`,
      objectKey: `${marker}/school-a/live`,
      expiresInSeconds: 300,
      disposition: 'attachment',
      downloadFileName: 'synthetic.txt',
    });
  });

  it('denies every app actor and platform actor before File lookup', async () => {
    findScopedFileByIdSpy.mockClear();

    for (const label of [
      'student',
      'parent',
      'teacher',
      'applicant',
      'platform',
    ] as const) {
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/files/${liveSchoolAFileId}/download`)
        .set('Authorization', bearer(label))
        .expect(403);

      const body = response.body as { error: { code: string } };
      expect(body.error).toMatchObject({
        code: 'auth.scope.missing',
      });
    }

    expect(findScopedFileByIdSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['cross-school', () => crossSchoolFileId],
    ['soft-deleted', () => deletedSchoolAFileId],
    ['missing', () => randomUUID()],
  ])(
    'returns a safe details-free 404 for a %s File',
    async (_case, getFileId) => {
      const fileId = getFileId();
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/files/${fileId}/download`)
        .set('Authorization', bearer('school-admin'))
        .expect(404);

      const body = response.body as {
        error: {
          code: string;
          message: string;
          details?: Record<string, unknown>;
        };
      };
      expect(body.error).toMatchObject({
        code: 'files.not_found',
        message: 'File not found or not accessible',
      });
      expect(body.error.details).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(fileId);
    },
  );

  async function createUser(input: {
    label: ActorLabel;
    userType: UserType;
    roleId?: string;
    passwordHash: string;
  }): Promise<void> {
    const email = `${marker}-${input.label}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Files0B',
        lastName: input.label,
        userType: input.userType,
        status: UserStatus.ACTIVE,
        passwordHash: input.passwordHash,
        passwordChangedAt: new Date(),
        credentialVersion: 1,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    emails.set(input.label, email);

    if (input.roleId) {
      await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: organizationAId,
          schoolId: schoolAId,
          roleId: input.roleId,
          userType: input.userType,
          status: MembershipStatus.ACTIVE,
        },
      });
    }
  }

  async function createFile(input: {
    organizationId: string;
    schoolId: string;
    objectKey: string;
    deletedAt?: Date;
  }): Promise<string> {
    const file = await prisma.file.create({
      data: {
        organizationId: input.organizationId,
        schoolId: input.schoolId,
        bucket: `${marker}-private`,
        objectKey: input.objectKey,
        originalName: 'synthetic.txt',
        mimeType: 'text/plain',
        sizeBytes: BigInt(1),
        visibility: FileVisibility.PRIVATE,
        deletedAt: input.deletedAt,
      },
      select: { id: true },
    });
    fileIds.push(file.id);
    return file.id;
  }

  async function login(label: ActorLabel): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: emails.get(label), password: PASSWORD })
      .expect(200);

    const body = response.body as { accessToken: string };
    return body.accessToken;
  }

  function bearer(label: ActorLabel): string {
    return `Bearer ${tokens.get(label)}`;
  }
});
