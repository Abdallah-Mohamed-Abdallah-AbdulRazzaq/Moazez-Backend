import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AuditOutcome,
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
  HomeworkAssignmentStatus,
  LessonPlanStatus,
  MembershipStatus,
  Prisma,
  PrismaClient,
  ReinforcementSource,
  ReinforcementTargetScope,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  TeacherEmploymentStatus,
  TeacherGender,
  TimetableEntryStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { AppModule } from '../../../src/app.module';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../src/common/context/request-context';
import { DomainException } from '../../../src/common/exceptions/domain-exception';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import { LessonPlansRepository } from '../../../src/modules/academics/lesson-plans/infrastructure/lesson-plans.repository';
import { PreviewTeacherAllocationReassignmentUseCase } from '../../../src/modules/academics/teacher-allocation/application/preview-teacher-allocation-reassignment.use-case';
import { ReassignTeacherAllocationUseCase } from '../../../src/modules/academics/teacher-allocation/application/reassign-teacher-allocation.use-case';
import {
  LockedTeacherAllocation,
  TeacherAllocationOperationalWriteGate,
  TeacherAllocationOperationalWriteGateError,
  TeacherAllocationOperationalWriteGateInput,
} from '../../../src/modules/academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import { PrismaTeacherAllocationOperationalWriteGate } from '../../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-operational-write-gate';
import { PrismaTeacherAllocationReassignmentTransactionOperations } from '../../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-reassignment-transaction.operations';
import { BulkSaveTimetableEntriesUseCase } from '../../../src/modules/academics/timetable/application/bulk-save-timetable-entries.use-case';
import { CreateTimetableEntryUseCase } from '../../../src/modules/academics/timetable/application/create-timetable-entry.use-case';
import { TimetableTeacherConflictException } from '../../../src/modules/academics/timetable/domain/timetable.exceptions';
import { CommunicationAnnouncementRepository } from '../../../src/modules/communication/infrastructure/communication-announcement.repository';
import { buildTeacherAnnouncementMetadata } from '../../../src/modules/communication/domain/teacher-app-announcement-metadata';
import { HomeworkRepository } from '../../../src/modules/homework/infrastructure/homework.repository';
import { ReinforcementTasksRepository } from '../../../src/modules/reinforcement/tasks/infrastructure/reinforcement-tasks.repository';

type RaceMode = 'idle' | 'writer_first' | 'reassignment_first';

interface Deferred<T = void> {
  promise: Promise<T>;
  resolve(value: T): void;
}

interface Identity {
  id: string;
  membershipId: string;
  roleId: string;
  userType: UserType;
}

interface AcademicBase {
  academicYearId: string;
  termId: string;
  stageId: string;
  gradeId: string;
  sectionId: string;
}

interface AllocationFixture {
  id: string;
  subjectId: string;
  classroomId: string;
  curriculumId: string;
}

interface RaceFixture {
  domain: string;
  allocation: AllocationFixture;
  marker: string;
  write: () => Promise<unknown>;
  count: () => Promise<number>;
  owner: () => Promise<string | null>;
  teacherSpecific: boolean;
}

interface BulkTimetableRaceFixture {
  existingAllocation: AllocationFixture;
  proposedAllocation: AllocationFixture;
  createExisting: () => Promise<unknown>;
  write: () => Promise<unknown>;
  proposedCount: () => Promise<number>;
  existingEntryOwner: () => Promise<string | null>;
  proposedEntryOwner: () => Promise<string | null>;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

class RaceCoordinator {
  mode: RaceMode = 'idle';
  allocationId = '';
  writerAcquired = deferred();
  writerAttempted = deferred();
  reassignmentAcquired = deferred();
  reassignmentAttempted = deferred();
  releaseWriter = deferred();
  releaseReassignment = deferred();

  configure(mode: Exclude<RaceMode, 'idle'>, allocationId: string): void {
    this.mode = mode;
    this.allocationId = allocationId;
    this.writerAcquired = deferred();
    this.writerAttempted = deferred();
    this.reassignmentAcquired = deferred();
    this.reassignmentAttempted = deferred();
    this.releaseWriter = deferred();
    this.releaseReassignment = deferred();
  }

  reset(): void {
    this.mode = 'idle';
    this.allocationId = '';
  }

  controls(input: { allocationIds: readonly string[] }): boolean {
    return input.allocationIds.includes(this.allocationId);
  }
}

class CoordinatedOperationalWriteGate extends TeacherAllocationOperationalWriteGate {
  constructor(
    private readonly real: PrismaTeacherAllocationOperationalWriteGate,
    private readonly coordinator: RaceCoordinator,
  ) {
    super();
  }

  override async lock(
    transaction: Prisma.TransactionClient,
    input: TeacherAllocationOperationalWriteGateInput,
  ): Promise<LockedTeacherAllocation[]> {
    if (!this.coordinator.controls(input)) {
      return this.real.lock(transaction, input);
    }

    if (this.coordinator.mode === 'reassignment_first') {
      this.coordinator.writerAttempted.resolve();
    }
    const result = await this.real.lock(transaction, input);
    if (this.coordinator.mode === 'writer_first') {
      this.coordinator.writerAcquired.resolve();
      await this.coordinator.releaseWriter.promise;
    }
    return result;
  }
}

class CoordinatedReassignmentOperations extends PrismaTeacherAllocationReassignmentTransactionOperations {
  constructor(private readonly coordinator: RaceCoordinator) {
    super();
  }

  override async lockAllocation(
    transaction: Prisma.TransactionClient,
    input: { schoolId: string; allocationId: string },
  ): Promise<boolean> {
    if (input.allocationId !== this.coordinator.allocationId) {
      return super.lockAllocation(transaction, input);
    }
    if (this.coordinator.mode === 'writer_first') {
      this.coordinator.reassignmentAttempted.resolve();
    }
    const result = await super.lockAllocation(transaction, input);
    if (this.coordinator.mode === 'reassignment_first') {
      this.coordinator.reassignmentAcquired.resolve();
      await this.coordinator.releaseReassignment.promise;
    }
    return result;
  }
}

let currentStage = 'startup';

async function run(): Promise<void> {
  assert.equal(process.env.DATABASE_RUNTIME_ROLE, 'api');
  assert.equal(process.env.DATABASE_CONNECTION_LIMIT, '5');

  const marker = `allocation-race-${randomUUID().slice(0, 8)}`;
  const fixturePrisma = new PrismaClient();
  const coordinator = new RaceCoordinator();
  const gate = new CoordinatedOperationalWriteGate(
    new PrismaTeacherAllocationOperationalWriteGate(),
    coordinator,
  );
  const operations = new CoordinatedReassignmentOperations(coordinator);
  let app: INestApplication | undefined;
  let organizationId: string | undefined;
  let schoolId: string | undefined;

  try {
    currentStage = 'fixture-connect';
    await fixturePrisma.$connect();
    const roles = await fixturePrisma.role.findMany({
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
    const organization = await fixturePrisma.organization.create({
      data: { name: `${marker}-organization`, slug: `${marker}-organization` },
      select: { id: true },
    });
    organizationId = organization.id;
    const school = await fixturePrisma.school.create({
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

    currentStage = 'fixture-identities';
    const admin = await createIdentity({
      prisma: fixturePrisma,
      marker,
      label: 'admin',
      organizationId,
      schoolId,
      roleId: schoolAdminRoleId,
      userType: UserType.SCHOOL_USER,
    });
    const sourceTeacher = await createIdentity({
      prisma: fixturePrisma,
      marker,
      label: 'source',
      organizationId,
      schoolId,
      roleId: teacherRoleId,
      userType: UserType.TEACHER,
    });
    const targetTeacher = await createIdentity({
      prisma: fixturePrisma,
      marker,
      label: 'target',
      organizationId,
      schoolId,
      roleId: teacherRoleId,
      userType: UserType.TEACHER,
    });
    for (const teacher of [sourceTeacher, targetTeacher]) {
      await fixturePrisma.teacherProfile.create({
        data: {
          schoolId,
          userId: teacher.id,
          teacherCode:
            `RC${randomUUID().replaceAll('-', '').slice(0, 10)}`.toUpperCase(),
          firstNameAr: 'معلم',
          lastNameAr: 'اختباري',
          firstNameEn: 'Race',
          lastNameEn: 'Teacher',
          gender: TeacherGender.MALE,
          employmentStatus: TeacherEmploymentStatus.ACTIVE,
        },
      });
    }

    currentStage = 'fixture-academics';
    const academic = await createAcademicBase(fixturePrisma, schoolId, marker);
    const allocations: AllocationFixture[] = [];
    for (let index = 0; index < 14; index += 1) {
      allocations.push(
        await createAllocationFixture({
          prisma: fixturePrisma,
          marker,
          index,
          schoolId,
          academic,
          teacherUserId:
            index === 11 || index === 13 ? targetTeacher.id : sourceTeacher.id,
          actorId: admin.id,
        }),
      );
    }
    const timetable = await createTimetableFixture(
      fixturePrisma,
      schoolId,
      academic,
      marker,
    );
    const taskEnrollments = await Promise.all(
      [allocations[0], allocations[1]].map((allocation, index) =>
        createStudentEnrollment({
          prisma: fixturePrisma,
          marker,
          index,
          organizationId: activeOrganizationId,
          schoolId: activeSchoolId,
          academic,
          classroomId: allocation.classroomId,
        }),
      ),
    );

    currentStage = 'app-init';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TeacherAllocationOperationalWriteGate)
      .useValue(gate)
      .overrideProvider(
        PrismaTeacherAllocationReassignmentTransactionOperations,
      )
      .useValue(operations)
      .compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();

    const previewUseCase = app.get(PreviewTeacherAllocationReassignmentUseCase);
    const reassignUseCase = app.get(ReassignTeacherAllocationUseCase);
    const taskRepository = app.get(ReinforcementTasksRepository);
    const announcementRepository = app.get(CommunicationAnnouncementRepository);
    const lessonPlanRepository = app.get(LessonPlansRepository);
    const homeworkRepository = app.get(HomeworkRepository);
    const createTimetableEntry = app.get(CreateTimetableEntryUseCase);
    const bulkSaveTimetableEntries = app.get(BulkSaveTimetableEntriesUseCase);
    const applicationPrisma = app.get(PrismaService);

    const scope = <T>(
      identity: Identity,
      action: () => Promise<T>,
    ): Promise<T> =>
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: identity.id, userType: identity.userType });
        setActiveMembership({
          membershipId: identity.membershipId,
          organizationId: activeOrganizationId,
          schoolId: activeSchoolId,
          roleId: identity.roleId,
          permissions: ['academics.structure.manage'],
        });
        return action();
      });

    const preview = (allocationId: string) =>
      scope(admin, () =>
        previewUseCase.execute(allocationId, {
          newTeacherUserId: targetTeacher.id,
        }),
      );
    const reassign = (allocationId: string, impactFingerprint: string) =>
      scope(admin, () =>
        reassignUseCase.execute(allocationId, {
          newTeacherUserId: targetTeacher.id,
          impactFingerprint,
          reasonCode: 'deterministic_race_test',
        }),
      );

    const scenarios: RaceFixture[] = [
      taskScenario({
        repository: taskRepository,
        prisma: fixturePrisma,
        scope,
        identity: sourceTeacher,
        sourceTeacherUserId: sourceTeacher.id,
        schoolId,
        academic,
        allocation: allocations[0],
        enrollment: taskEnrollments[0],
        marker: `${marker}-task-writer`,
      }),
      taskScenario({
        repository: taskRepository,
        prisma: fixturePrisma,
        scope,
        identity: sourceTeacher,
        sourceTeacherUserId: sourceTeacher.id,
        schoolId,
        academic,
        allocation: allocations[1],
        enrollment: taskEnrollments[1],
        marker: `${marker}-task-reassign`,
      }),
      announcementScenario({
        repository: announcementRepository,
        prisma: fixturePrisma,
        scope,
        identity: sourceTeacher,
        schoolId,
        allocation: allocations[2],
        marker: `${marker}-announcement-writer`,
      }),
      announcementScenario({
        repository: announcementRepository,
        prisma: fixturePrisma,
        scope,
        identity: sourceTeacher,
        schoolId,
        allocation: allocations[3],
        marker: `${marker}-announcement-reassign`,
      }),
      lessonPlanScenario({
        repository: lessonPlanRepository,
        prisma: fixturePrisma,
        scope,
        identity: admin,
        sourceTeacherUserId: sourceTeacher.id,
        schoolId,
        academic,
        allocation: allocations[4],
        marker: `${marker}-lesson-writer`,
      }),
      lessonPlanScenario({
        repository: lessonPlanRepository,
        prisma: fixturePrisma,
        scope,
        identity: admin,
        sourceTeacherUserId: sourceTeacher.id,
        schoolId,
        academic,
        allocation: allocations[5],
        marker: `${marker}-lesson-reassign`,
      }),
      homeworkScenario({
        repository: homeworkRepository,
        prisma: fixturePrisma,
        scope,
        identity: admin,
        sourceTeacherUserId: sourceTeacher.id,
        schoolId,
        academic,
        allocation: allocations[6],
        marker: `${marker}-homework-writer`,
      }),
      homeworkScenario({
        repository: homeworkRepository,
        prisma: fixturePrisma,
        scope,
        identity: admin,
        sourceTeacherUserId: sourceTeacher.id,
        schoolId,
        academic,
        allocation: allocations[7],
        marker: `${marker}-homework-reassign`,
      }),
      timetableScenario({
        useCase: createTimetableEntry,
        prisma: fixturePrisma,
        scope,
        identity: admin,
        schoolId,
        allocation: allocations[8],
        timetable,
        marker: `${marker}-timetable-writer`,
      }),
      timetableScenario({
        useCase: createTimetableEntry,
        prisma: fixturePrisma,
        scope,
        identity: admin,
        schoolId,
        allocation: allocations[9],
        timetable,
        marker: `${marker}-timetable-reassign`,
      }),
    ];

    currentStage = 'race-task-writer-first';
    await proveWriterFirst({
      scenario: scenarios[0],
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      sourceTeacherUserId: sourceTeacher.id,
    });
    console.log('TASK_WRITER_FIRST=PASS');
    currentStage = 'race-task-reassignment-first';
    await proveReassignmentFirst({
      scenario: scenarios[1],
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      targetTeacherUserId: targetTeacher.id,
    });
    console.log('TASK_REASSIGNMENT_FIRST=PASS');

    currentStage = 'race-announcement-writer-first';
    await proveWriterFirst({
      scenario: scenarios[2],
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      sourceTeacherUserId: sourceTeacher.id,
    });
    console.log('ANNOUNCEMENT_WRITER_FIRST=PASS');
    currentStage = 'race-announcement-reassignment-first';
    await proveReassignmentFirst({
      scenario: scenarios[3],
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      targetTeacherUserId: targetTeacher.id,
    });
    console.log('ANNOUNCEMENT_REASSIGNMENT_FIRST=PASS');

    currentStage = 'race-lesson-plan-writer-first';
    await proveWriterFirst({
      scenario: scenarios[4],
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      sourceTeacherUserId: sourceTeacher.id,
    });
    console.log('LESSON_PLAN_WRITER_FIRST=PASS');
    currentStage = 'race-lesson-plan-reassignment-first';
    await proveReassignmentFirst({
      scenario: scenarios[5],
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      targetTeacherUserId: targetTeacher.id,
    });
    console.log('LESSON_PLAN_REASSIGNMENT_FIRST=PASS');

    currentStage = 'race-homework-writer-first';
    await proveWriterFirst({
      scenario: scenarios[6],
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      sourceTeacherUserId: sourceTeacher.id,
    });
    console.log('HOMEWORK_WRITER_FIRST=PASS');
    currentStage = 'race-homework-reassignment-first';
    await proveReassignmentFirst({
      scenario: scenarios[7],
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      targetTeacherUserId: targetTeacher.id,
    });
    console.log('HOMEWORK_REASSIGNMENT_FIRST=PASS');

    currentStage = 'race-timetable-writer-first';
    await proveWriterFirst({
      scenario: scenarios[8],
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      sourceTeacherUserId: sourceTeacher.id,
    });
    console.log('TIMETABLE_WRITER_FIRST=PASS');
    currentStage = 'race-timetable-reassignment-first';
    await proveReassignmentFirst({
      scenario: scenarios[9],
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      targetTeacherUserId: targetTeacher.id,
    });
    console.log('TIMETABLE_REASSIGNMENT_FIRST=PASS');

    const bulkReassignmentFirst = bulkTimetableScenario({
      createUseCase: createTimetableEntry,
      bulkUseCase: bulkSaveTimetableEntries,
      prisma: fixturePrisma,
      scope,
      identity: admin,
      schoolId,
      academic,
      existingAllocation: allocations[10],
      proposedAllocation: allocations[11],
      timetable,
      dayOfWeek: 2,
      marker: `${marker}-timetable-bulk-reassignment-first`,
    });
    currentStage = 'race-timetable-bulk-reassignment-first';
    await proveBulkReassignmentFirst({
      scenario: bulkReassignmentFirst,
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      targetTeacherUserId: targetTeacher.id,
    });
    console.log('TIMETABLE_BULK_REASSIGNMENT_FIRST=PASS');

    const bulkWriterFirst = bulkTimetableScenario({
      createUseCase: createTimetableEntry,
      bulkUseCase: bulkSaveTimetableEntries,
      prisma: fixturePrisma,
      scope,
      identity: admin,
      schoolId,
      academic,
      existingAllocation: allocations[12],
      proposedAllocation: allocations[13],
      timetable,
      dayOfWeek: 3,
      marker: `${marker}-timetable-bulk-writer-first`,
    });
    currentStage = 'race-timetable-bulk-writer-first';
    await proveBulkWriterFirst({
      scenario: bulkWriterFirst,
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      sourceTeacherUserId: sourceTeacher.id,
      targetTeacherUserId: targetTeacher.id,
    });
    console.log('TIMETABLE_BULK_WRITER_FIRST=PASS');

    currentStage = 'multi-allocation-order';
    coordinator.reset();
    const orderIds = [allocations[0].id, allocations[2].id].sort();
    const orderResults = await withTimeout(
      Promise.all([
        applicationPrisma.$transaction((tx) =>
          gate.lock(tx, {
            schoolId: activeSchoolId,
            allocationIds: [orderIds[1], orderIds[0]],
          }),
        ),
        applicationPrisma.$transaction((tx) =>
          gate.lock(tx, {
            schoolId: activeSchoolId,
            allocationIds: orderIds,
          }),
        ),
      ]),
      10_000,
      'multi-allocation gate transactions timed out',
    );
    for (const rows of orderResults) {
      assert.deepEqual(
        rows.map((row) => row.id),
        orderIds,
      );
    }
    console.log('MULTI_ALLOCATION_DEADLOCK_TEST=PASS');

    const unsafeBulkTeacherConflictCount =
      await countUnsafeBulkTeacherConflicts(
        fixturePrisma,
        activeSchoolId,
        allocations.slice(10, 14).map((allocation) => allocation.id),
      );
    assert.equal(unsafeBulkTeacherConflictCount, 0);
    console.log('UNSAFE_BULK_TEACHER_CONFLICT_COUNT=0');

    const orphanedCount = await countOrphanedOperationalState(
      fixturePrisma,
      activeSchoolId,
    );
    assert.equal(orphanedCount, 0);
    console.log('ORPHANED_OPERATIONAL_STATE_COUNT=0');
  } finally {
    if (app) await app.close();
    if (schoolId) await cleanupSchool(fixturePrisma, schoolId);
    if (organizationId) {
      await fixturePrisma.organization.deleteMany({
        where: { id: organizationId },
      });
    }
    await fixturePrisma.$disconnect();
  }
}

async function proveWriterFirst(input: {
  scenario: RaceFixture;
  coordinator: RaceCoordinator;
  preview: (allocationId: string) => Promise<{ impactFingerprint: string }>;
  reassign: (allocationId: string, fingerprint: string) => Promise<unknown>;
  prisma: PrismaClient;
  sourceTeacherUserId: string;
}): Promise<void> {
  const before = await input.preview(input.scenario.allocation.id);
  input.coordinator.configure('writer_first', input.scenario.allocation.id);
  const writer = input.scenario.write();
  await withTimeout(
    input.coordinator.writerAcquired.promise,
    10_000,
    `${input.scenario.domain} writer did not acquire FOR SHARE`,
  );
  const reassignment = settle(
    input.reassign(input.scenario.allocation.id, before.impactFingerprint),
  );
  await withTimeout(
    input.coordinator.reassignmentAttempted.promise,
    10_000,
    `${input.scenario.domain} reassignment did not attempt FOR UPDATE`,
  );
  assert.equal(
    (
      await input.prisma.teacherSubjectAllocation.findUniqueOrThrow({
        where: { id: input.scenario.allocation.id },
        select: { teacherUserId: true },
      })
    ).teacherUserId,
    input.sourceTeacherUserId,
  );
  input.coordinator.releaseWriter.resolve();
  await writer;
  const reassignmentResult = await reassignment;
  assert.equal(reassignmentResult.status, 'rejected');
  assertSafeReassignmentFailure(reassignmentResult.reason);
  assert.equal(await input.scenario.count(), 1);
  assert.equal(await input.scenario.owner(), input.sourceTeacherUserId);
  assert.equal(
    (
      await input.prisma.teacherSubjectAllocation.findUniqueOrThrow({
        where: { id: input.scenario.allocation.id },
        select: { teacherUserId: true },
      })
    ).teacherUserId,
    input.sourceTeacherUserId,
  );
  input.coordinator.reset();
}

async function proveReassignmentFirst(input: {
  scenario: RaceFixture;
  coordinator: RaceCoordinator;
  preview: (allocationId: string) => Promise<{ impactFingerprint: string }>;
  reassign: (allocationId: string, fingerprint: string) => Promise<unknown>;
  prisma: PrismaClient;
  targetTeacherUserId: string;
}): Promise<void> {
  const before = await input.preview(input.scenario.allocation.id);
  input.coordinator.configure(
    'reassignment_first',
    input.scenario.allocation.id,
  );
  const reassignment = input.reassign(
    input.scenario.allocation.id,
    before.impactFingerprint,
  );
  await withTimeout(
    input.coordinator.reassignmentAcquired.promise,
    10_000,
    `${input.scenario.domain} reassignment did not acquire FOR UPDATE`,
  );
  const writer = settle(input.scenario.write());
  await withTimeout(
    input.coordinator.writerAttempted.promise,
    10_000,
    `${input.scenario.domain} writer did not attempt FOR SHARE`,
  );
  assert.equal(await input.scenario.count(), 0);
  input.coordinator.releaseReassignment.resolve();
  await reassignment;
  const writerResult = await writer;
  if (input.scenario.teacherSpecific) {
    assert.equal(writerResult.status, 'rejected');
    assert.ok(
      writerResult.reason instanceof TeacherAllocationOperationalWriteGateError,
    );
    assert.equal(writerResult.reason.reason, 'OWNER_CHANGED');
    assert.equal(await input.scenario.count(), 0);
  } else {
    assert.equal(writerResult.status, 'fulfilled');
    assert.equal(await input.scenario.count(), 1);
    assert.equal(await input.scenario.owner(), input.targetTeacherUserId);
  }
  assert.equal(
    (
      await input.prisma.teacherSubjectAllocation.findUniqueOrThrow({
        where: { id: input.scenario.allocation.id },
        select: { teacherUserId: true },
      })
    ).teacherUserId,
    input.targetTeacherUserId,
  );
  input.coordinator.reset();
}

async function proveBulkReassignmentFirst(input: {
  scenario: BulkTimetableRaceFixture;
  coordinator: RaceCoordinator;
  preview: (allocationId: string) => Promise<{ impactFingerprint: string }>;
  reassign: (allocationId: string, fingerprint: string) => Promise<unknown>;
  prisma: PrismaClient;
  targetTeacherUserId: string;
}): Promise<void> {
  await input.scenario.createExisting();
  const allocationId = input.scenario.existingAllocation.id;
  const before = await input.preview(allocationId);
  input.coordinator.configure('reassignment_first', allocationId);
  const reassignment = input.reassign(allocationId, before.impactFingerprint);
  await withTimeout(
    input.coordinator.reassignmentAcquired.promise,
    10_000,
    'bulk timetable reassignment did not acquire FOR UPDATE',
  );
  const writer = settle(input.scenario.write());
  await withTimeout(
    input.coordinator.writerAttempted.promise,
    10_000,
    'bulk timetable writer did not attempt the allocation gate',
  );
  assert.equal(await input.scenario.proposedCount(), 0);
  input.coordinator.releaseReassignment.resolve();
  await reassignment;
  const writerResult = await writer;
  assert.equal(writerResult.status, 'rejected');
  assert.ok(writerResult.reason instanceof TimetableTeacherConflictException);
  assert.equal(await input.scenario.proposedCount(), 0);
  assert.equal(
    await input.scenario.existingEntryOwner(),
    input.targetTeacherUserId,
  );
  assert.equal(
    (
      await input.prisma.teacherSubjectAllocation.findUniqueOrThrow({
        where: { id: allocationId },
        select: { teacherUserId: true },
      })
    ).teacherUserId,
    input.targetTeacherUserId,
  );
  input.coordinator.reset();
}

async function proveBulkWriterFirst(input: {
  scenario: BulkTimetableRaceFixture;
  coordinator: RaceCoordinator;
  preview: (allocationId: string) => Promise<{ impactFingerprint: string }>;
  reassign: (allocationId: string, fingerprint: string) => Promise<unknown>;
  prisma: PrismaClient;
  sourceTeacherUserId: string;
  targetTeacherUserId: string;
}): Promise<void> {
  await input.scenario.createExisting();
  const allocationId = input.scenario.existingAllocation.id;
  const before = await input.preview(allocationId);
  input.coordinator.configure('writer_first', allocationId);
  const writer = input.scenario.write();
  await withTimeout(
    input.coordinator.writerAcquired.promise,
    10_000,
    'bulk timetable writer did not acquire all allocation gates',
  );
  const reassignment = settle(
    input.reassign(allocationId, before.impactFingerprint),
  );
  await withTimeout(
    input.coordinator.reassignmentAttempted.promise,
    10_000,
    'bulk timetable reassignment did not attempt FOR UPDATE',
  );
  input.coordinator.releaseWriter.resolve();
  await writer;
  const reassignmentResult = await reassignment;
  assert.equal(reassignmentResult.status, 'rejected');
  assertSafeReassignmentFailure(reassignmentResult.reason);
  assert.equal(await input.scenario.proposedCount(), 1);
  assert.equal(
    await input.scenario.proposedEntryOwner(),
    input.targetTeacherUserId,
  );
  assert.equal(
    await input.scenario.existingEntryOwner(),
    input.sourceTeacherUserId,
  );
  assert.equal(
    (
      await input.prisma.teacherSubjectAllocation.findUniqueOrThrow({
        where: { id: allocationId },
        select: { teacherUserId: true },
      })
    ).teacherUserId,
    input.sourceTeacherUserId,
  );
  input.coordinator.reset();
}

function taskScenario(input: {
  repository: ReinforcementTasksRepository;
  prisma: PrismaClient;
  scope: <T>(identity: Identity, action: () => Promise<T>) => Promise<T>;
  identity: Identity;
  sourceTeacherUserId: string;
  schoolId: string;
  academic: AcademicBase;
  allocation: AllocationFixture;
  enrollment: { enrollmentId: string; studentId: string };
  marker: string;
}): RaceFixture {
  return {
    domain: 'task',
    allocation: input.allocation,
    marker: input.marker,
    teacherSpecific: true,
    write: () =>
      input.scope(input.identity, () =>
        input.repository.createTaskWithTargetsStagesAssignments({
          schoolId: input.schoolId,
          task: {
            academicYearId: input.academic.academicYearId,
            termId: input.academic.termId,
            subjectId: input.allocation.subjectId,
            titleEn: input.marker,
            source: ReinforcementSource.TEACHER,
            status: ReinforcementTaskStatus.NOT_COMPLETED,
            assignedById: input.sourceTeacherUserId,
            createdById: input.sourceTeacherUserId,
          },
          targets: [
            {
              scopeType: ReinforcementTargetScope.CLASSROOM,
              scopeKey: input.allocation.classroomId,
              stageId: input.academic.stageId,
              gradeId: input.academic.gradeId,
              sectionId: input.academic.sectionId,
              classroomId: input.allocation.classroomId,
              studentId: null,
            },
          ],
          stages: [],
          assignments: [input.enrollment],
          operationalWriteGate: {
            allocationIds: [input.allocation.id],
            expectedTeacherUserId: input.sourceTeacherUserId,
          },
        }),
      ),
    count: () =>
      input.prisma.reinforcementTask.count({
        where: { schoolId: input.schoolId, titleEn: input.marker },
      }),
    owner: () =>
      input.prisma.reinforcementTask
        .findFirst({
          where: { schoolId: input.schoolId, titleEn: input.marker },
          select: { assignedById: true },
        })
        .then((row) => row?.assignedById ?? null),
  };
}

function announcementScenario(input: {
  repository: CommunicationAnnouncementRepository;
  prisma: PrismaClient;
  scope: <T>(identity: Identity, action: () => Promise<T>) => Promise<T>;
  identity: Identity;
  schoolId: string;
  allocation: AllocationFixture;
  marker: string;
}): RaceFixture {
  return {
    domain: 'announcement',
    allocation: input.allocation,
    marker: input.marker,
    teacherSpecific: true,
    write: () =>
      input.scope(input.identity, () =>
        input.repository.createCurrentSchoolAnnouncement({
          schoolId: input.schoolId,
          data: {
            title: input.marker,
            body: 'Deterministic allocation race announcement',
            status: CommunicationAnnouncementStatus.DRAFT,
            priority: CommunicationAnnouncementPriority.NORMAL,
            audienceType: CommunicationAnnouncementAudienceType.CLASSROOM,
            createdById: input.identity.id,
            updatedById: input.identity.id,
            metadata: buildTeacherAnnouncementMetadata({
              target: {
                type: 'classroom',
                classId: input.allocation.id,
                classroomId: input.allocation.classroomId,
                label: input.marker,
              },
              audience: 'students_and_parents',
            }),
          },
          audienceRows: [
            {
              audienceType: CommunicationAnnouncementAudienceType.CLASSROOM,
              classroomId: input.allocation.classroomId,
            },
          ],
          operationalWriteGate: {
            allocationIds: [input.allocation.id],
            expectedTeacherUserId: input.identity.id,
          },
          buildAuditEntry: (announcement) => ({
            actorId: input.identity.id,
            userType: input.identity.userType,
            schoolId: input.schoolId,
            module: 'communication',
            action: 'communication.announcement.create',
            resourceType: 'communication_announcement',
            resourceId: announcement.id,
            outcome: AuditOutcome.SUCCESS,
          }),
        }),
      ),
    count: () =>
      input.prisma.communicationAnnouncement.count({
        where: { schoolId: input.schoolId, title: input.marker },
      }),
    owner: () =>
      input.prisma.communicationAnnouncement
        .findFirst({
          where: { schoolId: input.schoolId, title: input.marker },
          select: { createdById: true },
        })
        .then((row) => row?.createdById ?? null),
  };
}

function lessonPlanScenario(input: {
  repository: LessonPlansRepository;
  prisma: PrismaClient;
  scope: <T>(identity: Identity, action: () => Promise<T>) => Promise<T>;
  identity: Identity;
  sourceTeacherUserId: string;
  schoolId: string;
  academic: AcademicBase;
  allocation: AllocationFixture;
  marker: string;
}): RaceFixture {
  return {
    domain: 'lesson plan',
    allocation: input.allocation,
    marker: input.marker,
    teacherSpecific: false,
    write: () =>
      input.scope(input.identity, () =>
        input.repository.createPlan({
          schoolId: input.schoolId,
          academicYearId: input.academic.academicYearId,
          termId: input.academic.termId,
          teacherSubjectAllocationId: input.allocation.id,
          teacherUserId: input.sourceTeacherUserId,
          classroomId: input.allocation.classroomId,
          subjectId: input.allocation.subjectId,
          curriculumId: input.allocation.curriculumId,
          title: input.marker,
          status: LessonPlanStatus.DRAFT,
          weekStartDate: new Date('2026-09-06T00:00:00.000Z'),
          weekEndDate: new Date('2026-09-12T00:00:00.000Z'),
          createdByUserId: input.identity.id,
        }),
      ),
    count: () =>
      input.prisma.lessonPlan.count({
        where: { schoolId: input.schoolId, title: input.marker },
      }),
    owner: () =>
      input.prisma.lessonPlan
        .findFirst({
          where: { schoolId: input.schoolId, title: input.marker },
          select: { teacherUserId: true },
        })
        .then((row) => row?.teacherUserId ?? null),
  };
}

function homeworkScenario(input: {
  repository: HomeworkRepository;
  prisma: PrismaClient;
  scope: <T>(identity: Identity, action: () => Promise<T>) => Promise<T>;
  identity: Identity;
  sourceTeacherUserId: string;
  schoolId: string;
  academic: AcademicBase;
  allocation: AllocationFixture;
  marker: string;
}): RaceFixture {
  const homeworkId = randomUUID();
  return {
    domain: 'homework',
    allocation: input.allocation,
    marker: input.marker,
    teacherSpecific: false,
    write: () =>
      input.scope(input.identity, () =>
        input.repository.createAssignmentWithTargets(
          {
            id: homeworkId,
            schoolId: input.schoolId,
            academicYearId: input.academic.academicYearId,
            termId: input.academic.termId,
            classroomId: input.allocation.classroomId,
            subjectId: input.allocation.subjectId,
            teacherUserId: input.sourceTeacherUserId,
            teacherSubjectAllocationId: input.allocation.id,
            title: input.marker,
            dueAt: new Date('2026-10-15T12:00:00.000Z'),
            status: HomeworkAssignmentStatus.DRAFT,
            createdByUserId: input.identity.id,
          },
          [],
          {
            schoolId: input.schoolId,
            allocationId: input.allocation.id,
          },
        ),
      ),
    count: () =>
      input.prisma.homeworkAssignment.count({
        where: { schoolId: input.schoolId, title: input.marker },
      }),
    owner: () =>
      input.prisma.homeworkAssignment
        .findFirst({
          where: { schoolId: input.schoolId, title: input.marker },
          select: { teacherUserId: true },
        })
        .then((row) => row?.teacherUserId ?? null),
  };
}

function timetableScenario(input: {
  useCase: CreateTimetableEntryUseCase;
  prisma: PrismaClient;
  scope: <T>(identity: Identity, action: () => Promise<T>) => Promise<T>;
  identity: Identity;
  schoolId: string;
  allocation: AllocationFixture;
  timetable: { configId: string; periodId: string };
  marker: string;
}): RaceFixture {
  return {
    domain: 'timetable',
    allocation: input.allocation,
    marker: input.marker,
    teacherSpecific: false,
    write: () =>
      input.scope(input.identity, () =>
        input.useCase.execute({
          timetableConfigId: input.timetable.configId,
          periodId: input.timetable.periodId,
          dayOfWeek: 1,
          classroomId: input.allocation.classroomId,
          teacherSubjectAllocationId: input.allocation.id,
          notes: input.marker,
        }),
      ),
    count: () =>
      input.prisma.timetableEntry.count({
        where: { schoolId: input.schoolId, notes: input.marker },
      }),
    owner: () =>
      input.prisma.timetableEntry
        .findFirst({
          where: { schoolId: input.schoolId, notes: input.marker },
          select: { teacherUserId: true },
        })
        .then((row) => row?.teacherUserId ?? null),
  };
}

function bulkTimetableScenario(input: {
  createUseCase: CreateTimetableEntryUseCase;
  bulkUseCase: BulkSaveTimetableEntriesUseCase;
  prisma: PrismaClient;
  scope: <T>(identity: Identity, action: () => Promise<T>) => Promise<T>;
  identity: Identity;
  schoolId: string;
  academic: AcademicBase;
  existingAllocation: AllocationFixture;
  proposedAllocation: AllocationFixture;
  timetable: { configId: string; periodId: string };
  dayOfWeek: number;
  marker: string;
}): BulkTimetableRaceFixture {
  const slotWhere = (allocationId: string) => ({
    schoolId: input.schoolId,
    termId: input.academic.termId,
    periodId: input.timetable.periodId,
    dayOfWeek: input.dayOfWeek,
    teacherSubjectAllocationId: allocationId,
    status: { in: [TimetableEntryStatus.DRAFT, TimetableEntryStatus.ACTIVE] },
  });

  return {
    existingAllocation: input.existingAllocation,
    proposedAllocation: input.proposedAllocation,
    createExisting: () =>
      input.scope(input.identity, () =>
        input.createUseCase.execute({
          timetableConfigId: input.timetable.configId,
          periodId: input.timetable.periodId,
          dayOfWeek: input.dayOfWeek,
          classroomId: input.existingAllocation.classroomId,
          teacherSubjectAllocationId: input.existingAllocation.id,
          notes: `${input.marker}-existing`,
        }),
      ),
    write: () =>
      input.scope(input.identity, () =>
        input.bulkUseCase.execute({
          termId: input.academic.termId,
          items: [
            {
              classroomId: input.proposedAllocation.classroomId,
              dayOfWeek: input.dayOfWeek,
              periodId: input.timetable.periodId,
              teacherSubjectAllocationId: input.proposedAllocation.id,
            },
          ],
        }),
      ),
    proposedCount: () =>
      input.prisma.timetableEntry.count({
        where: slotWhere(input.proposedAllocation.id),
      }),
    existingEntryOwner: () =>
      input.prisma.timetableEntry
        .findFirst({
          where: slotWhere(input.existingAllocation.id),
          select: { teacherUserId: true },
        })
        .then((row) => row?.teacherUserId ?? null),
    proposedEntryOwner: () =>
      input.prisma.timetableEntry
        .findFirst({
          where: slotWhere(input.proposedAllocation.id),
          select: { teacherUserId: true },
        })
        .then((row) => row?.teacherUserId ?? null),
  };
}

async function createIdentity(input: {
  prisma: PrismaClient;
  marker: string;
  label: string;
  organizationId: string;
  schoolId: string;
  roleId: string;
  userType: UserType;
}): Promise<Identity> {
  const user = await input.prisma.user.create({
    data: {
      email: `${input.marker}-${input.label}@integration.invalid`,
      firstName: input.label,
      lastName: 'Race',
      userType: input.userType,
      status: UserStatus.ACTIVE,
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
  return {
    id: user.id,
    membershipId: membership.id,
    roleId: input.roleId,
    userType: input.userType,
  };
}

async function createAcademicBase(
  prisma: PrismaClient,
  schoolId: string,
  marker: string,
): Promise<AcademicBase> {
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
  return {
    academicYearId: academicYear.id,
    termId: term.id,
    stageId: stage.id,
    gradeId: grade.id,
    sectionId: section.id,
  };
}

async function createAllocationFixture(input: {
  prisma: PrismaClient;
  marker: string;
  index: number;
  schoolId: string;
  academic: AcademicBase;
  teacherUserId: string;
  actorId: string;
}): Promise<AllocationFixture> {
  const subject = await input.prisma.subject.create({
    data: {
      schoolId: input.schoolId,
      nameAr: `${input.marker}-subject-${input.index}-ar`,
      nameEn: `${input.marker}-subject-${input.index}`,
      code: `${input.marker}-s${input.index}`,
      isActive: true,
    },
  });
  const classroom = await input.prisma.classroom.create({
    data: {
      schoolId: input.schoolId,
      sectionId: input.academic.sectionId,
      nameAr: `${input.marker}-class-${input.index}-ar`,
      nameEn: `${input.marker}-class-${input.index}`,
    },
  });
  await input.prisma.subjectAllocation.create({
    data: {
      schoolId: input.schoolId,
      academicYearId: input.academic.academicYearId,
      termId: input.academic.termId,
      gradeId: input.academic.gradeId,
      subjectId: subject.id,
      weeklyHours: 2,
    },
  });
  const allocation = await input.prisma.teacherSubjectAllocation.create({
    data: {
      schoolId: input.schoolId,
      teacherUserId: input.teacherUserId,
      subjectId: subject.id,
      classroomId: classroom.id,
      termId: input.academic.termId,
    },
  });
  const curriculum = await input.prisma.curriculum.create({
    data: {
      schoolId: input.schoolId,
      academicYearId: input.academic.academicYearId,
      termId: input.academic.termId,
      gradeId: input.academic.gradeId,
      subjectId: subject.id,
      title: `${input.marker}-curriculum-${input.index}`,
      createdByUserId: input.actorId,
    },
  });
  return {
    id: allocation.id,
    subjectId: subject.id,
    classroomId: classroom.id,
    curriculumId: curriculum.id,
  };
}

async function createStudentEnrollment(input: {
  prisma: PrismaClient;
  marker: string;
  index: number;
  organizationId: string;
  schoolId: string;
  academic: AcademicBase;
  classroomId: string;
}): Promise<{ enrollmentId: string; studentId: string }> {
  const student = await input.prisma.student.create({
    data: {
      schoolId: input.schoolId,
      organizationId: input.organizationId,
      firstName: `Race-${input.index}`,
      lastName: 'Student',
      studentEmail: `${input.marker}-student-${input.index}@integration.invalid`,
      status: StudentStatus.ACTIVE,
    },
  });
  const enrollment = await input.prisma.enrollment.create({
    data: {
      schoolId: input.schoolId,
      studentId: student.id,
      academicYearId: input.academic.academicYearId,
      termId: input.academic.termId,
      classroomId: input.classroomId,
      status: StudentEnrollmentStatus.ACTIVE,
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  });
  return { enrollmentId: enrollment.id, studentId: student.id };
}

async function createTimetableFixture(
  prisma: PrismaClient,
  schoolId: string,
  academic: AcademicBase,
  marker: string,
): Promise<{ configId: string; periodId: string }> {
  const config = await prisma.timetableConfig.create({
    data: {
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      name: `${marker}-config`,
      activeDays: [1, 2, 3],
      scopeKey: academic.termId,
    },
  });
  const period = await prisma.timetablePeriod.create({
    data: {
      schoolId,
      timetableConfigId: config.id,
      periodIndex: 1,
      label: 'P1',
      startTime: '08:00',
      endTime: '09:00',
    },
  });
  return { configId: config.id, periodId: period.id };
}

async function countUnsafeBulkTeacherConflicts(
  prisma: PrismaClient,
  schoolId: string,
  allocationIds: string[],
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM "timetable_entries" left_entry
    JOIN "timetable_entries" right_entry
      ON left_entry."id" < right_entry."id"
     AND left_entry."school_id" = right_entry."school_id"
     AND left_entry."term_id" = right_entry."term_id"
     AND left_entry."teacher_user_id" = right_entry."teacher_user_id"
     AND left_entry."day_of_week" = right_entry."day_of_week"
     AND left_entry."period_id" = right_entry."period_id"
    WHERE left_entry."school_id" = ${schoolId}::uuid
      AND left_entry."status" IN ('DRAFT', 'ACTIVE')
      AND right_entry."status" IN ('DRAFT', 'ACTIVE')
      AND left_entry."teacher_subject_allocation_id" IN (${Prisma.join(
        allocationIds.map((allocationId) => Prisma.sql`${allocationId}::uuid`),
      )})
      AND right_entry."teacher_subject_allocation_id" IN (${Prisma.join(
        allocationIds.map((allocationId) => Prisma.sql`${allocationId}::uuid`),
      )})
  `);
  return Number(rows[0].count);
}

async function countOrphanedOperationalState(
  prisma: PrismaClient,
  schoolId: string,
): Promise<number> {
  const [lessonPlans, homework, timetable] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "lesson_plans" operation
      JOIN "teacher_subject_allocations" allocation
        ON allocation."id" = operation."teacher_subject_allocation_id"
       AND allocation."school_id" = operation."school_id"
      WHERE operation."school_id" = ${schoolId}::uuid
        AND operation."deleted_at" IS NULL
        AND operation."status" IN ('DRAFT', 'ACTIVE')
        AND operation."teacher_user_id" <> allocation."teacher_user_id"
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "homework_assignments" operation
      JOIN "teacher_subject_allocations" allocation
        ON allocation."id" = operation."teacher_subject_allocation_id"
       AND allocation."school_id" = operation."school_id"
      WHERE operation."school_id" = ${schoolId}::uuid
        AND operation."deleted_at" IS NULL
        AND operation."status" IN ('DRAFT', 'PUBLISHED', 'CLOSED')
        AND operation."teacher_user_id" <> allocation."teacher_user_id"
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "timetable_entries" operation
      JOIN "teacher_subject_allocations" allocation
        ON allocation."id" = operation."teacher_subject_allocation_id"
       AND allocation."school_id" = operation."school_id"
      WHERE operation."school_id" = ${schoolId}::uuid
        AND operation."status" IN ('DRAFT', 'ACTIVE')
        AND operation."teacher_user_id" <> allocation."teacher_user_id"
    `),
  ]);
  return Number(lessonPlans[0].count + homework[0].count + timetable[0].count);
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
  await prisma.communicationAnnouncementAudience.deleteMany({
    where: { schoolId },
  });
  await prisma.communicationAnnouncement.deleteMany({ where: { schoolId } });
  await prisma.reinforcementAssignment.deleteMany({ where: { schoolId } });
  await prisma.reinforcementTaskStage.deleteMany({ where: { schoolId } });
  await prisma.reinforcementTaskTarget.deleteMany({ where: { schoolId } });
  await prisma.reinforcementTask.deleteMany({ where: { schoolId } });
  await prisma.homeworkTarget.deleteMany({ where: { schoolId } });
  await prisma.homeworkAssignment.deleteMany({ where: { schoolId } });
  await prisma.lessonPlanItem.deleteMany({ where: { schoolId } });
  await prisma.lessonPlan.deleteMany({ where: { schoolId } });
  await prisma.curriculumLesson.deleteMany({ where: { schoolId } });
  await prisma.curriculumUnit.deleteMany({ where: { schoolId } });
  await prisma.curriculum.deleteMany({ where: { schoolId } });
  await prisma.timetableConflict.deleteMany({ where: { schoolId } });
  await prisma.timetableEntry.deleteMany({ where: { schoolId } });
  await prisma.timetablePublication.deleteMany({ where: { schoolId } });
  await prisma.timetablePeriod.deleteMany({ where: { schoolId } });
  await prisma.timetableConfig.deleteMany({ where: { schoolId } });
  await prisma.teacherSubjectAllocation.deleteMany({ where: { schoolId } });
  await prisma.subjectAllocation.deleteMany({ where: { schoolId } });
  await prisma.enrollment.deleteMany({ where: { schoolId } });
  await prisma.student.deleteMany({ where: { schoolId } });
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

function requireRole(
  roles: Array<{ id: string; key: string }>,
  key: string,
): string {
  const role = roles.find((candidate) => candidate.key === key);
  assert.ok(role, `Required integration role is missing: ${key}`);
  return role.id;
}

function assertSafeReassignmentFailure(error: unknown): void {
  assert.ok(error instanceof DomainException);
  assert.ok(
    [
      'academics.allocation.reassignment_stale_preview',
      'academics.allocation.reassignment_blocked',
      'academics.allocation.reassignment_concurrent_change',
    ].includes(error.code),
    `Unexpected reassignment failure: ${error.code}`,
  );
}

async function settle<T>(
  promise: Promise<T>,
): Promise<
  { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown }
> {
  try {
    return { status: 'fulfilled', value: await promise };
  } catch (reason) {
    return { status: 'rejected', reason };
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

run().catch((error: unknown) => {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String(error.name).slice(0, 128)
      : 'UnknownError';
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code).slice(0, 64)
      : 'NO_CODE';
  console.error(
    `OPERATIONAL_WRITE_CONCURRENCY=FAIL:${currentStage}:${name}:${code}`,
  );
  console.error(error);
  process.exitCode = 1;
});
