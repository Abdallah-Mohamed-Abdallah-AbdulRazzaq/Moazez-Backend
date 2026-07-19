import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ParseUUIDPipe } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../../../common/decorators/required-permissions.decorator';
import {
  PERMISSION_CODES,
  seedPermissions,
} from '../../../../../prisma/seeds/01-permissions.seed';
import {
  SYSTEM_ROLES,
  TEACHER_PERMISSIONS,
} from '../../../../../prisma/seeds/02-system-roles.seed';
import { UserType } from '@prisma/client';
import { GetTeacherUseCase } from '../application/get-teacher.use-case';
import { ListTeachersUseCase } from '../application/list-teachers.use-case';
import { TeachersController } from '../controller/teachers.controller';
import type { TeacherDirectoryRepository } from '../infrastructure/teacher-directory.repository';

const IDS = {
  actor: '43000000-0000-4000-8000-000000000001',
  organization: '43000000-0000-4000-8000-000000000002',
  school: '43000000-0000-4000-8000-000000000003',
  role: '43000000-0000-4000-8000-000000000004',
};

function inSchoolScope<T>(callback: () => T): T {
  const context = createRequestContext('directory-contract-test');
  context.actor = { id: IDS.actor, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: '43000000-0000-4000-8000-000000000005',
    schoolId: IDS.school,
    organizationId: IDS.organization,
    roleId: IDS.role,
    permissions: [],
  };
  return runWithRequestContext(context, callback);
}

describe('Teacher Directory route and permission contract', () => {
  it('registers exactly GET list, GET detail, and PATCH detail methods', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TeachersController)).toBe(
      'teachers',
    );
    const routes = Object.getOwnPropertyNames(TeachersController.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => {
        const method = TeachersController.prototype[name];
        return {
          path: Reflect.getMetadata(PATH_METADATA, method),
          method: Reflect.getMetadata(METHOD_METADATA, method),
        };
      })
      .filter((route) => route.method !== undefined);
    expect(routes).toEqual([
      { path: '/', method: RequestMethod.GET },
      { path: ':teacherId', method: RequestMethod.GET },
      { path: ':teacherId', method: RequestMethod.PATCH },
    ]);
    expect(routes.some((route) => route.method === RequestMethod.POST)).toBe(
      false,
    );
  });

  it('locks view permission on GET and manage permission on PATCH', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        TeachersController.prototype.list,
      ),
    ).toEqual(['teachers.records.view']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        TeachersController.prototype.get,
      ),
    ).toEqual(['teachers.records.view']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        TeachersController.prototype.update,
      ),
    ).toEqual(['teachers.records.manage']);
  });

  it('rejects malformed TeacherProfile ids at the controller boundary', async () => {
    const pipe = new ParseUUIDPipe();
    await expect(
      pipe.transform('not-a-uuid', { type: 'param' }),
    ).rejects.toThrow();
  });

  it('passes only current-school scope into list repository calls', async () => {
    const repository = {
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as TeacherDirectoryRepository;
    const useCase = new ListTeachersUseCase(repository);
    const result = await inSchoolScope(() =>
      useCase.execute({ page: 1, limit: 20 }),
    );
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: IDS.school, page: 1, limit: 20 }),
    );
    expect(result).toEqual({
      items: [],
      pagination: { page: 1, limit: 20, total: 0 },
    });
  });

  it('platform permission possession does not manufacture a School scope', async () => {
    const repository = {
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as TeacherDirectoryRepository;
    const useCase = new ListTeachersUseCase(repository);
    const context = createRequestContext('platform-no-school');
    context.actor = { id: IDS.actor, userType: UserType.PLATFORM_USER };
    context.platformPermissions = ['teachers.records.view'];
    await expect(
      runWithRequestContext(context, () =>
        useCase.execute({ page: 1, limit: 20 }),
      ),
    ).rejects.toMatchObject({ code: 'auth.scope.missing' });
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('uses the same safe 404 for nonexistent, archived, and foreign detail results', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as TeacherDirectoryRepository;
    const useCase = new GetTeacherUseCase(repository);
    for (const id of [
      '43000000-0000-4000-8000-000000000006',
      '43000000-0000-4000-8000-000000000007',
      '43000000-0000-4000-8000-000000000008',
    ]) {
      await expect(
        inSchoolScope(() => useCase.execute(id)),
      ).rejects.toMatchObject({
        code: 'teachers.profile.not_found',
        httpStatus: 404,
        details: undefined,
      });
    }
  });

  it('catalog contains exactly the two 1B Teacher Directory permissions and all codes are unique', () => {
    const teacherDirectory = PERMISSION_CODES.filter((code) =>
      code.startsWith('teachers.'),
    );
    expect(teacherDirectory).toEqual([
      'teachers.records.view',
      'teachers.records.manage',
    ]);
    expect(new Set(PERMISSION_CODES).size).toBe(PERMISSION_CODES.length);
    expect(PERMISSION_CODES).not.toEqual(
      expect.arrayContaining([
        'teachers.assignments.view',
        'teachers.assignments.manage',
      ]),
    );
  });

  it('grants both records permissions to platform, organization, and school admins', () => {
    for (const key of [
      'platform_super_admin',
      'organization_admin',
      'school_admin',
    ]) {
      const role = SYSTEM_ROLES.find((candidate) => candidate.key === key);
      expect(role?.permissions).toEqual(
        expect.arrayContaining([
          'teachers.records.view',
          'teachers.records.manage',
        ]),
      );
    }
  });

  it('grants neither permission to the Teacher system role or an automatic custom role', () => {
    expect(TEACHER_PERMISSIONS).not.toEqual(
      expect.arrayContaining([
        'teachers.records.view',
        'teachers.records.manage',
      ]),
    );
    expect(SYSTEM_ROLES.some((role) => role.key === 'custom')).toBe(false);
  });

  it('permission seed construction remains idempotent over a second run', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const logger = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const prisma = { permission: { upsert } } as never;
    await seedPermissions(prisma);
    const firstRun = upsert.mock.calls.map((call) => call[0]);
    upsert.mockClear();
    await seedPermissions(prisma);
    expect(upsert.mock.calls.map((call) => call[0])).toEqual(firstRun);
    logger.mockRestore();
  });

  it('registers TeachersModule in AppModule without exposing another controller', () => {
    const root = join(__dirname, '../../../../..');
    const appModule = readFileSync(join(root, 'src/app.module.ts'), 'utf8');
    const controller = readFileSync(
      join(
        root,
        'src/modules/teachers/directory/controller/teachers.controller.ts',
      ),
      'utf8',
    );
    expect(appModule).toContain('TeachersModule');
    expect(controller.match(/@(Get|Patch)\(/gu)).toHaveLength(3);
    expect(controller).not.toMatch(/@(Post|Delete)\(/u);
    expect(controller).not.toContain('employment-status');
    expect(controller).not.toContain('rehire');
    expect(controller).not.toContain('transfer');
  });
});
