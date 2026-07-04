import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DismissalGateOperationalStatus,
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
const PASSWORD = 'DismissalStaffE2E123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90_000);

describe('DISMISSAL-STAFF-1A assignments and profile (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let adminAToken: string;
  let adminBToken: string;
  let staffAToken: string;
  let staffNoAssignmentsToken: string;
  let staffAId: string;
  let staffBId: string;
  let staffNoAssignmentsId: string;
  let nonStaffUserId: string;
  let gateAId: string;
  let secondaryGateAId: string;
  let gateBId: string;
  let stageAId: string;
  let alternateStageAId: string;
  let gradeAId: string;
  let sectionAId: string;
  let classroomAId: string;
  let assignmentAId: string;
  let assignmentBId: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, dismissalStaffRole] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'dismissal_staff', schoolId: null, isSystem: true },
        select: { id: true },
      }),
    ]);
    if (!schoolAdminRole || !dismissalStaffRole) {
      throw new Error('Required system roles not found - run `npm run seed`.');
    }

    const fixtureA = await createSchoolFixture('a');
    const fixtureB = await createSchoolFixture('b');
    organizationAId = fixtureA.organizationId;
    organizationBId = fixtureB.organizationId;
    schoolAId = fixtureA.schoolId;
    schoolBId = fixtureB.schoolId;

    const academicA = await createAcademicFixture('a', schoolAId);
    stageAId = academicA.stageId;
    alternateStageAId = academicA.alternateStageId;
    gradeAId = academicA.gradeId;
    sectionAId = academicA.sectionId;
    classroomAId = academicA.classroomId;
    await createAcademicFixture('b', schoolBId);

    gateAId = await createGateFixture({
      schoolId: schoolAId,
      code: `STAFF-A-${TEST_RUN_ID}`,
      name: 'Staff Gate A',
      status: DismissalGateOperationalStatus.OPEN,
    });
    secondaryGateAId = await createGateFixture({
      schoolId: schoolAId,
      code: `STAFF-A2-${TEST_RUN_ID}`,
      name: 'Staff Secondary Gate A',
      status: DismissalGateOperationalStatus.BUSY,
    });
    gateBId = await createGateFixture({
      schoolId: schoolBId,
      code: `STAFF-B-${TEST_RUN_ID}`,
      name: 'Staff Gate B',
      status: DismissalGateOperationalStatus.CLOSED,
    });

    const adminA = await createUserWithMembership({
      email: `dismissal-staff-${TEST_RUN_ID}-admin-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'School',
      lastName: 'Admin A',
    });
    const adminB = await createUserWithMembership({
      email: `dismissal-staff-${TEST_RUN_ID}-admin-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'School',
      lastName: 'Admin B',
    });
    const staffA = await createUserWithMembership({
      email: `dismissal-staff-${TEST_RUN_ID}-staff-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Dana',
      lastName: 'Dismissal',
    });
    staffAId = staffA.userId;
    const staffB = await createUserWithMembership({
      email: `dismissal-staff-${TEST_RUN_ID}-staff-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Basma',
      lastName: 'Dismissal',
    });
    staffBId = staffB.userId;
    const staffNoAssignments = await createUserWithMembership({
      email: `dismissal-staff-${TEST_RUN_ID}-staff-empty@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Empty',
      lastName: 'Staff',
    });
    staffNoAssignmentsId = staffNoAssignments.userId;
    const nonStaff = await createUserWithMembership({
      email: `dismissal-staff-${TEST_RUN_ID}-school-user@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
      firstName: 'Not',
      lastName: 'Staff',
    });
    nonStaffUserId = nonStaff.userId;

    assignmentBId = (
      await prisma.dismissalStaffAssignment.create({
        data: {
          schoolId: schoolBId,
          staffUserId: staffBId,
          gateId: gateBId,
          isActive: true,
        },
        select: { id: true },
      })
    ).id;

    await prisma.dismissalStaffAssignment.create({
      data: {
        schoolId: schoolAId,
        staffUserId: staffAId,
        stageId: alternateStageAId,
        isActive: false,
        deletedAt: new Date(),
      },
    });

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

    adminAToken = await login(adminA.email);
    adminBToken = await login(adminB.email);
    staffAToken = await login(staffA.email);
    staffNoAssignmentsToken = await login(staffNoAssignments.email);
  });

  afterAll(async () => {
    if (prisma) {
      const schoolIds = [schoolAId, schoolBId].filter(Boolean);
      await prisma.dismissalStaffAssignment.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.dismissalSettings.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.dismissalGate.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.classroom.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.section.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.grade.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.stage.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: createdUserIds } },
            { schoolId: { in: schoolIds } },
          ],
          module: 'dismissal',
        },
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
    if (app) await app.close();
  });

  it('allows school admin to create an assignment for DISMISSAL_STAFF', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        staffUserId: staffAId,
        gateId: gateAId,
        classroomId: classroomAId,
        isLead: true,
        startsAt: '2026-07-04T12:00:00.000Z',
        endsAt: '2026-07-04T15:00:00.000Z',
        notes: 'Main dismissal duty',
      })
      .expect(201);

    assignmentAId = response.body.id;
    expect(response.body).toMatchObject({
      id: expect.any(String),
      staff: {
        displayName: 'Dana Dismissal',
        email: expect.stringContaining('staff-a'),
        userType: 'dismissal_staff',
        status: 'active',
      },
      gate: {
        id: gateAId,
        code: `STAFF-A-${TEST_RUN_ID}`,
        status: 'open',
      },
      academicScope: {
        stage: { id: stageAId, name: `Dismissal Stage a ${TEST_RUN_ID}` },
        grade: { id: gradeAId, name: `Dismissal Grade a ${TEST_RUN_ID}` },
        section: { id: sectionAId, name: `Dismissal Section a ${TEST_RUN_ID}` },
        classroom: {
          id: classroomAId,
          name: `Dismissal Classroom a ${TEST_RUN_ID}`,
        },
      },
      isLead: true,
      isActive: true,
      startsAt: '2026-07-04T12:00:00.000Z',
      endsAt: '2026-07-04T15:00:00.000Z',
      notes: 'Main dismissal duty',
    });
    assertNoDismissalLeak(response.body);

    const persisted = await prisma.dismissalStaffAssignment.findUniqueOrThrow({
      where: { id: assignmentAId },
      select: {
        schoolId: true,
        staffUserId: true,
        createdById: true,
        updatedById: true,
      },
    });
    expect(persisted).toMatchObject({
      schoolId: schoolAId,
      staffUserId: staffAId,
    });
    expect(persisted.createdById).toBeTruthy();
    expect(persisted.updatedById).toBeTruthy();
  });

  it('rejects invalid staff targets, missing scopes, cross-school gates, inconsistent scopes, invalid windows, and duplicates', async () => {
    const notStaff = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ staffUserId: nonStaffUserId, gateId: gateAId })
      .expect(422);
    expect(notStaff.body?.error?.code).toBe(
      'dismissal.staff_assignment.staff_not_dismissal_staff',
    );

    const staffNotInSchool = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ staffUserId: staffBId, gateId: gateAId })
      .expect(422);
    expect(staffNotInSchool.body?.error?.code).toBe(
      'dismissal.staff_assignment.staff_not_in_school',
    );

    const missingScope = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ staffUserId: staffAId })
      .expect(422);
    expect(missingScope.body?.error?.code).toBe(
      'dismissal.staff_assignment.scope_required',
    );

    const crossSchoolGate = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ staffUserId: staffAId, gateId: gateBId })
      .expect(404);
    expect(crossSchoolGate.body?.error?.code).toBe(
      'dismissal.staff_assignment.gate_not_found',
    );

    const scopeMismatch = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        staffUserId: staffAId,
        stageId: alternateStageAId,
        gradeId: gradeAId,
      })
      .expect(422);
    expect(scopeMismatch.body?.error?.code).toBe(
      'dismissal.staff_assignment.scope_mismatch',
    );

    const invalidWindow = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        staffUserId: staffAId,
        gateId: secondaryGateAId,
        startsAt: '2026-07-04T16:00:00.000Z',
        endsAt: '2026-07-04T15:00:00.000Z',
      })
      .expect(422);
    expect(invalidWindow.body?.error?.code).toBe(
      'dismissal.staff_assignment.invalid_time_window',
    );

    const duplicate = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        staffUserId: staffAId,
        gateId: gateAId,
        classroomId: classroomAId,
      })
      .expect(409);
    expect(duplicate.body?.error?.code).toBe(
      'dismissal.staff_assignment.duplicate_active',
    );
  });

  it('lists only current-school non-deleted assignments and supports filters', async () => {
    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    const serialized = JSON.stringify(list.body);
    expect(serialized).toContain(assignmentAId);
    expect(serialized).not.toContain(assignmentBId);
    expect(serialized).not.toContain(alternateStageAId);
    expect(list.body.summary).toMatchObject({
      totalCount: 1,
      activeCount: 1,
      inactiveCount: 0,
      leadCount: 1,
    });
    assertNoDismissalLeak(list.body);

    const filtered = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .query({
        q: 'Dana',
        gateId: gateAId,
        staffUserId: staffAId,
        active: 'true',
        lead: 'true',
      })
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].id).toBe(assignmentAId);
    assertNoDismissalLeak(filtered.body);
  });

  it('returns safe 404 for cross-school assignment reads', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${assignmentBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe(
      'dismissal.staff_assignment.not_found',
    );
  });

  it('patches gate, scope, lead, and time fields safely', async () => {
    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${assignmentAId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        gateId: secondaryGateAId,
        stageId: stageAId,
        gradeId: gradeAId,
        sectionId: null,
        classroomId: null,
        isLead: false,
        startsAt: '2026-07-04T13:00:00.000Z',
        endsAt: '2026-07-04T16:00:00.000Z',
        notes: null,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      id: assignmentAId,
      gate: {
        id: secondaryGateAId,
        status: 'busy',
      },
      academicScope: {
        stage: { id: stageAId },
        grade: { id: gradeAId },
        section: null,
        classroom: null,
      },
      isLead: false,
      startsAt: '2026-07-04T13:00:00.000Z',
      endsAt: '2026-07-04T16:00:00.000Z',
      notes: null,
    });
    assertNoDismissalLeak(response.body);
  });

  it('returns a safe profile for DISMISSAL_STAFF actors with assignments', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/profile`)
      .set('Authorization', `Bearer ${staffAToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      profile: {
        displayName: 'Dana Dismissal',
        userType: 'dismissal_staff',
        status: 'active',
      },
      school: {
        name: `Dismissal Staff School a ${TEST_RUN_ID}`,
        timezone: 'Africa/Cairo',
      },
      assignments: {
        totalCount: 1,
        leadCount: 0,
        activeCount: 1,
        gates: [
          {
            id: secondaryGateAId,
            code: `STAFF-A2-${TEST_RUN_ID}`,
            name: 'Staff Secondary Gate A',
            status: 'busy',
          },
        ],
        academicScopes: [
          {
            stage: { id: stageAId },
            grade: { id: gradeAId },
            section: null,
            classroom: null,
            isLead: false,
            startsAt: '2026-07-04T13:00:00.000Z',
            endsAt: '2026-07-04T16:00:00.000Z',
          },
        ],
      },
      readiness: {
        hasAssignments: true,
        canViewGates: true,
        canManageRequests: true,
        canDeliver: true,
        canEscalate: true,
      },
    });
    assertNoDismissalLeak(response.body);
  });

  it('returns hasAssignments=false for staff with no active assignments and rejects non-DISMISSAL_STAFF profile actors', async () => {
    const emptyProfile = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/profile`)
      .set('Authorization', `Bearer ${staffNoAssignmentsToken}`)
      .expect(200);

    expect(emptyProfile.body.assignments).toMatchObject({
      totalCount: 0,
      leadCount: 0,
      activeCount: 0,
      gates: [],
      academicScopes: [],
    });
    expect(emptyProfile.body.readiness.hasAssignments).toBe(false);
    assertNoDismissalLeak(emptyProfile.body);

    const nonStaffProfile = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/profile`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(403);
    expect(nonStaffProfile.body?.error?.code).toBe(
      'dismissal.profile.invalid_actor_type',
    );
  });

  it('soft-deletes assignments and removes them from the default list', async () => {
    const deleted = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${assignmentAId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(deleted.body).toEqual({ id: assignmentAId, deleted: true });
    assertNoDismissalLeak(deleted.body);

    const stored = await prisma.dismissalStaffAssignment.findUniqueOrThrow({
      where: { id: assignmentAId },
      select: { isActive: true, deletedAt: true, updatedById: true },
    });
    expect(stored.isActive).toBe(false);
    expect(stored.deletedAt).toBeTruthy();
    expect(stored.updatedById).toBeTruthy();

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${assignmentAId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(JSON.stringify(list.body)).not.toContain(assignmentAId);
  });

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-staff-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal Staff Org ${label} ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-staff-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal Staff School ${label} ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createAcademicFixture(
    label: string,
    schoolId: string,
  ): Promise<{
    stageId: string;
    alternateStageId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
  }> {
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `Dismissal Stage AR ${label} ${TEST_RUN_ID}`,
        nameEn: `Dismissal Stage ${label} ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const alternateStage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `Alternate Stage AR ${label} ${TEST_RUN_ID}`,
        nameEn: `Alternate Stage ${label} ${TEST_RUN_ID}`,
        sortOrder: 2,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `Dismissal Grade AR ${label} ${TEST_RUN_ID}`,
        nameEn: `Dismissal Grade ${label} ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `Dismissal Section AR ${label} ${TEST_RUN_ID}`,
        nameEn: `Dismissal Section ${label} ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `Dismissal Classroom AR ${label} ${TEST_RUN_ID}`,
        nameEn: `Dismissal Classroom ${label} ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });

    return {
      stageId: stage.id,
      alternateStageId: alternateStage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
    };
  }

  async function createGateFixture(params: {
    schoolId: string;
    code: string;
    name: string;
    status: DismissalGateOperationalStatus;
  }): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId: params.schoolId,
        code: params.code,
        name: params.name,
        status: params.status,
      },
      select: { id: true },
    });

    return gate.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    schoolId: string;
    organizationId: string;
    roleId: string;
    userType: UserType;
    firstName: string;
    lastName: string;
  }): Promise<{ userId: string; email: string }> {
    const passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return { userId: user.id, email: params.email };
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }
});

function assertNoDismissalLeak(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'staffUserId',
    'createdById',
    'updatedById',
    'deletedAt',
    'organizationId',
    'membershipId',
    'roleId',
    'actorId',
    'school_id',
    'staff_user_id',
    'created_by_id',
    'updated_by_id',
    'deleted_at',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
