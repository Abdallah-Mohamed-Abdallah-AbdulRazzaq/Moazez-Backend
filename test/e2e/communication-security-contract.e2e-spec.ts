import { INestApplication } from '@nestjs/common';
import {
  GUARDS_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../src/common/guards/scope-resolver.guard';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { CommunicationModule } from '../../src/modules/communication/communication.module';
import { CommunicationAdminController } from '../../src/modules/communication/controller/communication-admin.controller';
import { CommunicationAnnouncementController } from '../../src/modules/communication/controller/communication-announcement.controller';
import { CommunicationConversationController } from '../../src/modules/communication/controller/communication-conversation.controller';
import { CommunicationMessageInteractionsController } from '../../src/modules/communication/controller/communication-message-interactions.controller';
import { CommunicationMessageController } from '../../src/modules/communication/controller/communication-message.controller';
import { CommunicationNotificationController } from '../../src/modules/communication/controller/communication-notification.controller';
import { CommunicationParticipantController } from '../../src/modules/communication/controller/communication-participant.controller';
import { CommunicationPolicyController } from '../../src/modules/communication/controller/communication-policy.controller';
import { CommunicationSafetyController } from '../../src/modules/communication/controller/communication-safety.controller';
import { CommunicationCoreAccessGuard } from '../../src/modules/communication/guards/communication-core-access.guard';
import { ParentAnnouncementsController } from '../../src/modules/parent-app/announcements/controller/parent-announcements.controller';
import { ParentMessagesController } from '../../src/modules/parent-app/messages/controller/parent-messages.controller';
import { ParentNotificationsController } from '../../src/modules/parent-app/notifications/controller/parent-notifications.controller';
import { StudentAnnouncementsController } from '../../src/modules/student-app/announcements/controller/student-announcements.controller';
import { StudentMessagesController } from '../../src/modules/student-app/messages/controller/student-messages.controller';
import { StudentNotificationsController } from '../../src/modules/student-app/notifications/controller/student-notifications.controller';
import { TeacherAnnouncementsController } from '../../src/modules/teacher-app/announcements/controller/teacher-announcements.controller';
import { TeacherMessagesController } from '../../src/modules/teacher-app/messages/controller/teacher-messages.controller';
import { TeacherNotificationsController } from '../../src/modules/teacher-app/notifications/controller/teacher-notifications.controller';

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: { stack?: ExpressLayer[] };
};

const COMMUNICATION_CORE_ROUTES = [
  'GET /api/v1/communication/policies',
  'PATCH /api/v1/communication/policies',
  'GET /api/v1/communication/admin/overview',
  'POST /api/v1/communication/admin/announcements/:announcementId/replay-notifications',
  'GET /api/v1/communication/announcements',
  'POST /api/v1/communication/announcements',
  'GET /api/v1/communication/announcements/:announcementId',
  'PATCH /api/v1/communication/announcements/:announcementId',
  'POST /api/v1/communication/announcements/:announcementId/publish',
  'POST /api/v1/communication/announcements/:announcementId/archive',
  'POST /api/v1/communication/announcements/:announcementId/cancel',
  'POST /api/v1/communication/announcements/:announcementId/read',
  'GET /api/v1/communication/announcements/:announcementId/read-summary',
  'GET /api/v1/communication/announcements/:announcementId/attachments',
  'POST /api/v1/communication/announcements/:announcementId/attachments',
  'DELETE /api/v1/communication/announcements/:announcementId/attachments/:attachmentId',
  'GET /api/v1/communication/conversations',
  'POST /api/v1/communication/conversations',
  'GET /api/v1/communication/conversations/:conversationId',
  'PATCH /api/v1/communication/conversations/:conversationId',
  'POST /api/v1/communication/conversations/:conversationId/archive',
  'POST /api/v1/communication/conversations/:conversationId/close',
  'POST /api/v1/communication/conversations/:conversationId/reopen',
  'GET /api/v1/communication/conversations/:conversationId/messages',
  'POST /api/v1/communication/conversations/:conversationId/messages',
  'POST /api/v1/communication/conversations/:conversationId/read',
  'GET /api/v1/communication/conversations/:conversationId/read-summary',
  'GET /api/v1/communication/messages/:messageId',
  'GET /api/v1/communication/messages/:messageId/readers',
  'GET /api/v1/communication/messages/:messageId/info',
  'PATCH /api/v1/communication/messages/:messageId',
  'DELETE /api/v1/communication/messages/:messageId',
  'POST /api/v1/communication/messages/:messageId/read',
  'GET /api/v1/communication/messages/:messageId/reactions',
  'PUT /api/v1/communication/messages/:messageId/reactions',
  'DELETE /api/v1/communication/messages/:messageId/reactions/me',
  'GET /api/v1/communication/messages/:messageId/attachments',
  'POST /api/v1/communication/messages/:messageId/attachments',
  'DELETE /api/v1/communication/messages/:messageId/attachments/:attachmentId',
  'GET /api/v1/communication/notifications',
  'POST /api/v1/communication/notifications/read-all',
  'GET /api/v1/communication/notifications/:notificationId',
  'POST /api/v1/communication/notifications/:notificationId/read',
  'POST /api/v1/communication/notifications/:notificationId/archive',
  'GET /api/v1/communication/notification-deliveries',
  'GET /api/v1/communication/notification-deliveries/:deliveryId',
  'GET /api/v1/communication/conversations/:conversationId/participants',
  'POST /api/v1/communication/conversations/:conversationId/participants',
  'PATCH /api/v1/communication/conversations/:conversationId/participants/:participantId',
  'DELETE /api/v1/communication/conversations/:conversationId/participants/:participantId',
  'POST /api/v1/communication/conversations/:conversationId/leave',
  'POST /api/v1/communication/conversations/:conversationId/participants/:participantId/promote',
  'POST /api/v1/communication/conversations/:conversationId/participants/:participantId/demote',
  'GET /api/v1/communication/conversations/:conversationId/invites',
  'POST /api/v1/communication/conversations/:conversationId/invites',
  'POST /api/v1/communication/conversation-invites/:inviteId/accept',
  'POST /api/v1/communication/conversation-invites/:inviteId/reject',
  'GET /api/v1/communication/conversations/:conversationId/join-requests',
  'POST /api/v1/communication/conversations/:conversationId/join-requests',
  'POST /api/v1/communication/join-requests/:requestId/approve',
  'POST /api/v1/communication/join-requests/:requestId/reject',
  'POST /api/v1/communication/messages/:messageId/reports',
  'GET /api/v1/communication/message-reports',
  'GET /api/v1/communication/message-reports/:reportId',
  'PATCH /api/v1/communication/message-reports/:reportId',
  'GET /api/v1/communication/messages/:messageId/moderation-actions',
  'POST /api/v1/communication/messages/:messageId/moderation-actions',
  'GET /api/v1/communication/blocks',
  'POST /api/v1/communication/blocks',
  'DELETE /api/v1/communication/blocks/:blockId',
  'GET /api/v1/communication/restrictions',
  'POST /api/v1/communication/restrictions',
  'PATCH /api/v1/communication/restrictions/:restrictionId',
  'DELETE /api/v1/communication/restrictions/:restrictionId',
] as const;

describe('Communication security-contract route inventory (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue(createNoopBullmqService())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('registers the complete core Communication inventory without omissions', () => {
    const routes = listRegisteredRoutes().filter((route) =>
      route.includes(' /api/v1/communication/'),
    );

    expect(routes).toEqual([...COMMUNICATION_CORE_ROUTES].sort());
  });

  it('applies the core guard to every core controller and no actor adapter', () => {
    const guardedCoreControllers = [
      [CommunicationPolicyController, 'communication'],
      [CommunicationAdminController, 'communication/admin'],
      [CommunicationAnnouncementController, 'communication/announcements'],
      [CommunicationConversationController, 'communication/conversations'],
      [CommunicationParticipantController, 'communication'],
      [CommunicationMessageController, 'communication'],
      [
        CommunicationMessageInteractionsController,
        'communication/messages/:messageId',
      ],
      [CommunicationNotificationController, 'communication'],
      [CommunicationSafetyController, 'communication'],
    ] as const;

    for (const [controller, path] of guardedCoreControllers) {
      expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(path);
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        CommunicationCoreAccessGuard,
      ]);
    }

    const actorAdapters = [
      [ParentMessagesController, 'parent/messages'],
      [ParentAnnouncementsController, 'parent/announcements'],
      [ParentNotificationsController, 'parent/notifications'],
      [StudentMessagesController, 'student/messages'],
      [StudentAnnouncementsController, 'student/announcements'],
      [StudentNotificationsController, 'student/notifications'],
      [TeacherMessagesController, 'teacher/messages'],
      [TeacherAnnouncementsController, 'teacher/announcements'],
      [TeacherNotificationsController, 'teacher/notifications'],
    ] as const;

    for (const [controller, path] of actorAdapters) {
      expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(path);
      expect(
        Reflect.getMetadata(GUARDS_METADATA, controller) ?? [],
      ).not.toContain(CommunicationCoreAccessGuard);
    }
  });

  it('registers the guard only in Communication and preserves global order', () => {
    const communicationProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      CommunicationModule,
    ) as unknown[];
    expect(communicationProviders).toContain(CommunicationCoreAccessGuard);

    const appProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AppModule,
    ) as Array<unknown>;
    expect(appProviders).not.toContain(CommunicationCoreAccessGuard);

    const globalGuardOrder = appProviders
      .filter(
        (provider): provider is { provide: unknown; useClass: unknown } =>
          typeof provider === 'object' &&
          provider !== null &&
          'provide' in provider &&
          provider.provide === APP_GUARD &&
          'useClass' in provider,
      )
      .map((provider) => provider.useClass);

    expect(globalGuardOrder).toEqual([
      JwtAuthGuard,
      ScopeResolverGuard,
      PermissionsGuard,
    ]);
    expect(globalGuardOrder).not.toContain(CommunicationCoreAccessGuard);
  });

  function listRegisteredRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];
    collectRoutes(stack, routes);
    return routes.sort();
  }

  function collectRoutes(layers: ExpressLayer[], routes: string[]): void {
    for (const layer of layers) {
      if (layer.route?.path && layer.route.methods) {
        const paths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        const methods = Object.entries(layer.route.methods)
          .filter(([, enabled]) => enabled)
          .map(([method]) => method.toUpperCase());

        for (const path of paths) {
          for (const method of methods) {
            routes.push(`${method} ${normalizeRoutePath(path)}`);
          }
        }
      }

      if (layer.handle?.stack) collectRoutes(layer.handle.stack, routes);
    }
  }

  function normalizeRoutePath(path: string): string {
    return `/${path}`.replace(/\/{2,}/g, '/');
  }

  type AppModuleBullmqServiceMock = {
    getQueue: (
      ...args: Parameters<BullmqService['getQueue']>
    ) => NoopBullmqQueue;
    addJob: (
      ...args: Parameters<BullmqService['addJob']>
    ) => Promise<{ id: string }>;
    getQueueReadiness: BullmqService['getQueueReadiness'];
    createWorker: (
      ...args: Parameters<BullmqService['createWorker']>
    ) => NoopBullmqWorker;
  };

  type NoopBullmqQueue = {
    add: (...args: unknown[]) => Promise<{ id: string }>;
    close: () => Promise<void>;
  };

  type NoopBullmqWorker = {
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    close: () => Promise<void>;
  };

  function createNoopBullmqService(): AppModuleBullmqServiceMock {
    return {
      getQueue: jest.fn(() => ({
        add: jest.fn().mockResolvedValue({ id: 'noop-job' }),
        close: jest.fn().mockResolvedValue(undefined),
      })),
      addJob: jest.fn().mockResolvedValue({ id: 'noop-job' }),
      getQueueReadiness: jest.fn().mockResolvedValue({
        name: 'settings-branding-logo-cleanup',
        status: 'ok',
        counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
      }),
      createWorker: jest.fn(() => ({
        close: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      })),
    };
  }
});
