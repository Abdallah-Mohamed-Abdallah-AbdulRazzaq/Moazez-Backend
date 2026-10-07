import { TeacherAcademicContentWorkflowPublicationUseCases } from '../../../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases';
import { AcademicContentPublicationSnapshotRepository } from '../../../src/modules/academics/academic-content/infrastructure/academic-content-publication-snapshot.repository';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AuditOutcome,
  FileUploadPurpose,
  FileUploadSessionStatus,
  type FileUploadSession,
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
import { CreateReinforcementTaskUseCase } from '../../../src/modules/reinforcement/tasks/application/create-reinforcement-task.use-case';
import { ReinforcementTasksRepository } from '../../../src/modules/reinforcement/tasks/infrastructure/reinforcement-tasks.repository';
import { TeacherAcademicContentAuthoringUseCases } from '../../../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases';
import { TeacherAcademicContentFilesUseCases } from '../../../src/modules/teacher-app/academic-content/application/teacher-academic-content-files.use-cases';
import { AcademicContentFileVerifier } from '../../../src/modules/academics/academic-content/files/application/academic-content-file-verifier';
import { StorageService } from '../../../src/infrastructure/storage/storage.service';
import type { ObjectStoragePort } from '../../../src/infrastructure/storage/object-storage.port';
import type { SignedUrlService } from '../../../src/infrastructure/storage/signed-url.service';

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
  expectedReassignmentFirstFailure?:
    | 'reinforcement_invalid_scope'
    | 'academic_content_not_found';
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
  const verificationControls = new Map<
    string,
    { started: Deferred; release: Deferred }
  >();
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
  const storage = new StorageService(
    {
      getCapabilities: () => ({ resumableUpload: true, rangeRead: true }),
      createResumableUploadSession: (input: { objectKey: string }) =>
        Promise.resolve({
          sessionUrl: `https://provider.invalid/resumable/${input.objectKey}`,
          expiresAt: new Date(Date.now() + 7 * 86400_000),
        }),
      statObject: () =>
        Promise.resolve({
          size: pdf.length,
          etag: null,
          contentType: 'application/pdf',
          metadata: {},
          lastModified: null,
          generation: null,
          version: null,
        }),
      readObjectRange: (input: { offset: number; length: number }) =>
        Promise.resolve(
          pdf.subarray(input.offset, input.offset + input.length),
        ),
    } as unknown as ObjectStoragePort,
    {
      resolveBucket: () => 'owned-concurrency-fixture',
    } as unknown as SignedUrlService,
  );
  const verifier = new AcademicContentFileVerifier(storage);
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
    const nonOperationalTeacher = await createIdentity({
      prisma: fixturePrisma,
      marker,
      label: 'non-operational',
      organizationId,
      schoolId,
      roleId: teacherRoleId,
      userType: UserType.TEACHER,
    });
    for (const teacher of [
      sourceTeacher,
      targetTeacher,
      nonOperationalTeacher,
    ]) {
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
    for (let index = 0; index < 64; index += 1) {
      allocations.push(
        await createAllocationFixture({
          prisma: fixturePrisma,
          marker,
          index,
          schoolId,
          academic,
          teacherUserId:
            index >= 17 && index < 20
              ? nonOperationalTeacher.id
              : index === 11 || index === 13
                ? targetTeacher.id
                : sourceTeacher.id,
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
      [
        allocations[0],
        allocations[1],
        allocations[14],
        allocations[15],
        allocations[16],
        allocations[17],
        allocations[18],
        allocations[19],
      ].map((allocation, index) =>
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
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(AcademicContentFileVerifier)
      .useValue({
        verify: async (session: FileUploadSession) => {
          const verified = await verifier.verify(session);
          const control = verificationControls.get(session.id);
          if (control) {
            control.started.resolve();
            await control.release.promise;
          }
          return verified;
        },
      })
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
    const createReinforcementTask = app.get(CreateReinforcementTaskUseCase);
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
          permissions:
            identity.userType === UserType.TEACHER
              ? [
                  'academics.academic_content.manage',
                  'academics.academic_content.view',
                  'academics.academic_content.publish',
                ]
              : ['academics.structure.manage'],
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

    const academicContent = app.get(TeacherAcademicContentAuthoringUseCases);
    for (const [offset, kind] of [
      'CREATE',
      'EDIT',
      'TARGET',
      'DETAIL',
    ].entries()) {
      for (const [orderIndex, order] of [
        'writer_first',
        'reassignment_first',
      ].entries()) {
        const allocation = allocations[20 + offset * 2 + orderIndex];
        const title = `${marker}-acc-${kind}-${order}`;
        const command = {
          type:
            kind === 'DETAIL'
              ? ('GUARDIAN_WEEKLY_NOTE' as const)
              : ('GENERAL_RESOURCE' as const),
          audience:
            kind === 'DETAIL' ? ('GUARDIANS' as const) : ('STUDENTS' as const),
          title: title + '-before',
        };
        const content =
          kind === 'CREATE'
            ? undefined
            : await scope(sourceTeacher, () =>
                academicContent.create(allocation.id, command),
              );
        let requestedClassId = allocation.id;
        if (kind === 'TARGET') {
          const classroom = await fixturePrisma.classroom.create({
            data: {
              schoolId,
              sectionId: academic.sectionId,
              nameAr: title,
              nameEn: title,
            },
          });
          requestedClassId = (
            await fixturePrisma.teacherSubjectAllocation.create({
              data: {
                schoolId,
                classroomId: classroom.id,
                subjectId: allocation.subjectId,
                termId: academic.termId,
                teacherUserId: sourceTeacher.id,
              },
            })
          ).id;
        }
        const scenario: RaceFixture = {
          domain: `ACC_${kind}`,
          allocation,
          marker: title,
          teacherSpecific: true,
          expectedReassignmentFirstFailure: 'academic_content_not_found',
          write: () =>
            scope<unknown>(sourceTeacher, () => {
              if (kind === 'CREATE')
                return academicContent.create(allocation.id, {
                  ...command,
                  title,
                });
              if (kind === 'EDIT')
                return academicContent.update(content!.id, { title });
              if (kind === 'TARGET')
                return academicContent.targets(content!.id, {
                  classIds: [requestedClassId],
                });
              return academicContent.guardianNote(content!.id, {
                body: title,
                priority: 'NORMAL',
                requiresAcknowledgement: false,
              });
            }),
          count: () =>
            kind === 'TARGET'
              ? fixturePrisma.academicContentTarget.count({
                  where: {
                    academicContentId: content!.id,
                    teacherSubjectAllocationId: requestedClassId,
                  },
                })
              : kind === 'DETAIL'
                ? fixturePrisma.academicContentGuardianNoteDetail.count({
                    where: { academicContentId: content!.id, body: title },
                  })
                : fixturePrisma.academicContent.count({
                    where: { schoolId, title },
                  }),
          owner: async () =>
            (
              await fixturePrisma.academicContent.findFirst({
                where: {
                  schoolId,
                  ...(content ? { id: content.id } : { title }),
                },
              })
            )?.createdByUserId ?? null,
        };
        currentStage = `race-acc-${kind}-${order}`;
        if (order === 'writer_first')
          await proveWriterFirst({
            scenario,
            coordinator,
            preview,
            reassign,
            prisma: fixturePrisma,
            sourceTeacherUserId: sourceTeacher.id,
          });
        else
          await proveReassignmentFirst({
            scenario,
            coordinator,
            preview,
            reassign,
            prisma: fixturePrisma,
            targetTeacherUserId: targetTeacher.id,
          });
        console.log(`ACC_${kind}_${order.toUpperCase()}=PASS`);
      }
    }
    assert.equal(
      await fixturePrisma.academicContent.count({
        where: { schoolId, targets: { none: {} } },
      }),
      0,
    );
    console.log('ACC_OWNERLESS_DRAFT_COUNT=0');

    const academicWorkflow = app.get(
      TeacherAcademicContentWorkflowPublicationUseCases,
    );
    const publicationSnapshots = app.get(
      AcademicContentPublicationSnapshotRepository,
    );
    await fixturePrisma.academicContentWorkflowPolicy.create({
      data: { schoolId, preparationApprovalRequired: true },
    });
    for (const [offset, kind] of [
      'SUBMIT',
      'PUBLISH',
      'UNSCHEDULE',
      'WITHDRAW',
      'REVISE',
    ].entries()) {
      for (const [orderIndex, order] of [
        'writer_first',
        'reassignment_first',
      ].entries()) {
        const allocation = allocations[30 + offset * 2 + orderIndex];
        const content = await scope(sourceTeacher, () =>
          academicContent.create(allocation.id, {
            type:
              kind === 'SUBMIT' ? 'TEACHER_PREPARATION' : 'GENERAL_RESOURCE',
            audience: kind === 'SUBMIT' ? 'INTERNAL_STAFF' : 'STUDENTS',
            title: marker + '-acc-' + kind + '-' + order,
          }),
        );
        if (kind === 'SUBMIT')
          await scope(sourceTeacher, () =>
            academicContent.preparation(content.id, {
              topic: 'Race topic',
              objectives: [],
              learningOutcomes: [],
              teachingStrategies: [],
              activities: [],
            }),
          );
        let publicationId = '';
        if (['UNSCHEDULE', 'WITHDRAW', 'REVISE'].includes(kind)) {
          const publication = await scope(sourceTeacher, () =>
            academicWorkflow.publish(content.id, {
              clientRequestId: randomUUID(),
              publishAt: new Date(Date.now() + 3600000),
            }),
          );
          publicationId = publication.publicationId;
          if (kind !== 'UNSCHEDULE')
            await publicationSnapshots.publishScheduledPublication({
              schoolId,
              contentId: content.id,
              publicationId,
              now: new Date(Date.now() + 3601000),
            });
        }
        const action =
          kind === 'SUBMIT'
            ? 'academics.academic_content.submit'
            : 'academics.academic_content.publication.' +
              (
                {
                  PUBLISH: 'schedule',
                  UNSCHEDULE: 'unschedule',
                  WITHDRAW: 'cancel',
                  REVISE: 'revision_start',
                } as Record<string, string>
              )[kind];
        const scenario: RaceFixture = {
          domain: 'ACC_' + kind,
          allocation,
          marker,
          teacherSpecific: true,
          expectedReassignmentFirstFailure: 'academic_content_not_found',
          write: () =>
            scope<unknown>(sourceTeacher, () => {
              if (kind === 'SUBMIT') return academicWorkflow.submit(content.id);
              if (kind === 'PUBLISH')
                return academicWorkflow.publish(content.id, {
                  clientRequestId: randomUUID(),
                  publishAt: new Date(Date.now() + 3600000),
                });
              if (kind === 'UNSCHEDULE')
                return academicWorkflow.unschedule(content.id, publicationId);
              if (kind === 'WITHDRAW')
                return academicWorkflow.withdraw(content.id, publicationId);
              return academicWorkflow.revise(content.id, publicationId);
            }),
          count: () =>
            fixturePrisma.auditLog.count({
              where: {
                schoolId,
                resourceId:
                  kind === 'SUBMIT' ? content.id : publicationId || undefined,
                action,
                ...(kind === 'PUBLISH'
                  ? { after: { path: ['contentId'], equals: content.id } }
                  : {}),
              },
            }),
          owner: async () =>
            (
              await fixturePrisma.academicContent.findUniqueOrThrow({
                where: { id: content.id },
              })
            ).createdByUserId,
        };
        currentStage = 'race-acc-' + kind + '-' + order;
        if (order === 'writer_first') {
          // A workflow transition may leave the reassignment fingerprint unchanged.
          // Prove its committed write preceded any accepted new allocation owner.
          const before = await preview(allocation.id);
          coordinator.configure('writer_first', allocation.id);
          const writer = scenario.write();
          await withTimeout(
            coordinator.writerAcquired.promise,
            10000,
            kind + ' gate did not acquire',
          );
          const reassignment = settle(
            reassign(allocation.id, before.impactFingerprint),
          );
          await withTimeout(
            coordinator.reassignmentAttempted.promise,
            10000,
            kind + ' reallocation did not wait',
          );
          assert.equal(
            (
              await fixturePrisma.teacherSubjectAllocation.findUniqueOrThrow({
                where: { id: allocation.id },
              })
            ).teacherUserId,
            sourceTeacher.id,
          );
          coordinator.releaseWriter.resolve();
          await writer;
          const result = await reassignment;
          assert.equal(await scenario.count(), 1);
          coordinator.reset();
          if (result.status === 'rejected')
            assertSafeReassignmentFailure(result.reason);
          else {
            assert.equal(
              (
                await fixturePrisma.teacherSubjectAllocation.findUniqueOrThrow({
                  where: { id: allocation.id },
                })
              ).teacherUserId,
              targetTeacher.id,
            );
            const replay = await settle(scenario.write());
            assert.equal(replay.status, 'rejected');
            assert.ok(replay.reason instanceof DomainException);
            assert.equal(replay.reason.httpStatus, 404);
          }
        } else
          await proveReassignmentFirst({
            scenario,
            coordinator,
            preview,
            reassign,
            prisma: fixturePrisma,
            targetTeacherUserId: targetTeacher.id,
          });
        console.log('ACC_' + kind + '_' + order.toUpperCase() + '=PASS');
      }
    }

    const academicFiles = app.get(TeacherAcademicContentFilesUseCases);
    for (const [index, order] of [
      'writer_first',
      'reassignment_first',
    ].entries()) {
      const allocation = allocations[28 + index];
      const content = await scope(sourceTeacher, () =>
        academicContent.create(allocation.id, {
          type: 'GENERAL_RESOURCE',
          audience: 'STUDENTS',
          title: marker + '-file-' + order,
        }),
      );
      const upload: FileUploadSession =
        await fixturePrisma.fileUploadSession.create({
          data: {
            schoolId,
            organizationId,
            createdByUserId: sourceTeacher.id,
            purpose: FileUploadPurpose.ACADEMIC_CONTENT,
            purposeContextId: content.id,
            clientRequestId: randomUUID(),
            originalName: 'race.pdf',
            expectedMimeType: 'application/pdf',
            expectedSizeBytes: BigInt(pdf.length),
            finalBucket: 'owned-concurrency-fixture',
            finalObjectKey: marker + '/file/' + order,
            status: FileUploadSessionStatus.UPLOADING,
            expiresAt: new Date(Date.now() + 86400_000),
            latestUploadUrlExpiresAt: new Date(Date.now() + 7 * 86400_000),
          },
        });
      const control = { started: deferred(), release: deferred() };
      verificationControls.set(upload.id, control);
      // The real initial ownership transaction commits before either final
      // completion/reassignment ordering is armed. Only provider verification
      // is paused; the final gate and both database writers remain real.
      const completion = settle(
        scope(sourceTeacher, () =>
          academicFiles.complete(content.id, upload.id),
        ),
      );
      await withTimeout(
        control.started.promise,
        10_000,
        'Academic upload did not enter bounded verification',
      );
      assert.equal(
        (
          await fixturePrisma.fileUploadSession.findUniqueOrThrow({
            where: { id: upload.id },
          })
        ).status,
        FileUploadSessionStatus.VERIFYING,
      );
      const scenario: RaceFixture = {
        domain: 'ACC_UPLOAD_COMPLETE',
        allocation,
        marker: upload.finalObjectKey,
        teacherSpecific: true,
        expectedReassignmentFirstFailure: 'academic_content_not_found',
        write: async () => {
          control.release.resolve();
          const result = await completion;
          if (result.status === 'rejected') throw result.reason;
          return result.value;
        },
        count: () =>
          fixturePrisma.academicContentAsset.count({
            where: { academicContentId: content.id },
          }),
        owner: async () =>
          (
            await fixturePrisma.academicContentAsset.findFirst({
              where: { academicContentId: content.id },
            })
          )?.createdByUserId ?? null,
      };
      currentStage = 'race-acc-upload-complete-' + order;
      if (order === 'writer_first')
        await proveWriterFirst({
          scenario,
          coordinator,
          preview,
          reassign,
          prisma: fixturePrisma,
          sourceTeacherUserId: sourceTeacher.id,
        });
      else
        await proveReassignmentFirst({
          scenario,
          coordinator,
          preview,
          reassign,
          prisma: fixturePrisma,
          targetTeacherUserId: targetTeacher.id,
        });
      const finished = await fixturePrisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.id },
      });
      assert.equal(
        finished.status,
        order === 'writer_first'
          ? FileUploadSessionStatus.READY
          : FileUploadSessionStatus.FAILED,
      );
      assert.equal(
        await fixturePrisma.file.count({
          where: { schoolId, objectKey: upload.finalObjectKey },
        }),
        order === 'writer_first' ? 1 : 0,
      );
      console.log('ACC_UPLOAD_COMPLETE_' + order.toUpperCase() + '=PASS');
    }
    assert.equal(
      await fixturePrisma.fileUploadSession.count({
        where: { schoolId, status: FileUploadSessionStatus.VERIFYING },
      }),
      0,
    );
    console.log('ACC_UPLOAD_COMPLETION_CLAIM_RECOVERY=PASS');
    const unsafeFiles = await fixturePrisma.$queryRaw<
      Array<{ count: bigint }>
    >(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM academic_content_assets asset
      JOIN academic_content_targets target ON target.academic_content_id = asset.academic_content_id AND target.school_id = asset.school_id
      JOIN teacher_subject_allocations allocation ON allocation.id = target.teacher_subject_allocation_id AND allocation.school_id = target.school_id
      WHERE asset.school_id = ${schoolId}::uuid AND asset.created_by_user_id <> allocation.teacher_user_id`);
    assert.equal(Number(unsafeFiles[0].count), 0);
    console.log('ACC_UNAUTHORIZED_FILE_ASSET_COUNT=0');

    // The following unlink fixtures intentionally retain pre-reassignment assets.
    // Each race checks the actual mutation, independently of historical authorship.
    for (const [offset, kind] of [
      'ARCHIVE',
      'RESTORE',
      'DELETE',
      'LINKS',
      'TAGS',
      'PREPARATION',
      'WEEKLY_PLAN',
      'SUBJECT_RESOURCE',
      'ONLINE_SESSION',
      'UPLOAD_INTENT',
      'UPLOAD_CANCEL',
      'ASSET_UNLINK',
    ].entries()) {
      for (const [orderIndex, order] of [
        'writer_first',
        'reassignment_first',
      ].entries()) {
        const allocation = allocations[40 + offset * 2 + orderIndex];
        const title = `${marker}-closeout-${kind}-${order}`;
        const type =
          kind === 'PREPARATION'
            ? 'TEACHER_PREPARATION'
            : kind === 'WEEKLY_PLAN'
              ? 'WEEKLY_PLAN'
              : kind === 'SUBJECT_RESOURCE'
                ? 'SUBJECT_RESOURCE'
                : kind === 'ONLINE_SESSION'
                  ? 'ONLINE_SESSION'
                  : 'GENERAL_RESOURCE';
        const content = await scope(sourceTeacher, () =>
          academicContent.create(allocation.id, {
            type,
            audience:
              kind === 'PREPARATION'
                ? 'INTERNAL_STAFF'
                : kind === 'WEEKLY_PLAN'
                  ? 'GUARDIANS'
                  : 'STUDENTS',
            title,
          }),
        );
        if (kind === 'RESTORE')
          await scope(sourceTeacher, () => academicContent.archive(content.id));
        let uploadId = '',
          assetId = '';
        const clientRequestId = randomUUID();
        if (kind === 'UPLOAD_CANCEL')
          uploadId = (
            await fixturePrisma.fileUploadSession.create({
              data: {
                schoolId,
                organizationId,
                createdByUserId: sourceTeacher.id,
                purpose: FileUploadPurpose.ACADEMIC_CONTENT,
                purposeContextId: content.id,
                clientRequestId,
                originalName: 'race.pdf',
                expectedMimeType: 'application/pdf',
                expectedSizeBytes: BigInt(pdf.length),
                finalBucket: 'owned-concurrency-fixture',
                finalObjectKey: title,
                status: FileUploadSessionStatus.UPLOADING,
                expiresAt: new Date(Date.now() + 86400_000),
              },
            })
          ).id;
        if (kind === 'ASSET_UNLINK') {
          const file = await fixturePrisma.file.create({
            data: {
              schoolId,
              organizationId,
              uploaderId: sourceTeacher.id,
              bucket: 'owned-concurrency-fixture',
              objectKey: title,
              originalName: 'race.pdf',
              mimeType: 'application/pdf',
              sizeBytes: BigInt(pdf.length),
            },
          });
          assetId = (
            await fixturePrisma.academicContentAsset.create({
              data: {
                schoolId,
                academicContentId: content.id,
                fileId: file.id,
                createdByUserId: sourceTeacher.id,
                sortOrder: 0,
              },
            })
          ).id;
        }
        const actions: Record<string, () => Promise<unknown>> = {
          ARCHIVE: () => academicContent.archive(content.id),
          RESTORE: () => academicContent.restore(content.id),
          DELETE: () => academicContent.delete(content.id),
          LINKS: () =>
            academicContent.links(content.id, [
              { label: title, url: 'https://example.test/reference' },
            ]),
          TAGS: () => academicContent.tags(content.id, [{ value: title }]),
          PREPARATION: () =>
            academicContent.preparation(content.id, {
              topic: title,
              objectives: [],
              learningOutcomes: [],
              teachingStrategies: [],
              activities: [],
            }),
          WEEKLY_PLAN: () =>
            academicContent.weeklyPlan(content.id, {
              weekStartDate: '2026-10-05',
              weekEndDate: '2026-10-11',
              objectives: [],
              topics: [title],
              homeworkAssignmentIds: [],
              gradeAssessmentIds: [],
            }),
          SUBJECT_RESOURCE: () =>
            academicContent.subjectResource(content.id, {
              resourceCategory: 'OTHER',
            }),
          ONLINE_SESSION: () =>
            academicContent.onlineSession(content.id, {
              platform: 'ZOOM',
              joinUrl: 'https://example.test/meeting',
              startAt: '2026-10-08T10:00:00Z',
              endAt: '2026-10-08T11:00:00Z',
              timezone: 'Africa/Cairo',
            }),
          UPLOAD_INTENT: () =>
            academicFiles.uploadIntent(content.id, {
              clientRequestId,
              originalName: 'race.pdf',
              expectedMimeType: 'application/pdf',
              expectedSizeBytes: String(pdf.length),
            }),
          UPLOAD_CANCEL: () => academicFiles.cancel(content.id, uploadId),
          ASSET_UNLINK: () => academicFiles.unlink(content.id, assetId),
        };
        const detailActions: Record<string, string> = {
          PREPARATION: 'preparation',
          WEEKLY_PLAN: 'weekly_plan',
          SUBJECT_RESOURCE: 'subject_resource',
          ONLINE_SESSION: 'online_session',
        };
        const action =
          kind === 'LINKS' || kind === 'TAGS'
            ? `academics.academic_content.${kind.toLowerCase()}.replace`
            : detailActions[kind]
              ? `academics.academic_content.details.${detailActions[kind]}.update`
              : `academics.academic_content.${kind.toLowerCase()}`;
        const count = () =>
          kind === 'UPLOAD_INTENT'
            ? fixturePrisma.fileUploadSession.count({
                where: {
                  schoolId,
                  purposeContextId: content.id,
                  clientRequestId,
                },
              })
            : kind === 'UPLOAD_CANCEL'
              ? fixturePrisma.fileUploadSession.count({
                  where: {
                    id: uploadId,
                    status: FileUploadSessionStatus.CANCELLED,
                  },
                })
              : kind === 'ASSET_UNLINK'
                ? fixturePrisma.academicContentAsset.count({
                    where: { id: assetId, deletedAt: { not: null } },
                  })
                : fixturePrisma.auditLog.count({
                    where: { schoolId, resourceId: content.id, action },
                  });
        const before = await preview(allocation.id);
        coordinator.configure(
          order as Exclude<RaceMode, 'idle'>,
          allocation.id,
        );
        const write = () => scope(sourceTeacher, actions[kind]);
        currentStage = 'closeout-' + kind + '-' + order;
        if (order === 'writer_first') {
          const writer = settle(write());
          await withTimeout(
            coordinator.writerAcquired.promise,
            10000,
            currentStage + ' writer gate',
          );
          const reassignment = settle(
            reassign(allocation.id, before.impactFingerprint),
          );
          await withTimeout(
            coordinator.reassignmentAttempted.promise,
            10000,
            currentStage + ' reassignment gate',
          );
          try {
            await waitForAllocationBlock(fixturePrisma);
          } finally {
            coordinator.releaseWriter.resolve();
          }
          const written = await writer,
            reassigned = await reassignment;
          if (written.status === 'rejected') {
            // Intent has another authorization transaction after provider issuance.
            // A reassignment between those phases must fence its late persistence.
            assert.equal(kind, 'UPLOAD_INTENT');
            assert.equal(reassigned.status, 'fulfilled');
            assertAcademicOwnershipFailure(written.reason);
            const session =
              (await fixturePrisma.fileUploadSession.findFirstOrThrow({
                where: { schoolId, purposeContextId: content.id },
              })) as { status: FileUploadSessionStatus };
            assert.equal(session.status, FileUploadSessionStatus.FAILED);
          }
          assert.equal(await count(), 1);
          coordinator.reset();
          if (reassigned.status === 'rejected')
            assertSafeReassignmentFailure(reassigned.reason);
          else {
            assert.equal(
              (
                await fixturePrisma.teacherSubjectAllocation.findUniqueOrThrow({
                  where: { id: allocation.id },
                })
              ).teacherUserId,
              targetTeacher.id,
            );
            const replay = await settle(write());
            assert.equal(replay.status, 'rejected');
            assertAcademicOwnershipFailure(replay.reason);
          }
        } else {
          const reassignment = reassign(
            allocation.id,
            before.impactFingerprint,
          );
          await withTimeout(
            coordinator.reassignmentAcquired.promise,
            10000,
            currentStage + ' reassignment gate',
          );
          const writer = settle(write());
          await withTimeout(
            coordinator.writerAttempted.promise,
            10000,
            currentStage + ' writer gate',
          );
          try {
            await waitForAllocationBlock(fixturePrisma);
            assert.equal(await count(), 0);
          } finally {
            coordinator.releaseReassignment.resolve();
          }
          await reassignment;
          const written = await writer;
          assert.equal(written.status, 'rejected');
          assertAcademicOwnershipFailure(written.reason);
          assert.equal(await count(), 0);
          coordinator.reset();
        }
        console.log(`ACC_${kind}_${order.toUpperCase()}=PASS`);
      }
    }
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

    const coreWriterFirst = coreTaskScenario({
      useCase: createReinforcementTask,
      prisma: fixturePrisma,
      scope,
      identity: admin,
      sourceTeacherUserId: sourceTeacher.id,
      schoolId,
      academic,
      allocation: allocations[14],
      enrollment: taskEnrollments[2],
      marker: `${marker}-core-writer`,
    });
    currentStage = 'race-core-reinforcement-writer-first';
    await proveWriterFirst({
      scenario: coreWriterFirst,
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      sourceTeacherUserId: sourceTeacher.id,
    });
    console.log('CORE_REINFORCEMENT_WRITER_FIRST=PASS');

    const coreReassignmentFirst = coreTaskScenario({
      useCase: createReinforcementTask,
      prisma: fixturePrisma,
      scope,
      identity: admin,
      sourceTeacherUserId: sourceTeacher.id,
      schoolId,
      academic,
      allocation: allocations[15],
      enrollment: taskEnrollments[3],
      marker: `${marker}-core-reassignment`,
    });
    currentStage = 'race-core-reinforcement-reassignment-first';
    await proveReassignmentFirst({
      scenario: coreReassignmentFirst,
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      targetTeacherUserId: targetTeacher.id,
    });
    console.log('CORE_REINFORCEMENT_REASSIGNMENT_FIRST=PASS');

    const corePostReassignment = coreTaskScenario({
      useCase: createReinforcementTask,
      prisma: fixturePrisma,
      scope,
      identity: admin,
      sourceTeacherUserId: sourceTeacher.id,
      schoolId,
      academic,
      allocation: allocations[16],
      enrollment: taskEnrollments[4],
      marker: `${marker}-core-post-reassignment`,
    });
    currentStage = 'core-reinforcement-post-reassignment-old-owner';
    const postReassignmentPreview = await preview(allocations[16].id);
    await reassign(
      allocations[16].id,
      postReassignmentPreview.impactFingerprint,
    );
    const postReassignmentCreate = await settle(corePostReassignment.write());
    assert.equal(postReassignmentCreate.status, 'rejected');
    assertReinforcementInvalidScope(postReassignmentCreate.reason);
    assert.equal(await corePostReassignment.count(), 0);
    console.log('CORE_REINFORCEMENT_POST_REASSIGN_OLD_OWNER_REJECTED=PASS');

    currentStage = 'fixture-non-operational-teacher';
    await Promise.all([
      fixturePrisma.user.update({
        where: { id: nonOperationalTeacher.id },
        data: { status: UserStatus.DISABLED },
      }),
      fixturePrisma.membership.update({
        where: { id: nonOperationalTeacher.membershipId },
        data: { status: MembershipStatus.SUSPENDED, endedAt: null },
      }),
      fixturePrisma.teacherProfile.updateMany({
        where: { schoolId, userId: nonOperationalTeacher.id },
        data: { employmentStatus: TeacherEmploymentStatus.INACTIVE },
      }),
    ]);

    const suspendedCoreWriterFirst = coreTaskScenario({
      useCase: createReinforcementTask,
      prisma: fixturePrisma,
      scope,
      identity: admin,
      sourceTeacherUserId: nonOperationalTeacher.id,
      schoolId,
      academic,
      allocation: allocations[17],
      enrollment: taskEnrollments[5],
      marker: `${marker}-core-suspended-writer`,
    });
    currentStage = 'race-suspended-core-reinforcement-writer-first';
    await proveWriterFirst({
      scenario: suspendedCoreWriterFirst,
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      sourceTeacherUserId: nonOperationalTeacher.id,
    });
    console.log('SUSPENDED_TEACHER_CORE_WRITER_FIRST=PASS');

    const suspendedCoreReassignmentFirst = coreTaskScenario({
      useCase: createReinforcementTask,
      prisma: fixturePrisma,
      scope,
      identity: admin,
      sourceTeacherUserId: nonOperationalTeacher.id,
      schoolId,
      academic,
      allocation: allocations[18],
      enrollment: taskEnrollments[6],
      marker: `${marker}-core-suspended-reassignment`,
    });
    currentStage = 'race-suspended-core-reinforcement-reassignment-first';
    await proveReassignmentFirst({
      scenario: suspendedCoreReassignmentFirst,
      coordinator,
      preview,
      reassign,
      prisma: fixturePrisma,
      targetTeacherUserId: targetTeacher.id,
    });
    console.log('SUSPENDED_TEACHER_CORE_REASSIGNMENT_FIRST=PASS');

    const suspendedCorePostReassignment = coreTaskScenario({
      useCase: createReinforcementTask,
      prisma: fixturePrisma,
      scope,
      identity: admin,
      sourceTeacherUserId: nonOperationalTeacher.id,
      schoolId,
      academic,
      allocation: allocations[19],
      enrollment: taskEnrollments[7],
      marker: `${marker}-core-suspended-post-reassignment`,
    });
    currentStage = 'suspended-core-post-reassignment-old-owner';
    const suspendedPostPreview = await preview(allocations[19].id);
    await reassign(allocations[19].id, suspendedPostPreview.impactFingerprint);
    const suspendedPostCreate = await settle(
      suspendedCorePostReassignment.write(),
    );
    assert.equal(suspendedPostCreate.status, 'rejected');
    assertReinforcementInvalidScope(suspendedPostCreate.reason);
    assert.equal(await suspendedCorePostReassignment.count(), 0);
    console.log('SUSPENDED_TEACHER_POST_REASSIGN_OLD_OWNER_REJECTED=PASS');
    console.log('CORE_MULTI_CONNECTION_INTERLEAVING=PASS');

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

    const activeReinforcementOrphanCount =
      await countFixtureActiveReinforcementOrphans(
        fixturePrisma,
        activeSchoolId,
        `${marker}-core-`,
      );
    assert.equal(activeReinforcementOrphanCount, 0);
    console.log('ACTIVE_REINFORCEMENT_ORPHAN_COUNT=0');
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

async function waitForAllocationBlock(prisma: PrismaClient): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT (wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0) AS waiting
      FROM pg_stat_activity WHERE datname = current_database()
        AND query LIKE '%teacher_subject_allocations%'`;
    if (rows.some((row) => row.waiting)) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(
    'Competing allocation writer did not wait on the real PostgreSQL lock',
  );
}

function assertAcademicOwnershipFailure(error: unknown): void {
  if (error instanceof DomainException) {
    assert.equal(error.httpStatus, 404);
    return;
  }
  assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
  assert.ok(
    error.code === 'P2034' ||
      (error.code === 'P2010' && error.meta?.code === '40001'),
  );
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
    if (
      input.scenario.expectedReassignmentFirstFailure ===
      'reinforcement_invalid_scope'
    ) {
      assertReinforcementInvalidScope(writerResult.reason);
    } else if (
      input.scenario.expectedReassignmentFirstFailure ===
      'academic_content_not_found'
    ) {
      if (writerResult.reason instanceof DomainException) {
        assert.equal(writerResult.reason.httpStatus, 404);
        console.log(
          `${input.scenario.domain}_REASSIGNMENT_FIRST_FAILURE=OWNERSHIP_404`,
        );
      } else {
        assert.ok(
          writerResult.reason instanceof Prisma.PrismaClientKnownRequestError,
          `Unexpected ACC rejection: ${String(writerResult.reason)}`,
        );
        assert.ok(
          writerResult.reason.code === 'P2034' ||
            (writerResult.reason.code === 'P2010' &&
              writerResult.reason.meta?.code === '40001'),
          `Unexpected ACC database rejection: ${writerResult.reason.code} SQLSTATE=${String(writerResult.reason.meta?.code)}`,
        );
        console.log(
          `${input.scenario.domain}_REASSIGNMENT_FIRST_FAILURE=SERIALIZATION_CONFLICT`,
        );
      }
    } else {
      assert.ok(
        writerResult.reason instanceof
          TeacherAllocationOperationalWriteGateError,
      );
      assert.equal(writerResult.reason.reason, 'OWNER_CHANGED');
    }
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

function coreTaskScenario(input: {
  useCase: CreateReinforcementTaskUseCase;
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
    domain: 'core reinforcement task',
    allocation: input.allocation,
    marker: input.marker,
    teacherSpecific: true,
    expectedReassignmentFirstFailure: 'reinforcement_invalid_scope',
    write: () =>
      input.scope(input.identity, () =>
        input.useCase.execute({
          academicYearId: input.academic.academicYearId,
          termId: input.academic.termId,
          subjectId: input.allocation.subjectId,
          titleEn: input.marker,
          source: ReinforcementSource.TEACHER,
          assignedById: input.sourceTeacherUserId,
          targets: [
            {
              scopeType: ReinforcementTargetScope.CLASSROOM,
              scopeId: input.allocation.classroomId,
            },
          ],
        }),
      ),
    count: () =>
      input.prisma.reinforcementTask.count({
        where: {
          schoolId: input.schoolId,
          titleEn: input.marker,
          assignments: {
            some: { enrollmentId: input.enrollment.enrollmentId },
          },
        },
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

async function countFixtureActiveReinforcementOrphans(
  prisma: PrismaClient,
  schoolId: string,
  titlePrefix: string,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(DISTINCT task."id")::bigint AS count
    FROM "reinforcement_tasks" task
    JOIN "reinforcement_assignments" assignment
      ON assignment."task_id" = task."id"
     AND assignment."school_id" = task."school_id"
    JOIN "student_enrollments" enrollment
      ON enrollment."id" = assignment."enrollment_id"
     AND enrollment."school_id" = assignment."school_id"
    JOIN "students" student
      ON student."id" = enrollment."student_id"
     AND student."school_id" = enrollment."school_id"
    WHERE task."school_id" = ${schoolId}::uuid
      AND task."title_en" LIKE ${`${titlePrefix}%`}
      AND task."source" = 'TEACHER'
      AND task."status" IN ('NOT_COMPLETED', 'IN_PROGRESS', 'UNDER_REVIEW')
      AND task."deleted_at" IS NULL
      AND enrollment."academic_year_id" = task."academic_year_id"
      AND enrollment."term_id" = task."term_id"
      AND enrollment."status" = 'ACTIVE'
      AND enrollment."deleted_at" IS NULL
      AND student."status" = 'ACTIVE'
      AND student."deleted_at" IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "teacher_subject_allocations" allocation
        WHERE allocation."school_id" = task."school_id"
          AND allocation."term_id" = task."term_id"
          AND allocation."classroom_id" = enrollment."classroom_id"
          AND (
            task."subject_id" IS NULL
            OR allocation."subject_id" = task."subject_id"
          )
          AND allocation."teacher_user_id" IN (
            task."assigned_by_id",
            task."created_by_id"
          )
      )
  `);
  return Number(rows[0].count);
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
  await prisma.academicContentAudienceRecipientTarget.deleteMany({
    where: { schoolId },
  });
  await prisma.academicContentAudienceRecipient.deleteMany({
    where: { schoolId },
  });
  await prisma.academicContentApproval.deleteMany({ where: { schoolId } });
  await prisma.academicContentPublication.deleteMany({ where: { schoolId } });
  await prisma.academicContentRevisionAsset.deleteMany({ where: { schoolId } });
  await prisma.academicContentRevisionLink.deleteMany({ where: { schoolId } });
  await prisma.academicContentRevisionTag.deleteMany({ where: { schoolId } });
  await prisma.academicContentRevisionTarget.deleteMany({
    where: { schoolId },
  });
  await prisma.academicContentRevision.deleteMany({ where: { schoolId } });
  await prisma.academicContentPreparationDetail.deleteMany({
    where: { schoolId },
  });
  await prisma.academicContentWorkflowPolicy.deleteMany({
    where: { schoolId },
  });
  await prisma.academicContentAsset.deleteMany({ where: { schoolId } });
  await prisma.fileUploadSession.deleteMany({ where: { schoolId } });
  await prisma.file.deleteMany({ where: { schoolId } });
  await prisma.academicContentGuardianNoteDetail.deleteMany({
    where: { schoolId },
  });
  await prisma.academicContentWeeklyPlanDetail.deleteMany({
    where: { schoolId },
  });
  await prisma.academicContentSubjectResourceDetail.deleteMany({
    where: { schoolId },
  });
  await prisma.academicContentOnlineSessionDetail.deleteMany({
    where: { schoolId },
  });
  await prisma.academicContentLink.deleteMany({ where: { schoolId } });
  await prisma.academicContentTag.deleteMany({ where: { schoolId } });
  await prisma.academicContentTarget.deleteMany({ where: { schoolId } });
  await prisma.academicContent.deleteMany({ where: { schoolId } });
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

function assertReinforcementInvalidScope(error: unknown): void {
  assert.ok(error instanceof DomainException);
  assert.equal(error.code, 'reinforcement.task.invalid_scope');
  assert.equal(error.httpStatus, 422);
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
