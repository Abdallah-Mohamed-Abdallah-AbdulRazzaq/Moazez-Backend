import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import 'reflect-metadata';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../src/common/guards/scope-resolver.guard';
import { DismissalGatesController } from '../../src/modules/dismissal/gates/controller/dismissal-gates.controller';
import { DismissalNotificationsController } from '../../src/modules/dismissal/notifications/controller/dismissal-notifications.controller';
import { DismissalProfileController } from '../../src/modules/dismissal/profile/controller/dismissal-profile.controller';
import { DismissalRequestsController } from '../../src/modules/dismissal/requests/controller/dismissal-requests.controller';
import { DismissalSettingsController } from '../../src/modules/dismissal/settings/controller/dismissal-settings.controller';
import { DismissalStaffAssignmentsController } from '../../src/modules/dismissal/staff-assignments/controller/dismissal-staff-assignments.controller';
import { DismissalWaitingStudentsController } from '../../src/modules/dismissal/waiting-students/controller/dismissal-waiting-students.controller';
import { ParentSmartPickupController } from '../../src/modules/parent-app/smart-pickup/controller/parent-smart-pickup.controller';

const DISMISSAL_CONTROLLERS = [
  DismissalSettingsController,
  DismissalGatesController,
  DismissalProfileController,
  DismissalStaffAssignmentsController,
  DismissalRequestsController,
  DismissalWaitingStudentsController,
  DismissalNotificationsController,
];

describe('DISMISSAL-OPERATIONS-AUDIT-1A production hardening security', () => {
  it('keeps documented Dismissal and Parent Smart Pickup routes guarded', () => {
    for (const controller of [
      ParentSmartPickupController,
      ...DISMISSAL_CONTROLLERS,
    ]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        JwtAuthGuard,
        ScopeResolverGuard,
        PermissionsGuard,
      ]);
    }
  });

  it('keeps route permissions separated between parent and dismissal surfaces', () => {
    const parentPermissions = [
      ParentSmartPickupController.prototype.getReadiness,
      ParentSmartPickupController.prototype.createRequest,
      ParentSmartPickupController.prototype.listRecentCalls,
      ParentSmartPickupController.prototype.cancelRequest,
    ].flatMap((method) => requiredPermissions(method));

    expect(parentPermissions).toEqual([
      'parent.smart_pickup.view',
      'parent.smart_pickup.request',
      'parent.smart_pickup.view',
      'parent.smart_pickup.cancel',
    ]);
    expect(parentPermissions.some((code) => code.startsWith('dismissal.'))).toBe(
      false,
    );

    const dismissalPermissions = [
      DismissalSettingsController.prototype.getSettings,
      DismissalSettingsController.prototype.updateSettings,
      DismissalGatesController.prototype.listGates,
      DismissalGatesController.prototype.createGate,
      DismissalGatesController.prototype.getGate,
      DismissalGatesController.prototype.updateGate,
      DismissalProfileController.prototype.getProfile,
      DismissalStaffAssignmentsController.prototype.listAssignments,
      DismissalStaffAssignmentsController.prototype.createAssignment,
      DismissalStaffAssignmentsController.prototype.getAssignment,
      DismissalStaffAssignmentsController.prototype.updateAssignment,
      DismissalStaffAssignmentsController.prototype.deleteAssignment,
      DismissalRequestsController.prototype.listActiveRequests,
      DismissalRequestsController.prototype.listRequestHistory,
      DismissalRequestsController.prototype.getRequestHistoryDetail,
      DismissalRequestsController.prototype.getRequestDetail,
      DismissalRequestsController.prototype.listPickupRecipients,
      DismissalRequestsController.prototype.updateRequestStatus,
      DismissalRequestsController.prototype.escalateRequest,
      DismissalRequestsController.prototype.deliverRequest,
      DismissalWaitingStudentsController.prototype.listWaitingStudents,
      DismissalWaitingStudentsController.prototype.confirmArrival,
      DismissalNotificationsController.prototype.listNotifications,
      DismissalNotificationsController.prototype.markAllRead,
      DismissalNotificationsController.prototype.markRead,
    ].flatMap((method) => requiredPermissions(method));

    expect(dismissalPermissions).toEqual([
      'dismissal.settings.view',
      'dismissal.settings.manage',
      'dismissal.gates.view',
      'dismissal.gates.manage',
      'dismissal.gates.view',
      'dismissal.gates.manage',
      'dismissal.profile.view',
      'dismissal.staff.view',
      'dismissal.staff.manage',
      'dismissal.staff.view',
      'dismissal.staff.manage',
      'dismissal.staff.manage',
      'dismissal.requests.view',
      'dismissal.requests.history.view',
      'dismissal.requests.history.view',
      'dismissal.requests.view',
      'dismissal.requests.deliver',
      'dismissal.requests.manage',
      'dismissal.requests.escalate',
      'dismissal.requests.deliver',
      'dismissal.requests.view',
      'dismissal.requests.manage',
      'dismissal.notifications.view',
      'dismissal.notifications.manage',
      'dismissal.notifications.manage',
    ]);
    expect(
      dismissalPermissions.some((code) => code.startsWith('parent.smart_pickup.')),
    ).toBe(false);
  });

  it('keeps forbidden public routes and shortcut roots absent', () => {
    const dismissalSource = readSource('src/modules/dismissal');
    const parentSource = readSource('src/modules/parent-app/smart-pickup');
    const combined = `${dismissalSource}\n${parentSource}`;

    for (const forbidden of [
      "Controller('dismissal/expiry')",
      "Controller('dismissal/requests/expiry')",
      "Controller('dismissal/requests/expire')",
      "Get('expiry')",
      "Post('expiry')",
      "Get('expire')",
      "Post('expire')",
      "Controller('pickup')",
      "Controller('waiting-students')",
      "Controller('dismissal/chat')",
      "Controller('dismissal/files')",
      "Controller('dismissal/export')",
      "Post('requests/:id/resend-code')",
      "Post('requests/:id/rotate-code')",
      "Post('delegate-otp')",
      "Post('delegate-qr')",
    ]) {
      expect(combined).not.toContain(forbidden);
    }

    const requestsController = readFileSync(
      'src/modules/dismissal/requests/controller/dismissal-requests.controller.ts',
      'utf8',
    );
    expect(requestsController.indexOf("@Get('history')")).toBeLessThan(
      requestsController.indexOf("@Get(':id')"),
    );
    expect(requestsController.indexOf("@Get('history/:id')")).toBeLessThan(
      requestsController.indexOf("@Get(':id')"),
    );
    const notificationsController = readFileSync(
      'src/modules/dismissal/notifications/controller/dismissal-notifications.controller.ts',
      'utf8',
    );
    expect(notificationsController.indexOf("@Patch('read-all')")).toBeLessThan(
      notificationsController.indexOf("@Patch(':id/read')"),
    );
  });

  it('keeps role and permission seeds free of production-audit additions', () => {
    const permissionSeed = readFileSync(
      'prisma/seeds/01-permissions.seed.ts',
      'utf8',
    );
    const roleSeed = readFileSync('prisma/seeds/02-system-roles.seed.ts', 'utf8');

    expect(permissionSeed).not.toContain('dismissal.requests.expire');
    expect(permissionSeed).not.toContain('dismissal.operations');
    expect(permissionSeed).not.toContain('parent.smart_pickup.expire');
    expect(roleSeed).not.toContain('dismissal.requests.expire');
    expect(roleSeed).not.toContain('dismissal.operations');

    const parentPermissions = extractConstStringArray(roleSeed, 'PARENT_PERMISSIONS');
    const teacherPermissions = extractConstStringArray(roleSeed, 'TEACHER_PERMISSIONS');
    const studentPermissions = extractConstStringArray(roleSeed, 'STUDENT_PERMISSIONS');
    const dismissalStaffPermissions = extractConstStringArray(
      roleSeed,
      'DISMISSAL_STAFF_PERMISSIONS',
    );

    expect(parentPermissions.some((code) => code.startsWith('dismissal.'))).toBe(
      false,
    );
    expect(teacherPermissions.some((code) => code.startsWith('dismissal.'))).toBe(
      false,
    );
    expect(studentPermissions.some((code) => code.startsWith('dismissal.'))).toBe(
      false,
    );
    expect(dismissalStaffPermissions).toEqual(
      expect.arrayContaining([
        'dismissal.requests.view',
        'dismissal.requests.manage',
        'dismissal.requests.deliver',
        'dismissal.requests.escalate',
        'dismissal.requests.history.view',
      ]),
    );
    for (const permissions of [
      teacherPermissions,
      studentPermissions,
      dismissalStaffPermissions,
    ]) {
      expect(permissions).not.toContain('parent.smart_pickup.view');
      expect(permissions).not.toContain('parent.smart_pickup.request');
      expect(permissions).not.toContain('parent.smart_pickup.cancel');
    }
  });

  it('keeps operations hardening migration limited to indexes and excludes outbox expansion', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    const migrationSource = readFileSync(
      'prisma/migrations/20260710135222_baseline_v1/migration.sql',
      'utf8',
    );

    expect(schemaSource).not.toMatch(/model\s+DismissalRequestOutbox/);
    expect(schemaSource).not.toMatch(/model\s+DismissalRealtimeOutbox/);
    expect(schemaSource).not.toMatch(/model\s+DismissalRequestExpiry/);
    expect(schemaSource).toMatch(
      /enum\s+AppDeviceTokenSurface\s+\{[\s\S]*DISMISSAL_STAFF/,
    );
    expect(migrationSource).toContain(
      'dismissal_requests_school_id_requested_by_id_deleted_at_upd_idx',
    );
    expect(migrationSource).toContain(
      'dismissal_requests_school_id_created_at_idx',
    );
  });

  it('keeps production log messages from exposing realtime room names or socket ids', () => {
    const publisherSource = readFileSync(
      'src/infrastructure/realtime/realtime-publisher.service.ts',
      'utf8',
    );
    const gatewaySource = readFileSync(
      'src/infrastructure/realtime/realtime.gateway.ts',
      'utf8',
    );

    expect(publisherSource).not.toContain('in room ${roomName}');
    expect(publisherSource).not.toContain('roomName}:');
    expect(gatewaySource).not.toContain('Rejected realtime socket ${client.id}');
  });

  it('keeps representative presenters free of internal response fields', () => {
    const presenterSource = [
      readSource('src/modules/dismissal/requests/presenter'),
      readSource('src/modules/dismissal/waiting-students/presenter'),
      readSource('src/modules/dismissal/notifications/presenter'),
      readSource('src/modules/parent-app/smart-pickup/presenter'),
    ].join('\n');

    for (const forbidden of [
      'schoolId:',
      'organizationId:',
      'membershipId:',
      'roleId:',
      'guardianId:',
      'studentGuardianId:',
      'requestedById:',
      'actorUserId:',
      'staffUserId:',
      'handedOverById:',
      'assignmentId:',
      'parentLatitude:',
      'parentLongitude:',
      'distanceMeters:',
      'geofencePassed:',
      'clientRequestId:',
      'deletedAt:',
      'pickupCodeHash:',
      'pickupCodeSalt:',
    ]) {
      expect(presenterSource).not.toContain(forbidden);
    }

    expect(presenterSource).not.toContain('metadata: event.metadata');
    expect(presenterSource).not.toContain('metadata: request.metadata');
    expect(presenterSource).not.toContain('rawMetadata');
  });

  it('documents all emitted dismissal and parent smart-pickup error codes', () => {
    const errorCatalog = readFileSync('ERROR_CATALOG.md', 'utf8');
    const runtimeErrorSources = [
      readFileSync('src/modules/dismissal/shared/dismissal.errors.ts', 'utf8'),
      readFileSync(
        'src/modules/parent-app/smart-pickup/application/parent-smart-pickup.errors.ts',
        'utf8',
      ),
    ].join('\n');
    const emittedCodes = [
      ...runtimeErrorSources.matchAll(
        /code:\s*'([^']+)'|super\(\s*'([^']+)'/g,
      ),
    ]
      .map((match) => match[1] ?? match[2])
      .filter((code) => code.startsWith('dismissal.') || code.startsWith('parent.smart_pickup.'))
      .sort();

    for (const code of emittedCodes) {
      expect(errorCatalog).toContain(`\`${code}\``);
    }
  });
});

function requiredPermissions(method: unknown): string[] {
  return Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, method) ?? [];
}

function readSource(directory: string): string {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = join(directory, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) return [readSource(path)];
      if (!stat.isFile() || !entry.endsWith('.ts')) return [];
      return [readFileSync(path, 'utf8')];
    })
    .join('\n');
}

function extractConstStringArray(source: string, constName: string): string[] {
  const match = source.match(
    new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm'),
  );
  if (!match) throw new Error(`Could not locate ${constName}`);

  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}
