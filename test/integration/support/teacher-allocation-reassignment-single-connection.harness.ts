import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MembershipStatus,
  Prisma,
  PrismaClient,
  TeacherEmploymentStatus,
  TeacherGender,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../src/common/context/request-context';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import { ReassignTeacherAllocationUseCase } from '../../../src/modules/academics/teacher-allocation/application/reassign-teacher-allocation.use-case';
import { TeacherAllocationReassignmentImpactService } from '../../../src/modules/academics/teacher-allocation/application/teacher-allocation-reassignment-impact.service';
import type { TeacherAllocationReassignmentHandoffInput } from '../../../src/modules/academics/teacher-allocation/application/teacher-allocation-reassignment.unit-of-work';
import { PrismaTeacherAllocationReassignmentTransactionOperations } from '../../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-reassignment-transaction.operations';
import { PrismaTeacherAllocationReassignmentUnitOfWork } from '../../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-reassignment.unit-of-work';
import { TeacherAllocationReassignmentSnapshotOperations } from '../../../src/modules/academics/teacher-allocation/infrastructure/teacher-allocation-reassignment-read.repository';
import {
  PRISMA_CLIENT_OPTIONS,
  type PrismaClientRuntimeOptions,
} from '../../../src/infrastructure/database/prisma-client-options.provider';

const API = '/api/v1';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};
let currentStage = 'startup';

class ControlledFailureAfterTimetableOperations extends PrismaTeacherAllocationReassignmentTransactionOperations {
  override async handoffTimetable(
    transaction: Prisma.TransactionClient,
    input: TeacherAllocationReassignmentHandoffInput,
  ): Promise<number> {
    await super.handoffTimetable(transaction, input);
    throw new Error('controlled_failure_after_timetable_handoff');
  }
}

async function run(): Promise<void> {
  assert.equal(process.env.DATABASE_RUNTIME_ROLE, 'api');
  assert.equal(process.env.DATABASE_CONNECTION_LIMIT, '1');
  assert.equal(process.env.DATABASE_POOL_TIMEOUT_SECONDS, '5');

  const marker = `allocation-single-${randomUUID().slice(0, 8)}`;
  const prisma = new PrismaClient();
  let app: INestApplication<App> | undefined;
  let organizationId: string | undefined;
  let schoolId: string | undefined;

  try {
    currentStage = 'fixture-connect';
    await prisma.$connect();
    currentStage = 'fixture-roles';
    const roles = await prisma.role.findMany({
      where: {
        schoolId: null,
        isSystem: true,
        key: { in: ['school_admin', 'teacher'] },
        deletedAt: null,
      },
      select: { id: true, key: true },
    });
    const schoolAdminRoleId = requireRole(roles, 'school_admin');
    const teacherRoleId = requireRole(roles, 'teacher');

    currentStage = 'fixture-school';
    const organization = await prisma.organization.create({
      data: { name: `${marker}-organization`, slug: `${marker}-organization` },
      select: { id: true },
    });
    organizationId = organization.id;
    const school = await prisma.school.create({
      data: {
        organizationId,
        name: `${marker}-school`,
        slug: `${marker}-school`,
      },
      select: { id: true },
    });
    schoolId = school.id;
    const activeOrganizationId = organization.id;
    const activeSchoolId = school.id;

    currentStage = 'fixture-users';
    const adminPassword = `Z9!${randomUUID()}aA`;
    const adminEmail = `${marker}-admin@integration.invalid`;
    currentStage = 'fixture-admin';
    const admin = await createUser({
      prisma,
      marker,
      email: adminEmail,
      firstName: 'Allocation',
      lastName: 'Admin',
      password: adminPassword,
      userType: UserType.SCHOOL_USER,
      organizationId,
      schoolId,
      roleId: schoolAdminRoleId,
    });
    currentStage = 'fixture-source-teacher';
    const sourceTeacher = await createTeacher({
      prisma,
      marker,
      label: 'source',
      organizationId,
      schoolId,
      roleId: teacherRoleId,
    });
    currentStage = 'fixture-target-teacher';
    const targetTeacher = await createTeacher({
      prisma,
      marker,
      label: 'target',
      organizationId,
      schoolId,
      roleId: teacherRoleId,
    });
    currentStage = 'fixture-academics';
    const academic = await createAcademicBase(prisma, schoolId, marker);
    const [subjectA, subjectB] = await Promise.all([
      createSubject(prisma, schoolId, marker, 'a'),
      createSubject(prisma, schoolId, marker, 'b'),
    ]);
    const allocationA = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId: sourceTeacher.id,
        subjectId: subjectA.id,
        classroomId: academic.classroomId,
        termId: academic.termId,
      },
      select: { id: true },
    });

    currentStage = 'app-init';
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
    app.useLogger(false);
    await app.init();

    const prismaOptions = app.get<PrismaClientRuntimeOptions>(
      PRISMA_CLIENT_OPTIONS,
    );
    const applicationDatasource = new URL(
      requireString(prismaOptions.datasourceUrl, 'application datasource'),
    );
    assert.equal(
      applicationDatasource.searchParams.get('connection_limit'),
      '1',
    );
    assert.equal(applicationDatasource.searchParams.get('pool_timeout'), '5');
    console.log('REASSIGNMENT_APP_DATABASE_CONNECTION_LIMIT=1');
    console.log('REASSIGNMENT_APP_DATABASE_POOL_TIMEOUT_SECONDS=5');

    currentStage = 'login';
    const login = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: adminEmail, password: adminPassword });
    assert.equal(login.status, 200);
    const authorization = `Bearer ${requireString(
      (login.body as { accessToken?: unknown }).accessToken,
      'access token',
    )}`;

    currentStage = 'preview';
    const preview = await request(app.getHttpServer())
      .post(
        `${API}/academics/allocations/${allocationA.id}/reassignment-preview`,
      )
      .set('Authorization', authorization)
      .send({ newTeacherUserId: targetTeacher.id });
    assert.equal(preview.status, 200);
    const fingerprint = requireString(
      (preview.body as { impactFingerprint?: unknown }).impactFingerprint,
      'impact fingerprint',
    );
    assert.match(fingerprint, /^[a-f0-9]{64}$/u);
    console.log('REASSIGNMENT_SINGLE_CONNECTION_PREVIEW=PASS');

    currentStage = 'execute';
    const execute = await request(app.getHttpServer())
      .post(`${API}/academics/allocations/${allocationA.id}/reassign`)
      .set('Authorization', authorization)
      .send({
        newTeacherUserId: targetTeacher.id,
        impactFingerprint: fingerprint,
        reasonCode: 'single_connection_proof',
      });
    assert.equal(execute.status, 200);
    const executeBody = execute.body as unknown as {
      allocation: { id: string; teacherUserId: string };
    };
    assert.equal(executeBody.allocation.id, allocationA.id);
    assert.equal(executeBody.allocation.teacherUserId, targetTeacher.id);
    assert.equal(
      (
        await prisma.teacherSubjectAllocation.findUniqueOrThrow({
          where: { id: allocationA.id },
          select: { teacherUserId: true },
        })
      ).teacherUserId,
      targetTeacher.id,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          action: 'academics.allocation.reassign',
          resourceId: allocationA.id,
          outcome: 'SUCCESS',
        },
      }),
      1,
    );
    console.log('REASSIGNMENT_SINGLE_CONNECTION_EXECUTE=PASS');
    console.log('REASSIGNMENT_SINGLE_CONNECTION_NO_POOL_STARVATION=PASS');

    currentStage = 'rollback-fixture';
    const allocationB = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId: sourceTeacher.id,
        subjectId: subjectB.id,
        classroomId: academic.classroomId,
        termId: academic.termId,
      },
      select: { id: true },
    });
    const dependencies = await createOperationalDependencies({
      prisma,
      marker,
      schoolId,
      academic,
      subjectId: subjectB.id,
      allocationId: allocationB.id,
      sourceTeacherUserId: sourceTeacher.id,
      actorId: admin.id,
    });
    currentStage = 'rollback-preview';
    const rollbackPreview = await request(app.getHttpServer())
      .post(
        `${API}/academics/allocations/${allocationB.id}/reassignment-preview`,
      )
      .set('Authorization', authorization)
      .send({ newTeacherUserId: targetTeacher.id });
    assert.equal(rollbackPreview.status, 200);

    const applicationPrisma = app.get(PrismaService);
    const rollbackUseCase = new ReassignTeacherAllocationUseCase(
      new PrismaTeacherAllocationReassignmentUnitOfWork(
        applicationPrisma,
        new TeacherAllocationReassignmentSnapshotOperations(),
        new ControlledFailureAfterTimetableOperations(),
      ),
      new TeacherAllocationReassignmentImpactService(),
    );
    currentStage = 'rollback-execute';
    await assert.rejects(
      () =>
        runWithRequestContext(createRequestContext(), async () => {
          setActor({ id: admin.id, userType: UserType.SCHOOL_USER });
          setActiveMembership({
            membershipId: admin.membershipId,
            organizationId: activeOrganizationId,
            schoolId: activeSchoolId,
            roleId: schoolAdminRoleId,
            permissions: ['academics.structure.manage'],
          });
          await rollbackUseCase.execute(allocationB.id, {
            newTeacherUserId: targetTeacher.id,
            impactFingerprint: requireString(
              (rollbackPreview.body as { impactFingerprint?: unknown })
                .impactFingerprint,
              'rollback fingerprint',
            ),
          });
        }),
      /controlled_failure_after_timetable_handoff/u,
    );

    currentStage = 'rollback-verify';
    const [allocationAfter, timetableAfter, lessonPlanAfter, homeworkAfter] =
      await Promise.all([
        prisma.teacherSubjectAllocation.findUniqueOrThrow({
          where: { id: allocationB.id },
          select: { teacherUserId: true },
        }),
        prisma.timetableEntry.findUniqueOrThrow({
          where: { id: dependencies.timetableEntryId },
          select: { teacherUserId: true },
        }),
        prisma.lessonPlan.findUniqueOrThrow({
          where: { id: dependencies.lessonPlanId },
          select: { teacherUserId: true },
        }),
        prisma.homeworkAssignment.findUniqueOrThrow({
          where: { id: dependencies.homeworkId },
          select: { teacherUserId: true },
        }),
      ]);
    assert.equal(allocationAfter.teacherUserId, sourceTeacher.id);
    assert.equal(timetableAfter.teacherUserId, sourceTeacher.id);
    assert.equal(lessonPlanAfter.teacherUserId, sourceTeacher.id);
    assert.equal(homeworkAfter.teacherUserId, sourceTeacher.id);
    assert.equal(
      await prisma.auditLog.count({
        where: {
          action: 'academics.allocation.reassign',
          resourceId: allocationB.id,
          outcome: 'SUCCESS',
        },
      }),
      0,
    );
    console.log('REASSIGNMENT_ATOMIC_ROLLBACK=PASS');
  } finally {
    if (app) await app.close();
    if (schoolId) await cleanupSchool(prisma, schoolId);
    if (organizationId) {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
  }
}

async function createUser(input: {
  prisma: PrismaClient;
  marker: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  userType: UserType;
  organizationId: string;
  schoolId: string;
  roleId: string;
}): Promise<{ id: string; membershipId: string }> {
  const user = await input.prisma.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      userType: input.userType,
      status: UserStatus.ACTIVE,
      passwordHash: await argon2.hash(input.password, ARGON2_OPTIONS),
    },
    select: { id: true },
  });
  const membership = await input.prisma.membership.create({
    data: {
      userId: user.id,
      organizationId: input.organizationId,
      schoolId: input.schoolId,
      roleId: input.roleId,
      userType: input.userType,
      status: MembershipStatus.ACTIVE,
    },
    select: { id: true },
  });
  return { id: user.id, membershipId: membership.id };
}

async function createTeacher(input: {
  prisma: PrismaClient;
  marker: string;
  label: string;
  organizationId: string;
  schoolId: string;
  roleId: string;
}): Promise<{ id: string }> {
  const teacher = await createUser({
    ...input,
    email: `${input.marker}-${input.label}@integration.invalid`,
    firstName: input.label,
    lastName: 'Teacher',
    password: `Z9!${randomUUID()}aA`,
    userType: UserType.TEACHER,
  });
  await input.prisma.teacherProfile.create({
    data: {
      schoolId: input.schoolId,
      userId: teacher.id,
      teacherCode:
        `TA${randomUUID().slice(0, 8)}${input.label.slice(0, 1)}`.toUpperCase(),
      firstNameAr: 'معلم',
      lastNameAr: 'اختباري',
      firstNameEn: input.label,
      lastNameEn: 'Teacher',
      gender: TeacherGender.MALE,
      employmentStatus: TeacherEmploymentStatus.ACTIVE,
    },
  });
  return { id: teacher.id };
}

async function createAcademicBase(
  prisma: PrismaClient,
  schoolId: string,
  marker: string,
) {
  const academicYear = await prisma.academicYear.create({
    data: {
      schoolId,
      nameAr: `${marker}-year-ar`,
      nameEn: `${marker}-year`,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2027-06-30T00:00:00.000Z'),
      isActive: true,
    },
  });
  const term = await prisma.term.create({
    data: {
      schoolId,
      academicYearId: academicYear.id,
      nameAr: `${marker}-term-ar`,
      nameEn: `${marker}-term`,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      isActive: true,
    },
  });
  const stage = await prisma.stage.create({
    data: { schoolId, nameAr: `${marker}-stage-ar`, nameEn: `${marker}-stage` },
  });
  const grade = await prisma.grade.create({
    data: {
      schoolId,
      stageId: stage.id,
      nameAr: `${marker}-grade-ar`,
      nameEn: `${marker}-grade`,
    },
  });
  const section = await prisma.section.create({
    data: {
      schoolId,
      gradeId: grade.id,
      nameAr: `${marker}-section-ar`,
      nameEn: `${marker}-section`,
    },
  });
  const classroom = await prisma.classroom.create({
    data: {
      schoolId,
      sectionId: section.id,
      nameAr: `${marker}-classroom-ar`,
      nameEn: `${marker}-classroom`,
    },
  });
  return {
    academicYearId: academicYear.id,
    termId: term.id,
    gradeId: grade.id,
    sectionId: section.id,
    classroomId: classroom.id,
  };
}

async function createSubject(
  prisma: PrismaClient,
  schoolId: string,
  marker: string,
  label: string,
) {
  return prisma.subject.create({
    data: {
      schoolId,
      nameAr: `${marker}-${label}-ar`,
      nameEn: `${marker}-${label}`,
      code: `${marker}-${label}`,
      isActive: true,
    },
  });
}

async function createOperationalDependencies(input: {
  prisma: PrismaClient;
  marker: string;
  schoolId: string;
  academic: {
    academicYearId: string;
    termId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
  };
  subjectId: string;
  allocationId: string;
  sourceTeacherUserId: string;
  actorId: string;
}) {
  const config = await input.prisma.timetableConfig.create({
    data: {
      schoolId: input.schoolId,
      academicYearId: input.academic.academicYearId,
      termId: input.academic.termId,
      name: `${input.marker}-rollback-config`,
      activeDays: [1],
      scopeKey: input.academic.termId,
    },
  });
  const period = await input.prisma.timetablePeriod.create({
    data: {
      schoolId: input.schoolId,
      timetableConfigId: config.id,
      periodIndex: 1,
      label: 'P1',
      startTime: '08:00',
      endTime: '09:00',
    },
  });
  const timetableEntry = await input.prisma.timetableEntry.create({
    data: {
      schoolId: input.schoolId,
      academicYearId: input.academic.academicYearId,
      termId: input.academic.termId,
      timetableConfigId: config.id,
      periodId: period.id,
      dayOfWeek: 1,
      gradeId: input.academic.gradeId,
      sectionId: input.academic.sectionId,
      classroomId: input.academic.classroomId,
      subjectId: input.subjectId,
      teacherUserId: input.sourceTeacherUserId,
      teacherSubjectAllocationId: input.allocationId,
      status: 'DRAFT',
    },
  });
  const curriculum = await input.prisma.curriculum.create({
    data: {
      schoolId: input.schoolId,
      academicYearId: input.academic.academicYearId,
      termId: input.academic.termId,
      gradeId: input.academic.gradeId,
      subjectId: input.subjectId,
      title: `${input.marker}-curriculum`,
      createdByUserId: input.actorId,
    },
  });
  const lessonPlan = await input.prisma.lessonPlan.create({
    data: {
      schoolId: input.schoolId,
      academicYearId: input.academic.academicYearId,
      termId: input.academic.termId,
      teacherSubjectAllocationId: input.allocationId,
      teacherUserId: input.sourceTeacherUserId,
      classroomId: input.academic.classroomId,
      subjectId: input.subjectId,
      curriculumId: curriculum.id,
      title: `${input.marker}-lesson-plan`,
      weekStartDate: new Date('2026-09-06T00:00:00.000Z'),
      weekEndDate: new Date('2026-09-12T00:00:00.000Z'),
      createdByUserId: input.sourceTeacherUserId,
      status: 'DRAFT',
    },
  });
  const homework = await input.prisma.homeworkAssignment.create({
    data: {
      schoolId: input.schoolId,
      academicYearId: input.academic.academicYearId,
      termId: input.academic.termId,
      classroomId: input.academic.classroomId,
      subjectId: input.subjectId,
      teacherUserId: input.sourceTeacherUserId,
      teacherSubjectAllocationId: input.allocationId,
      timetableEntryId: timetableEntry.id,
      title: `${input.marker}-homework`,
      dueAt: new Date('2026-09-30T12:00:00.000Z'),
      createdByUserId: input.sourceTeacherUserId,
      status: 'DRAFT',
    },
  });
  return {
    timetableEntryId: timetableEntry.id,
    lessonPlanId: lessonPlan.id,
    homeworkId: homework.id,
  };
}

function requireRole(
  roles: Array<{ id: string; key: string }>,
  key: string,
): string {
  const role = roles.find((candidate) => candidate.key === key);
  assert.ok(role, `Required integration role is missing: ${key}`);
  return role.id;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be returned`);
  }
  return value;
}

async function cleanupSchool(
  prisma: PrismaClient,
  schoolId: string,
): Promise<void> {
  const memberships = await prisma.membership.findMany({
    where: { schoolId },
    select: { userId: true },
  });
  const userIds = memberships.map(({ userId }) => userId);
  await prisma.auditLog.deleteMany({ where: { schoolId } });
  await prisma.homeworkAssignment.deleteMany({ where: { schoolId } });
  await prisma.lessonPlan.deleteMany({ where: { schoolId } });
  await prisma.curriculum.deleteMany({ where: { schoolId } });
  await prisma.timetableEntry.deleteMany({ where: { schoolId } });
  await prisma.timetablePeriod.deleteMany({ where: { schoolId } });
  await prisma.timetableConfig.deleteMany({ where: { schoolId } });
  await prisma.teacherSubjectAllocation.deleteMany({ where: { schoolId } });
  await prisma.subject.deleteMany({ where: { schoolId } });
  await prisma.classroom.deleteMany({ where: { schoolId } });
  await prisma.section.deleteMany({ where: { schoolId } });
  await prisma.grade.deleteMany({ where: { schoolId } });
  await prisma.stage.deleteMany({ where: { schoolId } });
  await prisma.term.deleteMany({ where: { schoolId } });
  await prisma.academicYear.deleteMany({ where: { schoolId } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.teacherProfile.deleteMany({ where: { schoolId } });
  await prisma.membership.deleteMany({ where: { schoolId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.school.deleteMany({ where: { id: schoolId } });
}

run().catch((error: unknown) => {
  const errorName =
    error && typeof error === 'object' && 'name' in error
      ? String(error.name).slice(0, 128)
      : 'UnknownError';
  const errorCode =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code).slice(0, 32)
      : 'NO_CODE';
  console.error(
    `REASSIGNMENT_SINGLE_CONNECTION=FAIL:${currentStage}:${errorName}:${errorCode}`,
  );
  process.exitCode = 1;
});
