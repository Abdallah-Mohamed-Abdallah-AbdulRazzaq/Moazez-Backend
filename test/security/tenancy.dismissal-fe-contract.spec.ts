import { readFileSync, readdirSync } from 'node:fs';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import 'reflect-metadata';
import { REALTIME_SERVER_EVENTS } from '../../src/infrastructure/realtime/realtime-event-names';
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

const EXPECTED_ROUTES = [
  'GET /api/v1/parent/smart-pickup',
  'POST /api/v1/parent/smart-pickup/requests',
  'GET /api/v1/parent/smart-pickup/recent-calls',
  'POST /api/v1/parent/smart-pickup/requests/:id/cancel',
  'GET /api/v1/dismissal/settings',
  'PATCH /api/v1/dismissal/settings',
  'GET /api/v1/dismissal/gates',
  'POST /api/v1/dismissal/gates',
  'GET /api/v1/dismissal/gates/:id',
  'PATCH /api/v1/dismissal/gates/:id',
  'GET /api/v1/dismissal/profile',
  'GET /api/v1/dismissal/staff-assignments',
  'POST /api/v1/dismissal/staff-assignments',
  'GET /api/v1/dismissal/staff-assignments/:id',
  'PATCH /api/v1/dismissal/staff-assignments/:id',
  'DELETE /api/v1/dismissal/staff-assignments/:id',
  'GET /api/v1/dismissal/requests/active',
  'GET /api/v1/dismissal/requests/:id',
  'PATCH /api/v1/dismissal/requests/:id/status',
  'GET /api/v1/dismissal/waiting-students',
  'POST /api/v1/dismissal/waiting-students/:id/arrival',
  'GET /api/v1/dismissal/requests/:id/pickup-recipients',
  'POST /api/v1/dismissal/requests/:id/deliver',
  'GET /api/v1/dismissal/notifications',
  'POST /api/v1/dismissal/notifications/device-tokens',
  'DELETE /api/v1/dismissal/notifications/device-tokens/current',
  'PATCH /api/v1/dismissal/notifications/:id/read',
  'PATCH /api/v1/dismissal/notifications/read-all',
  'GET /api/v1/dismissal/requests/history',
  'GET /api/v1/dismissal/requests/history/:id',
  'POST /api/v1/dismissal/requests/:id/escalate',
];

const EXPECTED_DISMISSAL_REALTIME_EVENTS = [
  'dismissal.request.created',
  'dismissal.request.cancelled',
  'dismissal.request.status_changed',
  'dismissal.request.arrival_confirmed',
  'dismissal.request.delivered',
  'dismissal.queue.changed',
  'parent.smart_pickup.request.changed',
  'dismissal.notification.created',
  'dismissal.notification.read',
  'dismissal.notifications.read_all',
];

describe('DISMISSAL-FE-CONTRACT-1A contract security and inventory', () => {
  it('documents every implemented route and forbidden non-routes', () => {
    const inventory = readFileSync('docs/dismissal-api-route-inventory-v1.md', 'utf8');
    const contract = readFileSync('docs/dismissal-fe-contract-v1.md', 'utf8');
    const guide = readFileSync(
      'docs/dismissal-frontend-implementation-guide-v1.md',
      'utf8',
    );

    for (const route of EXPECTED_ROUTES) {
      const [method, path] = route.split(' ');
      expect(inventory).toContain(`| ${method} | \`${path}\``);
    }
    for (const requiredSection of [
      'Parent Smart Pickup',
      'Dismissal Settings',
      'Dismissal Gates',
      'Dismissal Staff / Profile / Assignments',
      'Dismissal Active Queue and Request Detail',
      'Dismissal Lifecycle Transitions',
      'Dismissal Waiting Students',
      'Dismissal Delivery / Handover and Pickup Recipients',
      'Dismissal Notifications',
      'Dismissal History and Escalation',
      'Realtime Gateway Events',
      'Routes That Do Not Exist',
    ]) {
      expect(inventory).toContain(requiredSection);
    }
    for (const forbiddenRoute of [
      'No `/api/v1/pickup`',
      'No `/api/v1/history`',
      'No `/api/v1/requests/history`',
      'No root `/api/v1/waiting-students`',
      'No root `/api/v1/notifications`',
      'No Smart Pickup-specific parent notification route',
      'No pickup-code resend route',
      'No pickup-code rotation route',
      'No delegate OTP route',
      'No delegate QR route',
      'No external delegate invitation route',
    ]) {
      expect(inventory).toContain(forbiddenRoute);
    }

    expect(contract).toContain('Raw pickup code appears only');
    expect(contract).toContain('pickupRecipientToken` is allowed only');
    expect(contract).toContain('Error Code Matrix');
    expect(contract).toContain('Realtime Event Contract');
    expect(guide).toContain('Do not rely on realtime as the source of truth.');
    expect(guide).toContain('Never store `pickupRecipientToken` longer than needed');
  });

  it('keeps exact guard chain metadata on all contract controllers', () => {
    for (const controller of [
      ParentSmartPickupController,
      DismissalSettingsController,
      DismissalGatesController,
      DismissalProfileController,
      DismissalStaffAssignmentsController,
      DismissalRequestsController,
      DismissalWaitingStudentsController,
      DismissalNotificationsController,
    ]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        JwtAuthGuard,
        ScopeResolverGuard,
        PermissionsGuard,
      ]);
    }
  });

  it('keeps exact RequiredPermissions metadata for documented routes', () => {
    expectPermission(ParentSmartPickupController.prototype.getReadiness, [
      'parent.smart_pickup.view',
    ]);
    expectPermission(ParentSmartPickupController.prototype.createRequest, [
      'parent.smart_pickup.request',
    ]);
    expectPermission(ParentSmartPickupController.prototype.listRecentCalls, [
      'parent.smart_pickup.view',
    ]);
    expectPermission(ParentSmartPickupController.prototype.cancelRequest, [
      'parent.smart_pickup.cancel',
    ]);

    expectPermission(DismissalSettingsController.prototype.getSettings, [
      'dismissal.settings.view',
    ]);
    expectPermission(DismissalSettingsController.prototype.updateSettings, [
      'dismissal.settings.manage',
    ]);
    expectPermission(DismissalGatesController.prototype.listGates, [
      'dismissal.gates.view',
    ]);
    expectPermission(DismissalGatesController.prototype.createGate, [
      'dismissal.gates.manage',
    ]);
    expectPermission(DismissalGatesController.prototype.getGate, [
      'dismissal.gates.view',
    ]);
    expectPermission(DismissalGatesController.prototype.updateGate, [
      'dismissal.gates.manage',
    ]);
    expectPermission(DismissalProfileController.prototype.getProfile, [
      'dismissal.profile.view',
    ]);

    expectPermission(DismissalStaffAssignmentsController.prototype.listAssignments, [
      'dismissal.staff.view',
    ]);
    expectPermission(DismissalStaffAssignmentsController.prototype.createAssignment, [
      'dismissal.staff.manage',
    ]);
    expectPermission(DismissalStaffAssignmentsController.prototype.getAssignment, [
      'dismissal.staff.view',
    ]);
    expectPermission(DismissalStaffAssignmentsController.prototype.updateAssignment, [
      'dismissal.staff.manage',
    ]);
    expectPermission(DismissalStaffAssignmentsController.prototype.deleteAssignment, [
      'dismissal.staff.manage',
    ]);

    expectPermission(DismissalRequestsController.prototype.listActiveRequests, [
      'dismissal.requests.view',
    ]);
    expectPermission(DismissalRequestsController.prototype.getRequestDetail, [
      'dismissal.requests.view',
    ]);
    expectPermission(DismissalRequestsController.prototype.updateRequestStatus, [
      'dismissal.requests.manage',
    ]);
    expectPermission(DismissalRequestsController.prototype.listPickupRecipients, [
      'dismissal.requests.deliver',
    ]);
    expectPermission(DismissalRequestsController.prototype.deliverRequest, [
      'dismissal.requests.deliver',
    ]);
    expectPermission(DismissalRequestsController.prototype.listRequestHistory, [
      'dismissal.requests.history.view',
    ]);
    expectPermission(DismissalRequestsController.prototype.getRequestHistoryDetail, [
      'dismissal.requests.history.view',
    ]);
    expectPermission(DismissalRequestsController.prototype.escalateRequest, [
      'dismissal.requests.escalate',
    ]);

    expectPermission(DismissalWaitingStudentsController.prototype.listWaitingStudents, [
      'dismissal.requests.view',
    ]);
    expectPermission(DismissalWaitingStudentsController.prototype.confirmArrival, [
      'dismissal.requests.manage',
    ]);
    expectPermission(DismissalNotificationsController.prototype.listNotifications, [
      'dismissal.notifications.view',
    ]);
    expectPermission(DismissalNotificationsController.prototype.markRead, [
      'dismissal.notifications.manage',
    ]);
    expectPermission(DismissalNotificationsController.prototype.markAllRead, [
      'dismissal.notifications.manage',
    ]);
  });

  it('keeps permission catalog, role boundaries, schema, migration, and device-token contracts frozen', () => {
    const permissionsSeed = readFileSync(
      'src/modules/iam/reference-data/permission-catalog.ts',
      'utf8',
    );
    const rolesSeed = readFileSync(
      'src/modules/iam/reference-data/system-role-catalog.ts',
      'utf8',
    );
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    const migrations = readdirSync('prisma/migrations');
    const parentPermissions = extractConstStringArray(rolesSeed, 'PARENT_PERMISSIONS');
    const dismissalStaffPermissions = extractConstStringArray(
      rolesSeed,
      'DISMISSAL_STAFF_PERMISSIONS',
    );
    const teacherPermissions = extractConstStringArray(rolesSeed, 'TEACHER_PERMISSIONS');
    const studentPermissions = extractConstStringArray(rolesSeed, 'STUDENT_PERMISSIONS');
    const dismissalPermissionCodes = [
      ...permissionsSeed.matchAll(/code: '(dismissal\.[^']+)'/g),
    ].map((match) => match[1]);
    const parentSmartPickupCodes = [
      ...permissionsSeed.matchAll(/code: '(parent\.smart_pickup\.[^']+)'/g),
    ].map((match) => match[1]);

    expect(dismissalPermissionCodes).toHaveLength(14);
    expect(parentSmartPickupCodes).toEqual([
      'parent.smart_pickup.view',
      'parent.smart_pickup.request',
      'parent.smart_pickup.cancel',
    ]);
    expect(parentPermissions).toEqual(
      expect.arrayContaining(parentSmartPickupCodes),
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
    expect(dismissalStaffPermissions).toEqual(
      expect.arrayContaining([
        'dismissal.requests.view',
        'dismissal.requests.manage',
        'dismissal.requests.deliver',
        'dismissal.requests.escalate',
        'dismissal.requests.history.view',
        'dismissal.notifications.view',
        'dismissal.notifications.manage',
      ]),
    );

    expect(migrations.some((name) => name.includes('fe_contract'))).toBe(false);
    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).toContain('DISMISSAL_STAFF');
  });

  it('keeps route ordering, forbidden roots, chat/file expansions, and realtime event names exact', () => {
    const requestsController = readFileSync(
      'src/modules/dismissal/requests/controller/dismissal-requests.controller.ts',
      'utf8',
    );
    const dismissalSource = readSource('src/modules/dismissal');
    const parentSmartPickupSource = readSource('src/modules/parent-app/smart-pickup');
    const realtimeEvents = Object.values(REALTIME_SERVER_EVENTS).filter(
      (event) =>
        event.startsWith('dismissal.') ||
        event.startsWith('parent.smart_pickup.'),
    );

    expect(requestsController.indexOf("@Get('history')")).toBeLessThan(
      requestsController.indexOf("@Get(':id')"),
    );
    for (const forbiddenSourceFragment of [
      "Controller('pickup')",
      "Controller('waiting-students')",
      "Controller('notifications')",
      "Controller('parent/notifications')",
      "Post('requests/:id/resend-code')",
      "Post('requests/:id/rotate-code')",
      "Post('delegate-otp')",
      "Post('delegate-qr')",
      "Controller('dismissal/files')",
      "Controller('dismissal/chat')",
      "Controller('dismissal/communication')",
    ]) {
      expect(`${dismissalSource}\n${parentSmartPickupSource}`).not.toContain(
        forbiddenSourceFragment,
      );
    }
    expect(realtimeEvents).toEqual(EXPECTED_DISMISSAL_REALTIME_EVENTS);
    expect(realtimeEvents).not.toContain('dismissal.request.escalated');
  });
});

function expectPermission(method: unknown, expected: string[]): void {
  expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, method)).toEqual(
    expected,
  );
}

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
  if (!match) throw new Error(`Could not locate ${constName}`);

  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}
