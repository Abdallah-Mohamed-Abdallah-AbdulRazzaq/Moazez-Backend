import { readFileSync } from 'node:fs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CommunicationNotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { ExpireDismissalRequestsUseCase } from '../../src/modules/dismissal/requests/application/expire-dismissal-requests.use-case';
import { DismissalRequestExpiryWorker } from '../../src/modules/dismissal/requests/worker/dismissal-request-expiry.worker';

const GLOBAL_PREFIX = '/api/v1';

jest.setTimeout(60_000);

describe('DISMISSAL-EXPIRY-1A tenancy and worker security', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

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
    await app?.close();
    await prisma?.$disconnect();
  });

  it('registers the expiry worker internally without adding public routes', async () => {
    expect(app.get(ExpireDismissalRequestsUseCase)).toBeDefined();
    expect(app.get(DismissalRequestExpiryWorker)).toBeDefined();

    for (const route of [
      `${GLOBAL_PREFIX}/dismissal/requests/expire`,
      `${GLOBAL_PREFIX}/dismissal/requests/expiry`,
      `${GLOBAL_PREFIX}/dismissal/expiry`,
      `${GLOBAL_PREFIX}/jobs/dismissal-expiry`,
      `${GLOBAL_PREFIX}/pickup`,
      `${GLOBAL_PREFIX}/waiting-students`,
    ]) {
      expect(
        [401, 404].includes(
          (await request(app.getHttpServer()).get(route)).status,
        ),
      ).toBe(true);
      expect(
        [401, 404].includes(
          (await request(app.getHttpServer()).post(route).send({})).status,
        ),
      ).toBe(true);
    }
  });

  it('adds only the allowed expiry settings field and expired notification enum', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    const migrationSource = readFileSync(
      'prisma/migrations/20260706140000_dismissal_expiry_threshold/migration.sql',
      'utf8',
    );

    expect(schemaSource).toContain(
      'expiryThresholdMinutes        Int      @default(180) @map("expiry_threshold_minutes")',
    );
    expect(schemaSource).toContain('DISMISSAL_REQUEST_EXPIRED');
    expect(schemaSource).not.toMatch(/model\s+DismissalRequestExpiry/);
    expect(schemaSource).not.toMatch(/model\s+DismissalRequestOutbox/);
    expect(schemaSource).not.toMatch(
      /enum\s+AppDeviceTokenSurface\s+\{[\s\S]*DISMISSAL_STAFF/,
    );
    expect(Object.values(CommunicationNotificationType)).toContain(
      'DISMISSAL_REQUEST_EXPIRED',
    );

    expect(migrationSource).toContain('"expiry_threshold_minutes"');
    expect(migrationSource).toContain('DISMISSAL_REQUEST_EXPIRED');
    expect(migrationSource).not.toMatch(/CREATE\s+TABLE/i);
    expect(migrationSource).not.toContain('app_device_tokens');
    expect(migrationSource).not.toContain('permissions');
  });

  it('keeps permissions and role seeds unchanged for expiry', async () => {
    const permissionRows = await prisma.permission.findMany({
      where: {
        OR: [
          { code: { contains: 'expiry' } },
          { code: { contains: 'expire' } },
        ],
      },
      select: { code: true },
    });
    expect(permissionRows).toEqual([]);

    const permissionSeed = readFileSync(
      'prisma/seeds/01-permissions.seed.ts',
      'utf8',
    );
    const roleSeed = readFileSync('prisma/seeds/02-system-roles.seed.ts', 'utf8');
    for (const source of [permissionSeed, roleSeed]) {
      expect(source).not.toContain('dismissal.requests.expire');
      expect(source).not.toContain('dismissal.expiry');
      expect(source).not.toContain('parent.smart_pickup.expire');
      expect(source).not.toContain('AppDeviceTokenSurface.DISMISSAL_STAFF');
    }

    const parentPermissions = await rolePermissionCodes('parent');
    expect(parentPermissions.some((code) => code.startsWith('dismissal.'))).toBe(
      false,
    );
    expect(parentPermissions).not.toEqual(
      expect.arrayContaining(['dismissal.requests.view']),
    );
  });

  it('keeps runtime source free of forbidden expiry surfaces and broad architecture changes', () => {
    const routeInventory = readFileSync(
      'src/modules/dismissal/requests/controller/dismissal-requests.controller.ts',
      'utf8',
    );
    const workerSource = readFileSync(
      'src/modules/dismissal/requests/worker/dismissal-request-expiry.worker.ts',
      'utf8',
    );
    const repositorySource = readFileSync(
      'src/modules/dismissal/requests/infrastructure/dismissal-requests-expiry.repository.ts',
      'utf8',
    );
    const communicationSource = readFileSync(
      'src/modules/communication/domain/communication-notification-domain.ts',
      'utf8',
    );

    expect(routeInventory).not.toContain('expire');
    expect(routeInventory).not.toContain('expiry');
    expect(workerSource).toContain("'* * * * *'");
    expect(workerSource).toContain("process.env.NODE_ENV === 'test'");
    expect(repositorySource).toContain('dismissal.request.expired');
    expect(repositorySource).toContain('actorUserId: null');
    expect(repositorySource).toContain('UserType.SERVICE_ACCOUNT');
    expect(repositorySource).not.toContain('parentLatitude');
    expect(repositorySource).not.toContain('parentLongitude');
    expect(repositorySource).not.toContain('pickupCodeHash');
    expect(communicationSource).toContain(
      "request_expired: 'DISMISSAL_REQUEST_EXPIRED'",
    );
  });

  async function rolePermissionCodes(roleKey: string): Promise<string[]> {
    const role = await prisma.role.findFirst({
      where: { key: roleKey, schoolId: null, isSystem: true },
      select: {
        rolePermissions: {
          select: {
            permission: { select: { code: true } },
          },
        },
      },
    });
    if (!role) throw new Error(`${roleKey} system role not found - run seed.`);
    return role.rolePermissions.map((item) => item.permission.code).sort();
  }
});
