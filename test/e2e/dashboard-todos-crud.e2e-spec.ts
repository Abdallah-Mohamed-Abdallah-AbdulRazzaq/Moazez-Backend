import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  PrismaClient,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DashboardTodos123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type Principal = { email: string; userId: string; roleId: string };
type ExpressLayer = {
  route?: { path?: string | string[]; methods?: Record<string, boolean> };
  handle?: { stack?: ExpressLayer[] };
};

jest.setTimeout(90000);

describe('DASHBOARD-TODOS-1A CRUD (e2e)', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `dashboard-todos-${suffix}`;
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let databaseConnected = false;
  let organizationId = '';
  let schoolId = '';
  let lightModeDropdownViewPermissionId = '';
  let admin: Principal;
  let viewOnly: Principal;
  let manageOnly: Principal;
  let denied: Principal;
  const userIds: string[] = [];
  const roleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    databaseConnected = true;
    const organization = await prisma.organization.create({
      data: { slug: `${marker}-org`, name: `Dashboard Todos ${suffix}` },
      select: { id: true },
    });
    organizationId = organization.id;
    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: `${marker}-school`,
        name: `Dashboard Todos School ${suffix}`,
      },
      select: { id: true },
    });
    schoolId = school.id;
    await prisma.schoolProfile.create({
      data: {
        schoolId,
        timezone: 'Africa/Cairo',
        city: 'Cairo',
        country: 'Egypt',
      },
    });
    const permissions = await ensurePermissions();
    lightModeDropdownViewPermissionId = permissions.lightModeDropdownView;
    admin = await createPrincipal('admin', [
      permissions.view,
      permissions.manage,
    ]);
    viewOnly = await createPrincipal('view', [permissions.view]);
    manageOnly = await createPrincipal('manage', [permissions.manage]);
    denied = await createPrincipal('denied', []);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue(noopBullmq())
      .compile();
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
    if (app) await app.close();
    if (!prisma || !databaseConnected) return;
    await prisma.dashboardTodo.deleteMany({ where: { schoolId } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: roleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.schoolProfile.deleteMany({ where: { schoolId } });
    await prisma.school.deleteMany({ where: { id: schoolId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('registers todo CRUD routes and preserves deferred dashboard route exclusions', () => {
    const routes = registeredRoutes();
    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/dashboard/light-mode-dropdown/todos',
        'POST /api/v1/dashboard/light-mode-dropdown/todos',
        'PATCH /api/v1/dashboard/light-mode-dropdown/todos/:todoId',
        'DELETE /api/v1/dashboard/light-mode-dropdown/todos/:todoId',
      ]),
    );
    for (const route of [
      'GET /api/v1/dashboard/weather/current',
      'POST /api/v1/dashboard/weather/refresh',
      'GET /api/v1/dashboard/planner/events',
      'POST /api/v1/dashboard/alerts/:alertKey/acknowledge',
      'GET /api/v1/dashboard/realtime',
      'POST /api/v1/dashboard/reports/:reportKey',
    ]) {
      expect(routes).not.toContain(route);
    }
  });

  it('enforces authentication and split todo permissions', async () => {
    const viewToken = await login(viewOnly.email);
    const manageToken = await login(manageOnly.email);
    const deniedToken = await login(denied.email);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos`)
      .set('Authorization', `Bearer ${deniedToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos`)
      .set('Authorization', `Bearer ${viewToken}`)
      .send({ date: '2026-07-09', title: 'Denied' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos`)
      .set('Authorization', `Bearer ${manageToken}`)
      .expect(403);
  });

  it('creates, lists, updates, completes, reopens, and soft-deletes an owner todo', async () => {
    const token = await login(admin.email);
    const create = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-07-09',
        title: '  Review attendance  ',
        notes: '  Check pending sessions  ',
        priority: 'normal',
        sortOrder: 0,
      })
      .expect(201);
    const todoId = create.body.todo.todoId as string;
    expect(create.body.todo).toMatchObject({
      todoId: expect.any(String),
      date: '2026-07-09',
      title: 'Review attendance',
      notes: 'Check pending sessions',
      status: 'pending',
      priority: 'normal',
    });
    expectNoInternalLeaks(create.body);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos`)
      .query({ date: '2026-07-09' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toMatchObject({
      date: '2026-07-09',
      todos: [expect.objectContaining({ todoId })],
      summary: { total: 1, pending: 1, completed: 0 },
      filters: { date: '2026-07-09', status: 'all', limit: 50 },
    });

    const completed = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos/${todoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Updated attendance review',
        priority: 'high',
        sortOrder: 10,
        status: 'completed',
        date: '2026-07-10',
      })
      .expect(200);
    expect(completed.body.todo).toMatchObject({
      todoId,
      title: 'Updated attendance review',
      priority: 'high',
      status: 'completed',
      date: '2026-07-10',
      completedAt: expect.any(String),
    });

    const reopened = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos/${todoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'pending', notes: null })
      .expect(200);
    expect(reopened.body.todo).toMatchObject({
      status: 'pending',
      completedAt: null,
      notes: null,
    });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos/${todoId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) =>
        expect(response.body).toMatchObject({ deleted: true, todoId }),
      );
    const afterDelete = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos`)
      .query({ date: '2026-07-10' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterDelete.body.todos).toEqual([]);
  });

  it('includes persisted current-owner todos in the LightModeDropdown response', async () => {
    const todoOnlyToken = await login(admin.email);
    const todoOnlyMe = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${todoOnlyToken}`)
      .expect(200);
    expect(todoOnlyMe.body).toMatchObject({
      id: admin.userId,
      activeMembership: {
        organizationId,
        schoolId,
        roleId: admin.roleId,
      },
    });
    expect(
      new Set(todoOnlyMe.body.activeMembership.permissions as string[]),
    ).toEqual(new Set(['dashboard.todos.view', 'dashboard.todos.manage']));

    const create = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos`)
      .set('Authorization', `Bearer ${todoOnlyToken}`)
      .send({ date: '2026-07-09', title: 'Dropdown todo' })
      .expect(201);
    const todoId = create.body.todo.todoId as string;

    const persistedTodo = await prisma.dashboardTodo.findUnique({
      where: { id: todoId },
      select: { ownerUserId: true, schoolId: true },
    });
    expect(persistedTodo).toEqual({
      ownerUserId: admin.userId,
      schoolId,
    });

    const deniedDropdown = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown`)
      .query({ date: '2026-07-09' })
      .set('Authorization', `Bearer ${todoOnlyToken}`)
      .expect(403);
    expect(deniedDropdown.body).toMatchObject({
      error: {
        code: 'auth.scope.missing',
        details: {
          missingPermissions: ['dashboard.light_mode_dropdown.view'],
        },
      },
    });

    await prisma.rolePermission.create({
      data: {
        roleId: admin.roleId,
        permissionId: lightModeDropdownViewPermissionId,
      },
    });

    const dropdownToken = await login(admin.email);
    const dropdownMe = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${dropdownToken}`)
      .expect(200);
    expect(dropdownMe.body).toMatchObject({
      id: todoOnlyMe.body.id,
      activeMembership: {
        membershipId: todoOnlyMe.body.activeMembership.membershipId,
        organizationId: todoOnlyMe.body.activeMembership.organizationId,
        schoolId: todoOnlyMe.body.activeMembership.schoolId,
        roleId: todoOnlyMe.body.activeMembership.roleId,
      },
    });
    expect(
      new Set(dropdownMe.body.activeMembership.permissions as string[]),
    ).toEqual(
      new Set([
        'dashboard.todos.view',
        'dashboard.todos.manage',
        'dashboard.light_mode_dropdown.view',
      ]),
    );

    const dropdown = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown`)
      .query({ date: '2026-07-09' })
      .set('Authorization', `Bearer ${dropdownToken}`)
      .expect(200);
    expect(dropdown.body).toMatchObject({
      planner: {
        todos: [expect.objectContaining({ todoId, title: 'Dropdown todo' })],
      },
      meta: { todosStatus: 'persisted' },
    });
    expectNoInternalLeaks(dropdown.body);
  });

  it('rejects malformed and override-shaped input and hides unknown todo existence', async () => {
    const token = await login(admin.email);
    for (const body of [
      { date: 'invalid', title: 'Invalid date' },
      { date: '2026-07-09', title: 'Todo', priority: 'urgent' },
      { date: '2026-07-09', title: 'Todo', schoolId },
      { date: '2026-07-09', title: 'Todo', ownerUserId: admin.userId },
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos`)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(400);
    }
    for (const query of [{ status: 'invalid' }, { limit: 101 }, { schoolId }]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos`)
        .set('Authorization', `Bearer ${token}`)
        .query(query)
        .expect(400);
    }
    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/dashboard/light-mode-dropdown/todos/${randomUUID()}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Unknown' })
      .expect(404);
  });

  async function ensurePermissions(): Promise<{
    view: string;
    manage: string;
    lightModeDropdownView: string;
  }> {
    const entries = await Promise.all([
      permission(
        'dashboard.todos.view',
        'view',
        'View personal dashboard todos',
      ),
      permission(
        'dashboard.todos.manage',
        'manage',
        'Manage personal dashboard todos',
      ),
      permission(
        'dashboard.light_mode_dropdown.view',
        'view',
        'View dashboard dropdown',
      ),
      permission('dashboard.summary.view', 'view', 'View dashboard summary'),
      permission('dashboard.alerts.view', 'view', 'View dashboard alerts'),
      permission(
        'dashboard.activity_feed.view',
        'view',
        'View dashboard activity',
      ),
      permission(
        'dashboard.command_center.view',
        'view',
        'View command center',
      ),
      permission('dashboard.widgets.view', 'view', 'View widgets'),
      permission('dashboard.analytics.view', 'view', 'View analytics'),
      permission('dashboard.modules.view', 'view', 'View modules'),
    ]);
    return {
      view: entries[0],
      manage: entries[1],
      lightModeDropdownView: entries[2],
    };
  }

  async function permission(
    code: string,
    action: string,
    description: string,
  ): Promise<string> {
    const result = await prisma.permission.upsert({
      where: { code },
      update: {
        module: 'dashboard',
        resource: code.includes('.todos.') ? 'todos' : 'dashboard',
        action,
        description,
      },
      create: {
        code,
        module: 'dashboard',
        resource: code.includes('.todos.') ? 'todos' : 'dashboard',
        action,
        description,
      },
      select: { id: true },
    });
    return result.id;
  }

  async function createPrincipal(
    label: string,
    permissionIds: string[],
  ): Promise<Principal> {
    const role = await prisma.role.create({
      data: {
        schoolId,
        key: `${marker}-${label}`,
        name: `Dashboard todos ${label}`,
        isSystem: false,
      },
      select: { id: true },
    });
    roleIds.push(role.id);
    if (permissionIds.length) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}@example.test`,
        firstName: 'Dashboard',
        lastName: label,
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    userIds.push(user.id);
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        schoolId,
        roleId: role.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });
    return {
      email: `${marker}-${label}@example.test`,
      userId: user.id,
      roleId: role.id,
    };
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);
    return response.body.accessToken;
  }

  function registeredRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const routes: string[] = [];
    const collect = (layers: ExpressLayer[]) =>
      layers.forEach((layer) => {
        if (layer.route?.path && layer.route.methods) {
          const paths = Array.isArray(layer.route.path)
            ? layer.route.path
            : [layer.route.path];
          for (const path of paths)
            for (const [method, enabled] of Object.entries(layer.route.methods))
              if (enabled) routes.push(`${method.toUpperCase()} ${path}`);
        }
        if (layer.handle?.stack) collect(layer.handle.stack);
      });
    collect(expressApp._router?.stack ?? expressApp.router?.stack ?? []);
    return routes;
  }
});

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

type AppModuleBullmqServiceMock = {
  addEmailJob: (...args: unknown[]) => Promise<void>;
  addImportJob: (...args: unknown[]) => Promise<void>;
  addJob: (...args: Parameters<BullmqService['addJob']>) => Promise<void>;
  getQueueReadiness: BullmqService['getQueueReadiness'];
  createWorker: (
    ...args: Parameters<BullmqService['createWorker']>
  ) => NoopBullmqWorker;
  onModuleDestroy: BullmqService['onModuleDestroy'];
};

type NoopBullmqWorker = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  close: () => Promise<void>;
};

function noopBullmq(): AppModuleBullmqServiceMock {
  return {
    addEmailJob: jest.fn().mockResolvedValue(undefined),
    addImportJob: jest.fn().mockResolvedValue(undefined),
    addJob: jest.fn().mockResolvedValue(undefined),
    getQueueReadiness: jest.fn().mockResolvedValue({
      name: 'settings-branding-logo-cleanup',
      status: 'ok',
      counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
    }),
    createWorker: jest.fn().mockReturnValue({
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    }),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };
}
