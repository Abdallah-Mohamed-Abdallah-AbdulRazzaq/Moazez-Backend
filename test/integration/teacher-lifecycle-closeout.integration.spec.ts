import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AuditOutcome,
  MembershipStatus,
  PrismaClient,
  TeacherEmploymentStatus,
  TeacherGender,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const API = '/api/v1';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type Token = { accessToken: string };
type Actor = { id: string; email: string; password: string; token?: Token };

jest.setTimeout(240_000);

describe('Teacher Directory 1B lifecycle closeout (disposable database)', () => {
  const marker = `closeout-${randomUUID().slice(0, 8)}`;
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolA1Id: string;
  let schoolA2Id: string;
  let schoolB1Id: string;
  let schoolAdminRoleId: string;
  let organizationAdminRoleId: string;
  let teacherRoleId: string;
  let customSchoolRoleId: string;
  let customOrganizationRoleId: string;
  let schoolAActor: Actor;
  let schoolBActor: Actor;
  let organizationAActor: Actor;
  let organizationBActor: Actor;
  let teacherActor: Actor;
  let customSchoolActor: Actor;
  let customOrganizationActor: Actor;
  let platformActor: Actor;

  beforeAll(async () => {
    assertDisposableDatabase();
    prisma = new PrismaClient();
    await prisma.$connect();

    const roles = await prisma.role.findMany({
      where: {
        schoolId: null,
        isSystem: true,
        key: { in: ['school_admin', 'organization_admin', 'teacher'] },
        deletedAt: null,
      },
      select: { id: true, key: true },
    });
    schoolAdminRoleId = requireRole(roles, 'school_admin');
    organizationAdminRoleId = requireRole(roles, 'organization_admin');
    teacherRoleId = requireRole(roles, 'teacher');

    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: `${marker}-organization-a`, slug: `${marker}-org-a` },
        select: { id: true },
      }),
      prisma.organization.create({
        data: { name: `${marker}-organization-b`, slug: `${marker}-org-b` },
        select: { id: true },
      }),
    ]);
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;

    const [schoolA1, schoolA2, schoolB1] = await Promise.all([
      createSchool(organizationAId, 'a1'),
      createSchool(organizationAId, 'a2'),
      createSchool(organizationBId, 'b1'),
    ]);
    schoolA1Id = schoolA1.id;
    schoolA2Id = schoolA2.id;
    schoolB1Id = schoolB1.id;

    const [customSchoolRole, customOrganizationRole] = await Promise.all([
      prisma.role.create({
        data: {
          schoolId: schoolA1Id,
          key: `${marker}-school-custom`,
          name: 'Synthetic School Custom',
        },
        select: { id: true },
      }),
      prisma.role.create({
        data: {
          key: `${marker}-organization-custom`,
          name: 'Synthetic Organization Custom',
        },
        select: { id: true },
      }),
    ]);
    customSchoolRoleId = customSchoolRole.id;
    customOrganizationRoleId = customOrganizationRole.id;

    schoolAActor = await createActor({
      label: 'school-a-admin',
      userType: UserType.SCHOOL_USER,
      organizationId: organizationAId,
      schoolId: schoolA1Id,
      roleId: schoolAdminRoleId,
    });
    schoolBActor = await createActor({
      label: 'school-b-admin',
      userType: UserType.SCHOOL_USER,
      organizationId: organizationBId,
      schoolId: schoolB1Id,
      roleId: schoolAdminRoleId,
    });
    organizationAActor = await createActor({
      label: 'organization-a-admin',
      userType: UserType.ORGANIZATION_USER,
      organizationId: organizationAId,
      schoolId: null,
      roleId: organizationAdminRoleId,
    });
    organizationBActor = await createActor({
      label: 'organization-b-admin',
      userType: UserType.ORGANIZATION_USER,
      organizationId: organizationBId,
      schoolId: null,
      roleId: organizationAdminRoleId,
    });
    customSchoolActor = await createActor({
      label: 'school-custom',
      userType: UserType.SCHOOL_USER,
      organizationId: organizationAId,
      schoolId: schoolA1Id,
      roleId: customSchoolRoleId,
    });
    customOrganizationActor = await createActor({
      label: 'organization-custom',
      userType: UserType.ORGANIZATION_USER,
      organizationId: organizationAId,
      schoolId: null,
      roleId: customOrganizationRoleId,
    });
    platformActor = await createActor({
      label: 'platform',
      userType: UserType.PLATFORM_USER,
    });
    teacherActor = await createActor({
      label: 'teacher',
      userType: UserType.TEACHER,
      organizationId: organizationAId,
      schoolId: schoolA1Id,
      roleId: teacherRoleId,
      profile: true,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API.slice(1));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    for (const actor of [
      schoolAActor,
      schoolBActor,
      organizationAActor,
      organizationBActor,
      customSchoolActor,
      customOrganizationActor,
      platformActor,
      teacherActor,
    ]) {
      actor.token = await login(actor);
    }
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      const users = await prisma.user.findMany({
        where: { email: { startsWith: marker } },
        select: { id: true },
      });
      const userIds = users.map(({ id }) => id);
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { organizationId: { in: [organizationAId, organizationBId] } },
            { actorId: { in: userIds } },
            { resourceId: { in: userIds } },
          ],
        },
      });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.teacherProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.role.deleteMany({
        where: { id: { in: [customSchoolRoleId, customOrganizationRoleId] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.school.deleteMany({
        where: { id: { in: [schoolA1Id, schoolA2Id, schoolB1Id] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId] } },
      });
      await prisma.$disconnect();
    }
  });

  it('provisions and composes the exact current-School Teacher aggregate', async () => {
    const response = await createTeacher(
      schoolAActor,
      'provisioned',
      TeacherEmploymentStatus.ACTIVE,
    );
    expect(response.status).toBe(201);
    const teacherId = response.body.id as string;
    const userId = response.body.userId as string;
    expect(response.body).toEqual(
      expect.objectContaining({
        accountStatus: UserStatus.INVITED,
        membershipStatus: MembershipStatus.ACTIVE,
        membershipEndedAt: null,
        employmentStatus: TeacherEmploymentStatus.ACTIVE,
        profileCompleteness: { isComplete: true, missingFields: [] },
        credentialSummary: expect.objectContaining({
          hasPassword: false,
          status: 'missing',
        }),
      }),
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|membershipId|roleId|schoolId|organizationId|session/iu,
    );

    const [user, membership, profile, audits] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.membership.findFirst({ where: { userId, schoolId: schoolA1Id } }),
      prisma.teacherProfile.findUnique({ where: { id: teacherId } }),
      prisma.auditLog.findMany({
        where: {
          resourceId: { in: [userId, teacherId] },
          action: {
            in: ['teachers.account.provision', 'teachers.profile.create'],
          },
        },
      }),
    ]);
    expect(user).toMatchObject({
      status: UserStatus.INVITED,
      userType: UserType.TEACHER,
      passwordHash: null,
    });
    expect(membership).toMatchObject({
      userType: UserType.TEACHER,
      status: MembershipStatus.ACTIVE,
      endedAt: null,
      deletedAt: null,
    });
    expect(profile).toMatchObject({
      schoolId: schoolA1Id,
      userId,
      employmentStatus: TeacherEmploymentStatus.ACTIVE,
      deletedAt: null,
    });
    expect(audits).toHaveLength(2);
  });

  it('enforces the current-School route and safe-404 matrix', async () => {
    const own = await createTeacher(schoolAActor, 'scope-own');
    const foreign = await createTeacher(schoolBActor, 'scope-foreign');
    expect(own.status).toBe(201);
    expect(foreign.status).toBe(201);

    const list = await authorized(schoolAActor)
      .get(`${API}/teachers`)
      .expect(200);
    const serialized = JSON.stringify(list.body);
    expect(serialized).toContain(own.body.id as string);
    expect(serialized).not.toContain(foreign.body.id as string);

    await authorized(schoolAActor)
      .get(`${API}/teachers/${own.body.id}`)
      .expect(200);
    const foreignDetail = await authorized(schoolAActor)
      .get(`${API}/teachers/${foreign.body.id}`)
      .expect(404);
    const missingDetail = await authorized(schoolAActor)
      .get(`${API}/teachers/${randomUUID()}`)
      .expect(404);
    expect(safeError(foreignDetail.body)).toEqual(
      safeError(missingDetail.body),
    );

    await authorized(schoolAActor)
      .patch(`${API}/teachers/${own.body.id}`)
      .send({ department: 'Synthetic Updated Department' })
      .expect(200);
    await authorized(schoolAActor)
      .patch(`${API}/teachers/${foreign.body.id}`)
      .send({ department: 'Must Not Cross Scope' })
      .expect(404);
    await authorized(schoolAActor)
      .patch(`${API}/teachers/${own.body.id}`)
      .send({ schoolId: schoolB1Id })
      .expect(400);
    await authorized(schoolAActor)
      .post(`${API}/teachers`)
      .send({
        ...teacherCommand('caller-scope'),
        organizationId: organizationBId,
      })
      .expect(400);
  });

  it('denies Teacher, custom School Role, and Platform actors from current-School management', async () => {
    for (const actor of [teacherActor, customSchoolActor, platformActor]) {
      const response = await authorized(actor).get(`${API}/teachers`);
      expect(response.status).toBe(403);
      expect(response.body?.error?.code).toBeDefined();
    }
  });

  it('persists INACTIVE, reactivation, and Session-revocation state exactly', async () => {
    const created = await createTeacher(schoolAActor, 'employment-cycle');
    const teacherId = created.body.id as string;
    const userId = created.body.userId as string;
    await createSession(userId, 'before-inactive');

    const inactive = await authorized(schoolAActor)
      .patch(`${API}/teachers/${teacherId}/employment-status`)
      .send({ employmentStatus: TeacherEmploymentStatus.INACTIVE })
      .expect(200);
    expect(inactive.body.teacher).toMatchObject({
      accountStatus: UserStatus.DISABLED,
      membershipStatus: MembershipStatus.SUSPENDED,
      membershipEndedAt: null,
      employmentStatus: TeacherEmploymentStatus.INACTIVE,
    });
    await expect(activeSessionCount(userId)).resolves.toBe(0);

    await provisionFixtureCredential(userId);
    await createSession(userId, 'before-reactivation');
    const active = await authorized(schoolAActor)
      .patch(`${API}/teachers/${teacherId}/employment-status`)
      .send({ employmentStatus: TeacherEmploymentStatus.ACTIVE })
      .expect(200);
    expect(active.body.teacher).toMatchObject({
      accountStatus: UserStatus.ACTIVE,
      membershipStatus: MembershipStatus.ACTIVE,
      membershipEndedAt: null,
      employmentStatus: TeacherEmploymentStatus.ACTIVE,
    });
    await expect(activeSessionCount(userId)).resolves.toBe(0);
  });

  it('persists TERMINATED state without deleting identity or credentials', async () => {
    const created = await createTeacher(schoolAActor, 'terminated');
    const teacherId = created.body.id as string;
    const userId = created.body.userId as string;
    await createSession(userId, 'before-termination');
    const effectiveAt = new Date(Date.now() - 1_000).toISOString();
    const response = await authorized(schoolAActor)
      .patch(`${API}/teachers/${teacherId}/employment-status`)
      .send({
        employmentStatus: TeacherEmploymentStatus.TERMINATED,
        effectiveAt,
      })
      .expect(200);
    expect(response.body.teacher).toMatchObject({
      accountStatus: UserStatus.DISABLED,
      membershipStatus: MembershipStatus.INACTIVE,
      employmentStatus: TeacherEmploymentStatus.TERMINATED,
    });
    const [profile, membership, user] = await Promise.all([
      prisma.teacherProfile.findUnique({ where: { id: teacherId } }),
      prisma.membership.findFirst({ where: { userId, schoolId: schoolA1Id } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);
    expect(profile).toMatchObject({ deletedAt: null });
    expect(membership).toMatchObject({
      status: MembershipStatus.INACTIVE,
      deletedAt: null,
    });
    expect(membership?.endedAt?.toISOString()).toBe(effectiveAt);
    expect(user).toMatchObject({ deletedAt: null, userType: UserType.TEACHER });
    await expect(activeSessionCount(userId)).resolves.toBe(0);
  });

  it('archives and restores the exact same-school Profile without hard deletion', async () => {
    const created = await createTeacher(schoolAActor, 'archive-rehire');
    const teacherId = created.body.id as string;
    const userId = created.body.userId as string;
    await authorized(schoolAActor)
      .delete(`${API}/teachers/${teacherId}`)
      .expect(204);
    const archived = await prisma.teacherProfile.findUnique({
      where: { id: teacherId },
    });
    expect(archived).toMatchObject({
      id: teacherId,
      schoolId: schoolA1Id,
      userId,
      employmentStatus: TeacherEmploymentStatus.ACTIVE,
    });
    expect(archived?.deletedAt).toBeInstanceOf(Date);

    const restored = await authorized(schoolAActor)
      .post(`${API}/teachers/${teacherId}/rehire`)
      .send(rehireCommand('archive-rehire'))
      .expect(200);
    expect(restored.body).toMatchObject({
      id: teacherId,
      userId,
      accountStatus: UserStatus.DISABLED,
      membershipStatus: MembershipStatus.SUSPENDED,
      employmentStatus: TeacherEmploymentStatus.INACTIVE,
    });
    await expect(
      prisma.teacherProfile.count({ where: { userId } }),
    ).resolves.toBe(1);
  });

  it('fails closed under genuinely concurrent same-school rehire attempts', async () => {
    const created = await createTeacher(schoolAActor, 'rehire-race');
    const teacherId = created.body.id as string;
    const userId = created.body.userId as string;
    await authorized(schoolAActor)
      .delete(`${API}/teachers/${teacherId}`)
      .expect(204);
    const responses = await Promise.all([
      authorized(schoolAActor)
        .post(`${API}/teachers/${teacherId}/rehire`)
        .send(rehireCommand('rehire-race-a')),
      authorized(schoolAActor)
        .post(`${API}/teachers/${teacherId}/rehire`)
        .send(rehireCommand('rehire-race-b')),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    await expect(
      prisma.teacherProfile.count({ where: { userId, deletedAt: null } }),
    ).resolves.toBe(1);
    await expect(
      prisma.membership.count({
        where: {
          userId,
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          deletedAt: null,
        },
      }),
    ).resolves.toBe(0);
  });

  it('closes generic Settings Teacher creation, display, activation, invite, and reset bypasses', async () => {
    const countsBefore = await aggregateCounts();
    for (const path of [
      `${API}/settings/users`,
      `${API}/settings/users/invite`,
    ]) {
      const response = await authorized(schoolAActor)
        .post(path)
        .send({
          fullName: 'Synthetic Teacher Bypass',
          email: `${randomUUID()}@closeout.invalid`,
          roleId: teacherRoleId,
        })
        .expect(409);
      expect(response.body.error).toMatchObject({
        code: 'teachers.account.role_transition_conflict',
        details: { reasonCode: 'teacher_directory_provisioning_required' },
      });
    }
    expect(await aggregateCounts()).toEqual(countsBefore);

    const created = await createTeacher(schoolAActor, 'settings-bypass');
    const teacherId = created.body.id as string;
    const userId = created.body.userId as string;
    await authorized(schoolAActor)
      .patch(`${API}/settings/users/${userId}`)
      .send({ fullName: 'Forbidden Projection' })
      .expect(409);
    await authorized(schoolAActor)
      .post(`${API}/settings/users/${userId}/resend-invite`)
      .expect(409);
    await authorized(schoolAActor)
      .post(`${API}/settings/users/${userId}/reset-password`)
      .expect(409);

    await createSession(userId, 'settings-disable');
    await authorized(schoolAActor)
      .patch(`${API}/settings/users/${userId}/status`)
      .send({ status: 'inactive' })
      .expect(200);
    await expect(activeSessionCount(userId)).resolves.toBe(0);
    const [profileAfterDisable, membershipAfterDisable] = await Promise.all([
      prisma.teacherProfile.findUnique({ where: { id: teacherId } }),
      prisma.membership.findFirst({ where: { userId, schoolId: schoolA1Id } }),
    ]);
    expect(profileAfterDisable?.employmentStatus).toBe(
      TeacherEmploymentStatus.ACTIVE,
    );
    expect(membershipAfterDisable?.status).toBe(MembershipStatus.ACTIVE);
    const activate = await authorized(schoolAActor)
      .patch(`${API}/settings/users/${userId}/status`)
      .send({ status: 'active' })
      .expect(409);
    expect(activate.body.error).toMatchObject({
      code: 'teachers.lifecycle.invalid_transition',
      details: { reasonCode: 'teacher_activation_requires_lifecycle' },
    });
  });

  it('delegates Teacher demotion and preserves Profile/Membership history', async () => {
    const created = await createTeacher(schoolAActor, 'demotion');
    const teacherId = created.body.id as string;
    const userId = created.body.userId as string;
    await createSession(userId, 'before-demotion');
    await authorized(schoolAActor)
      .patch(`${API}/settings/users/${userId}`)
      .send({ roleId: schoolAdminRoleId })
      .expect(200);
    const [user, profile, memberships] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.teacherProfile.findUnique({ where: { id: teacherId } }),
      prisma.membership.findMany({
        where: { userId },
        orderBy: { startedAt: 'asc' },
      }),
    ]);
    expect(user).toMatchObject({ userType: UserType.SCHOOL_USER });
    expect(user?.status).not.toBe(UserStatus.ACTIVE);
    expect(profile?.deletedAt).toBeInstanceOf(Date);
    expect(
      memberships.some(
        (row) => row.userType === UserType.TEACHER && row.endedAt !== null,
      ),
    ).toBe(true);
    expect(
      memberships.some(
        (row) =>
          row.userType === UserType.SCHOOL_USER && row.deletedAt === null,
      ),
    ).toBe(true);
    await expect(activeSessionCount(userId)).resolves.toBe(0);
  });

  it('transfers within one Organization and preserves source/credential/history invariants', async () => {
    const created = await createTeacher(schoolAActor, 'transfer-success');
    const sourceProfileId = created.body.id as string;
    const userId = created.body.userId as string;
    const credentialBefore = await credentialSnapshot(userId);
    await createSession(userId, 'before-transfer');
    const response = await authorized(organizationAActor)
      .post(`${API}/organization-admin/teachers/${sourceProfileId}/transfer`)
      .send(transferCommand(schoolA2Id, 'transfer-success'))
      .expect(200);
    expect(response.body.teacher).toMatchObject({
      userId,
      accountStatus: UserStatus.DISABLED,
      membershipStatus: MembershipStatus.SUSPENDED,
      membershipEndedAt: null,
      employmentStatus: TeacherEmploymentStatus.INACTIVE,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /organizationId|schoolId|membershipId|roleId|sessionId|allocationId|passwordHash/iu,
    );

    const [source, liveProfiles, memberships, credentialAfter] =
      await Promise.all([
        prisma.teacherProfile.findUnique({ where: { id: sourceProfileId } }),
        prisma.teacherProfile.findMany({ where: { userId, deletedAt: null } }),
        prisma.membership.findMany({ where: { userId } }),
        credentialSnapshot(userId),
      ]);
    expect(source).toMatchObject({
      schoolId: schoolA1Id,
      employmentStatus: TeacherEmploymentStatus.ACTIVE,
    });
    expect(source?.deletedAt).toBeInstanceOf(Date);
    expect(liveProfiles).toHaveLength(1);
    expect(liveProfiles[0]).toMatchObject({
      schoolId: schoolA2Id,
      employmentStatus: TeacherEmploymentStatus.INACTIVE,
    });
    expect(memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schoolId: schoolA1Id,
          status: MembershipStatus.TRANSFERRED,
        }),
        expect.objectContaining({
          schoolId: schoolA2Id,
          status: MembershipStatus.SUSPENDED,
          endedAt: null,
        }),
      ]),
    );
    expect(credentialAfter).toEqual(credentialBefore);
    await expect(activeSessionCount(userId)).resolves.toBe(0);
  });

  it('enforces Organization A/B ownership and actor denial before transfer lookup', async () => {
    const source = await createTeacher(schoolAActor, 'transfer-boundary');
    const foreignSource = await createTeacher(schoolBActor, 'transfer-foreign');
    const crossOrganization = await authorized(organizationAActor)
      .post(`${API}/organization-admin/teachers/${source.body.id}/transfer`)
      .send(transferCommand(schoolB1Id, 'cross-organization'))
      .expect(404);
    const missing = await authorized(organizationAActor)
      .post(`${API}/organization-admin/teachers/${randomUUID()}/transfer`)
      .send(transferCommand(schoolA2Id, 'missing'))
      .expect(404);
    expect(safeError(crossOrganization.body)).toEqual(safeError(missing.body));
    await authorized(organizationAActor)
      .post(
        `${API}/organization-admin/teachers/${foreignSource.body.id}/transfer`,
      )
      .send(transferCommand(schoolA2Id, 'foreign-source'))
      .expect(404);
    await authorized(organizationBActor)
      .post(`${API}/organization-admin/teachers/${source.body.id}/transfer`)
      .send(transferCommand(schoolA2Id, 'foreign-actor'))
      .expect(404);

    for (const actor of [
      schoolAActor,
      teacherActor,
      platformActor,
      customOrganizationActor,
    ]) {
      const denied = await authorized(actor)
        .post(`${API}/organization-admin/teachers/${randomUUID()}/transfer`)
        .send(transferCommand(schoolA2Id, 'actor-denied'));
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('auth.scope.missing');
    }
    await authorized(organizationAActor)
      .post(`${API}/organization-admin/teachers/${source.body.id}/transfer`)
      .send({
        ...transferCommand(schoolA2Id, 'caller-org'),
        organizationId: organizationAId,
      })
      .expect(400);
  });

  it('fails closed for moved and ambiguous Organization actor scope', async () => {
    const ambiguous = await createActor({
      label: 'organization-ambiguous',
      userType: UserType.ORGANIZATION_USER,
      organizationId: organizationAId,
      schoolId: null,
      roleId: organizationAdminRoleId,
    });
    await prisma.membership.create({
      data: {
        userId: ambiguous.id,
        organizationId: organizationBId,
        schoolId: null,
        roleId: organizationAdminRoleId,
        userType: UserType.ORGANIZATION_USER,
        status: MembershipStatus.ACTIVE,
      },
    });
    ambiguous.token = await login(ambiguous);
    await authorized(ambiguous)
      .post(`${API}/organization-admin/teachers/${randomUUID()}/transfer`)
      .send(transferCommand(schoolA2Id, 'ambiguous'))
      .expect(403);

    const stale = await createActor({
      label: 'organization-stale',
      userType: UserType.ORGANIZATION_USER,
      organizationId: organizationAId,
      schoolId: null,
      roleId: organizationAdminRoleId,
    });
    stale.token = await login(stale);
    await prisma.user.update({
      where: { id: stale.id },
      data: { userType: UserType.SCHOOL_USER },
    });
    await authorized(stale)
      .post(`${API}/organization-admin/teachers/${randomUUID()}/transfer`)
      .send(transferCommand(schoolA2Id, 'stale'))
      .expect(403);

    const ended = await createActor({
      label: 'organization-ended',
      userType: UserType.ORGANIZATION_USER,
      organizationId: organizationAId,
      schoolId: null,
      roleId: organizationAdminRoleId,
    });
    ended.token = await login(ended);
    await prisma.membership.updateMany({
      where: { userId: ended.id },
      data: { endedAt: new Date() },
    });
    await authorized(ended)
      .post(`${API}/organization-admin/teachers/${randomUUID()}/transfer`)
      .send(transferCommand(schoolA2Id, 'ended'))
      .expect(403);
  });

  it('allows only one concurrent transfer to commit and leaves one coherent destination', async () => {
    const created = await createTeacher(schoolAActor, 'transfer-race');
    const sourceProfileId = created.body.id as string;
    const userId = created.body.userId as string;
    const responses = await Promise.all([
      authorized(organizationAActor)
        .post(`${API}/organization-admin/teachers/${sourceProfileId}/transfer`)
        .send(transferCommand(schoolA2Id, 'transfer-race-a')),
      authorized(organizationAActor)
        .post(`${API}/organization-admin/teachers/${sourceProfileId}/transfer`)
        .send(transferCommand(schoolA2Id, 'transfer-race-b')),
    ]);
    expect(
      responses
        .map(({ body, status }) => ({
          status,
          errorCode: body?.error?.code ?? null,
        }))
        .sort((left, right) => left.status - right.status),
    ).toEqual([
      { status: 200, errorCode: null },
      {
        status: 409,
        errorCode: 'teachers.lifecycle.transfer_conflict',
      },
    ]);
    await expect(
      prisma.teacherProfile.count({ where: { userId, deletedAt: null } }),
    ).resolves.toBe(1);
    await expect(
      prisma.membership.count({
        where: {
          userId,
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          deletedAt: null,
        },
      }),
    ).resolves.toBe(0);
    const successAudits = await prisma.auditLog.count({
      where: {
        resourceId: userId,
        action: 'teachers.account.transfer',
      },
    });
    expect(successAudits).toBe(1);
  });

  it('keeps Teacher audit metadata bounded and free of sensitive values', async () => {
    const allowedActions = new Set([
      'teachers.account.provision',
      'teachers.account.activate',
      'teachers.account.disable',
      'teachers.account.rehire',
      'teachers.account.transfer',
      'teachers.membership.suspend',
      'teachers.membership.transfer',
      'teachers.profile.create',
      'teachers.profile.update',
      'teachers.profile.restore',
      'teachers.profile.archive',
      'teachers.employment_status.change',
      'teachers.role.promote',
      'teachers.role.demote',
      'teachers.role_transition.rejected',
    ]);
    const audits = await prisma.auditLog.findMany({
      where: {
        module: 'teachers',
        organizationId: { in: [organizationAId, organizationBId] },
      },
      select: { action: true, resourceType: true, before: true, after: true },
    });
    expect(audits.length).toBeGreaterThan(0);
    for (const audit of audits) {
      expect(allowedActions.has(audit.action)).toBe(true);
      expect(['user', 'membership', 'teacher_profile']).toContain(
        audit.resourceType,
      );
      const serializedMetadata = JSON.stringify([audit.before, audit.after]);
      expect(serializedMetadata).not.toContain(marker);
      expect(serializedMetadata).not.toMatch(/@closeout\.invalid/iu);
      expect(collectObjectKeys([audit.before, audit.after])).not.toEqual(
        expect.arrayContaining([
          'passwordHash',
          'temporaryPassword',
          'token',
          'sessionId',
          'filename',
          'bucket',
          'objectKey',
          'rawError',
          'requestBody',
          'notesAr',
          'notesEn',
        ]),
      );
    }
  });

  function authorized(actor: Actor) {
    if (!actor.token) throw new Error('Synthetic actor is not authenticated');
    const authorization = `Bearer ${actor.token.accessToken}`;
    const client = request(app.getHttpServer());
    return {
      get: (path: string) =>
        client.get(path).set('Authorization', authorization),
      post: (path: string) =>
        client.post(path).set('Authorization', authorization),
      patch: (path: string) =>
        client.patch(path).set('Authorization', authorization),
      delete: (path: string) =>
        client.delete(path).set('Authorization', authorization),
    };
  }

  async function login(actor: Actor): Promise<Token> {
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: actor.email, password: actor.password })
      .expect(200);
    return { accessToken: response.body.accessToken as string };
  }

  async function createActor(input: {
    label: string;
    userType: UserType;
    organizationId?: string;
    schoolId?: string | null;
    roleId?: string;
    profile?: boolean;
  }): Promise<Actor> {
    const password = generatedPassword();
    const email = `${marker}-${input.label}-${randomUUID().slice(0, 8)}@closeout.invalid`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Synthetic',
        lastName: 'Actor',
        userType: input.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(password, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    if (input.organizationId && input.roleId) {
      await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: input.organizationId,
          schoolId: input.schoolId ?? null,
          roleId: input.roleId,
          userType: input.userType,
          status: MembershipStatus.ACTIVE,
        },
      });
    }
    if (input.profile && input.schoolId) {
      await prisma.teacherProfile.create({
        data: {
          schoolId: input.schoolId,
          userId: user.id,
          teacherCode: `ACT${randomUUID().slice(0, 8)}`.toUpperCase(),
          firstNameAr: 'معلم',
          lastNameAr: 'اختباري',
          firstNameEn: 'Synthetic',
          lastNameEn: 'Teacher',
          gender: TeacherGender.MALE,
          employmentStatus: TeacherEmploymentStatus.ACTIVE,
        },
      });
    }
    return { id: user.id, email, password };
  }

  function createSchool(organizationId: string, suffix: string) {
    return prisma.school.create({
      data: {
        organizationId,
        name: `${marker}-school-${suffix}`,
        slug: `${marker}-school-${suffix}`,
      },
      select: { id: true },
    });
  }

  async function createTeacher(
    actor: Actor,
    label: string,
    employmentStatus = TeacherEmploymentStatus.ACTIVE,
  ) {
    return authorized(actor)
      .post(`${API}/teachers`)
      .send(teacherCommand(label, employmentStatus));
  }

  function teacherCommand(
    label: string,
    employmentStatus = TeacherEmploymentStatus.ACTIVE,
  ) {
    return {
      loginEmail: `${marker}-${label}-${randomUUID().slice(0, 8)}@closeout.invalid`,
      teacherCode: code(label),
      firstNameAr: 'معلم',
      lastNameAr: 'اختباري',
      firstNameEn: 'Synthetic',
      lastNameEn: 'Teacher',
      preferredDisplayLanguage: 'EN',
      gender: TeacherGender.MALE,
      employmentStatus,
      workingDays: [],
    };
  }

  function rehireCommand(label: string) {
    return {
      teacherCode: code(label),
      firstNameAr: 'معلم',
      lastNameAr: 'معاد',
      firstNameEn: 'Synthetic',
      lastNameEn: 'Rehire',
      preferredDisplayLanguage: 'EN',
      gender: TeacherGender.MALE,
      workingDays: [],
    };
  }

  function transferCommand(destinationSchoolId: string, label: string) {
    return {
      destinationSchoolId,
      teacherCode: code(label),
      firstNameAr: 'معلم',
      lastNameAr: 'منقول',
      firstNameEn: 'Synthetic',
      lastNameEn: 'Transfer',
      preferredDisplayLanguage: 'EN',
      gender: TeacherGender.MALE,
      workingDays: [],
    };
  }

  function code(label: string): string {
    return `${label.replace(/[^a-z0-9]/giu, '').slice(0, 10)}${randomUUID().slice(0, 6)}`
      .toUpperCase()
      .slice(0, 20);
  }

  function generatedPassword(): string {
    return `Z9!${randomUUID()}aA`;
  }

  async function provisionFixtureCredential(userId: string): Promise<void> {
    const provisionedAt = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await argon2.hash(generatedPassword(), ARGON2_OPTIONS),
        mustChangePassword: false,
        passwordProvisionedAt: provisionedAt,
        passwordChangedAt: provisionedAt,
        credentialVersion: { increment: 1 },
      },
      select: { id: true },
    });
  }

  async function createSession(userId: string, label: string): Promise<void> {
    await prisma.session.create({
      data: {
        userId,
        refreshTokenHash: `${marker}-${label}-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
  }

  function activeSessionCount(userId: string) {
    return prisma.session.count({ where: { userId, revokedAt: null } });
  }

  function credentialSnapshot(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        passwordHash: true,
        mustChangePassword: true,
        passwordProvisionedAt: true,
        passwordChangedAt: true,
        credentialVersion: true,
      },
    });
  }

  function aggregateCounts() {
    return Promise.all([
      prisma.user.count(),
      prisma.membership.count(),
      prisma.teacherProfile.count(),
      prisma.auditLog.count({ where: { outcome: AuditOutcome.SUCCESS } }),
    ]);
  }
});

function requireRole(
  roles: Array<{ id: string; key: string }>,
  key: string,
): string {
  const role = roles.find((candidate) => candidate.key === key);
  if (!role) throw new Error(`Required synthetic test Role missing: ${key}`);
  return role.id;
}

function safeError(body: unknown) {
  const candidate = body as { error?: { code?: string; details?: unknown } };
  return {
    code: candidate.error?.code,
    details: candidate.error?.details,
  };
}

function collectObjectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectObjectKeys);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) => [
    key,
    ...collectObjectKeys(nested),
  ]);
}

function assertDisposableDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('Disposable DATABASE_URL is required');
  const databaseName = decodeURIComponent(new URL(raw).pathname.slice(1));
  if (!/^moazez_1b7_closeout_[a-z0-9_]+$/u.test(databaseName)) {
    throw new Error(
      'Closeout tests require a uniquely named disposable database',
    );
  }
}
