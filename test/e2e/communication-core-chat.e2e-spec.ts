import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CommunicationConversationStatus,
  CommunicationConversationType,
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
import { StorageService } from '../../src/infrastructure/storage/storage.service';

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
  allowDirectStaffToStaff: boolean;
  allowAdminToAnyone: boolean;
  allowTeacherToParent: boolean;
  allowTeacherToStudent: boolean;
  allowStudentToTeacher: boolean;
  allowStudentToStudent: boolean;
  studentDirectMode:
    | 'DISABLED'
    | 'SAME_CLASSROOM'
    | 'SAME_GRADE'
    | 'SAME_SCHOOL'
    | 'ANY_SCHOOL_USER'
    | 'APPROVAL_REQUIRED';
  allowTeacherCreatedGroups: boolean;
  allowStudentCreatedGroups: boolean;
  requireApprovalForStudentGroups: boolean;
  allowParentToParent: boolean;
  allowAttachments: boolean;
  allowVoiceMessages: boolean;
  allowVideoMessages: boolean;
  allowMessageEdit: boolean;
  allowMessageDelete: boolean;
  allowReactions: boolean;
  allowReadReceipts: boolean;
  allowDeliveryReceipts: boolean;
  allowOnlinePresence: boolean;
  maxGroupMembers: number;
  maxMessageLength: number;
  maxAttachmentSizeMb: number;
  retentionDays: number | null;
  moderationMode: string | null;
  createdById: string | null;
  updatedById: string | null;
  metadata: unknown;
};

jest.setTimeout(60000);

describe('Communication Core Chat closeout flow (e2e)', () => {
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
    conversationIds: new Set<string>(),
    messageIds: new Set<string>(),
    fileIds: new Set<string>(),
    schoolIds: new Set<string>(),
    organizationIds: new Set<string>(),
  };

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
    await createCrossSchoolConversation();

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
    if (prisma) {
      await cleanupCloseoutData();
      await prisma.$disconnect();
    }

    if (uploadedBucket && uploadedObjectKey && storageService) {
      await storageService.deleteObject({
        bucket: uploadedBucket,
        objectKey: uploadedObjectKey,
      });
    }

    if (app) {
      await app.close();
    }
  });

  it('runs the Sprint 6B Communication Core Chat closeout flow', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const meResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meResponse.body).toMatchObject({
      email: DEMO_ADMIN_EMAIL,
      activeMembership: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
      },
    });

    const notificationBaseline = await readNotificationCounts();

    const initialPolicy = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(initialPolicy.body).toMatchObject({
      isEnabled: expect.any(Boolean),
      allowAttachments: expect.any(Boolean),
      allowReactions: expect.any(Boolean),
      allowReadReceipts: expect.any(Boolean),
    });
    expectNoSchoolId(initialPolicy.body);

    const policy = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        isEnabled: true,
        allowAttachments: true,
        allowReactions: true,
        allowReadReceipts: true,
        allowDeliveryReceipts: true,
        allowMessageDelete: true,
        allowMessageEdit: true,
        maxGroupMembers: 50,
        maxMessageLength: 4000,
        maxAttachmentSizeMb: 10,
        moderationMode: 'standard',
        metadata: { closeout: 'sprint6b' },
      })
      .expect(200);
    closeoutPolicyId = policy.body.id;
    expect(policy.body).toMatchObject({
      isConfigured: true,
      isEnabled: true,
      allowAttachments: true,
      allowReactions: true,
      allowReadReceipts: true,
      moderationMode: 'standard',
    });
    expectNoSchoolId(policy.body);

    const overview = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/admin/overview`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(overview.body.policy).toMatchObject({
      isConfigured: true,
      isEnabled: true,
      allowAttachments: true,
      allowReactions: true,
      allowReadReceipts: true,
    });
    expect(JSON.stringify(overview.body)).not.toContain('body');
    expectNoSchoolId(overview.body);

    const conversationTitle = `Sprint 6B Core Chat ${suffix}`;
    const conversation = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'group',
        title: conversationTitle,
        description: 'Sprint 6B closeout conversation',
        metadata: { closeout: 'sprint6b', body: 'must not leak' },
      })
      .expect(201);
    const conversationId = conversation.body.id as string;
    cleanupState.conversationIds.add(conversationId);
    expect(conversation.body).toMatchObject({
      id: conversationId,
      type: 'group',
      status: 'active',
      title: conversationTitle,
      participantCount: 1,
      createdById: adminUserId,
      metadata: { closeout: 'sprint6b' },
    });
    expect(JSON.stringify(conversation.body)).not.toContain('must not leak');
    expectNoSchoolId(conversation.body);

    const conversationList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations`)
      .query({ search: conversationTitle, type: 'group', status: 'active' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      conversationList.body.items.map((item: { id: string }) => item.id),
    ).toContain(conversationId);
    expectNoSchoolId(conversationList.body);

    const conversationDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(conversationDetail.body).toMatchObject({
      id: conversationId,
      participantSummary: { total: 1, active: 1 },
    });
    expectNoSchoolId(conversationDetail.body);

    const reportUserId = createdUsers.reporter.id;
    const addedParticipant = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/participants`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ userId: reportUserId, role: 'member' })
      .expect(201);
    expect(addedParticipant.body).toMatchObject({
      conversationId,
      userId: reportUserId,
      role: 'member',
      status: 'active',
    });
    expectNoSchoolId(addedParticipant.body);

    const participantList = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/participants`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      participantList.body.items.map((item: { userId: string }) => item.userId),
    ).toEqual(expect.arrayContaining([adminUserId, reportUserId]));
    expectNoSchoolId(participantList.body);

    const invite = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/invites`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        invitedUserId: createdUsers.invited.id,
        metadata: { source: 'closeout', message: 'must not leak' },
      })
      .expect(201);
    expect(invite.body).toMatchObject({
      conversationId,
      invitedUserId: createdUsers.invited.id,
      status: 'pending',
      metadata: { source: 'closeout' },
    });
    expectNoSchoolId(invite.body);

    const inviteList = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/invites`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      inviteList.body.items.map((item: { id: string }) => item.id),
    ).toContain(invite.body.id);
    expectNoSchoolId(inviteList.body);

    const invitedLogin = await login(createdUsers.invited.email, PASSWORD);
    const acceptedInvite = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversation-invites/${invite.body.id}/accept`,
      )
      .set('Authorization', `Bearer ${invitedLogin.accessToken}`)
      .expect(201);
    expect(acceptedInvite.body).toMatchObject({
      conversationId,
      userId: createdUsers.invited.id,
      status: 'active',
    });

    const joinRequesterLogin = await login(
      createdUsers.joinRequester.email,
      PASSWORD,
    );
    const joinRequest = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/join-requests`,
      )
      .set('Authorization', `Bearer ${joinRequesterLogin.accessToken}`)
      .send({ note: 'Please add me', metadata: { source: 'closeout' } })
      .expect(201);
    expect(joinRequest.body).toMatchObject({
      conversationId,
      requestedById: createdUsers.joinRequester.id,
      status: 'pending',
    });
    expectNoSchoolId(joinRequest.body);

    const joinRequestList = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/join-requests`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      joinRequestList.body.items.map((item: { id: string }) => item.id),
    ).toContain(joinRequest.body.id);
    expectNoSchoolId(joinRequestList.body);

    const approvedJoinRequest = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/join-requests/${joinRequest.body.id}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Approved by Sprint 6B closeout.' })
      .expect(201);
    expect(approvedJoinRequest.body).toMatchObject({
      conversationId,
      userId: createdUsers.joinRequester.id,
      status: 'active',
    });

    const messageBody = `Sprint 6B closeout message ${suffix}`;
    const message = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/messages`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        body: messageBody,
        clientMessageId: `s6b-${suffix}`,
        metadata: { closeout: 'sprint6b', body: 'must not leak' },
      })
      .expect(201);
    const messageId = message.body.id as string;
    cleanupState.messageIds.add(messageId);
    expect(message.body).toMatchObject({
      id: messageId,
      conversationId,
      senderUserId: adminUserId,
      type: 'text',
      status: 'sent',
      body: messageBody,
      content: messageBody,
      metadata: { closeout: 'sprint6b' },
    });
    expect(JSON.stringify(message.body)).not.toContain('must not leak');
    expectNoSchoolId(message.body);

    const messages = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/messages`,
      )
      .query({ type: 'text', status: 'sent' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(messages.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: messageId, body: messageBody }),
      ]),
    );
    expectNoSchoolId(messages.body);

    const messageDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/messages/${messageId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(messageDetail.body).toMatchObject({
      id: messageId,
      body: messageBody,
    });
    expectNoSchoolId(messageDetail.body);

    const messageRead = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/messages/${messageId}/read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(messageRead.body).toMatchObject({
      conversationId,
      messageId,
      userId: adminUserId,
      readAt: expect.any(String),
    });
    expectNoSchoolId(messageRead.body);

    const conversationRead = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/read`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
    expect(conversationRead.body).toMatchObject({
      conversationId,
      readAt: expect.any(String),
      markedCount: expect.any(Number),
    });

    const readSummary = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/read-summary`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(readSummary.body).toMatchObject({
      conversationId,
      items: expect.any(Array),
      total: expect.any(Number),
    });
    expectNoSchoolId(readSummary.body);

    const reaction = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/communication/messages/${messageId}/reactions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'love' })
      .expect(200);
    expect(reaction.body).toMatchObject({
      messageId,
      userId: adminUserId,
      type: 'love',
    });
    expectNoSchoolId(reaction.body);

    const reactions = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/messages/${messageId}/reactions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(reactions.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ messageId, userId: adminUserId }),
      ]),
    );
    expectNoSchoolId(reactions.body);

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/communication/messages/${messageId}/reactions/me`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ ok: true }));

    const fileUpload = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/files`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('sprint 6b communication attachment'), {
        filename: `sprint-6b-${suffix}.txt`,
        contentType: 'text/plain',
      })
      .expect(201);
    const fileId = fileUpload.body.id as string;
    cleanupState.fileIds.add(fileId);
    const uploadedFile = await prisma.file.findUnique({
      where: { id: fileId },
      select: { bucket: true, objectKey: true },
    });
    uploadedBucket = uploadedFile?.bucket ?? null;
    uploadedObjectKey = uploadedFile?.objectKey ?? null;

    const attachment = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/messages/${messageId}/attachments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileId,
        caption: 'Sprint 6B closeout proof',
        sortOrder: 1,
      })
      .expect(201);
    expect(attachment.body).toMatchObject({
      messageId,
      fileId,
      uploadedById: adminUserId,
      caption: 'Sprint 6B closeout proof',
      file: {
        id: fileId,
        filename: `sprint-6b-${suffix}.txt`,
        mimeType: 'text/plain',
      },
    });
    expectNoSchoolId(attachment.body);

    const attachments = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/messages/${messageId}/attachments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      attachments.body.items.map((item: { id: string }) => item.id),
    ).toContain(attachment.body.id);
    expectNoSchoolId(attachments.body);

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/communication/messages/${messageId}/attachments/${attachment.body.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ ok: true }));

    const reporterLogin = await login(createdUsers.reporter.email, PASSWORD);
    const report = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/messages/${messageId}/reports`)
      .set('Authorization', `Bearer ${reporterLogin.accessToken}`)
      .send({
        reason: 'safety',
        description: 'Closeout moderation review',
        metadata: { source: 'closeout', body: 'must not leak' },
      })
      .expect(201);
    const reportId = report.body.id as string;
    expect(report.body).toMatchObject({
      id: reportId,
      messageId,
      conversationId,
      reporterUserId: reportUserId,
      reason: 'safety',
      status: 'open',
    });
    expect(JSON.stringify(report.body)).not.toContain('must not leak');
    expectNoSchoolId(report.body);

    const reports = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/message-reports`)
      .query({ messageId, status: 'open' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const reportListJson = JSON.stringify(reports.body);
    expect(reports.body.items.map((item: { id: string }) => item.id)).toContain(
      reportId,
    );
    expect(reportListJson).not.toContain(messageBody);
    expect(reportListJson).not.toContain('body');
    expectNoSchoolId(reports.body);

    const reportDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/message-reports/${reportId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(reportDetail.body).toMatchObject({
      id: reportId,
      messageId,
      reportedUserId: adminUserId,
    });
    expect(JSON.stringify(reportDetail.body)).not.toContain(messageBody);
    expectNoSchoolId(reportDetail.body);

    const resolvedReport = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/message-reports/${reportId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'resolved', note: 'Resolved in closeout.' })
      .expect(200);
    expect(resolvedReport.body).toMatchObject({
      id: reportId,
      status: 'resolved',
      reviewedById: adminUserId,
      reviewedAt: expect.any(String),
    });

    const moderation = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/messages/${messageId}/moderation-actions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ action: 'hide', reason: 'Closeout safety action' })
      .expect(201);
    expect(moderation.body).toMatchObject({
      action: { action: 'hide', messageId },
      message: {
        id: messageId,
        status: 'hidden',
        hiddenById: adminUserId,
        hiddenAt: expect.any(String),
      },
    });
    expectNoSchoolId(moderation.body);

    const moderationActions = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/messages/${messageId}/moderation-actions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(moderationActions.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ messageId, action: 'hide' }),
      ]),
    );
    expectNoSchoolId(moderationActions.body);

    const hiddenMessage = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/messages/${messageId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(hiddenMessage.body).toMatchObject({
      id: messageId,
      status: 'hidden',
      body: null,
      content: null,
    });
    expect(JSON.stringify(hiddenMessage.body)).not.toContain(messageBody);
    expectNoSchoolId(hiddenMessage.body);

    const block = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/blocks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        targetUserId: createdUsers.blockTarget.id,
        reason: 'Closeout block lifecycle',
      })
      .expect(201);
    expect(block.body).toMatchObject({
      blockerUserId: adminUserId,
      blockedUserId: createdUsers.blockTarget.id,
      status: 'active',
    });
    expectNoSchoolId(block.body);

    const blockList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/blocks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      blockList.body.items.map((item: { id: string }) => item.id),
    ).toContain(block.body.id);
    expectNoSchoolId(blockList.body);

    const deletedBlock = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/communication/blocks/${block.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(deletedBlock.body).toMatchObject({
      id: block.body.id,
      status: 'inactive',
      unblockedAt: expect.any(String),
    });

    const restriction = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/restrictions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        targetUserId: createdUsers.restrictionTarget.id,
        type: 'send_disabled',
        reason: 'Closeout restriction lifecycle',
        expiresAt: '2026-12-31T00:00:00.000Z',
      })
      .expect(201);
    expect(restriction.body).toMatchObject({
      targetUserId: createdUsers.restrictionTarget.id,
      type: 'send_disabled',
      status: 'active',
      restrictedById: adminUserId,
    });
    expectNoSchoolId(restriction.body);

    const restrictionList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/restrictions`)
      .query({ activeOnly: true })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      restrictionList.body.items.map((item: { id: string }) => item.id),
    ).toContain(restriction.body.id);
    expectNoSchoolId(restrictionList.body);

    const updatedRestriction = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/communication/restrictions/${restriction.body.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Updated closeout restriction' })
      .expect(200);
    expect(updatedRestriction.body).toMatchObject({
      id: restriction.body.id,
      reason: 'Updated closeout restriction',
    });

    const revokedRestriction = await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/communication/restrictions/${restriction.body.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(revokedRestriction.body).toMatchObject({
      id: restriction.body.id,
      status: 'lifted',
      liftedById: adminUserId,
      liftedAt: expect.any(String),
    });

    const noAccess = await login(createdUsers.noAccess.email, PASSWORD);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/message-reports`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/communication/conversations/${crossSchoolConversationId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const archivedConversation = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(archivedConversation.body).toMatchObject({
      id: conversationId,
      status: 'archived',
      archivedAt: expect.any(String),
    });

    const reopenedConversation = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/reopen`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(reopenedConversation.body).toMatchObject({
      id: conversationId,
      status: 'active',
      archivedAt: null,
    });

    const closedConversation = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/close`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(closedConversation.body).toMatchObject({
      id: conversationId,
      status: 'closed',
      closedAt: expect.any(String),
    });

    await expect(readNotificationCounts()).resolves.toEqual(
      notificationBaseline,
    );
  });

  const createdUsers: Record<
    | 'noAccess'
    | 'reporter'
    | 'invited'
    | 'joinRequester'
    | 'blockTarget'
    | 'restrictionTarget',
    { id: string; email: string }
  > = {
    noAccess: { id: '', email: '' },
    reporter: { id: '', email: '' },
    invited: { id: '', email: '' },
    joinRequester: { id: '', email: '' },
    blockTarget: { id: '', email: '' },
    restrictionTarget: { id: '', email: '' },
  };
  let crossSchoolConversationId = '';

  async function createCloseoutUsersAndRoles(): Promise<void> {
    const noAccessRoleId = await createCustomRole('no-access', []);
    const viewOnlyRoleId = await createCustomRole('view-only', [
      'communication.conversations.view',
    ]);
    const reporterRoleId = await createCustomRole('reporter', [
      'communication.conversations.view',
      'communication.messages.view',
      'communication.messages.report',
    ]);

    createdUsers.noAccess = await createUserWithMembership({
      key: 'no-access',
      roleId: noAccessRoleId,
    });
    createdUsers.reporter = await createUserWithMembership({
      key: 'reporter',
      roleId: reporterRoleId,
    });
    createdUsers.invited = await createUserWithMembership({
      key: 'invited',
      roleId: viewOnlyRoleId,
    });
    createdUsers.joinRequester = await createUserWithMembership({
      key: 'join-requester',
      roleId: viewOnlyRoleId,
    });
    createdUsers.blockTarget = await createUserWithMembership({
      key: 'block-target',
      roleId: noAccessRoleId,
    });
    createdUsers.restrictionTarget = await createUserWithMembership({
      key: 'restriction-target',
      roleId: noAccessRoleId,
    });
  }

  async function createCrossSchoolConversation(): Promise<void> {
    const organization = await prisma.organization.create({
      data: {
        slug: `sprint-6b-closeout-${suffix}`,
        name: `Sprint 6B Closeout ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanupState.organizationIds.add(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `sprint-6b-closeout-${suffix}`,
        name: `Sprint 6B Closeout ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanupState.schoolIds.add(school.id);

    const conversation = await prisma.communicationConversation.create({
      data: {
        schoolId: school.id,
        type: CommunicationConversationType.GROUP,
        status: CommunicationConversationStatus.ACTIVE,
        titleEn: `Cross school Sprint 6B ${suffix}`,
      },
      select: { id: true },
    });
    crossSchoolConversationId = conversation.id;
    cleanupState.conversationIds.add(conversation.id);
  }

  async function createCustomRole(
    key: string,
    permissionCodes: string[],
  ): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: demoSchoolId,
        key: `sprint-6b-${suffix}-${key}`,
        name: `Sprint 6B ${key} ${suffix}`,
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
  }): Promise<{ id: string; email: string }> {
    const email = `sprint-6b-${suffix}-${params.key}@e2e.moazez.local`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Sprint6B',
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
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: params.roleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });

    return { id: user.id, email };
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

  async function readCurrentPolicySnapshot(): Promise<StoredPolicySnapshot | null> {
    return prisma.communicationPolicy.findUnique({
      where: { schoolId: demoSchoolId },
      select: {
        id: true,
        isEnabled: true,
        allowDirectStaffToStaff: true,
        allowAdminToAnyone: true,
        allowTeacherToParent: true,
        allowTeacherToStudent: true,
        allowStudentToTeacher: true,
        allowStudentToStudent: true,
        studentDirectMode: true,
        allowTeacherCreatedGroups: true,
        allowStudentCreatedGroups: true,
        requireApprovalForStudentGroups: true,
        allowParentToParent: true,
        allowAttachments: true,
        allowVoiceMessages: true,
        allowVideoMessages: true,
        allowMessageEdit: true,
        allowMessageDelete: true,
        allowReactions: true,
        allowReadReceipts: true,
        allowDeliveryReceipts: true,
        allowOnlinePresence: true,
        maxGroupMembers: true,
        maxMessageLength: true,
        maxAttachmentSizeMb: true,
        retentionDays: true,
        moderationMode: true,
        createdById: true,
        updatedById: true,
        metadata: true,
      },
    });
  }

  async function readNotificationCounts(): Promise<{
    notificationTemplates: number;
    notificationTemplateChannelStates: number;
  }> {
    const [notificationTemplates, notificationTemplateChannelStates] =
      await Promise.all([
        prisma.notificationTemplate.count({
          where: { schoolId: demoSchoolId },
        }),
        prisma.notificationTemplateChannelState.count({
          where: { schoolId: demoSchoolId },
        }),
      ]);

    return { notificationTemplates, notificationTemplateChannelStates };
  }

  async function cleanupCloseoutData(): Promise<void> {
    const schoolIds = [demoSchoolId, ...cleanupState.schoolIds];
    const conversationIds = [...cleanupState.conversationIds];
    const messageIds = [...cleanupState.messageIds];
    const userIds = [...cleanupState.userIds];
    const roleIds = [...cleanupState.roleIds];
    const fileIds = [...cleanupState.fileIds];

    await prisma.auditLog.deleteMany({
      where: {
        module: 'communication',
        OR: [
          { schoolId: { in: schoolIds } },
          { actorId: { in: userIds } },
          { resourceId: { in: [...conversationIds, ...messageIds] } },
        ],
      },
    });

    await prisma.communicationMessageAttachment.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { messageId: { in: messageIds } },
          { fileId: { in: fileIds } },
        ],
      },
    });
    await prisma.communicationMessageReaction.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { messageId: { in: messageIds } },
          { userId: { in: userIds } },
        ],
      },
    });
    await prisma.communicationMessageRead.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { messageId: { in: messageIds } },
          { userId: { in: userIds } },
        ],
      },
    });
    await prisma.communicationMessageDelivery.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { messageId: { in: messageIds } },
          { recipientUserId: { in: userIds } },
        ],
      },
    });
    await prisma.communicationMessageReport.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { messageId: { in: messageIds } },
          { reporterUserId: { in: userIds } },
        ],
      },
    });
    await prisma.communicationModerationAction.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { messageId: { in: messageIds } },
          { actorUserId: { in: userIds } },
          { targetUserId: { in: userIds } },
        ],
      },
    });
    await prisma.communicationConversationInvite.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { invitedUserId: { in: userIds } },
          { invitedById: { in: userIds } },
        ],
      },
    });
    await prisma.communicationConversationJoinRequest.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { requestedById: { in: userIds } },
          { reviewedById: { in: userIds } },
        ],
      },
    });
    await prisma.communicationConversationParticipant.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { userId: { in: userIds } },
          { invitedById: { in: userIds } },
          { removedById: { in: userIds } },
        ],
      },
    });
    await prisma.communicationMessage.deleteMany({
      where: {
        OR: [
          { id: { in: messageIds } },
          { conversationId: { in: conversationIds } },
          { senderUserId: { in: userIds } },
        ],
      },
    });
    await prisma.communicationConversation.deleteMany({
      where: { id: { in: conversationIds } },
    });
    await prisma.communicationUserBlock.deleteMany({
      where: {
        OR: [
          { blockerUserId: { in: userIds } },
          { blockedUserId: { in: userIds } },
        ],
      },
    });
    await prisma.communicationUserRestriction.deleteMany({
      where: {
        OR: [
          { targetUserId: { in: userIds } },
          { restrictedById: { in: userIds } },
          { liftedById: { in: userIds } },
        ],
      },
    });

    await restoreCommunicationPolicy();

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
          allowDirectStaffToStaff: originalPolicy.allowDirectStaffToStaff,
          allowAdminToAnyone: originalPolicy.allowAdminToAnyone,
          allowTeacherToParent: originalPolicy.allowTeacherToParent,
          allowTeacherToStudent: originalPolicy.allowTeacherToStudent,
          allowStudentToTeacher: originalPolicy.allowStudentToTeacher,
          allowStudentToStudent: originalPolicy.allowStudentToStudent,
          studentDirectMode: originalPolicy.studentDirectMode,
          allowTeacherCreatedGroups: originalPolicy.allowTeacherCreatedGroups,
          allowStudentCreatedGroups: originalPolicy.allowStudentCreatedGroups,
          requireApprovalForStudentGroups:
            originalPolicy.requireApprovalForStudentGroups,
          allowParentToParent: originalPolicy.allowParentToParent,
          allowAttachments: originalPolicy.allowAttachments,
          allowVoiceMessages: originalPolicy.allowVoiceMessages,
          allowVideoMessages: originalPolicy.allowVideoMessages,
          allowMessageEdit: originalPolicy.allowMessageEdit,
          allowMessageDelete: originalPolicy.allowMessageDelete,
          allowReactions: originalPolicy.allowReactions,
          allowReadReceipts: originalPolicy.allowReadReceipts,
          allowDeliveryReceipts: originalPolicy.allowDeliveryReceipts,
          allowOnlinePresence: originalPolicy.allowOnlinePresence,
          maxGroupMembers: originalPolicy.maxGroupMembers,
          maxMessageLength: originalPolicy.maxMessageLength,
          maxAttachmentSizeMb: originalPolicy.maxAttachmentSizeMb,
          retentionDays: originalPolicy.retentionDays,
          moderationMode: originalPolicy.moderationMode,
          createdById: originalPolicy.createdById,
          updatedById: originalPolicy.updatedById,
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
