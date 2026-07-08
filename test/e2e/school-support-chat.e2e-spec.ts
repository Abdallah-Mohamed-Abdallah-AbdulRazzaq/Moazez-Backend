import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CommunicationConversationStatus,
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { REALTIME_SERVER_EVENTS } from '../../src/infrastructure/realtime/realtime-event-names';
import { RealtimePublisherService } from '../../src/infrastructure/realtime/realtime-publisher.service';
import { CommunicationNotificationCommandService } from '../../src/modules/communication/application/communication-notification-command.service';
import { SCHOOL_SUPPORT_NOTIFICATION_SOURCE_TYPE } from '../../src/modules/school-support/domain/school-support.constants';

const GLOBAL_PREFIX = '/api/v1';
const TEST_PREFIX = `school-support-e2e-${Date.now()}`;
const PASSWORD = 'SchoolSupport1A!Pass';

const SUPPORT_PERMISSIONS = [
  {
    code: 'school.support.view',
    module: 'school',
    resource: 'support',
    action: 'view',
    description: "View the current school's support conversation and messages.",
  },
  {
    code: 'school.support.send',
    module: 'school',
    resource: 'support',
    action: 'send',
    description: "Send messages in the current school's support conversation.",
  },
  {
    code: 'platform.support.view',
    module: 'platform',
    resource: 'support',
    action: 'view',
    description:
      'View Platform Admin school support inbox, conversations, and messages.',
  },
  {
    code: 'platform.support.reply',
    module: 'platform',
    resource: 'support',
    action: 'reply',
    description:
      'Reply to school support conversations as Moazez Support.',
  },
  {
    code: 'platform.support.manage',
    module: 'platform',
    resource: 'support',
    action: 'manage',
    description: 'Close and reopen school support conversations.',
  },
];

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

jest.setTimeout(90000);

describe('School support chat V1 final acceptance (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let schoolAdminAEmail: string;
  let schoolAdminBEmail: string;
  let platformEmail: string;
  let platformSecondEmail: string;
  let schoolAdminAId: string;
  let schoolAdminBId: string;
  let platformUserId: string;
  let platformSecondUserId: string;
  let schoolAdminAToken: string;
  let schoolAdminBToken: string;
  let platformToken: string;
  let platformSecondToken: string;

  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await ensureSupportPermissions();

    const orgA = await createOrganization('A');
    organizationAId = orgA.id;
    const orgB = await createOrganization('B');
    organizationBId = orgB.id;
    const schoolA = await createSchool(organizationAId, 'A');
    schoolAId = schoolA.id;
    const schoolB = await createSchool(organizationBId, 'B');
    schoolBId = schoolB.id;

    schoolAdminAEmail = `${TEST_PREFIX}-school-a-admin@moazez.local`;
    schoolAdminBEmail = `${TEST_PREFIX}-school-b-admin@moazez.local`;
    platformEmail = `${TEST_PREFIX}-platform@moazez.local`;
    platformSecondEmail = `${TEST_PREFIX}-platform-second@moazez.local`;

    schoolAdminAId = await createSystemRoleActor({
      email: schoolAdminAEmail,
      userType: UserType.SCHOOL_USER,
      roleKey: 'school_admin',
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    schoolAdminBId = await createSystemRoleActor({
      email: schoolAdminBEmail,
      userType: UserType.SCHOOL_USER,
      roleKey: 'school_admin',
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    platformUserId = await createNoMembershipUser(
      platformEmail,
      UserType.PLATFORM_USER,
    );
    platformSecondUserId = await createNoMembershipUser(
      platformSecondEmail,
      UserType.PLATFORM_USER,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue(createNoopBullmqService())
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

    schoolAdminAToken = await login(schoolAdminAEmail);
    schoolAdminBToken = await login(schoolAdminBEmail);
    platformToken = await login(platformEmail);
    platformSecondToken = await login(platformSecondEmail);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: createdUserIds } },
            { organizationId: { in: createdOrganizationIds } },
            { schoolId: { in: createdSchoolIds } },
          ],
        },
      });
      await prisma.communicationNotificationPushAttempt.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationNotificationDelivery.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationNotification.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationMessageRead.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationMessageDelivery.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationMessageAttachment.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationMessageReaction.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationConversationParticipant.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationMessage.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationConversation.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
  });

  it('registers the school and platform support REST surface', () => {
    const routes = listRegisteredRoutes();
    const supportRoutes = routes.filter(
      (route) =>
        route.includes('/api/v1/school-support') ||
        route.includes('/api/v1/platform-admin/support'),
    );

    expect(supportRoutes).toEqual([
      'GET /api/v1/platform-admin/support/conversations',
      'GET /api/v1/platform-admin/support/conversations/:conversationId',
      'GET /api/v1/platform-admin/support/conversations/:conversationId/messages',
      'GET /api/v1/school-support/conversation',
      'GET /api/v1/school-support/messages',
      'POST /api/v1/platform-admin/support/conversations/:conversationId/close',
      'POST /api/v1/platform-admin/support/conversations/:conversationId/messages',
      'POST /api/v1/platform-admin/support/conversations/:conversationId/read',
      'POST /api/v1/platform-admin/support/conversations/:conversationId/reopen',
      'POST /api/v1/school-support/messages',
      'POST /api/v1/school-support/read',
    ]);
    expect(
      routes.filter(
        (route) =>
          route.includes('/api/v1/communication') &&
          route.toLowerCase().includes('support'),
      ),
    ).toEqual([]);
    expect(JSON.stringify(supportRoutes)).not.toContain('ticket');
    expect(JSON.stringify(supportRoutes)).not.toContain('sla');
    expect(JSON.stringify(supportRoutes)).not.toContain('assignment');
    expect(JSON.stringify(supportRoutes)).not.toContain('category');
  });

  it('supports the school-to-platform-to-school chat loop without leaking school-side internals', async () => {
    const schoolConversation = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/school-support/conversation`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .expect(200);
    const conversationId = schoolConversation.body.conversation.id;

    expect(schoolConversation.body).toMatchObject({
      conversation: {
        id: expect.any(String),
        type: 'support',
        status: 'active',
        title: 'Moazez Support',
        lastMessageAt: null,
      },
      unread: {
        count: 0,
        lastReadAt: null,
      },
    });
    expectNoSchoolLeaks(schoolConversation.body);

    const schoolMessage = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .send({
        body: 'Need help configuring the Help page.',
        clientMessageId: `${TEST_PREFIX}-school-message-1`,
      })
      .expect(201);

    expect(schoolMessage.body).toMatchObject({
      id: expect.any(String),
      conversationId,
      body: 'Need help configuring the Help page.',
      sender: {
        kind: 'school',
        displayName: expect.any(String),
      },
      isMine: true,
      sentAt: expect.any(String),
    });
    expectNoSchoolLeaks(schoolMessage.body);

    const duplicateSchoolMessage = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .send({
        body: 'Need help configuring the Help page.',
        clientMessageId: `${TEST_PREFIX}-school-message-1`,
      })
      .expect(201);
    expect(duplicateSchoolMessage.body.id).toBe(schoolMessage.body.id);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .send({
        body: 'Tenant override must be rejected.',
        schoolId: schoolBId,
        organizationId: organizationBId,
        membershipId: 'client-supplied-membership',
        participantId: 'client-supplied-participant',
      })
      .expect(400)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('validation.failed');
      });

    const schoolBConversation = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/school-support/conversation`)
      .set('Authorization', `Bearer ${schoolAdminBToken}`)
      .expect(200);
    expect(schoolBConversation.body.conversation.id).not.toBe(conversationId);

    const schoolBMessages = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminBToken}`)
      .expect(200);
    expect(JSON.stringify(schoolBMessages.body)).not.toContain(
      'Need help configuring the Help page.',
    );

    const inbox = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/support/conversations`)
      .query({ schoolId: schoolAId })
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(inbox.body.items).toHaveLength(1);
    expect(inbox.body.items[0]).toMatchObject({
      conversation: {
        id: conversationId,
        status: 'active',
        lastMessageAt: expect.any(String),
      },
      school: {
        id: schoolAId,
        name: `${TEST_PREFIX} School A`,
        status: 'active',
      },
      organization: {
        id: organizationAId,
        name: `${TEST_PREFIX} Organization A`,
      },
      lastMessage: {
        preview: 'Need help configuring the Help page.',
        senderKind: 'school',
        sentAt: expect.any(String),
      },
      unread: {
        count: 1,
      },
    });
    expectNoPlatformSecrets(inbox.body);

    const reply = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/support/conversations/${conversationId}/messages`,
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        body: 'Thanks for contacting Moazez Support.',
        clientMessageId: `${TEST_PREFIX}-platform-reply-1`,
      })
      .expect(201);

    expect(reply.body).toMatchObject({
      id: expect.any(String),
      conversationId,
      body: 'Thanks for contacting Moazez Support.',
      sender: {
        kind: 'support',
        displayName: 'Moazez Support',
      },
      isMine: true,
      sentAt: expect.any(String),
    });
    expect(JSON.stringify(reply.body)).not.toContain(platformEmail);
    expectNoSchoolLeaks(reply.body);

    const schoolMessages = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .expect(200);
    expect(schoolMessages.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: 'Thanks for contacting Moazez Support.',
          sender: {
            kind: 'support',
            displayName: 'Moazez Support',
          },
          isMine: false,
        }),
      ]),
    );
    expectNoSchoolLeaks(schoolMessages.body);

    const unreadAfterReply = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/school-support/conversation`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .expect(200);
    expect(unreadAfterReply.body.unread.count).toBe(1);

    const read = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/school-support/read`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .send({})
      .expect(200);
    expect(read.body).toMatchObject({
      conversationId,
      readAt: expect.any(String),
      markedCount: 1,
    });

    const unreadAfterRead = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/school-support/conversation`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .expect(200);
    expect(unreadAfterRead.body.unread.count).toBe(0);
  });

  it('closes and reopens support conversations with explicit 409 behavior while preserving platform membership boundaries', async () => {
    const conversation = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/school-support/conversation`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .expect(200);
    const conversationId = conversation.body.conversation.id;

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/support/conversations/${conversationId}/close`,
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ reason: 'Resolved in chat' })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          conversation: {
            id: conversationId,
            status: 'closed',
            closedAt: expect.any(String),
          },
        });
      });

    const publisher = app.get(RealtimePublisherService);
    const conversationSpy = jest.spyOn(publisher, 'publishToConversation');
    const userSpy = jest.spyOn(publisher, 'publishToUser');
    const notificationCountBeforeRejectedSend =
      await prisma.communicationNotification.count({
        where: { schoolId: schoolAId },
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .send({ body: 'Follow-up while closed.' })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'school_support.conversation.closed',
        );
      });

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/support/conversations/${conversationId}/messages`,
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ body: 'Reply while closed.' })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'platform_support.conversation.closed',
        );
      });

    expect(conversationSpy).not.toHaveBeenCalled();
    expect(userSpy).not.toHaveBeenCalled();
    await expect(
      prisma.communicationNotification.count({
        where: { schoolId: schoolAId },
      }),
    ).resolves.toBe(notificationCountBeforeRejectedSend);
    conversationSpy.mockRestore();
    userSpy.mockRestore();

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/support/conversations/${conversationId}/reopen`,
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ reason: 'School followed up' })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          conversation: {
            id: conversationId,
            status: 'active',
            reopenedAt: expect.any(String),
          },
        });
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .send({ body: 'Follow-up after reopen.' })
      .expect(201);

    await expect(
      prisma.membership.count({ where: { userId: platformUserId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.communicationConversationParticipant.count({
        where: { conversationId, userId: platformUserId },
      }),
    ).resolves.toBe(1);

    const settingsUsers = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/users`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .expect(200);
    const serializedUsers = JSON.stringify(settingsUsers.body);
    expect(serializedUsers).not.toContain(platformUserId);
    expect(serializedUsers).not.toContain(platformEmail);

    const stored = await prisma.communicationConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { status: true },
    });
    expect(stored.status).toBe(CommunicationConversationStatus.ACTIVE);
  });

  it('emits safe realtime events, creates in-app notifications, and keeps platform unread per actor', async () => {
    const conversation = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/school-support/conversation`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .expect(200);
    const conversationId = conversation.body.conversation.id;

    const publisher = app.get(RealtimePublisherService);
    const conversationSpy = jest.spyOn(publisher, 'publishToConversation');
    const userSpy = jest.spyOn(publisher, 'publishToUser');

    const schoolFollowUp = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .send({
        body: 'Support follow-up after platform participant exists.',
        clientMessageId: `${TEST_PREFIX}-school-follow-up-1b`,
      })
      .expect(201);

    const schoolMessageEvent = publishedConversationPayload(
      conversationSpy,
      conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_CREATED,
      (payload) => payload.message?.id === schoolFollowUp.body.id,
    );
    expect(schoolMessageEvent).toMatchObject({
      conversationId,
      message: {
        id: schoolFollowUp.body.id,
        conversationId,
        body: 'Support follow-up after platform participant exists.',
        sender: { kind: 'school' },
        sentAt: expect.any(String),
      },
      eventAt: expect.any(String),
    });
    expectNoSchoolRealtimeLeaks(schoolMessageEvent);

    const platformNotifications = await readNotificationsForMessage(
      schoolFollowUp.body.id,
    );
    expect(platformNotifications).toHaveLength(1);
    expect(platformNotifications[0]).toMatchObject({
      recipientUserId: platformUserId,
      actorUserId: null,
      sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
      sourceType: SCHOOL_SUPPORT_NOTIFICATION_SOURCE_TYPE,
      sourceId: schoolFollowUp.body.id,
      type: CommunicationNotificationType.MESSAGE_RECEIVED,
    });
    expect(platformNotifications[0].recipientUserId).not.toBe(schoolAdminAId);
    expect(platformNotifications[0].recipientUserId).not.toBe(schoolAdminBId);
    expect(platformNotifications[0].deliveries).toEqual([
      expect.objectContaining({
        channel: CommunicationNotificationDeliveryChannel.IN_APP,
      }),
    ]);
    expectNotificationRealtimeFor(
      userSpy,
      platformUserId,
      schoolFollowUp.body.id,
    );

    const sideEffectCallsBeforeSchoolReplay = {
      conversation: conversationSpy.mock.calls.length,
      user: userSpy.mock.calls.length,
      notifications: platformNotifications.length,
    };
    const duplicateSchoolFollowUp = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .send({
        body: 'Support follow-up after platform participant exists.',
        clientMessageId: `${TEST_PREFIX}-school-follow-up-1b`,
      })
      .expect(201);
    expect(duplicateSchoolFollowUp.body.id).toBe(schoolFollowUp.body.id);
    expect(conversationSpy).toHaveBeenCalledTimes(
      sideEffectCallsBeforeSchoolReplay.conversation,
    );
    expect(userSpy).toHaveBeenCalledTimes(sideEffectCallsBeforeSchoolReplay.user);
    await expect(readNotificationsForMessage(schoolFollowUp.body.id)).resolves
      .toHaveLength(sideEffectCallsBeforeSchoolReplay.notifications);

    await expect(countPushAttempts()).resolves.toBe(0);

    const platformUnreadBeforeRead = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/support/conversations`)
      .query({ schoolId: schoolAId })
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(platformUnreadBeforeRead.body.items[0].unread.count).toBeGreaterThan(
      0,
    );

    const platformRead = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/support/conversations/${conversationId}/read`,
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .send({})
      .expect(200);
    expect(platformRead.body.markedCount).toBeGreaterThan(0);

    const platformReadEvent = publishedConversationPayload(
      conversationSpy,
      conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_READ,
      (payload) => payload.reader?.kind === 'support',
    );
    expect(platformReadEvent).toMatchObject({
      conversationId,
      reader: { kind: 'support' },
      readAt: expect.any(String),
      markedCount: expect.any(Number),
      eventAt: expect.any(String),
    });
    expect(JSON.stringify(platformReadEvent)).not.toContain(platformUserId);

    const platformUnreadAfterRead = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/support/conversations`)
      .query({ schoolId: schoolAId })
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(platformUnreadAfterRead.body.items[0].unread.count).toBe(0);

    const secondPlatformUnread = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/support/conversations`)
      .query({ schoolId: schoolAId })
      .set('Authorization', `Bearer ${platformSecondToken}`)
      .expect(200);
    expect(secondPlatformUnread.body.items[0].unread.count).toBeGreaterThan(0);

    const platformReply = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/support/conversations/${conversationId}/messages`,
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        body: 'Realtime-safe support reply from platform.',
        clientMessageId: `${TEST_PREFIX}-platform-reply-1b`,
      })
      .expect(201);

    const platformMessageEvent = publishedConversationPayload(
      conversationSpy,
      conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_CREATED,
      (payload) => payload.message?.id === platformReply.body.id,
    );
    expect(platformMessageEvent).toMatchObject({
      conversationId,
      message: {
        id: platformReply.body.id,
        sender: {
          kind: 'support',
          displayName: 'Moazez Support',
        },
        body: 'Realtime-safe support reply from platform.',
      },
      eventAt: expect.any(String),
    });
    expectNoSchoolRealtimeLeaks(platformMessageEvent);
    expect(JSON.stringify(platformMessageEvent)).not.toContain(platformUserId);
    expect(JSON.stringify(platformMessageEvent)).not.toContain(platformEmail);

    const schoolNotifications = await readNotificationsForMessage(
      platformReply.body.id,
    );
    expect(schoolNotifications).toHaveLength(1);
    expect(schoolNotifications[0]).toMatchObject({
      recipientUserId: schoolAdminAId,
      actorUserId: null,
      sourceType: SCHOOL_SUPPORT_NOTIFICATION_SOURCE_TYPE,
      sourceId: platformReply.body.id,
      type: CommunicationNotificationType.MESSAGE_RECEIVED,
    });
    expect(schoolNotifications[0].recipientUserId).not.toBe(platformUserId);
    expectNotificationRealtimeFor(
      userSpy,
      schoolNotifications[0].recipientUserId,
      platformReply.body.id,
    );

    const sideEffectCallsBeforePlatformReplay = {
      conversation: conversationSpy.mock.calls.length,
      user: userSpy.mock.calls.length,
      notifications: schoolNotifications.length,
    };
    const duplicatePlatformReply = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/support/conversations/${conversationId}/messages`,
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        body: 'Realtime-safe support reply from platform.',
        clientMessageId: `${TEST_PREFIX}-platform-reply-1b`,
      })
      .expect(201);
    expect(duplicatePlatformReply.body.id).toBe(platformReply.body.id);
    expect(conversationSpy).toHaveBeenCalledTimes(
      sideEffectCallsBeforePlatformReplay.conversation,
    );
    expect(userSpy).toHaveBeenCalledTimes(
      sideEffectCallsBeforePlatformReplay.user,
    );
    await expect(readNotificationsForMessage(platformReply.body.id)).resolves
      .toHaveLength(sideEffectCallsBeforePlatformReplay.notifications);

    const schoolUnread = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/school-support/conversation`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .expect(200);
    expect(schoolUnread.body.unread.count).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/school-support/read`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .send({})
      .expect(200);

    const schoolReadEvent = publishedConversationPayload(
      conversationSpy,
      conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_READ,
      (payload) => payload.reader?.kind === 'school',
    );
    expect(schoolReadEvent).toMatchObject({
      conversationId,
      reader: { kind: 'school' },
      readAt: expect.any(String),
      markedCount: expect.any(Number),
      eventAt: expect.any(String),
    });
    expect(JSON.stringify(schoolReadEvent)).not.toContain('readerId');

    conversationSpy.mockImplementationOnce(() => {
      throw new Error('socket adapter unavailable');
    });
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .send({
        body: 'Message still commits when realtime publish fails.',
        clientMessageId: `${TEST_PREFIX}-publish-failure-1b`,
      })
      .expect(201);

    const notificationCommandService = app.get(
      CommunicationNotificationCommandService,
    );
    const notificationCommandSpy = jest
      .spyOn(notificationCommandService, 'createOrReuseNotification')
      .mockRejectedValueOnce(new Error('notification writer unavailable'));
    const notificationFailureMessage = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminAToken}`)
      .send({
        body: 'Message still commits when notification creation fails.',
        clientMessageId: `${TEST_PREFIX}-notification-failure-1c`,
      })
      .expect(201);
    await expect(
      prisma.communicationMessage.findUnique({
        where: { id: notificationFailureMessage.body.id },
        select: { id: true },
      }),
    ).resolves.toEqual({ id: notificationFailureMessage.body.id });
    notificationCommandSpy.mockRestore();
    await expect(countPushAttempts()).resolves.toBe(0);

    conversationSpy.mockRestore();
    userSpy.mockRestore();
  });

  async function ensureSupportPermissions(): Promise<void> {
    for (const permission of SUPPORT_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        update: permission,
        create: permission,
      });
    }

    await ensureSystemRolePermissions('platform_super_admin', [
      'platform.support.view',
      'platform.support.reply',
      'platform.support.manage',
    ]);
    await ensureSystemRolePermissions('school_admin', [
      'school.support.view',
      'school.support.send',
    ]);
  }

  async function ensureSystemRolePermissions(
    roleKey: string,
    codes: string[],
  ): Promise<void> {
    const role = await prisma.role.findFirst({
      where: { key: roleKey, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${roleKey} system role not found.`);

    const permissions = await prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });

    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  async function createOrganization(suffix: string): Promise<{ id: string }> {
    const organization = await prisma.organization.create({
      data: {
        name: `${TEST_PREFIX} Organization ${suffix}`,
        slug: `${TEST_PREFIX}-org-${suffix.toLowerCase()}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization;
  }

  async function createSchool(
    organizationId: string,
    suffix: string,
  ): Promise<{ id: string }> {
    const school = await prisma.school.create({
      data: {
        organizationId,
        name: `${TEST_PREFIX} School ${suffix}`,
        slug: `${TEST_PREFIX}-school-${suffix.toLowerCase()}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school;
  }

  async function createSystemRoleActor(params: {
    email: string;
    userType: UserType;
    roleKey: string;
    organizationId: string;
    schoolId: string;
  }): Promise<string> {
    const role = await prisma.role.findFirst({
      where: {
        key: params.roleKey,
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!role) throw new Error(`${params.roleKey} system role not found.`);

    const userId = await createNoMembershipUser(params.email, params.userType);
    await prisma.membership.create({
      data: {
        userId,
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        roleId: role.id,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return userId;
  }

  async function createNoMembershipUser(
    email: string,
    userType: UserType,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email,
        firstName: userType === UserType.PLATFORM_USER ? 'Platform' : 'School',
        lastName: 'Support',
        userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken;
  }

  function expectNoSchoolLeaks(payload: unknown): void {
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'participant',
      'platform@',
      'metadata',
      'deletedAt',
      'objectKey',
      'tokenHash',
      'session',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function expectNoPlatformSecrets(payload: unknown): void {
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      'passwordHash',
      'session',
      'tokenHash',
      'objectKey',
      'metadata',
      'audit',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function expectNoSchoolRealtimeLeaks(payload: unknown): void {
    const serialized = JSON.stringify(payload);
    for (const forbiddenKey of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'participant',
      'senderUserId',
      'readerId',
      'metadata',
      'deletedAt',
      'objectKey',
      'tokenHash',
      'session',
      'socket',
      'room',
    ]) {
      expect(serialized).not.toContain(`"${forbiddenKey}"`);
    }

    for (const forbiddenValue of [
      platformEmail,
      platformSecondEmail,
      platformUserId,
      platformSecondUserId,
    ]) {
      expect(serialized).not.toContain(forbiddenValue);
    }
  }

  function publishedConversationPayload(
    spy: jest.SpyInstance,
    expectedConversationId: string,
    expectedEventName: string,
    predicate: (payload: any) => boolean,
  ): any {
    const call = spy.mock.calls.find(
      ([schoolId, conversationId, eventName, payload]) =>
        schoolId === schoolAId &&
        conversationId === expectedConversationId &&
        eventName === expectedEventName &&
        predicate(payload),
    );
    expect(call).toBeDefined();
    return call?.[3];
  }

  function expectNotificationRealtimeFor(
    spy: jest.SpyInstance,
    recipientUserId: string,
    sourceId: string,
  ): void {
    const call = spy.mock.calls.find(
      ([schoolId, userId, eventName, payload]) =>
        schoolId === schoolAId &&
        userId === recipientUserId &&
        eventName ===
          REALTIME_SERVER_EVENTS.COMMUNICATION_NOTIFICATION_CREATED &&
        payload?.notification?.sourceId === sourceId,
    );
    expect(call).toBeDefined();
    const serialized = JSON.stringify(call?.[3]);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('recipientUserId');
    expect(serialized).not.toContain('actorUserId');
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('tokenHash');
  }

  async function readNotificationsForMessage(messageId: string) {
    return prisma.communicationNotification.findMany({
      where: {
        schoolId: schoolAId,
        sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
        sourceType: SCHOOL_SUPPORT_NOTIFICATION_SOURCE_TYPE,
        sourceId: messageId,
        type: CommunicationNotificationType.MESSAGE_RECEIVED,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        recipientUserId: true,
        actorUserId: true,
        sourceModule: true,
        sourceType: true,
        sourceId: true,
        type: true,
        metadata: true,
        deliveries: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            channel: true,
            status: true,
            provider: true,
          },
        },
      },
    });
  }

  function countPushAttempts(): Promise<number> {
    return prisma.communicationNotificationPushAttempt.count({
      where: { schoolId: { in: [schoolAId, schoolBId] } },
    });
  }

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

        for (const routePath of paths) {
          for (const method of methods) {
            routes.push(`${method} ${routePath}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }
});

function createNoopBullmqService(): Pick<
  BullmqService,
  'addEmailJob' | 'addImportJob' | 'createWorker' | 'onModuleDestroy'
> {
  return {
    addEmailJob: jest.fn().mockResolvedValue(undefined),
    addImportJob: jest.fn().mockResolvedValue(undefined),
    createWorker: jest.fn().mockReturnValue({ close: jest.fn() }),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };
}
