import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
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
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { CommunicationNotificationGenerationService } from '../../src/modules/communication/application/communication-notification-generation.service';
import {
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE,
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  COMMUNICATION_IN_APP_NOTIFICATION_PROVIDER,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
} from '../../src/modules/communication/domain/communication-notification-generation-domain';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';
const PASSWORD = 'Communication123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type StoredPolicySnapshot = {
  id: string;
  isEnabled: boolean;
  allowOnlinePresence: boolean;
  allowDeliveryReceipts: boolean;
  metadata: unknown;
};

jest.setTimeout(90000);

describe('Sprint 6C Realtime + Announcements + Notifications closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;
  let demoSchoolId: string;
  let demoOrganizationId: string;
  let adminUserId: string;
  let originalPolicy: StoredPolicySnapshot | null = null;
  let closeoutPolicyId: string | null = null;
  let uploadedBucket: string | null = null;
  let uploadedObjectKey: string | null = null;

  const suffix = randomUUID().split('-')[0];
  const cleanupState = {
    roleIds: new Set<string>(),
    userIds: new Set<string>(),
    fileIds: new Set<string>(),
    announcementIds: new Set<string>(),
    attachmentIds: new Set<string>(),
    notificationIds: new Set<string>(),
    deliveryIds: new Set<string>(),
    schoolIds: new Set<string>(),
    organizationIds: new Set<string>(),
  };

  const createdUsers: Record<
    'recipient' | 'noAccess',
    { id: string; email: string }
  > = {
    recipient: { id: '', email: '' },
    noAccess: { id: '', email: '' },
  };

  let crossSchoolAnnouncementId = '';
  let crossSchoolNotificationId = '';
  let crossSchoolDeliveryId = '';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error(
        'Demo school admin not found - run `npm run seed` first.',
      );
    }

    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;
    adminUserId = demoAdmin.id;
    originalPolicy = await readCurrentPolicySnapshot();

    await createCloseoutUsersAndRoles();
    await createCrossSchoolFixtures();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

    storageService = app.get(StorageService);
  });

  afterAll(async () => {
    if (uploadedBucket && uploadedObjectKey && storageService) {
      await storageService.deleteObject({
        bucket: uploadedBucket,
        objectKey: uploadedObjectKey,
      });
    }

    if (app) {
      await app.close();
    }

    if (prisma) {
      await cleanupCloseoutData();
      await prisma.$disconnect();
    }
  });

  it('runs the Sprint 6C REST and queue-backed closeout flow', async () => {
    const admin = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const meResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(meResponse.body).toMatchObject({
      email: DEMO_ADMIN_EMAIL,
      activeMembership: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
      },
    });

    const policy = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        isEnabled: true,
        allowOnlinePresence: true,
        allowDeliveryReceipts: true,
        metadata: { closeout: 'sprint6c' },
      })
      .expect(200);
    closeoutPolicyId = policy.body.id;
    expect(policy.body).toMatchObject({
      isConfigured: true,
      isEnabled: true,
      allowOnlinePresence: true,
      allowDeliveryReceipts: true,
    });
    expectNoSchoolId(policy.body);

    const title = `Sprint 6C closeout announcement ${suffix}`;
    const draft = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/announcements`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        title,
        body: 'Sprint 6C closeout body for deterministic notification generation.',
        priority: 'high',
        audienceType: 'custom',
        audiences: [{ userId: createdUsers.recipient.id }],
        metadata: {
          closeout: 'sprint6c',
          body: 'must not leak through metadata',
          schoolId: demoSchoolId,
        },
      })
      .expect(201);
    const announcementId = draft.body.id as string;
    cleanupState.announcementIds.add(announcementId);
    expect(draft.body).toMatchObject({
      id: announcementId,
      title,
      status: 'draft',
      priority: 'high',
      audienceType: 'custom',
      audienceSummary: { type: 'custom', rowCount: 1 },
      metadata: { closeout: 'sprint6c' },
    });
    expect(draft.body.audiences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: createdUsers.recipient.id }),
      ]),
    );
    expectNoSchoolId(draft.body);
    await expect(countAnnouncementNotifications(announcementId)).resolves.toBe(
      0,
    );

    const upload = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/files`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .attach('file', Buffer.from('sprint 6c announcement attachment'), {
        filename: `sprint-6c-${suffix}.txt`,
        contentType: 'text/plain',
      })
      .expect(201);
    const fileId = upload.body.id as string;
    cleanupState.fileIds.add(fileId);
    const uploadedFile = await prisma.file.findUnique({
      where: { id: fileId },
      select: { bucket: true, objectKey: true },
    });
    uploadedBucket = uploadedFile?.bucket ?? null;
    uploadedObjectKey = uploadedFile?.objectKey ?? null;

    const attachment = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/announcements/${announcementId}/attachments`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        fileId,
        caption: 'Sprint 6C closeout attachment',
        sortOrder: 1,
      })
      .expect(201);
    cleanupState.attachmentIds.add(attachment.body.id);
    expect(attachment.body).toMatchObject({
      announcementId,
      fileId,
      createdById: adminUserId,
      file: {
        id: fileId,
        filename: `sprint-6c-${suffix}.txt`,
        mimeType: 'text/plain',
      },
    });
    expectNoSchoolId(attachment.body);

    const attachments = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/announcements/${announcementId}/attachments`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(attachments.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: attachment.body.id, fileId }),
      ]),
    );
    expectNoSchoolId(attachments.body);

    const announcementList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/announcements`)
      .query({ search: title, status: 'draft' })
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      announcementList.body.items.map((item: { id: string }) => item.id),
    ).toContain(announcementId);
    expectNoSchoolId(announcementList.body);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/announcements/${announcementId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      id: announcementId,
      title,
      status: 'draft',
      attachmentCount: 1,
      metadata: { closeout: 'sprint6c' },
    });
    expect(detail.body.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: attachment.body.id, fileId }),
      ]),
    );
    expectNoSchoolId(detail.body);
    await expect(countAnnouncementNotifications(announcementId)).resolves.toBe(
      0,
    );

    const bullmqService = app.get(BullmqService, { strict: false });
    const addJobSpy = jest.spyOn(bullmqService, 'addJob');

    const published = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/announcements/${announcementId}/publish`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);
    expect(published.body).toMatchObject({
      id: announcementId,
      status: 'published',
      publishedById: adminUserId,
      publishedAt: expect.any(String),
    });
    expectNoSchoolId(published.body);
    expect(addJobSpy).toHaveBeenCalledWith(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
      expect.objectContaining({
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        announcementId,
        actorUserId: adminUserId,
        actorUserType: UserType.SCHOOL_USER,
      }),
      expect.objectContaining({
        jobId: expect.stringContaining(announcementId),
      }),
    );
    addJobSpy.mockRestore();

    // Socket.io closeout is covered by realtime unit tests and AppModule boot.
    // This E2E stays REST + queue-backed because socket.io-client is not a
    // project dependency, and adding it would expand closeout scope.
    await generateAnnouncementNotifications(announcementId);

    const notificationRows = await prisma.communicationNotification.findMany({
      where: {
        schoolId: demoSchoolId,
        sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
        sourceType: COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE,
        sourceId: announcementId,
        type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        recipientUserId: true,
        status: true,
        deliveries: {
          select: {
            id: true,
            channel: true,
            status: true,
            provider: true,
          },
        },
      },
    });
    expect(notificationRows).toHaveLength(1);
    expect(notificationRows[0]).toMatchObject({
      recipientUserId: createdUsers.recipient.id,
      status: CommunicationNotificationStatus.UNREAD,
    });
    const notificationId = notificationRows[0].id;
    cleanupState.notificationIds.add(notificationId);
    expect(notificationRows[0].deliveries).toHaveLength(1);
    expect(notificationRows[0].deliveries[0]).toMatchObject({
      channel: CommunicationNotificationDeliveryChannel.IN_APP,
      status: CommunicationNotificationDeliveryStatus.DELIVERED,
      provider: COMMUNICATION_IN_APP_NOTIFICATION_PROVIDER,
    });
    cleanupState.deliveryIds.add(notificationRows[0].deliveries[0].id);

    const externalDeliveryCount =
      await prisma.communicationNotificationDelivery.count({
        where: {
          notificationId,
          channel: { not: CommunicationNotificationDeliveryChannel.IN_APP },
        },
      });
    expect(externalDeliveryCount).toBe(0);

    const beforeRetry = await readNotificationGenerationCounts(announcementId);
    await generateAnnouncementNotifications(announcementId);
    await expect(
      readNotificationGenerationCounts(announcementId),
    ).resolves.toEqual(beforeRetry);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/announcements/${announcementId}/publish`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(409);
    await expect(
      readNotificationGenerationCounts(announcementId),
    ).resolves.toEqual(beforeRetry);

    const recipient = await login(createdUsers.recipient.email, PASSWORD);

    const notifications = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/notifications`)
      .query({ sourceId: announcementId })
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .expect(200);
    expect(notifications.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: notificationId,
          recipientUserId: createdUsers.recipient.id,
          sourceModule: 'announcements',
          sourceType: COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE,
          sourceId: announcementId,
          type: 'announcement_published',
          status: 'unread',
        }),
      ]),
    );
    expectNoSchoolId(notifications.body);

    const notificationDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/notifications/${notificationId}`)
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .expect(200);
    expect(notificationDetail.body).toMatchObject({
      id: notificationId,
      status: 'unread',
      deliverySummary: {
        total: 1,
        delivered: 1,
      },
    });
    expectNoSchoolId(notificationDetail.body);

    const readNotification = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/notifications/${notificationId}/read`,
      )
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .expect(201);
    expect(readNotification.body).toMatchObject({
      id: notificationId,
      status: 'read',
      readAt: expect.any(String),
    });
    expectNoSchoolId(readNotification.body);

    const readAll = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/notifications/read-all`)
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .expect(201);
    expect(readAll.body).toMatchObject({
      markedCount: 0,
      readAt: expect.any(String),
    });

    const archivedNotification = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/notifications/${notificationId}/archive`,
      )
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .expect(201);
    expect(archivedNotification.body).toMatchObject({
      id: notificationId,
      status: 'archived',
      archivedAt: expect.any(String),
    });
    expectNoSchoolId(archivedNotification.body);

    const deliveryList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/notification-deliveries`)
      .query({ notificationId })
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(deliveryList.body.items).toEqual([
      expect.objectContaining({
        id: notificationRows[0].deliveries[0].id,
        notificationId,
        channel: 'in_app',
        status: 'delivered',
        provider: COMMUNICATION_IN_APP_NOTIFICATION_PROVIDER,
      }),
    ]);
    expectNoSchoolId(deliveryList.body);

    const deliveryDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/notification-deliveries/${notificationRows[0].deliveries[0].id}`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(deliveryDetail.body).toMatchObject({
      id: notificationRows[0].deliveries[0].id,
      notificationId,
      channel: 'in_app',
      status: 'delivered',
      provider: COMMUNICATION_IN_APP_NOTIFICATION_PROVIDER,
    });
    expectNoSchoolId(deliveryDetail.body);

    const announcementRead = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/announcements/${announcementId}/read`,
      )
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .expect(201);
    expect(announcementRead.body).toMatchObject({
      announcementId,
      userId: createdUsers.recipient.id,
      readAt: expect.any(String),
    });
    expectNoSchoolId(announcementRead.body);

    const readSummary = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/announcements/${announcementId}/read-summary`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(readSummary.body).toMatchObject({
      announcementId,
      readCount: 1,
      totalTargetCount: null,
    });
    expectNoSchoolId(readSummary.body);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/announcements/${crossSchoolAnnouncementId}`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/notifications/${crossSchoolNotificationId}`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/notification-deliveries/${crossSchoolDeliveryId}`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);

    const noAccess = await login(createdUsers.noAccess.email, PASSWORD);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/announcements`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .send({
        title: `Forbidden announcement ${suffix}`,
        body: 'No access actor must not manage announcements.',
      })
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/notifications`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);

    for (const deferredRoute of [
      '/teacher/communication/announcements',
      '/student/communication/announcements',
      '/parent/communication/announcements',
      '/platform/communication/announcements',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${deferredRoute}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(404);
    }
  });

  async function createCloseoutUsersAndRoles(): Promise<void> {
    const recipientRoleId = await createCustomRole('recipient', [
      'communication.announcements.view',
      'communication.notifications.view',
    ]);
    const noAccessRoleId = await createCustomRole('no-access', []);

    createdUsers.recipient = await createUserWithMembership({
      key: 'recipient',
      roleId: recipientRoleId,
    });
    createdUsers.noAccess = await createUserWithMembership({
      key: 'no-access',
      roleId: noAccessRoleId,
    });
  }

  async function createCrossSchoolFixtures(): Promise<void> {
    const schoolAdminRole = await findSystemRole('school_admin');
    const organization = await prisma.organization.create({
      data: {
        slug: `sprint-6c-closeout-${suffix}`,
        name: `Sprint 6C Closeout ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanupState.organizationIds.add(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `sprint-6c-closeout-${suffix}`,
        name: `Sprint 6C Closeout ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanupState.schoolIds.add(school.id);

    const crossUser = await createUserWithMembership({
      key: 'cross-school-admin',
      roleId: schoolAdminRole.id,
      organizationId: organization.id,
      schoolId: school.id,
    });

    const crossAnnouncement = await prisma.communicationAnnouncement.create({
      data: {
        schoolId: school.id,
        title: `Cross school Sprint 6C ${suffix}`,
        body: 'Cross-school announcement body must remain scoped.',
        status: CommunicationAnnouncementStatus.DRAFT,
        priority: CommunicationAnnouncementPriority.NORMAL,
        audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
        createdById: crossUser.id,
        updatedById: crossUser.id,
      },
      select: { id: true },
    });
    crossSchoolAnnouncementId = crossAnnouncement.id;
    cleanupState.announcementIds.add(crossAnnouncement.id);

    const notification = await prisma.communicationNotification.create({
      data: {
        schoolId: school.id,
        recipientUserId: crossUser.id,
        actorUserId: crossUser.id,
        sourceModule: CommunicationNotificationSourceModule.SYSTEM,
        sourceType: 'sprint_6c_cross_school_fixture',
        sourceId: null,
        type: CommunicationNotificationType.SYSTEM_ALERT,
        title: `Cross school notification ${suffix}`,
        body: 'Cross-school notification body must remain scoped.',
        priority: CommunicationNotificationPriority.NORMAL,
        status: CommunicationNotificationStatus.UNREAD,
      },
      select: { id: true },
    });
    crossSchoolNotificationId = notification.id;
    cleanupState.notificationIds.add(notification.id);

    const delivery = await prisma.communicationNotificationDelivery.create({
      data: {
        schoolId: school.id,
        notificationId: notification.id,
        channel: CommunicationNotificationDeliveryChannel.IN_APP,
        status: CommunicationNotificationDeliveryStatus.DELIVERED,
        provider: COMMUNICATION_IN_APP_NOTIFICATION_PROVIDER,
        attemptedAt: new Date(),
        deliveredAt: new Date(),
      },
      select: { id: true },
    });
    crossSchoolDeliveryId = delivery.id;
    cleanupState.deliveryIds.add(delivery.id);
  }

  async function createCustomRole(
    key: string,
    permissionCodes: string[],
  ): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: demoSchoolId,
        key: `sprint-6c-${suffix}-${key}`,
        name: `Sprint 6C ${key} ${suffix}`,
        isSystem: false,
      },
      select: { id: true },
    });
    cleanupState.roleIds.add(role.id);

    if (permissionCodes.length > 0) {
      const permissions = await prisma.permission.findMany({
        where: { code: { in: permissionCodes } },
        select: { id: true, code: true },
      });
      const missing = permissionCodes.filter(
        (code) => !permissions.some((permission) => permission.code === code),
      );
      if (missing.length > 0) {
        throw new Error(`Missing permissions: ${missing.join(', ')}`);
      }

      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      });
    }

    return role.id;
  }

  async function createUserWithMembership(params: {
    key: string;
    roleId: string;
    organizationId?: string;
    schoolId?: string;
  }): Promise<{ id: string; email: string }> {
    const email = `sprint-6c-${suffix}-${params.key}@e2e.moazez.local`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Sprint6C',
        lastName: params.key,
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    cleanupState.userIds.add(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: params.organizationId ?? demoOrganizationId,
        schoolId: params.schoolId ?? demoSchoolId,
        roleId: params.roleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });

    return { id: user.id, email };
  }

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${key} system role not found - run seed.`);
    return role;
  }

  async function login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function generateAnnouncementNotifications(
    announcementId: string,
  ): Promise<void> {
    const generationService = app.get(
      CommunicationNotificationGenerationService,
    );
    const context = createRequestContext(
      `sprint-6c-closeout-notification-generation:${announcementId}`,
    );
    context.actor = {
      id: adminUserId,
      userType: UserType.SCHOOL_USER,
    };
    context.activeMembership = {
      membershipId: 'sprint-6c-closeout-generation',
      organizationId: demoOrganizationId,
      schoolId: demoSchoolId,
      roleId: 'sprint-6c-closeout-generation',
      permissions: [],
    };

    await runWithRequestContext(context, () =>
      generationService.generateForPublishedAnnouncement({
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        announcementId,
        actorUserId: adminUserId,
        actorUserType: UserType.SCHOOL_USER,
      }),
    );
  }

  async function countAnnouncementNotifications(
    announcementId: string,
  ): Promise<number> {
    return prisma.communicationNotification.count({
      where: {
        schoolId: demoSchoolId,
        sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
        sourceType: COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE,
        sourceId: announcementId,
      },
    });
  }

  async function readNotificationGenerationCounts(
    announcementId: string,
  ): Promise<{ notifications: number; deliveries: number; external: number }> {
    const notifications = await prisma.communicationNotification.findMany({
      where: {
        schoolId: demoSchoolId,
        sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
        sourceType: COMMUNICATION_ANNOUNCEMENT_NOTIFICATION_SOURCE_TYPE,
        sourceId: announcementId,
      },
      select: { id: true },
    });
    const notificationIds = notifications.map(
      (notification) => notification.id,
    );
    const [deliveries, external] = await Promise.all([
      prisma.communicationNotificationDelivery.count({
        where: { notificationId: { in: notificationIds } },
      }),
      prisma.communicationNotificationDelivery.count({
        where: {
          notificationId: { in: notificationIds },
          channel: { not: CommunicationNotificationDeliveryChannel.IN_APP },
        },
      }),
    ]);

    return { notifications: notifications.length, deliveries, external };
  }

  async function readCurrentPolicySnapshot(): Promise<StoredPolicySnapshot | null> {
    return prisma.communicationPolicy.findUnique({
      where: { schoolId: demoSchoolId },
      select: {
        id: true,
        isEnabled: true,
        allowOnlinePresence: true,
        allowDeliveryReceipts: true,
        metadata: true,
      },
    });
  }

  async function cleanupCloseoutData(): Promise<void> {
    const userIds = [...cleanupState.userIds];
    const roleIds = [...cleanupState.roleIds];
    const fileIds = [...cleanupState.fileIds];
    const announcementIds = [...cleanupState.announcementIds].filter(Boolean);
    const notificationIds = [...cleanupState.notificationIds].filter(Boolean);
    const deliveryIds = [...cleanupState.deliveryIds].filter(Boolean);

    await restoreCommunicationPolicy();

    await prisma.auditLog.deleteMany({
      where: {
        module: 'communication',
        OR: [
          { resourceId: { in: announcementIds } },
          { resourceId: { in: [...cleanupState.attachmentIds] } },
          { actorId: { in: userIds } },
        ],
      },
    });

    const sourceNotificationIds =
      await prisma.communicationNotification.findMany({
        where: {
          OR: [
            { id: { in: notificationIds } },
            { sourceId: { in: announcementIds } },
            { recipientUserId: { in: userIds } },
          ],
        },
        select: { id: true },
      });
    const allNotificationIds = [
      ...new Set([
        ...notificationIds,
        ...sourceNotificationIds.map((notification) => notification.id),
      ]),
    ];

    if (allNotificationIds.length > 0 || deliveryIds.length > 0) {
      await prisma.communicationNotificationDelivery.deleteMany({
        where: {
          OR: [
            { id: { in: deliveryIds } },
            { notificationId: { in: allNotificationIds } },
          ],
        },
      });
      await prisma.communicationNotification.deleteMany({
        where: { id: { in: allNotificationIds } },
      });
    }

    if (announcementIds.length > 0) {
      await prisma.communicationAnnouncementAttachment.deleteMany({
        where: { announcementId: { in: announcementIds } },
      });
      await prisma.communicationAnnouncementRead.deleteMany({
        where: { announcementId: { in: announcementIds } },
      });
      await prisma.communicationAnnouncementAudience.deleteMany({
        where: { announcementId: { in: announcementIds } },
      });
      await prisma.communicationAnnouncement.deleteMany({
        where: { id: { in: announcementIds } },
      });
    }

    if (fileIds.length > 0) {
      await prisma.file.deleteMany({ where: { id: { in: fileIds } } });
    }

    if (userIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.membership.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    if (roleIds.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    }

    if (cleanupState.schoolIds.size > 0) {
      await prisma.school.deleteMany({
        where: { id: { in: [...cleanupState.schoolIds] } },
      });
    }
    if (cleanupState.organizationIds.size > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: [...cleanupState.organizationIds] } },
      });
    }
  }

  async function restoreCommunicationPolicy(): Promise<void> {
    if (originalPolicy) {
      await prisma.communicationPolicy.update({
        where: { id: originalPolicy.id },
        data: {
          isEnabled: originalPolicy.isEnabled,
          allowOnlinePresence: originalPolicy.allowOnlinePresence,
          allowDeliveryReceipts: originalPolicy.allowDeliveryReceipts,
          metadata: originalPolicy.metadata,
        },
      });
      return;
    }

    if (closeoutPolicyId) {
      await prisma.communicationPolicy.deleteMany({
        where: { id: closeoutPolicyId, schoolId: demoSchoolId },
      });
    }
  }

  function expectNoSchoolId(value: unknown): void {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (const item of value) expectNoSchoolId(item);
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      expect(key).not.toBe('schoolId');
      expectNoSchoolId(nested);
    }
  }
});
