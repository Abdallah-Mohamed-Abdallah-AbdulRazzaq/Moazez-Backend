import { readFileSync, readdirSync } from 'node:fs';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import 'reflect-metadata';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../src/common/guards/scope-resolver.guard';
import { ParentSmartPickupController } from '../../src/modules/parent-app/smart-pickup/controller/parent-smart-pickup.controller';

describe('PARENT-DISMISSAL-1D Parent Smart Pickup contract hardening (security)', () => {
  it('keeps exact Parent Smart Pickup route permission metadata', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        ParentSmartPickupController.prototype.getReadiness,
      ),
    ).toEqual(['parent.smart_pickup.view']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        ParentSmartPickupController.prototype.createRequest,
      ),
    ).toEqual(['parent.smart_pickup.request']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        ParentSmartPickupController.prototype.listRecentCalls,
      ),
    ).toEqual(['parent.smart_pickup.view']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        ParentSmartPickupController.prototype.cancelRequest,
      ),
    ).toEqual(['parent.smart_pickup.cancel']);
  });

  it('keeps the required JwtAuth, ScopeResolver, Permissions guard chain', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ParentSmartPickupController)).toEqual([
      JwtAuthGuard,
      ScopeResolverGuard,
      PermissionsGuard,
    ]);
  });

  it('does not add permissions, role grants, schema, migrations, or device-token surfaces', () => {
    const permissionsSeed = readFileSync(
      `${process.cwd()}/prisma/seeds/01-permissions.seed.ts`,
      'utf8',
    );
    const rolesSeed = readFileSync(
      `${process.cwd()}/prisma/seeds/02-system-roles.seed.ts`,
      'utf8',
    );
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    const parentPermissions = extractConstStringArray(
      rolesSeed,
      'PARENT_PERMISSIONS',
    );
    const dismissalStaffPermissions = extractConstStringArray(
      rolesSeed,
      'DISMISSAL_STAFF_PERMISSIONS',
    );
    const teacherPermissions = extractConstStringArray(
      rolesSeed,
      'TEACHER_PERMISSIONS',
    );
    const studentPermissions = extractConstStringArray(
      rolesSeed,
      'STUDENT_PERMISSIONS',
    );

    expect(permissionsSeed).toContain("code: 'parent.smart_pickup.view'");
    expect(permissionsSeed).toContain("code: 'parent.smart_pickup.request'");
    expect(permissionsSeed).toContain("code: 'parent.smart_pickup.cancel'");
    expect(permissionsSeed).not.toContain('parent.smart_pickup.resend');
    expect(permissionsSeed).not.toContain('parent.smart_pickup.rotate');
    expect(parentPermissions).toEqual(
      expect.arrayContaining([
        'parent.smart_pickup.view',
        'parent.smart_pickup.request',
        'parent.smart_pickup.cancel',
      ]),
    );
    expect(parentPermissions.some((code) => code.startsWith('dismissal.'))).toBe(
      false,
    );

    for (const permissions of [
      dismissalStaffPermissions,
      teacherPermissions,
      studentPermissions,
    ]) {
      expect(permissions).not.toContain('parent.smart_pickup.view');
      expect(permissions).not.toContain('parent.smart_pickup.request');
      expect(permissions).not.toContain('parent.smart_pickup.cancel');
    }

    expect(schemaSource).toMatch(/model\s+DismissalRequest\b/);
    expect(schemaSource).not.toMatch(/model\s+ParentSmartPickup/);
    expect(schemaSource).not.toMatch(/model\s+PickupDelegateInvitation/);
    expect(schemaSource).not.toMatch(/model\s+PickupCodeRotation/);
    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).not.toContain('DISMISSAL_STAFF');

    const migrationNames = readdirSync('prisma/migrations');
    expect(
      migrationNames.some((name) =>
        name.includes('parent_dismissal_1d') ||
        name.includes('smart_pickup_contract') ||
        name.includes('pickup_polish'),
      ),
    ).toBe(false);
  });

  it('keeps forbidden route expansions and Parent App token internals out of source', () => {
    const parentSmartPickupSource = readSource(
      'src/modules/parent-app/smart-pickup',
    );
    const parentModuleSource = readFileSync(
      'src/modules/parent-app/parent-app.module.ts',
      'utf8',
    );
    const combinedSource = `${parentSmartPickupSource}\n${parentModuleSource}`;

    expect(combinedSource).toContain("@Controller('parent/smart-pickup')");
    expect(combinedSource).not.toContain("Post('requests/:id/resend-code')");
    expect(combinedSource).not.toContain("Post('requests/:id/rotate-code')");
    expect(combinedSource).not.toContain("Post('requests/:id/qr')");
    expect(combinedSource).not.toContain("Controller('pickup')");
    expect(combinedSource).not.toContain("Controller('waiting-students')");
    expect(combinedSource).not.toContain("Controller('notifications')");
    expect(combinedSource).not.toContain('pickupRecipientToken');
    expect(combinedSource).not.toContain('handoverReceiverName');
    expect(combinedSource).not.toContain('handoverReceiverRelation');
  });
});

function readSource(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return [readSource(path)];
      if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];
      return [readFileSync(path, 'utf8')];
    })
    .join('\n');
}

function extractConstStringArray(source: string, constName: string): string[] {
  const match = source.match(
    new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm'),
  );
  if (!match) {
    throw new Error(`Could not locate ${constName}`);
  }

  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}
