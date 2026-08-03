import { readFileSync } from 'node:fs';
import { CommunicationNotificationType, PrismaClient } from '@prisma/client';

describe('DISMISSAL-EXPIRY-1A tenancy and worker security', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('keeps the expiry worker out of the API graph without adding public routes', () => {
    const apiModuleSource = readFileSync(
      'src/modules/dismissal/dismissal.module.ts',
      'utf8',
    );
    const routeSource = readFileSync(
      'src/modules/dismissal/requests/controller/dismissal-requests.controller.ts',
      'utf8',
    );

    expect(apiModuleSource).not.toContain('DismissalRequestExpiryWorker');
    expect(apiModuleSource).not.toContain('ExpireDismissalRequestsUseCase');
    expect(routeSource).not.toContain('expire');
    expect(routeSource).not.toContain('expiry');
  });

  it('adds only the allowed expiry settings field and expired notification enum', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    const migrationSource = readFileSync(
      'prisma/migrations/20260710135222_baseline_v1/migration.sql',
      'utf8',
    );

    expect(schemaSource).toContain(
      'expiryThresholdMinutes        Int      @default(180) @map("expiry_threshold_minutes")',
    );
    expect(schemaSource).toContain('DISMISSAL_REQUEST_EXPIRED');
    expect(schemaSource).not.toMatch(/model\s+DismissalRequestExpiry/);
    expect(schemaSource).not.toMatch(/model\s+DismissalRequestOutbox/);
    expect(schemaSource).toMatch(
      /enum\s+AppDeviceTokenSurface\s+\{[\s\S]*DISMISSAL_STAFF/,
    );
    expect(Object.values(CommunicationNotificationType)).toContain(
      'DISMISSAL_REQUEST_EXPIRED',
    );

    expect(migrationSource).toContain('"expiry_threshold_minutes"');
    expect(migrationSource).toContain('DISMISSAL_REQUEST_EXPIRED');
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
      expect(source).not.toContain('dismissal.requests.expire');
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
    const scheduleSource = readFileSync(
      'src/runtime/maintenance-scheduler/dismissal-expiry.schedule.ts',
      'utf8',
    );
    const scheduleConstantsSource = readFileSync(
      'src/modules/dismissal/requests/domain/dismissal-request-expiry.constants.ts',
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
    expect(workerSource).not.toContain('registerRepeatJob');
    expect(scheduleSource).toContain('registerRepeatJob');
    expect(scheduleConstantsSource).toContain("'* * * * *'");
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
