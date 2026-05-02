import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
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
  let adminAEmail: string;
  let noAccessEmail: string;
  let viewOnlyEmail: string;
  let teacherEmail: string;
  let parentEmail: string;
  let studentEmail: string;

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
      adminViewPermission,
    ] = await Promise.all([
      findSystemRole('school_admin'),
      findSystemRole('teacher'),
      findSystemRole('parent'),
      findSystemRole('student'),
      findPermission('communication.policies.view'),
      findPermission('communication.policies.manage'),
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
    ]);
    const manageOnlyRoleId = await createCustomRole('manage-only', [
      policiesManagePermission.id,
    ]);
    expect(manageOnlyRoleId).toBeTruthy();

    adminAEmail = `${testSuffix}-admin-a@security.moazez.local`;
    noAccessEmail = `${testSuffix}-no-access@security.moazez.local`;
    viewOnlyEmail = `${testSuffix}-view-only@security.moazez.local`;
    teacherEmail = `${testSuffix}-teacher@security.moazez.local`;
    parentEmail = `${testSuffix}-parent@security.moazez.local`;
    studentEmail = `${testSuffix}-student@security.moazez.local`;

    const adminAId = await createUserWithMembership({
      email: adminAEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
    });
    await createUserWithMembership({
      email: noAccessEmail,
      userType: UserType.SCHOOL_USER,
      roleId: noAccessRoleId,
    });
    await createUserWithMembership({
      email: viewOnlyEmail,
      userType: UserType.SCHOOL_USER,
      roleId: viewOnlyRoleId,
    });
    await createUserWithMembership({
      email: teacherEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
    });
    await createUserWithMembership({
      email: parentEmail,
      userType: UserType.PARENT,
      roleId: parentRole.id,
    });
    await createUserWithMembership({
      email: studentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
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
        createdById: adminAId,
        lastMessageAt: new Date('2026-05-01T10:00:00.000Z'),
      },
      select: { id: true },
    });
    createdConversationIds.push(conversation.id);

    const message = await prisma.communicationMessage.create({
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
    });
    createdMessageIds.push(message.id);

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
    }
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

  it('read endpoints do not create audit rows', async () => {
    const { accessToken } = await login(adminAEmail);
    const before = await communicationAuditCount();

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/communication/admin/overview`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await expect(communicationAuditCount()).resolves.toBe(before);
  });

  it('mutation endpoints create audit rows', async () => {
    const { accessToken } = await login(adminAEmail);
    const before = await communicationAuditCount();

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/communication/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ allowReactions: false })
      .expect(200);

    await expect(communicationAuditCount()).resolves.toBe(before + 1);
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
        organizationId: organizationAId,
        schoolId: schoolAId,
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
