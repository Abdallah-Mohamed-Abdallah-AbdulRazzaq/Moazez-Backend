import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DashboardTodoPriority,
  DashboardTodoStatus,
  MembershipStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { SCHOOL_MANAGEMENT_ONLY_METADATA } from '../../src/common/decorators/school-management-only.decorator';
import { NotFoundDomainException } from '../../src/common/exceptions/domain-exception';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { ScopeMissingException } from '../../src/modules/iam/auth/domain/auth.exceptions';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { DeleteDashboardTodoUseCase } from '../../src/modules/dashboard/application/delete-dashboard-todo.use-case';
import { GetDashboardLightModeDropdownUseCase } from '../../src/modules/dashboard/application/get-dashboard-light-mode-dropdown.use-case';
import { UpdateDashboardTodoUseCase } from '../../src/modules/dashboard/application/update-dashboard-todo.use-case';
import { DashboardTodosController } from '../../src/modules/dashboard/controller/dashboard-todos.controller';
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { DashboardLightModeDropdownRepository } from '../../src/modules/dashboard/infrastructure/dashboard-light-mode-dropdown.repository';
import { DashboardTodosRepository } from '../../src/modules/dashboard/infrastructure/dashboard-todos.repository';
import { presentDashboardTodo } from '../../src/modules/dashboard/presenters/dashboard-todos.presenter';

jest.setTimeout(60000);

describe('Dashboard todos tenancy and security contracts', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `dashboard-todos-security-${suffix}`;
  let prisma: PrismaService;
  let databaseConnected = false;
  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';
  let roleAId = '';
  let roleBId = '';
  let ownerAId = '';
  let ownerBId = '';
  let ownerSchoolBId = '';
  let ownerATodoId = '';
  let ownerBTodoId = '';
  let schoolBTodoId = '';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    databaseConnected = true;

    const organization = await prisma.organization.create({
      data: { slug: `${marker}-org`, name: `Dashboard todos ${suffix}` },
      select: { id: true },
    });
    organizationId = organization.id;
    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-a`,
          name: `Dashboard todos school A ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-b`,
          name: `Dashboard todos school B ${suffix}`,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;
    const [roleA, roleB] = await Promise.all([
      prisma.role.create({
        data: {
          schoolId: schoolAId,
          key: `${marker}-role-a`,
          name: `Dashboard todos A ${suffix}`,
          isSystem: false,
        },
        select: { id: true },
      }),
      prisma.role.create({
        data: {
          schoolId: schoolBId,
          key: `${marker}-role-b`,
          name: `Dashboard todos B ${suffix}`,
          isSystem: false,
        },
        select: { id: true },
      }),
    ]);
    roleAId = roleA.id;
    roleBId = roleB.id;
    const [ownerA, ownerB, ownerSchoolB] = await Promise.all([
      createUser('owner-a'),
      createUser('owner-b'),
      createUser('owner-school-b'),
    ]);
    ownerAId = ownerA;
    ownerBId = ownerB;
    ownerSchoolBId = ownerSchoolB;
    await prisma.membership.createMany({
      data: [
        membership(ownerAId, schoolAId, roleAId),
        membership(ownerBId, schoolAId, roleAId),
        membership(ownerSchoolBId, schoolBId, roleBId),
      ],
    });
    const [ownerATodo, ownerBTodo, schoolBTodo] = await Promise.all([
      prisma.dashboardTodo.create({
        data: todo(ownerAId, schoolAId, 'Owner A todo'),
        select: { id: true },
      }),
      prisma.dashboardTodo.create({
        data: todo(ownerBId, schoolAId, 'Owner B todo'),
        select: { id: true },
      }),
      prisma.dashboardTodo.create({
        data: todo(ownerSchoolBId, schoolBId, 'School B todo'),
        select: { id: true },
      }),
    ]);
    ownerATodoId = ownerATodo.id;
    ownerBTodoId = ownerBTodo.id;
    schoolBTodoId = schoolBTodo.id;
  });

  afterAll(async () => {
    if (!prisma || !databaseConnected) return;
    await prisma.dashboardTodo.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.membership.deleteMany({
      where: {
        userId: { in: [ownerAId, ownerBId, ownerSchoolBId].filter(Boolean) },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [ownerAId, ownerBId, ownerSchoolBId].filter(Boolean) },
      },
    });
    await prisma.role.deleteMany({
      where: { id: { in: [roleAId, roleBId].filter(Boolean) } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('registers exactly four Todo routes on the dedicated controller', () => {
    expect(controllerMethods(DashboardTodosController)).toEqual([
      'listLightModeDropdownTodos',
      'createLightModeDropdownTodo',
      'updateLightModeDropdownTodo',
      'deleteLightModeDropdownTodo',
    ]);
    expect(routeContract('listLightModeDropdownTodos')).toEqual({
      method: RequestMethod.GET,
      path: '/api/v1/dashboard/light-mode-dropdown/todos',
    });
    expect(routeContract('createLightModeDropdownTodo')).toEqual({
      method: RequestMethod.POST,
      path: '/api/v1/dashboard/light-mode-dropdown/todos',
    });
    expect(routeContract('updateLightModeDropdownTodo')).toEqual({
      method: RequestMethod.PATCH,
      path: '/api/v1/dashboard/light-mode-dropdown/todos/:todoId',
    });
    expect(routeContract('deleteLightModeDropdownTodo')).toEqual({
      method: RequestMethod.DELETE,
      path: '/api/v1/dashboard/light-mode-dropdown/todos/:todoId',
    });
    expect(controllerMethods(DashboardController)).not.toEqual(
      expect.arrayContaining(controllerMethods(DashboardTodosController)),
    );
  });

  it('uses only the two accepted Todo permissions on the dedicated surface', () => {
    expect(requiredPermissions('listLightModeDropdownTodos')).toEqual([
      'dashboard.todos.view',
    ]);
    for (const method of [
      'createLightModeDropdownTodo',
      'updateLightModeDropdownTodo',
      'deleteLightModeDropdownTodo',
    ]) {
      expect(requiredPermissions(method)).toEqual(['dashboard.todos.manage']);
    }

    const assignedPermissions = controllerMethods(
      DashboardTodosController,
    ).flatMap((method) => requiredPermissions(method) ?? []);
    expect(new Set(assignedPermissions)).toEqual(
      new Set(['dashboard.todos.view', 'dashboard.todos.manage']),
    );
  });

  it('keeps app-facing actors outside the core Dashboard Todo surface', () => {
    expect(
      Reflect.getMetadata(
        SCHOOL_MANAGEMENT_ONLY_METADATA,
        DashboardTodosController,
      ),
    ).toBe(true);

    const guard = new PermissionsGuard(new Reflector());
    const executionContext = {
      getClass: () => DashboardTodosController,
      getHandler: () =>
        DashboardTodosController.prototype.listLightModeDropdownTodos,
    } as unknown as ExecutionContext;

    for (const userType of [
      UserType.TEACHER,
      UserType.PARENT,
      UserType.STUDENT,
    ]) {
      expect(() =>
        runWithRequestContext(createRequestContext(), () => {
          setActor({ id: `${userType}-actor`, userType });
          setActiveMembership({
            membershipId: `${userType}-membership`,
            organizationId: `${userType}-organization`,
            schoolId: `${userType}-school`,
            roleId: `${userType}-role`,
            permissions: ['dashboard.todos.view', 'dashboard.todos.manage'],
          });

          return guard.canActivate(executionContext);
        }),
      ).toThrow(ScopeMissingException);
    }
  });

  it('seeds dashboard todo permissions for inherited admin roles only', () => {
    const permissions = readFileSync(
      join(process.cwd(), 'prisma/seeds/01-permissions.seed.ts'),
      'utf8',
    );
    const roles = readFileSync(
      join(process.cwd(), 'prisma/seeds/02-system-roles.seed.ts'),
      'utf8',
    );
    for (const permission of [
      'dashboard.todos.view',
      'dashboard.todos.manage',
    ]) {
      expect(permissions).toContain(`'${permission}'`);
      for (const role of [
        'TEACHER_PERMISSIONS',
        'PARENT_PERMISSIONS',
        'STUDENT_PERMISSIONS',
      ]) {
        expect(extractArrayLiteral(roles, role)).not.toContain(permission);
      }
    }
    expect(roles).toContain('const ALL = PERMISSION_CODES;');
    expect(roles).toContain('const SCHOOL_LEVEL = NON_PLATFORM;');
  });

  it('isolates todos by owner and school and returns not found for cross-scope mutations', async () => {
    const todosRepository = new DashboardTodosRepository(prisma);
    const updateUseCase = new UpdateDashboardTodoUseCase(todosRepository);
    const deleteUseCase = new DeleteDashboardTodoUseCase(todosRepository);

    await withOwnerAScope(async () => {
      const todos = await todosRepository.listOwnedTodos(currentScope(), {
        date: new Date('2026-07-09T00:00:00.000Z'),
        limit: 100,
      });
      expect(todos.map((todo) => todo.id)).toEqual([ownerATodoId]);
      await expect(
        updateUseCase.execute(ownerBTodoId, { title: 'Attempted takeover' }),
      ).rejects.toBeInstanceOf(NotFoundDomainException);
      await expect(deleteUseCase.execute(schoolBTodoId)).rejects.toBeInstanceOf(
        NotFoundDomainException,
      );
    });
  });

  it('includes only current-owner persisted todos in the LightModeDropdown response', async () => {
    const useCase = new GetDashboardLightModeDropdownUseCase(
      new DashboardLightModeDropdownRepository(prisma),
      new DashboardTodosRepository(prisma),
    );

    await withOwnerAScope(async () => {
      const response = await useCase.execute({ date: '2026-07-09' });
      expect(response.planner.todos).toEqual([
        expect.objectContaining({
          todoId: ownerATodoId,
          title: 'Owner A todo',
        }),
      ]);
      expect(response.meta.todosStatus).toBe('persisted');
      expect(JSON.stringify(response)).not.toContain(ownerBTodoId);
      expect(JSON.stringify(response)).not.toContain(schoolBTodoId);
      expectNoInternalLeaks(response);
    });
  });

  it('keeps dashboard todo response shaping free of tenant fields', () => {
    const response = presentDashboardTodo({
      id: 'todo-1',
      date: new Date('2026-07-09T00:00:00.000Z'),
      title: 'Review attendance',
      notes: null,
      status: DashboardTodoStatus.PENDING,
      priority: DashboardTodoPriority.NORMAL,
      sortOrder: 0,
      completedAt: null,
      createdAt: new Date('2026-07-09T10:00:00.000Z'),
      updatedAt: new Date('2026-07-09T10:00:00.000Z'),
    });
    expectNoInternalLeaks(response);
  });

  function createUser(label: string): Promise<string> {
    return prisma.user
      .create({
        data: {
          email: `${marker}-${label}@example.test`,
          firstName: 'Dashboard',
          lastName: label,
          userType: UserType.SCHOOL_USER,
          status: UserStatus.ACTIVE,
        },
        select: { id: true },
      })
      .then((user) => user.id);
  }

  function membership(userId: string, schoolId: string, roleId: string) {
    return {
      userId,
      organizationId,
      schoolId,
      roleId,
      userType: UserType.SCHOOL_USER,
      status: MembershipStatus.ACTIVE,
    };
  }

  function todo(ownerUserId: string, schoolId: string, title: string) {
    return {
      schoolId,
      ownerUserId,
      title,
      date: new Date('2026-07-09T00:00:00.000Z'),
      status: DashboardTodoStatus.PENDING,
      priority: DashboardTodoPriority.NORMAL,
    };
  }

  async function withOwnerAScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: ownerAId, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'dashboard-todos-membership-a',
        organizationId,
        schoolId: schoolAId,
        roleId: roleAId,
        permissions: ['dashboard.todos.view', 'dashboard.todos.manage'],
      });
      return fn();
    });
  }

  function currentScope() {
    return {
      actorId: ownerAId,
      userType: UserType.SCHOOL_USER,
      organizationId,
      schoolId: schoolAId,
      roleId: roleAId,
    };
  }
});

function requiredPermissions(methodName: string): string[] | undefined {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS_METADATA,
    DashboardTodosController.prototype[methodName],
  );
}

function routeContract(methodName: string): {
  method: RequestMethod;
  path: string;
} {
  const controllerPath = Reflect.getMetadata(
    PATH_METADATA,
    DashboardTodosController,
  ) as string;
  const handler = DashboardTodosController.prototype[methodName];
  const handlerPath = Reflect.getMetadata(PATH_METADATA, handler) as string;
  const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;

  return {
    method,
    path: `/api/v1/${controllerPath}/${handlerPath}`,
  };
}

function controllerMethods(controller: Function): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (method) => method !== 'constructor',
  );
}

function extractArrayLiteral(source: string, arrayName: string): string {
  const match = source.match(
    new RegExp(`const ${arrayName} = \\[(\\s\\S]*?)\\];`),
  );
  return match?.[1] ?? '';
}

function expectNoInternalLeaks(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'ownerUserId',
    'userId',
    'deletedAt',
    'passwordHash',
    'raw',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
