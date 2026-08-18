import { readFileSync } from 'node:fs';
import { UserType } from '@prisma/client';
import 'reflect-metadata';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { PermissionsController } from '../../src/modules/settings/permissions/controller/permissions.controller';
import { RolesController } from '../../src/modules/settings/roles/controller/roles.controller';
import { UsersController } from '../../src/modules/settings/users/controller/users.controller';
import { userTypeFromRoleKey } from '../../src/modules/settings/users/domain/user-type-from-role';

const EXPECTED_DISMISSAL_STAFF_PERMISSIONS = [
  'app.device_tokens.manage',
  'dismissal.profile.view',
  'dismissal.gates.view',
  'dismissal.requests.view',
  'dismissal.requests.manage',
  'dismissal.requests.deliver',
  'dismissal.requests.escalate',
  'dismissal.requests.history.view',
  'dismissal.notifications.view',
  'dismissal.notifications.manage',
] as const;

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

function readConstStringArray(source: string, constName: string): string[] {
  const match = source.match(
    new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\]\\s*(?:as const)?;`),
  );
  expect(match).not.toBeNull();

  return [...match![1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function getHandler(controller: { prototype: object }, method: string): object {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    throw new Error(`${method} handler not found.`);
  }

  return handler;
}

describe('Settings Dismissal Staff role security contract', () => {
  it('keeps exact Settings permission metadata on roles, permissions, and users routes', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        getHandler(RolesController, 'listRoles'),
      ),
    ).toEqual(['settings.roles.view']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        getHandler(PermissionsController, 'listPermissions'),
      ),
    ).toEqual(['settings.permissions.view']);

    for (const method of ['createUser', 'inviteUser', 'updateUser'] as const) {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSIONS_METADATA,
          getHandler(UsersController, method),
        ),
      ).toEqual(['settings.users.manage']);
    }
  });

  it('exposes dismissal_staff in Settings Roles visibility without changing other visible system roles', () => {
    const source = readSource(
      'src/modules/settings/roles/infrastructure/roles.repository.ts',
    );
    const visibleKeys = readConstStringArray(source, 'VISIBLE_SYSTEM_ROLE_KEYS');

    expect(visibleKeys).toEqual([
      'school_admin',
      'teacher',
      'parent',
      'student',
      'dismissal_staff',
    ]);
  });

  it('allows dismissal_staff in Settings Users assignability without changing other assignable system roles', () => {
    const source = readSource(
      'src/modules/settings/users/infrastructure/users.repository.ts',
    );
    const assignableKeys = readConstStringArray(
      source,
      'ASSIGNABLE_SYSTEM_ROLE_KEYS',
    );

    expect(assignableKeys).toEqual([
      'school_admin',
      'teacher',
      'parent',
      'student',
      'dismissal_staff',
    ]);
  });

  it('maps existing Settings role keys to the approved user types', () => {
    expect(userTypeFromRoleKey('school_admin')).toBe(UserType.SCHOOL_USER);
    expect(userTypeFromRoleKey('teacher')).toBe(UserType.TEACHER);
    expect(userTypeFromRoleKey('parent')).toBe(UserType.PARENT);
    expect(userTypeFromRoleKey('student')).toBe(UserType.STUDENT);
    expect(userTypeFromRoleKey('dismissal_staff')).toBe(
      UserType.DISMISSAL_STAFF,
    );
    expect(userTypeFromRoleKey('custom_school_operator')).toBe(
      UserType.SCHOOL_USER,
    );
  });

  it('does not grant Settings or broad admin permissions to the dismissal_staff seed role', () => {
    const source = readSource(
      'src/modules/iam/reference-data/system-role-catalog.ts',
    );
    const permissions = readConstStringArray(
      source,
      'DISMISSAL_STAFF_PERMISSIONS',
    );

    expect(permissions).toEqual([...EXPECTED_DISMISSAL_STAFF_PERMISSIONS]);
    expect(permissions.filter((permission) => permission.startsWith('settings.'))).toEqual(
      [],
    );
    expect(permissions.filter((permission) => permission.startsWith('platform.'))).toEqual(
      [],
    );
    expect(permissions.filter((permission) => permission.startsWith('parent.'))).toEqual(
      [],
    );
  });
});
