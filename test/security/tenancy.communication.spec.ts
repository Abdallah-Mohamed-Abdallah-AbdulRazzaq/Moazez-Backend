import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationInviteStatus,
  CommunicationJoinRequestStatus,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  CommunicationStudentDirectMode,
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

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Communication123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(45000);

describe('Communication policy tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let policyAId: string;
  let policyBId: string;
  let conversationAId: string;
  let conversationBId: string;
  let participantAId: string;
  let participantBId: string;
  let inviteAId: string;
  let inviteBId: string;
  let joinRequestAId: string;
  let joinRequestBId: string;
  let messageAId: string;
  let messageBId: string;
  let adminAId: string;
  let noAccessUserId: string;
  let viewOnlyUserId: string;
  let teacherUserId: string;
  let parentUserId: string;
  let studentUserId: string;
  let schoolBUserId: string;
  let joinRequesterUserId: string;
  let viewOnlyRoleIdForFixtures: string;
  let messageSendRoleIdForFixtures: string;
  let adminAEmail: string;
  let noAccessEmail: string;
  let viewOnlyEmail: string;
  let teacherEmail: string;
  let parentEmail: string;
  let studentEmail: string;
  let schoolBUserEmail: string;
  let joinRequesterEmail: string;

  const testSuffix = `communication-security-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdConversationIds: string[] = [];
  const createdMessageIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [
      schoolAdminRole,
      teacherRole,
      parentRole,
      studentRole,
      policiesViewPermission,
      policiesManagePermission,
      conversationsViewPermission,
      conversationsCreatePermission,
      conversationsManagePermission,
      participantsManagePermission,
      messagesViewPermission,
      messagesSendPermission,
      messagesEditPermission,
      messagesDeletePermission,
      adminViewPermission,
    ] = await Promise.all([
      findSystemRole('school_admin'),
      findSystemRole('teacher'),
      findSystemRole('parent'),
      findSystemRole('student'),
      findPermission('communication.policies.view'),
      findPermission('communication.policies.manage'),
      findPermission('communication.conversations.view'),
      findPermission('communication.conversations.create'),
      findPermission('communication.conversations.manage'),
      findPermission('communication.participants.manage'),
      findPermission('communication.messages.view'),
      findPermission('communication.messages.send'),
      findPermission('communication.messages.edit'),
      findPermission('communication.messages.delete'),
      findPermission('communication.admin.view'),
    ]);

    const orgA = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org-a`,
        name: `${testSuffix} Org A`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org-b`,
        name: `${testSuffix} Org B`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationBId = orgB.id;

    const schoolA = await prisma.school.create({
      data: {
        organizationId: organizationAId,
        slug: `${testSuffix}-school-a`,
        name: `${testSuffix} School A`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolAId = schoolA.id;

    const schoolB = await prisma.school.create({
      data: {
        organizationId: organizationBId,
        slug: `${testSuffix}-school-b`,
        name: `${testSuffix} School B`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolBId = schoolB.id;

    const noAccessRoleId = await createCustomRole('no-access', []);
    const viewOnlyRoleId = await createCustomRole('view-only', [
      policiesViewPermission.id,
      conversationsViewPermission.id,
      messagesViewPermission.id,
    ]);
    viewOnlyRoleIdForFixtures = viewOnlyRoleId;
    messageSendRoleIdForFixtures = await createCustomRole('message-send-only', [
      conversationsViewPermission.id,
      messagesViewPermission.id,
      messagesSendPermission.id,
    ]);
    const manageOnlyRoleId = await createCustomRole('manage-only', [
      policiesManagePermission.id,
      conversationsCreatePermission.id,
      conversationsManagePermission.id,
      participantsManagePermission.id,
      messagesEditPermission.id,
      messagesDeletePermission.id,
    ]);
    expect(manageOnlyRoleId).toBeTruthy();

    adminAEmail = `${testSuffix}-admin-a@security.moazez.local`;
    noAccessEmail = `${testSuffix}-no-access@security.moazez.local`;
    viewOnlyEmail = `${testSuffix}-view-only@security.moazez.local`;
    teacherEmail = `${testSuffix}-teacher@security.moazez.local`;
    parentEmail = `${testSuffix}-parent@security.moazez.local`;
    studentEmail = `${testSuffix}-student@security.moazez.local`;
    schoolBUserEmail = `${testSuffix}-school-b-user@security.moazez.local`;
    joinRequesterEmail = `${testSuffix}-join-requester@security.moazez.local`;

    adminAId = await createUserWithMembership({
      email: adminAEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
    });
    noAccessUserId = await createUserWithMembership({
      email: noAccessEmail,
      userType: UserType.SCHOOL_USER,
      roleId: noAccessRoleId,
    });
    viewOnlyUserId = await createUserWithMembership({
      email: viewOnlyEmail,
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleId,
    });
    teacherUserId = await createUserWithMembership({
      email: teacherEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
    });
    parentUserId = await createUserWithMembership({
      email: parentEmail,
      userType: UserType.PARENT,
      roleId: parentRole.id,
    });
    studentUserId = await createUserWithMembership({
      email: studentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
    });
    schoolBUserId = await createUserWithMembership({
      email: schoolBUserEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    joinRequesterUserId = await createUserWithMembership({
      email: joinRequesterEmail,
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleId,
    });

    const [policyA, policyB] = await Promise.all([
      prisma.communicationPolicy.create({
        data: {
          schoolId: schoolAId,
          studentDirectMode: CommunicationStudentDirectMode.SAME_CLASSROOM,
          maxGroupMembers: 111,
          createdById: adminAId,
          updatedById: adminAId,
          metadata: { marker: 'school-a' },
        },
        select: { id: true },
      }),
      prisma.communicationPolicy.create({
        data: {
          schoolId: schoolBId,
          studentDirectMode: CommunicationStudentDirectMode.SAME_GRADE,
          maxGroupMembers: 222,
          metadata: { marker: 'school-b' },
        },
        select: { id: true },
      }),
    ]);
    policyAId = policyA.id;
    policyBId = policyB.id;

    const conversation = await prisma.communicationConversation.create({
      data: {
        schoolId: schoolAId,
        type: CommunicationConversationType.GROUP,
        status: CommunicationConversationStatus.ACTIVE,
        titleEn: `${testSuffix} private school A conversation`,
        createdById: adminAId,
        lastMessageAt: new Date('2026-05-01T10:00:00.000Z'),
      },
      select: { id: true },
    });
    conversationAId = conversation.id;
    createdConversationIds.push(conversation.id);

    const conversationB = await prisma.communicationConversation.create({
      data: {
        schoolId: schoolBId,
        type: CommunicationConversationType.GROUP,
        status: CommunicationConversationStatus.ACTIVE,
        titleEn: `${testSuffix} private school B conversation`,
      },
      select: { id: true },
    });
    conversationBId = conversationB.id;
    createdConversationIds.push(conversationB.id);

    const [message, tenantBMessage] = await Promise.all([
      prisma.communicationMessage.create({
        data: {
          schoolId: schoolAId,
          conversationId: conversation.id,
          senderUserId: adminAId,
          kind: CommunicationMessageKind.TEXT,
          status: CommunicationMessageStatus.SENT,
          body: 'private communication body',
          sentAt: new Date('2026-05-01T10:00:00.000Z'),
        },
        select: { id: true },
      }),
      prisma.communicationMessage.create({
        data: {
          schoolId: schoolBId,
          conversationId: conversationB.id,
          senderUserId: schoolBUserId,
          kind: CommunicationMessageKind.TEXT,
          status: CommunicationMessageStatus.SENT,
          body: 'school B private communication body',
          sentAt: new Date('2026-05-01T10:05:00.000Z'),
        },
        select: { id: true },
      }),
    ]);
    messageAId = message.id;
    messageBId = tenantBMessage.id;
    createdMessageIds.push(message.id, tenantBMessage.id);

    const [ownerParticipant, memberParticipant, tenantBParticipant] =
      await Promise.all([
        prisma.communicationConversationParticipant.create({
          data: {
            schoolId: schoolAId,
            conversationId: conversationAId,
            userId: adminAId,
            role: CommunicationParticipantRole.OWNER,
            status: CommunicationParticipantStatus.ACTIVE,
          },
          select: { id: true },
        }),
        prisma.communicationConversationParticipant.create({
          data: {
            schoolId: schoolAId,
            conversationId: conversationAId,
            userId: viewOnlyUserId,
            role: CommunicationParticipantRole.MEMBER,
            status: CommunicationParticipantStatus.ACTIVE,
            invitedById: adminAId,
          },
          select: { id: true },
        }),
        prisma.communicationConversationParticipant.create({
          data: {
            schoolId: schoolBId,
            conversationId: conversationBId,
            userId: schoolBUserId,
            role: CommunicationParticipantRole.MEMBER,
            status: CommunicationParticipantStatus.ACTIVE,
          },
          select: { id: true },
        }),
      ]);
    expect(ownerParticipant.id).toBeTruthy();
    participantAId = memberParticipant.id;
    participantBId = tenantBParticipant.id;

    const [inviteA, inviteB, joinRequestA, joinRequestB] = await Promise.all([
      prisma.communicationConversationInvite.create({
        data: {
          schoolId: schoolAId,
          conversationId: conversationAId,
          invitedUserId: teacherUserId,
          invitedById: adminAId,
          status: CommunicationInviteStatus.PENDING,
          metadata: { marker: 'school-a-invite' },
        },
        select: { id: true },
      }),
      prisma.communicationConversationInvite.create({
        data: {
          schoolId: schoolBId,
          conversationId: conversationBId,
          invitedUserId: schoolBUserId,
          status: CommunicationInviteStatus.PENDING,
          metadata: { marker: 'school-b-invite' },
        },
        select: { id: true },
      }),
      prisma.communicationConversationJoinRequest.create({
        data: {
          schoolId: schoolAId,
          conversationId: conversationAId,
          requestedById: joinRequesterUserId,
          status: CommunicationJoinRequestStatus.PENDING,
          metadata: { marker: 'school-a-join-request' },
        },
        select: { id: true },
      }),
      prisma.communicationConversationJoinRequest.create({
        data: {
          schoolId: schoolBId,
          conversationId: conversationBId,
          requestedById: schoolBUserId,
          status: CommunicationJoinRequestStatus.PENDING,
          metadata: { marker: 'school-b-join-request' },
        },
        select: { id: true },
      }),
    ]);
    inviteAId = inviteA.id;
    inviteBId = inviteB.id;
    joinRequestAId = joinRequestA.id;
    joinRequestBId = joinRequestB.id;

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
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      await cleanupCommunicationSchools([schoolAId, schoolBId]);
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ schoolId: schoolAId }, { schoolId: schoolBId }],
          module: 'communication',
        },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      await prisma.school.deleteMany({
        where: { id: { in: [schoolAId, schoolBId].filter(Boolean) } },
      });
      await prisma.organization.deleteMany({
        where: {
          id: { in: [organizationAId, organizationBId].filter(Boolean) },
        },
      });
      await prisma.$disconnect();
    }
  });

  it('creating two policy rows for two schools returns only school A policy for school A', async () => {
    const { accessToken } = await login(adminAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: policyAId,
      isConfigured: true,
      studentDirectMode: 'same_classroom',
      maxGroupMembers: 111,
    });
    expect(JSON.stringify(response.body)).not.toContain(policyBId);
    expect(JSON.stringify(response.body)).not.toContain('schoolId');
  });

  it('school A cannot see or update school B policy through school-scoped routes', async () => {
    const { accessToken } = await login(adminAEmail);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ maxGroupMembers: 333, studentDirectMode: 'same_school' })
      .expect(200);

    const [policyA, policyB] = await Promise.all([
      prisma.communicationPolicy.findUnique({
        where: { id: policyAId },
        select: { maxGroupMembers: true, studentDirectMode: true },
      }),
      prisma.communicationPolicy.findUnique({
        where: { id: policyBId },
        select: { maxGroupMembers: true, studentDirectMode: true },
      }),
    ]);

    expect(policyA).toEqual({
      maxGroupMembers: 333,
      studentDirectMode: CommunicationStudentDirectMode.SAME_SCHOOL,
    });
    expect(policyB).toEqual({
      maxGroupMembers: 222,
      studentDirectMode: CommunicationStudentDirectMode.SAME_GRADE,
    });
  });

  it('same-school actor without communication.policies.view gets 403 for GET policy', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('same-school actor without communication.policies.manage gets 403 for PATCH policy', async () => {
    const { accessToken } = await login(viewOnlyEmail);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ maxGroupMembers: 444 })
      .expect(403);
  });

  it('same-school actor without communication.admin.view gets 403 for admin overview', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/admin/overview`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('school admin can get/update policy and get admin overview', async () => {
    const { accessToken } = await login(adminAEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const patch = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        isEnabled: false,
        maxMessageLength: 8000,
        maxAttachmentSizeMb: 50,
        moderationMode: 'strict',
      })
      .expect(200);

    expect(patch.body).toMatchObject({
      isConfigured: true,
      isEnabled: false,
      maxMessageLength: 8000,
      maxAttachmentSizeMb: 50,
      moderationMode: 'strict',
    });

    const overview = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/admin/overview`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(overview.body.policy).toMatchObject({
      isConfigured: true,
      isEnabled: false,
      studentDirectMode: 'same_school',
    });
    expect(overview.body.conversations.total).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(overview.body)).not.toContain('schoolId');
  });

  it('teacher cannot manage policy and parent/student cannot access dashboard communication routes', async () => {
    const teacher = await login(teacherEmail);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ isEnabled: true })
      .expect(403);

    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/communication/policies`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .patch(`${GLOBAL_PREFIX}/communication/policies`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ isEnabled: true })
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/communication/admin/overview`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/communication/conversations`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/communication/conversations`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'group', title: 'Forbidden group' })
        .expect(403);
    }
  });

  it('school admin can create/list/get/update/archive/close/reopen conversations and every mutation audits', async () => {
    await setCommunicationPolicyEnabled(true);
    const { accessToken } = await login(adminAEmail);
    const beforeAudit = await communicationConversationAuditCount();
    const title = `${testSuffix} lifecycle conversation`;

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'group',
        title,
        description: 'Initial metadata-only conversation',
        isReadOnly: true,
        isPinned: true,
      })
      .expect(201);

    const conversationId = created.body.id as string;
    createdConversationIds.push(conversationId);
    expect(created.body).toMatchObject({
      type: 'group',
      status: 'active',
      title,
      description: 'Initial metadata-only conversation',
      isReadOnly: true,
      isPinned: true,
      participantCount: 1,
      createdById: expect.any(String),
    });
    expect(JSON.stringify(created.body)).not.toContain('schoolId');
    expect(JSON.stringify(created.body)).not.toContain('body');

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations`)
      .query({ search: title, type: 'group', status: 'active', limit: 20 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(
      conversationId,
    );
    expect(JSON.stringify(list.body)).not.toContain(conversationBId);
    expect(JSON.stringify(list.body)).not.toContain('schoolId');

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      id: conversationId,
      participantSummary: { total: 1, active: 1 },
    });
    expect(JSON.stringify(detail.body)).not.toContain('private communication body');

    const patched = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: `${title} updated`,
        description: 'Updated metadata only',
        isReadOnly: false,
        isPinned: false,
        metadata: { topic: 'operations', body: 'must not leak' },
      })
      .expect(200);
    expect(patched.body).toMatchObject({
      title: `${title} updated`,
      description: 'Updated metadata only',
      isReadOnly: false,
      isPinned: false,
      metadata: { topic: 'operations' },
    });
    expect(JSON.stringify(patched.body)).not.toContain('must not leak');

    const archived = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(archived.body).toMatchObject({
      id: conversationId,
      status: 'archived',
      archivedAt: expect.any(String),
    });

    const reopenedFromArchive = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationId}/reopen`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(reopenedFromArchive.body).toMatchObject({
      id: conversationId,
      status: 'active',
      archivedAt: null,
    });

    const closed = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationId}/close`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(closed.body).toMatchObject({
      id: conversationId,
      status: 'closed',
      closedAt: expect.any(String),
    });

    const reopenedFromClose = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationId}/reopen`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(reopenedFromClose.body).toMatchObject({
      id: conversationId,
      status: 'active',
      closedAt: null,
    });

    await expect(communicationConversationAuditCount()).resolves.toBe(
      beforeAudit + 6,
    );
  });

  it('school A cannot access school B conversations by guessed id and list excludes school B', async () => {
    const { accessToken } = await login(adminAEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationBId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/conversations/${conversationBId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Should not cross school' })
      .expect(404);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(list.body);
    expect(json).toContain(conversationAId);
    expect(json).not.toContain(conversationBId);
    expect(json).not.toContain(`${testSuffix} private school B conversation`);
  });

  it('conversation permissions return 403 when view create or manage permissions are missing', async () => {
    const noAccess = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);

    const viewOnly = await login(viewOnlyEmail);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({ type: 'group', title: 'No create permission' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({ title: 'No manage permission' })
      .expect(403);
    for (const action of ['archive', 'close', 'reopen']) {
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/${action}`,
        )
        .set('Authorization', `Bearer ${viewOnly.accessToken}`)
        .expect(403);
    }
  });

  it('teacher access follows seeded conversation permissions', async () => {
    await setCommunicationPolicyEnabled(true);
    const { accessToken } = await login(teacherEmail);
    const title = `${testSuffix} teacher seeded permission conversation`;

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'group', title })
      .expect(201);
    createdConversationIds.push(created.body.id);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/conversations/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: `${title} updated` })
      .expect(200);
  });

  it('school admin can create list get edit delete and read same-school messages', async () => {
    await setCommunicationPolicyEnabled(true);
    const { accessToken } = await login(adminAEmail);
    const beforeAudit = await communicationMessageAuditCount();

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/messages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        body: 'Security test message',
        clientMessageId: `${testSuffix}-client-message`,
        metadata: { source: 'security-test', body: 'must not leak' },
      })
      .expect(201);
    const messageId = created.body.id as string;
    createdMessageIds.push(messageId);

    expect(created.body).toMatchObject({
      conversationId: conversationAId,
      senderUserId: adminAId,
      type: 'text',
      status: 'sent',
      body: 'Security test message',
      content: 'Security test message',
      clientMessageId: `${testSuffix}-client-message`,
      metadata: { source: 'security-test' },
    });
    expect(JSON.stringify(created.body)).not.toContain('schoolId');
    expect(JSON.stringify(created.body)).not.toContain('must not leak');

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/messages`)
      .query({ type: 'text', status: 'sent', limit: 20 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const listJson = JSON.stringify(list.body);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(
      messageId,
    );
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(
      messageAId,
    );
    expect(listJson).not.toContain(messageBId);
    expect(listJson).not.toContain('schoolId');
    expect(listJson).not.toContain('school B private communication body');

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/messages/${messageId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      id: messageId,
      body: 'Security test message',
    });
    expect(JSON.stringify(detail.body)).not.toContain('schoolId');

    const edited = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/messages/${messageId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ body: 'Edited security test message' })
      .expect(200);
    expect(edited.body).toMatchObject({
      id: messageId,
      body: 'Edited security test message',
      editedAt: expect.any(String),
    });

    const read = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/messages/${messageId}/read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(read.body).toMatchObject({
      conversationId: conversationAId,
      messageId,
      userId: adminAId,
      readAt: expect.any(String),
    });
    expect(JSON.stringify(read.body)).not.toContain('schoolId');

    const conversationRead = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
    expect(conversationRead.body).toMatchObject({
      conversationId: conversationAId,
      readAt: expect.any(String),
      markedCount: expect.any(Number),
    });

    const readSummary = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/read-summary`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(readSummary.body).toMatchObject({
      conversationId: conversationAId,
      total: expect.any(Number),
      items: expect.any(Array),
    });
    expect(JSON.stringify(readSummary.body)).not.toContain('schoolId');
    expect(JSON.stringify(readSummary.body)).not.toContain('firstName');

    const deleted = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/communication/messages/${messageId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(deleted.body).toMatchObject({
      id: messageId,
      status: 'deleted',
      body: null,
      content: null,
      deletedAt: expect.any(String),
      deletedById: adminAId,
    });
    expect(JSON.stringify(deleted.body)).not.toContain(
      'Edited security test message',
    );
    expect(JSON.stringify(deleted.body)).not.toContain('schoolId');

    await expect(communicationMessageAuditCount()).resolves.toBe(
      beforeAudit + 3,
    );
  });

  it('school A cannot access school B messages by guessed ids and lists exclude school B', async () => {
    const { accessToken } = await login(adminAEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/messages/${messageBId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/messages/${messageBId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ body: 'Should not cross school' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/communication/messages/${messageBId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/messages/${messageBId}/read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationBId}/messages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/messages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(list.body);
    expect(json).toContain(messageAId);
    expect(json).not.toContain(messageBId);
    expect(json).not.toContain('school B private communication body');
  });

  it('message permissions return 403 when view send edit or delete are missing', async () => {
    const noAccess = await login(noAccessEmail);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/messages`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/messages/${messageAId}`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/messages/${messageAId}/read`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/read`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/read-summary`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);

    const viewOnly = await login(viewOnlyEmail);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/messages`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({ body: 'No send permission' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/messages/${messageAId}`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({ body: 'No edit permission' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/communication/messages/${messageAId}`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .expect(403);
  });

  it('parent and student cannot access dashboard message routes', async () => {
    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/communication/messages/${messageAId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'Forbidden' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/communication/messages/${messageAId}/read`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    }
  });

  it('teacher access follows seeded message permissions for participant messages', async () => {
    await setCommunicationPolicyEnabled(true);
    const teacher = await login(teacherEmail);
    const teacherConversation = await prisma.communicationConversation.create({
      data: {
        schoolId: schoolAId,
        type: CommunicationConversationType.GROUP,
        status: CommunicationConversationStatus.ACTIVE,
        titleEn: `${testSuffix} teacher message conversation`,
      },
      select: { id: true },
    });
    createdConversationIds.push(teacherConversation.id);
    await prisma.communicationConversationParticipant.create({
      data: {
        schoolId: schoolAId,
        conversationId: teacherConversation.id,
        userId: teacherUserId,
        role: CommunicationParticipantRole.MEMBER,
        status: CommunicationParticipantStatus.ACTIVE,
      },
    });

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${teacherConversation.id}/messages`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ body: 'Teacher seeded message' })
      .expect(201);
    createdMessageIds.push(created.body.id);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${teacherConversation.id}/messages`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/messages/${created.body.id}`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ body: 'Teacher edited message' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/communication/messages/${created.body.id}`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
  });

  it('message send rejects disabled policy archived closed non-participant and muted participants', async () => {
    const admin = await login(adminAEmail);

    await setCommunicationPolicyEnabled(false);
    const disabledPolicy = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/messages`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: 'Disabled policy should reject' })
      .expect(403);
    expect(disabledPolicy.body.error.code).toBe(
      'communication.policy.disabled',
    );
    await setCommunicationPolicyEnabled(true);

    const archivedConversation = await createConversationWithParticipant({
      status: CommunicationConversationStatus.ARCHIVED,
      userId: adminAId,
    });
    const archived = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${archivedConversation}/messages`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: 'Archived should reject' })
      .expect(409);
    expect(archived.body.error.code).toBe(
      'communication.conversation.archived',
    );

    const closedConversation = await createConversationWithParticipant({
      status: CommunicationConversationStatus.CLOSED,
      userId: adminAId,
    });
    const closed = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${closedConversation}/messages`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: 'Closed should reject' })
      .expect(409);
    expect(closed.body.error.code).toBe('communication.conversation.closed');

    const nonParticipantConversation =
      await createConversationWithParticipant({
        status: CommunicationConversationStatus.ACTIVE,
        userId: adminAId,
      });
    const messageActorEmail = `${testSuffix}-message-send-only@security.moazez.local`;
    await createUserWithMembership({
      email: messageActorEmail,
      userType: UserType.SCHOOL_USER,
      roleId: messageSendRoleIdForFixtures,
    });
    const messageActor = await login(messageActorEmail);
    const nonParticipantSend = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${nonParticipantConversation}/messages`)
      .set('Authorization', `Bearer ${messageActor.accessToken}`)
      .send({ body: 'Non participant should reject' })
      .expect(403);
    expect(nonParticipantSend.body.error.code).toBe(
      'communication.conversation.not_member',
    );
    const nonParticipantRead = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/messages/${messageAId}/read`)
      .set('Authorization', `Bearer ${messageActor.accessToken}`)
      .expect(403);
    expect(nonParticipantRead.body.error.code).toBe(
      'communication.conversation.not_member',
    );

    const mutedConversation = await createConversationWithParticipant({
      status: CommunicationConversationStatus.ACTIVE,
      userId: teacherUserId,
      participantStatus: CommunicationParticipantStatus.MUTED,
      mutedUntil: new Date('2026-05-03T09:00:00.000Z'),
    });
    const teacher = await login(teacherEmail);
    const muted = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${mutedConversation}/messages`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ body: 'Muted should reject' })
      .expect(403);
    expect(muted.body.error.code).toBe('communication.message.send_forbidden');
  });

  it('message flows do not create delivery reaction attachment report moderation block restriction or notification side effects', async () => {
    await setCommunicationPolicyEnabled(true);
    const admin = await login(adminAEmail);
    const before = await communicationMessageOutOfScopeCounts(schoolAId);

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/messages`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: 'Side effect guard message' })
      .expect(201);
    createdMessageIds.push(created.body.id);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/messages/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: 'Side effect guard message edited' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/messages/${created.body.id}/read`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/communication/messages/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    const after = await communicationMessageOutOfScopeCounts(schoolAId);
    expect(after).toEqual(before);
  });

  it('school admin can list add update remove promote and demote same-school participants', async () => {
    await setCommunicationPolicyEnabled(true);
    const { accessToken } = await login(adminAEmail);
    const beforeAudit = await communicationRuntimeAuditCount();

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(
      participantAId,
    );
    expect(JSON.stringify(list.body)).not.toContain(participantBId);
    expect(JSON.stringify(list.body)).not.toContain('schoolId');
    expect(JSON.stringify(list.body)).not.toContain('private communication body');

    const added = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        userId: noAccessUserId,
        role: 'member',
        metadata: { cohort: 'support', body: 'must not leak' },
      })
      .expect(201);
    const addedParticipantId = added.body.id as string;
    expect(added.body).toMatchObject({
      conversationId: conversationAId,
      userId: noAccessUserId,
      role: 'member',
      status: 'active',
      metadata: { cohort: 'support' },
    });
    expect(JSON.stringify(added.body)).not.toContain('schoolId');
    expect(JSON.stringify(added.body)).not.toContain('must not leak');

    const updated = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${addedParticipantId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        role: 'moderator',
        status: 'muted',
        mutedUntil: '2026-05-03T09:00:00.000Z',
        metadata: { desk: 'front-office' },
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: addedParticipantId,
      role: 'moderator',
      status: 'muted',
      mutedUntil: '2026-05-03T09:00:00.000Z',
      metadata: { cohort: 'support', desk: 'front-office' },
    });

    const promoted = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${addedParticipantId}/promote`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
    expect(promoted.body.role).toBe('admin');

    const demoted = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${addedParticipantId}/demote`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
    expect(demoted.body.role).toBe('moderator');

    const removed = await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${addedParticipantId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(removed.body).toMatchObject({
      id: addedParticipantId,
      status: 'removed',
      removedById: adminAId,
      removedAt: expect.any(String),
    });

    await expect(communicationRuntimeAuditCount()).resolves.toBe(
      beforeAudit + 5,
    );
  });

  it('school admin can leave a conversation as a non-owner participant', async () => {
    await setCommunicationPolicyEnabled(true);
    const { accessToken } = await login(adminAEmail);
    const leaveConversation = await prisma.communicationConversation.create({
      data: {
        schoolId: schoolAId,
        type: CommunicationConversationType.GROUP,
        status: CommunicationConversationStatus.ACTIVE,
        titleEn: `${testSuffix} leave-safe conversation`,
      },
      select: { id: true },
    });
    createdConversationIds.push(leaveConversation.id);
    const adminParticipant =
      await prisma.communicationConversationParticipant.create({
        data: {
          schoolId: schoolAId,
          conversationId: leaveConversation.id,
          userId: adminAId,
          role: CommunicationParticipantRole.MEMBER,
          status: CommunicationParticipantStatus.ACTIVE,
        },
        select: { id: true },
      });
    await prisma.communicationConversationParticipant.create({
      data: {
        schoolId: schoolAId,
        conversationId: leaveConversation.id,
        userId: viewOnlyUserId,
        role: CommunicationParticipantRole.OWNER,
        status: CommunicationParticipantStatus.ACTIVE,
      },
    });

    const left = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${leaveConversation.id}/leave`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(left.body).toMatchObject({
      id: adminParticipant.id,
      userId: adminAId,
      status: 'left',
      leftAt: expect.any(String),
    });
  });

  it('school admin can create and list invites, invited actors can accept or reject', async () => {
    await setCommunicationPolicyEnabled(true);
    const admin = await login(adminAEmail);

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/invites`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        invitedUserId: parentUserId,
        metadata: { source: 'security-test', message: 'must not leak' },
      })
      .expect(201);
    expect(created.body).toMatchObject({
      conversationId: conversationAId,
      invitedUserId: parentUserId,
      status: 'pending',
      metadata: { source: 'security-test' },
    });
    expect(JSON.stringify(created.body)).not.toContain('schoolId');
    expect(JSON.stringify(created.body)).not.toContain('must not leak');

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/invites`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(
      created.body.id,
    );
    expect(JSON.stringify(list.body)).not.toContain(inviteBId);
    expect(JSON.stringify(list.body)).not.toContain('schoolId');

    const teacher = await login(teacherEmail);
    const accepted = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversation-invites/${inviteAId}/accept`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(201);
    expect(accepted.body).toMatchObject({
      conversationId: conversationAId,
      userId: teacherUserId,
      status: 'active',
    });

    const rejectInvite = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/invites`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ invitedUserId: joinRequesterUserId })
      .expect(201);

    const joinRequester = await login(joinRequesterEmail);
    const rejected = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversation-invites/${rejectInvite.body.id}/reject`)
      .set('Authorization', `Bearer ${joinRequester.accessToken}`)
      .send({ reason: 'Declined for now' })
      .expect(201);
    expect(rejected.body).toMatchObject({
      id: rejectInvite.body.id,
      status: 'rejected',
      respondedAt: expect.any(String),
    });
  });

  it('school admin can list approve and reject join requests and actors can create them', async () => {
    await setCommunicationPolicyEnabled(true);
    const admin = await login(adminAEmail);

    const requesterEmail = `${testSuffix}-join-create@security.moazez.local`;
    const requesterId = await createUserWithMembership({
      email: requesterEmail,
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleIdForFixtures,
    });
    const requester = await login(requesterEmail);

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/join-requests`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({
        note: 'Please add me',
        metadata: { source: 'security-test', body: 'must not leak' },
      })
      .expect(201);
    expect(created.body).toMatchObject({
      conversationId: conversationAId,
      requestedById: requesterId,
      status: 'pending',
      metadata: { source: 'security-test' },
    });
    expect(JSON.stringify(created.body)).not.toContain('schoolId');
    expect(JSON.stringify(created.body)).not.toContain('must not leak');

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/join-requests`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(
      created.body.id,
    );
    expect(JSON.stringify(list.body)).not.toContain(joinRequestBId);
    expect(JSON.stringify(list.body)).not.toContain('schoolId');

    const approved = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/join-requests/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Approved' })
      .expect(201);
    expect(approved.body).toMatchObject({
      conversationId: conversationAId,
      userId: requesterId,
      status: 'active',
    });

    const rejected = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/join-requests/${joinRequestAId}/reject`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Not this group' })
      .expect(201);
    expect(rejected.body).toMatchObject({
      id: joinRequestAId,
      status: 'rejected',
      reviewedById: adminAId,
      reviewedAt: expect.any(String),
    });
  });

  it('school A cannot access school B participants invites or join requests by guessed ids', async () => {
    const { accessToken } = await login(adminAEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationBId}/participants`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationBId}/participants/${participantBId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ role: 'moderator' })
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationBId}/invites`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversation-invites/${inviteBId}/accept`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationBId}/join-requests`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/join-requests/${joinRequestBId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('participant invite and join request permission boundaries return 403', async () => {
    const viewOnly = await login(viewOnlyEmail);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({ userId: parentUserId })
      .expect(403);
    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${participantAId}`,
      )
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({ role: 'moderator' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${participantAId}`,
      )
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${participantAId}/promote`,
      )
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${participantAId}/demote`,
      )
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/invites`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/invites`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({ invitedUserId: parentUserId })
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/join-requests`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/join-requests/${joinRequestBId}/approve`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/join-requests/${joinRequestBId}/reject`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({ reason: 'No permission' })
      .expect(403);

    const noAccess = await login(noAccessEmail);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/leave`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversation-invites/${inviteAId}/accept`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversation-invites/${inviteAId}/reject`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .send({ reason: 'No permission' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/join-requests`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .send({ note: 'No permission' })
      .expect(403);
  });

  it('parent and student cannot access dashboard participant management routes', async () => {
    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ userId: parentUserId })
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/invites`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/join-requests`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    }
  });

  it('teacher access follows seeded participant permissions', async () => {
    const { accessToken } = await login(teacherEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/invites`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('disabled communication policy rejects participant invite and join request mutations', async () => {
    await setCommunicationPolicyEnabled(false);
    const admin = await login(adminAEmail);
    const requesterEmail = `${testSuffix}-disabled-requester@security.moazez.local`;
    await createUserWithMembership({
      email: requesterEmail,
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleIdForFixtures,
    });
    const requester = await login(requesterEmail);

    const participant = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: parentUserId })
      .expect(403);
    expect(participant.body.error.code).toBe('communication.policy.disabled');

    const invite = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/invites`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ invitedUserId: parentUserId })
      .expect(403);
    expect(invite.body.error.code).toBe('communication.policy.disabled');

    const joinRequest = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/join-requests`)
      .set('Authorization', `Bearer ${requester.accessToken}`)
      .send({ note: 'Disabled policy should reject' })
      .expect(403);
    expect(joinRequest.body.error.code).toBe(
      'communication.policy.disabled',
    );

    await setCommunicationPolicyEnabled(true);
  });

  it('disabled communication policy rejects new conversation creation', async () => {
    await setCommunicationPolicyEnabled(false);
    const { accessToken } = await login(adminAEmail);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'group', title: 'Disabled policy group' })
      .expect(403);

    expect(response.body.error.code).toBe('communication.policy.disabled');
    await setCommunicationPolicyEnabled(true);
  });

  it('conversation metadata and state mutations do not create message or moderation side effects', async () => {
    await setCommunicationPolicyEnabled(true);
    const { accessToken } = await login(adminAEmail);
    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'group',
        title: `${testSuffix} side-effect guard conversation`,
      })
      .expect(201);
    createdConversationIds.push(created.body.id);

    const before = await communicationMessageSideEffectCounts(schoolAId);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/conversations/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Side-effect guard updated' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${created.body.id}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${created.body.id}/reopen`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${created.body.id}/close`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${created.body.id}/reopen`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const after = await communicationMessageSideEffectCounts(schoolAId);
    expect(after).toEqual(before);
  });

  it('policy update does not create communication chat/moderation side effects', async () => {
    const { accessToken } = await login(adminAEmail);
    const before = await communicationSideEffectCounts(schoolAId);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ allowAttachments: false })
      .expect(200);

    const after = await communicationSideEffectCounts(schoolAId);
    expect(after).toEqual(before);
  });

  it('participant invite and join request mutations do not create message moderation or realtime side effects', async () => {
    await setCommunicationPolicyEnabled(true);
    const admin = await login(adminAEmail);
    const participantTargetEmail = `${testSuffix}-side-participant@security.moazez.local`;
    const inviteTargetEmail = `${testSuffix}-side-invite@security.moazez.local`;
    const approveRequesterEmail = `${testSuffix}-side-approve-requester@security.moazez.local`;
    const rejectRequesterEmail = `${testSuffix}-side-reject-requester@security.moazez.local`;
    const participantTargetId = await createUserWithMembership({
      email: participantTargetEmail,
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleIdForFixtures,
    });
    const inviteTargetId = await createUserWithMembership({
      email: inviteTargetEmail,
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleIdForFixtures,
    });
    await createUserWithMembership({
      email: approveRequesterEmail,
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleIdForFixtures,
    });
    await createUserWithMembership({
      email: rejectRequesterEmail,
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleIdForFixtures,
    });

    const before = await communicationMessageSideEffectCounts(schoolAId);

    const participant = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: participantTargetId })
      .expect(201);
    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${participant.body.id}`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'moderator' })
      .expect(200);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${participant.body.id}/promote`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${participant.body.id}/demote`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants/${participant.body.id}`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    const invite = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/invites`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ invitedUserId: inviteTargetId })
      .expect(201);
    const inviteTarget = await login(inviteTargetEmail);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversation-invites/${invite.body.id}/accept`)
      .set('Authorization', `Bearer ${inviteTarget.accessToken}`)
      .expect(201);

    const approveRequester = await login(approveRequesterEmail);
    const approveRequest = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/join-requests`)
      .set('Authorization', `Bearer ${approveRequester.accessToken}`)
      .send({ note: 'Approve me' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/join-requests/${approveRequest.body.id}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(201);

    const rejectRequester = await login(rejectRequesterEmail);
    const rejectRequest = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/join-requests`)
      .set('Authorization', `Bearer ${rejectRequester.accessToken}`)
      .send({ note: 'Reject me' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/join-requests/${rejectRequest.body.id}/reject`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Not now' })
      .expect(201);

    const after = await communicationMessageSideEffectCounts(schoolAId);
    expect(after).toEqual(before);
  });

  it('read endpoints do not create audit rows', async () => {
    const { accessToken } = await login(adminAEmail);
    const before = await communicationAuditCount();
    const beforeConversationAudit = await communicationConversationAuditCount();
    const beforeRuntimeAudit = await communicationRuntimeAuditCount();

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/admin/overview`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/invites`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/join-requests`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/messages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/messages/${messageAId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/messages/${messageAId}/read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/read-summary`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await expect(communicationAuditCount()).resolves.toBe(before);
    await expect(communicationConversationAuditCount()).resolves.toBe(
      beforeConversationAudit,
    );
    await expect(communicationRuntimeAuditCount()).resolves.toBe(
      beforeRuntimeAudit,
    );
  });

  it('mutation endpoints create audit rows', async () => {
    const { accessToken } = await login(adminAEmail);
    const before = await communicationAuditCount();
    const beforeRuntime = await communicationRuntimeAuditCount();
    const beforeMessageAudit = await communicationMessageAuditCount();
    const auditTargetEmail = `${testSuffix}-audit-target@security.moazez.local`;
    const auditTargetId = await createUserWithMembership({
      email: auditTargetEmail,
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleIdForFixtures,
    });

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ allowReactions: false })
      .expect(200);

    await expect(communicationAuditCount()).resolves.toBe(before + 1);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/participants`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ userId: auditTargetId })
      .expect(201);

    await expect(communicationRuntimeAuditCount()).resolves.toBe(
      beforeRuntime + 1,
    );

    const createdMessage = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/communication/conversations/${conversationAId}/messages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ body: 'Audited message mutation' })
      .expect(201);
    createdMessageIds.push(createdMessage.body.id);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/messages/${createdMessage.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ body: 'Audited message mutation edited' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/communication/messages/${createdMessage.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await expect(communicationMessageAuditCount()).resolves.toBe(
      beforeMessageAudit + 3,
    );
  });

  it('admin overview does not expose message body', async () => {
    const { accessToken } = await login(adminAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/admin/overview`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const json = JSON.stringify(response.body);
    expect(json).not.toContain('body');
    expect(json).not.toContain('private communication body');
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${key} system role not found - run seed.`);
    return role;
  }

  async function findPermission(code: string): Promise<{ id: string }> {
    const permission = await prisma.permission.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!permission) throw new Error(`${code} permission not found - run seed.`);
    return permission;
  }

  async function createCustomRole(
    keySuffix: string,
    permissionIds: string[],
  ): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: schoolAId,
        key: `${testSuffix}-${keySuffix}`,
        name: `${testSuffix} ${keySuffix}`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }

    return role.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    userType: UserType;
    roleId: string;
    organizationId?: string;
    schoolId?: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Communication',
        lastName: 'Security',
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: params.organizationId ?? organizationAId,
        schoolId: params.schoolId ?? schoolAId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function communicationAuditCount(): Promise<number> {
    return prisma.auditLog.count({
      where: {
        schoolId: schoolAId,
        module: 'communication',
        resourceType: 'communication_policy',
      },
    });
  }

  async function communicationConversationAuditCount(): Promise<number> {
    return prisma.auditLog.count({
      where: {
        schoolId: schoolAId,
        module: 'communication',
        resourceType: 'communication_conversation',
      },
    });
  }

  async function communicationMessageAuditCount(): Promise<number> {
    return prisma.auditLog.count({
      where: {
        schoolId: schoolAId,
        module: 'communication',
        resourceType: 'communication_message',
      },
    });
  }

  async function communicationRuntimeAuditCount(): Promise<number> {
    return prisma.auditLog.count({
      where: {
        schoolId: schoolAId,
        module: 'communication',
        resourceType: {
          in: [
            'communication_participant',
            'communication_invite',
            'communication_join_request',
          ],
        },
      },
    });
  }

  async function setCommunicationPolicyEnabled(isEnabled: boolean): Promise<void> {
    await prisma.communicationPolicy.update({
      where: { id: policyAId },
      data: { isEnabled },
    });
  }

  async function createConversationWithParticipant(params: {
    status: CommunicationConversationStatus;
    userId: string;
    participantStatus?: CommunicationParticipantStatus;
    mutedUntil?: Date | null;
  }): Promise<string> {
    const conversation = await prisma.communicationConversation.create({
      data: {
        schoolId: schoolAId,
        type: CommunicationConversationType.GROUP,
        status: params.status,
        titleEn: `${testSuffix} message state guard ${params.status.toLowerCase()}`,
      },
      select: { id: true },
    });
    createdConversationIds.push(conversation.id);

    await prisma.communicationConversationParticipant.create({
      data: {
        schoolId: schoolAId,
        conversationId: conversation.id,
        userId: params.userId,
        role: CommunicationParticipantRole.MEMBER,
        status: params.participantStatus ?? CommunicationParticipantStatus.ACTIVE,
        mutedUntil: params.mutedUntil ?? null,
      },
    });

    return conversation.id;
  }

  async function communicationSideEffectCounts(schoolId: string) {
    const [
      conversations,
      participants,
      messages,
      reads,
      deliveries,
      reactions,
      attachments,
      reports,
      moderationActions,
      userBlocks,
      userRestrictions,
    ] = await Promise.all([
      prisma.communicationConversation.count({ where: { schoolId } }),
      prisma.communicationConversationParticipant.count({ where: { schoolId } }),
      prisma.communicationMessage.count({ where: { schoolId } }),
      prisma.communicationMessageRead.count({ where: { schoolId } }),
      prisma.communicationMessageDelivery.count({ where: { schoolId } }),
      prisma.communicationMessageReaction.count({ where: { schoolId } }),
      prisma.communicationMessageAttachment.count({ where: { schoolId } }),
      prisma.communicationMessageReport.count({ where: { schoolId } }),
      prisma.communicationModerationAction.count({ where: { schoolId } }),
      prisma.communicationUserBlock.count({ where: { schoolId } }),
      prisma.communicationUserRestriction.count({ where: { schoolId } }),
    ]);

    return {
      conversations,
      participants,
      messages,
      reads,
      deliveries,
      reactions,
      attachments,
      reports,
      moderationActions,
      userBlocks,
      userRestrictions,
    };
  }

  async function communicationMessageSideEffectCounts(schoolId: string) {
    const [
      messages,
      reads,
      deliveries,
      reactions,
      attachments,
      reports,
      moderationActions,
      userBlocks,
      userRestrictions,
    ] = await Promise.all([
      prisma.communicationMessage.count({ where: { schoolId } }),
      prisma.communicationMessageRead.count({ where: { schoolId } }),
      prisma.communicationMessageDelivery.count({ where: { schoolId } }),
      prisma.communicationMessageReaction.count({ where: { schoolId } }),
      prisma.communicationMessageAttachment.count({ where: { schoolId } }),
      prisma.communicationMessageReport.count({ where: { schoolId } }),
      prisma.communicationModerationAction.count({ where: { schoolId } }),
      prisma.communicationUserBlock.count({ where: { schoolId } }),
      prisma.communicationUserRestriction.count({ where: { schoolId } }),
    ]);

    return {
      messages,
      reads,
      deliveries,
      reactions,
      attachments,
      reports,
      moderationActions,
      userBlocks,
      userRestrictions,
    };
  }

  async function communicationMessageOutOfScopeCounts(schoolId: string) {
    const [
      deliveries,
      reactions,
      attachments,
      reports,
      moderationActions,
      userBlocks,
      userRestrictions,
    ] = await Promise.all([
      prisma.communicationMessageDelivery.count({ where: { schoolId } }),
      prisma.communicationMessageReaction.count({ where: { schoolId } }),
      prisma.communicationMessageAttachment.count({ where: { schoolId } }),
      prisma.communicationMessageReport.count({ where: { schoolId } }),
      prisma.communicationModerationAction.count({ where: { schoolId } }),
      prisma.communicationUserBlock.count({ where: { schoolId } }),
      prisma.communicationUserRestriction.count({ where: { schoolId } }),
    ]);

    return {
      deliveries,
      reactions,
      attachments,
      reports,
      moderationActions,
      userBlocks,
      userRestrictions,
    };
  }

  async function cleanupCommunicationSchools(schoolIds: string[]): Promise<void> {
    await prisma.communicationMessageAttachment.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationMessageReaction.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationMessageDelivery.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationMessageRead.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationMessageReport.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationModerationAction.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationConversationInvite.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationConversationJoinRequest.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationConversationParticipant.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationMessage.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationConversation.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationUserRestriction.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationUserBlock.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
    await prisma.communicationPolicy.deleteMany({
      where: { schoolId: { in: schoolIds } },
    });
  }
});
