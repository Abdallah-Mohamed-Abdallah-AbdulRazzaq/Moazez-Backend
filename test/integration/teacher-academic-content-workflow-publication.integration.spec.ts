import { randomUUID } from 'node:crypto';
import { AcademicContentReviewDecisionNotificationEnqueueService } from '../../src/modules/academics/academic-content/application/academic-content-review-decision-notification-enqueue.service';
import { AcademicContentReviewDecisionNotificationService } from '../../src/modules/academics/academic-content/application/academic-content-review-decision-notification.service';
import { AcademicContentReviewDecisionNotificationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-review-decision-notification.repository';
import { CommunicationNotificationGenerationService } from '../../src/modules/communication/application/communication-notification-generation.service';
import { CommunicationNotificationGenerationRepository } from '../../src/modules/communication/infrastructure/communication-notification-generation.repository';
import { CommunicationNotificationPreferenceService } from '../../src/modules/communication/application/communication-notification-preference.service';
import { CommunicationNotificationPreferenceRepository } from '../../src/modules/communication/infrastructure/communication-notification-preference.repository';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentStatus as Status,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as Type,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { TeacherAppAccessService } from '../../src/modules/teacher-app/access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../../src/modules/teacher-app/access/teacher-app-allocation-read.adapter';
import { TeacherAcademicContentReadAdapter } from '../../src/modules/teacher-app/academic-content/infrastructure/teacher-academic-content-read.adapter';
import { TeacherAcademicContentWorkflowPublicationUseCases } from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases';
import { TeacherAcademicContentAuthoringUseCases } from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases';
import { GetTeacherAcademicContentUseCase } from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-read.use-cases';
import { TeacherAcademicContentWorkflowPublicationController } from '../../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller';
import { AcademicContentAuthoringOperations } from '../../src/modules/academics/academic-content/application/academic-content-authoring.operations';
import { GetAcademicContentReadinessUseCase } from '../../src/modules/academics/academic-content/application/academic-content-readiness.use-case';
import { AcademicContentWorkflowPublicationCapabilities } from '../../src/modules/academics/academic-content/application/academic-content-workflow-publication-capabilities';
import { PrismaTeacherAllocationOperationalWriteGate } from '../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-operational-write-gate';
import { AcademicContentPublicationWorker } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.worker';
import { AcademicContentRevisionAudienceResolver } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision-audience.resolver';
import { AcademicContentAudienceResolver } from '../../src/modules/academics/academic-content/application/academic-content-audience.resolver';
import { GlobalExceptionFilter } from '../../src/common/exceptions/global-exception.filter';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';
import { AcademicContentTargetRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-target.repository';
import { AcademicContentTypeDetailRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-type-detail.repository';
import { AcademicContentLinksTagsRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-links-tags.repository';
import { AcademicContentValidationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-validation.repository';
import { AcademicContentWorkflowPolicyRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-workflow-policy.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import { AcademicContentWorkflowRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-workflow.repository';
import { AcademicContentReviewRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-review.repository';
import { AcademicContentPublicationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.repository';
import { AcademicContentPublicationLifecycleRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-lifecycle.repository';
import { AcademicContentPublicationSnapshotRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-snapshot.repository';
import { AcademicContentAudienceRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-audience.repository';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import { AcademicContentFilePolicyResolver } from '../../src/modules/academics/academic-content/files/application/academic-content-file-policy.resolver';
import {
  SubmitAcademicContentUseCase,
  ApproveAcademicContentUseCase,
  RequestAcademicContentChangesUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-workflow.use-cases';
import {
  ListAcademicContentRevisionsUseCase,
  GetAcademicContentRevisionUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-revision.use-cases';
import { ListAcademicContentApprovalHistoryUseCase } from '../../src/modules/academics/academic-content/application/academic-content-review.use-cases';
import {
  ScheduleAcademicContentPublicationUseCase,
  UnscheduleAcademicContentPublicationUseCase,
  CancelAcademicContentPublicationUseCase,
  StartAcademicContentRevisionUseCase,
  GetAcademicContentPublicationReadinessUseCase,
  GetAcademicContentAudiencePreviewUseCase,
  ListAcademicContentPublicationHistoryUseCase,
  GetAcademicContentPublicationUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-publication.use-cases';
import type { AcademicContentPublicationQueueService } from '../../src/modules/academics/academic-content/application/academic-content-publication-queue.service';
import type { CommunicationNotificationQueueService } from '../../src/modules/communication/application/communication-notification-queue.service';

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;
describeDatabase('ACC-9D PostgreSQL Teacher workflow and publication', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService();
  const gate = new PrismaTeacherAllocationOperationalWriteGate();
  const contents = new AcademicContentRepository(prisma, gate);
  const revisions = new AcademicContentRevisionRepository(prisma);
  const workflow = new AcademicContentWorkflowRepository(
    prisma,
    revisions,
    gate,
  );
  const publicationRepo = new AcademicContentPublicationRepository(
    prisma,
    revisions,
    gate,
  );
  const lifecycle = new AcademicContentPublicationLifecycleRepository(
    prisma,
    gate,
  );
  const coreReadiness = new GetAcademicContentReadinessUseCase(
    contents,
    new AcademicContentValidationRepository(prisma),
  );
  const read = new TeacherAcademicContentReadAdapter(
    contents,
    new AcademicContentWorkflowPolicyRepository(prisma),
    new AcademicContentFilePolicyResolver(
      new AcademicContentFileRepository(prisma),
    ),
  );
  const access = new TeacherAppAccessService(
    new TeacherAppAllocationReadAdapter(prisma),
  );
  const authoring = new TeacherAcademicContentAuthoringUseCases(
    access,
    new AcademicContentAuthoringOperations(
      contents,
      new AcademicContentTargetRepository(prisma, gate),
      new AcademicContentLinksTagsRepository(prisma, gate),
      new AcademicContentTypeDetailRepository(prisma, gate),
    ),
    read,
    coreReadiness,
  );
  const queue = {
    ensureAfterCommit: jest.fn(
      async (_kind: string, input: { publicationId: string }) => {
        const persisted =
          await prisma.academicContentPublication.findUniqueOrThrow({
            where: { id: input.publicationId },
          });
        expect(['SCHEDULED', 'PUBLISHED']).toContain(persisted.status);
      },
    ),
  };
  const notifications = {
    ensureAcademicContentCancellationNotifications: jest.fn(
      async (input: { publicationId: string }) => {
        const persisted =
          await prisma.academicContentPublication.findUniqueOrThrow({
            where: { id: input.publicationId },
          });
        expect(persisted.cancellationReason).toBe('WITHDRAWN');
      },
    ),
  };
  const teacher = new TeacherAcademicContentWorkflowPublicationUseCases(
    access,
    read,
    new SubmitAcademicContentUseCase(workflow),
    new ListAcademicContentRevisionsUseCase(revisions),
    new GetAcademicContentRevisionUseCase(revisions),
    new ListAcademicContentApprovalHistoryUseCase(
      new AcademicContentReviewRepository(prisma),
    ),
    new GetAcademicContentPublicationReadinessUseCase(publicationRepo),
    new GetAcademicContentAudiencePreviewUseCase(
      new AcademicContentAudienceResolver(
        new AcademicContentAudienceRepository(prisma),
      ),
    ),
    new ListAcademicContentPublicationHistoryUseCase(publicationRepo),
    new GetAcademicContentPublicationUseCase(publicationRepo),
    new ScheduleAcademicContentPublicationUseCase(
      publicationRepo,
      queue as unknown as AcademicContentPublicationQueueService,
    ),
    new UnscheduleAcademicContentPublicationUseCase(publicationRepo),
    new CancelAcademicContentPublicationUseCase(
      lifecycle,
      notifications as unknown as CommunicationNotificationQueueService,
    ),
    new StartAcademicContentRevisionUseCase(lifecycle),
  );
  const detail = new GetTeacherAcademicContentUseCase(
    access,
    read,
    new AcademicContentWorkflowPublicationCapabilities(
      coreReadiness,
      publicationRepo,
    ),
  );
  const snapshot = new AcademicContentPublicationSnapshotRepository(
    prisma,
    new AcademicContentRevisionAudienceResolver(
      new AcademicContentAudienceRepository(prisma),
    ),
  );
  const worker = new AcademicContentPublicationWorker(
    {} as never,
    snapshot,
    lifecycle,
    queue as unknown as AcademicContentPublicationQueueService,
    {} as never,
    { ensureAfterPublicationCommit: jest.fn() } as never,
  );
  const suffix = randomUUID();
  const ids: Record<string, string> = {};
  let app: INestApplication<App>;
  const now = new Date();
  const grants = [
    'academics.academic_content.view',
    'academics.academic_content.manage',
    'academics.academic_content.publish',
  ];
  function asTeacher<T>(
    fn: () => T,
    teacherUserId = ids.teacher,
    permissions = grants,
    userType: UserType = UserType.TEACHER,
  ): T {
    const context = createRequestContext();
    context.actor = { id: teacherUserId, userType };
    context.activeMembership = {
      schoolId: ids.school,
      organizationId: ids.org,
      membershipId: randomUUID(),
      roleId: randomUUID(),
      permissions,
    };
    return runWithRequestContext(context, fn);
  }

  async function createContent(
    name: string,
    options: {
      creator?: string;
      allocations?: string[];
      type?: Type;
      status?: Status;
      audience?: Audience;
      foreign?: boolean;
      deleted?: boolean;
    } = {},
  ) {
    const prefix = options.foreign ? 'foreign' : '';
    const row = await prisma.academicContent.create({
      data: {
        schoolId: ids[prefix + 'school'],
        academicYearId: ids[prefix + 'year'],
        termId: ids[prefix + 'term'],
        createdByUserId: options.creator ?? ids.teacher,
        title: 'acc9d-' + name,
        type: options.type ?? Type.GENERAL_RESOURCE,
        status: options.status ?? Status.DRAFT,
        archivedAt: options.status === Status.ARCHIVED ? now : null,
        audience: options.audience ?? Audience.STUDENTS,
        deletedAt: options.deleted ? now : null,
      },
    });
    for (const allocationId of options.allocations ?? [ids.a]) {
      const allocation =
        await prisma.teacherSubjectAllocation.findUniqueOrThrow({
          where: { id: allocationId },
        });
      await prisma.academicContentTarget.create({
        data: {
          schoolId: row.schoolId,
          academicContentId: row.id,
          createdByUserId: row.createdByUserId,
          scopeType: Scope.CLASSROOM,
          classroomId: allocation.classroomId,
          subjectId: allocation.subjectId,
          teacherSubjectAllocationId: allocation.id,
          identityFingerprint: randomUUID(),
        },
      });
    }
    return row;
  }

  beforeAll(async () => {
    await prisma.$connect();
    for (const [key, userType] of [
      ['teacher', UserType.TEACHER],
      ['other', UserType.TEACHER],
      ['manager', UserType.SCHOOL_USER],
    ] as const)
      ids[key] = (
        await prisma.user.create({
          data: {
            email: key + suffix + '@example.test',
            firstName: 'ACC9D',
            lastName: key,
            userType,
          },
        })
      ).id;
    for (const prefix of ['', 'foreign']) {
      ids[prefix + 'org'] = (
        await prisma.organization.create({
          data: {
            name: 'ACC9D ' + prefix + suffix,
            slug: 'acc9d-org-' + prefix + suffix,
          },
        })
      ).id;
      ids[prefix + 'school'] = (
        await prisma.school.create({
          data: {
            organizationId: ids[prefix + 'org'],
            name: 'ACC9D ' + prefix + suffix,
            slug: 'acc9d-school-' + prefix + suffix,
          },
        })
      ).id;
      const schoolId = ids[prefix + 'school'];
      ids[prefix + 'year'] = (
        await prisma.academicYear.create({
          data: {
            schoolId,
            nameAr: suffix,
            nameEn: suffix,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2031-12-31'),
          },
        })
      ).id;
      ids[prefix + 'term'] = (
        await prisma.term.create({
          data: {
            schoolId,
            academicYearId: ids[prefix + 'year'],
            nameAr: suffix,
            nameEn: suffix,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2031-12-31'),
            isActive: true,
          },
        })
      ).id;
      const stage = await prisma.stage.create({
        data: { schoolId, nameAr: suffix, nameEn: suffix },
      });
      const grade = await prisma.grade.create({
        data: { schoolId, stageId: stage.id, nameAr: suffix, nameEn: suffix },
      });
      const section = await prisma.section.create({
        data: { schoolId, gradeId: grade.id, nameAr: suffix, nameEn: suffix },
      });
      const subject = await prisma.subject.create({
        data: { schoolId, code: suffix, nameAr: suffix, nameEn: suffix },
      });
      ids[prefix + 'subject'] = subject.id;
      ids[prefix + 'grade'] = grade.id;
      await prisma.subjectAllocation.create({
        data: {
          schoolId,
          academicYearId: ids[prefix + 'year'],
          termId: ids[prefix + 'term'],
          subjectId: subject.id,
          gradeId: grade.id,
          weeklyHours: 4,
        },
      });
      for (const key of ['a', 'b', 'c']) {
        const classroom = await prisma.classroom.create({
          data: {
            schoolId,
            sectionId: section.id,
            nameAr: key + suffix,
            nameEn: key + suffix,
          },
        });
        ids[prefix + key] = (
          await prisma.teacherSubjectAllocation.create({
            data: {
              schoolId,
              classroomId: classroom.id,
              subjectId: subject.id,
              termId: ids[prefix + 'term'],
              teacherUserId: key === 'b' ? ids.other : ids.teacher,
            },
          })
        ).id;
      }
    }
  });
  beforeAll(async () => {
    const allocation = await prisma.teacherSubjectAllocation.findUniqueOrThrow({
      where: { id: ids.a },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: ids.school,
        organizationId: ids.org,
        firstName: 'ACC9D',
        lastName: suffix,
      },
    });
    await prisma.enrollment.create({
      data: {
        schoolId: ids.school,
        studentId: student.id,
        academicYearId: ids.year,
        termId: ids.term,
        classroomId: allocation.classroomId,
        enrolledAt: now,
      },
    });
    const module = await Test.createTestingModule({
      controllers: [TeacherAcademicContentWorkflowPublicationController],
      providers: [
        {
          provide: TeacherAcademicContentWorkflowPublicationUseCases,
          useValue: teacher,
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(
      (
        req: { headers: Record<string, string> },
        _res: unknown,
        next: () => void,
      ) => {
        const context = createRequestContext();
        context.actor = {
          id: ids.teacher,
          userType:
            (req.headers['x-actor'] as UserType | undefined) ??
            UserType.TEACHER,
        };
        context.activeMembership = {
          schoolId: ids.school,
          organizationId: ids.org,
          membershipId: randomUUID(),
          roleId: randomUUID(),
          permissions:
            req.headers['x-permissions'] === undefined
              ? grants
              : req.headers['x-permissions'].split(','),
        };
        runWithRequestContext(context, next);
      },
    );
    app.useGlobalGuards(new PermissionsGuard(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (ids.school && ids.foreignschool) {
      const schoolId = { in: [ids.school, ids.foreignschool] };
      await prisma.communicationNotificationDelivery.deleteMany({
        where: { schoolId },
      });
      await prisma.communicationNotification.deleteMany({
        where: { schoolId },
      });
      await prisma.membership.deleteMany({ where: { schoolId } });
      await prisma.role.deleteMany({ where: { schoolId } });
      await prisma.auditLog.deleteMany({ where: { schoolId } });
      await prisma.academicContentApproval.deleteMany({ where: { schoolId } });
      await prisma.academicContentAudienceRecipientTarget.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentAudienceRecipient.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentPublication.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentRevisionAsset.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentRevisionLink.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentRevisionTag.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentRevisionTarget.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentRevision.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentAsset.deleteMany({ where: { schoolId } });
      await prisma.file.deleteMany({ where: { schoolId } });
      await prisma.academicContentLink.deleteMany({ where: { schoolId } });
      await prisma.academicContentPreparationDetail.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentSubjectResourceDetail.deleteMany({
        where: { schoolId },
      });
      await prisma.curriculum.deleteMany({ where: { schoolId } });
      await prisma.academicContentTag.deleteMany({ where: { schoolId } });
      await prisma.academicContentWeeklyPlanDetail.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentOnlineSessionDetail.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentGuardianNoteDetail.deleteMany({
        where: { schoolId },
      });
      await prisma.academicContentTarget.deleteMany({ where: { schoolId } });
      await prisma.academicContent.deleteMany({ where: { schoolId } });
      await prisma.enrollment.deleteMany({ where: { schoolId } });
      await prisma.student.deleteMany({ where: { schoolId } });
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { schoolId },
      });
      await prisma.subjectAllocation.deleteMany({ where: { schoolId } });
      await prisma.classroom.deleteMany({ where: { schoolId } });
      await prisma.section.deleteMany({ where: { schoolId } });
      await prisma.grade.deleteMany({ where: { schoolId } });
      await prisma.stage.deleteMany({ where: { schoolId } });
      await prisma.subject.deleteMany({ where: { schoolId } });
      await prisma.term.deleteMany({ where: { schoolId } });
      await prisma.academicYear.deleteMany({ where: { schoolId } });
      await prisma.academicContentWorkflowPolicy.deleteMany({
        where: { schoolId },
      });
      await prisma.enrollment.deleteMany({ where: { schoolId } });
      await prisma.student.deleteMany({ where: { schoolId } });
      await prisma.school.deleteMany({ where: { id: schoolId } });
      await prisma.organization.deleteMany({
        where: { id: { in: [ids.org, ids.foreignorg] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [ids.teacher, ids.other, ids.manager] } },
      });
    }
    await prisma.$disconnect();
  });

  const preparation = {
    topic: 'Teacher topic',
    objectives: [],
    learningOutcomes: [],
    teachingStrategies: [],
    activities: [],
  };
  async function prep(options: Parameters<typeof createContent>[1] = {}) {
    const content = await createContent(randomUUID(), {
      type: Type.TEACHER_PREPARATION,
      audience: Audience.INTERNAL_STAFF,
      ...options,
    });
    await prisma.academicContentPreparationDetail.create({
      data: {
        schoolId: content.schoolId,
        academicContentId: content.id,
        topic: preparation.topic,
      },
    });
    return content;
  }
  async function policy(required: boolean) {
    await prisma.academicContentWorkflowPolicy.upsert({
      where: { schoolId: ids.school },
      create: { schoolId: ids.school, preparationApprovalRequired: required },
      update: { preparationApprovalRequired: required },
    });
  }
  const publish = (contentId: string, extra = {}) =>
    asTeacher(() =>
      teacher.publish(contentId, { clientRequestId: randomUUID(), ...extra }),
    );
  async function published(contentId: string) {
    const intent = await publish(contentId);
    await worker.process(
      'publish',
      { schoolId: ids.school, contentId, publicationId: intent.publicationId },
      new Date(Date.now() + 100),
    );
    const publication =
      await prisma.academicContentPublication.findUniqueOrThrow({
        where: { id: intent.publicationId },
      });
    expect(publication.status).toBe('PUBLISHED');
    expect(publication.studentRecipientCount).toBe(1);
    return intent;
  }

  it('submits, requests changes, edits, resubmits and approves through the unchanged Management workflow', async () => {
    const role = await prisma.role.create({
      data: {
        schoolId: ids.school,
        key: 'acc9e-feedback',
        name: 'Teacher feedback fixture',
      },
    });
    await prisma.membership.create({
      data: {
        schoolId: ids.school,
        organizationId: ids.org,
        roleId: role.id,
        userId: ids.teacher,
        userType: UserType.TEACHER,
      },
    });
    const ensureFailed = jest.fn(async (input: { approvalId: string }) => {
      const persisted = await prisma.academicContentApproval.findUniqueOrThrow({
        where: { id: input.approvalId },
      });
      expect(['APPROVED', 'CHANGES_REQUESTED']).toContain(persisted.status);
      expect(persisted.decidedAt).not.toBeNull();
      throw new Error('fixture_queue_unavailable_after_commit');
    });
    const feedback =
      new AcademicContentReviewDecisionNotificationEnqueueService({
        ensureAcademicContentReviewDecision: ensureFailed,
      } as never);
    await policy(true);
    const content = await prep();
    expect(
      (await asTeacher(() => detail.execute(content.id))).capabilities
        .canSubmit,
    ).toBe(true);
    const first = await asTeacher(() => teacher.submit(content.id));
    expect(first).toMatchObject({
      contentStatus: Status.SUBMITTED,
      approvalStatus: 'PENDING',
      roundNumber: 1,
    });
    const frozen = await revisions.detail({
      schoolId: ids.school,
      contentId: content.id,
      revisionId: first.revisionId,
    });
    expect(frozen.snapshotContractVersion).toBe(2);
    await asTeacher(
      () =>
        new RequestAcademicContentChangesUseCase(workflow, feedback).execute(
          content.id,
          {
            note: 'Revise topic',
          },
        ),
      ids.manager,
      ['academics.academic_content.approve'],
      UserType.SCHOOL_USER,
    );
    await asTeacher(() =>
      authoring.preparation(content.id, { ...preparation, topic: 'New topic' }),
    );
    const second = await asTeacher(() => teacher.submit(content.id));
    expect(second.roundNumber).toBe(2);
    expect(second.revisionId).not.toBe(first.revisionId);
    await asTeacher(
      () =>
        new ApproveAcademicContentUseCase(workflow, feedback).execute(
          content.id,
        ),
      ids.manager,
      ['academics.academic_content.approve'],
      UserType.SCHOOL_USER,
    );
    expect(
      (
        await prisma.academicContent.findUniqueOrThrow({
          where: { id: content.id },
        })
      ).status,
    ).toBe(Status.APPROVED);
    expect(ensureFailed).toHaveBeenCalledTimes(2);
    const recovered: {
      approvalId: string;
      schoolId: string;
      organizationId: string;
      actorUserId: null;
      actorUserType: null;
    }[] = [];
    const realtime = jest.fn();
    const reviewNotifications =
      new AcademicContentReviewDecisionNotificationService(
        new AcademicContentReviewDecisionNotificationRepository(prisma),
        new CommunicationNotificationGenerationService(
          new CommunicationNotificationGenerationRepository(prisma),
          { publishNotificationCreated: realtime } as never,
          new CommunicationNotificationPreferenceService(
            new CommunicationNotificationPreferenceRepository(prisma),
          ),
          { enqueueNotificationPushDelivery: jest.fn() } as never,
        ),
        {
          ensureAcademicContentReviewDecision: jest.fn(
            (data: (typeof recovered)[number]) => {
              recovered.push(data);
              return Promise.resolve('created');
            },
          ),
        } as never,
      );
    await reviewNotifications.recover(new Date(Date.now() + 100));
    expect(recovered.map((data) => data.approvalId).sort()).toEqual(
      [first.approvalId, second.approvalId].sort(),
    );
    for (const data of recovered)
      await asTeacher(() => reviewNotifications.generate(data));
    const feedbackRows = await prisma.communicationNotification.findMany({
      where: { schoolId: ids.school, recipientUserId: ids.teacher },
      include: { deliveries: true },
    });
    expect(feedbackRows).toHaveLength(2);
    for (const [result, type] of [
      [first, 'ACADEMIC_CONTENT_CHANGES_REQUESTED'],
      [second, 'ACADEMIC_CONTENT_APPROVED'],
    ] as const) {
      const row = feedbackRows.find(
        (item) => item.sourceId === result.approvalId,
      )!;
      expect(row.type).toBe(type);
      expect(row.metadata).toMatchObject({
        approvalId: result.approvalId,
        revisionId: result.revisionId,
        roundNumber: result.roundNumber,
      });
      expect(row.deliveries.map((delivery) => delivery.channel).sort()).toEqual(
        ['IN_APP', 'PUSH'],
      );
      expect(row.body).not.toContain('Revise topic');
    }
    for (const data of recovered)
      await asTeacher(() => reviewNotifications.generate(data));
    expect(realtime).toHaveBeenCalledTimes(2);
    expect(
      await revisions.detail({
        schoolId: ids.school,
        contentId: content.id,
        revisionId: first.revisionId,
      }),
    ).toEqual(frozen);
    const history = await asTeacher(() => teacher.approvals(content.id));
    expect(history.total).toBe(2);
    expect(Object.keys(history.items[0]).sort()).toEqual(
      [
        'roundNumber',
        'revisionId',
        'status',
        'submittedAt',
        'decidedAt',
        'decisionNote',
      ].sort(),
    );
    expect(history.items[1].decisionNote).toBe('Revise topic');
    expect(
      (await asTeacher(() => teacher.revisions(content.id))).items,
    ).toHaveLength(2);
    expect(
      (await asTeacher(() => teacher.revision(content.id, first.revisionId)))
        .snapshotContractVersion,
    ).toBe(2);
    await expect(publish(content.id)).rejects.toMatchObject({
      httpStatus: 409,
    });
  });
  it.each([
    'disabled',
    'wrong-type',
    'missing-detail',
    'missing-target',
    'ended-term',
    'bad-body',
  ] as const)(
    'preserves submit failure %s without fake approval or revision',
    async (kind) => {
      await policy(kind !== 'disabled');
      const c =
        kind === 'wrong-type'
          ? await createContent(randomUUID())
          : await prep({
              allocations: kind === 'missing-target' ? [] : undefined,
            });
      if (kind === 'missing-detail')
        await prisma.academicContentPreparationDetail.deleteMany({
          where: { academicContentId: c.id },
        });
      if (kind === 'ended-term')
        await prisma.term.update({
          where: { id: ids.term },
          data: { endDate: new Date('2026-01-02') },
        });
      try {
        await expect(
          Promise.resolve().then(() =>
            asTeacher(() =>
              teacher.submit(
                c.id,
                kind === 'bad-body' ? { schoolId: ids.school } : {},
              ),
            ),
          ),
        ).rejects.toThrow();
      } finally {
        await prisma.term.update({
          where: { id: ids.term },
          data: { endDate: new Date('2031-12-31') },
        });
      }
      expect(
        await prisma.academicContentApproval.count({
          where: { academicContentId: c.id },
        }),
      ).toBe(0);
      expect(
        await prisma.academicContentRevision.count({
          where: { academicContentId: c.id },
        }),
      ).toBe(0);
      if (!['bad-body', 'ended-term', 'missing-target'].includes(kind))
        expect(
          (await asTeacher(() => detail.execute(c.id))).capabilities.canSubmit,
        ).toBe(false);
    },
  );
  it('persists publish-now and future intents; replay reauthorizes before returning success, and workers remain service-owned', async () => {
    const c = await createContent(randomUUID());
    expect(
      (await asTeacher(() => detail.execute(c.id))).capabilities.canPublish,
    ).toBe(true);
    const cmd = { clientRequestId: randomUUID() };
    const intent = await asTeacher(() => teacher.publish(c.id, cmd));
    expect(intent.status).toBe('SCHEDULED');
    expect(intent.studentRecipientCount).toBe(0);
    expect(await asTeacher(() => teacher.publish(c.id, cmd))).toEqual(intent);
    await expect(
      asTeacher(() =>
        teacher.publish(c.id, { ...cmd, visibleUntil: new Date('2031-01-01') }),
      ),
    ).rejects.toMatchObject({
      code: 'academic_content.publication.idempotency_conflict',
    });
    await prisma.teacherSubjectAllocation.update({
      where: { id: ids.a },
      data: { teacherUserId: ids.other },
    });
    try {
      await expect(
        asTeacher(() => teacher.publish(c.id, cmd)),
      ).rejects.toMatchObject({ httpStatus: 404 });
      await worker.process(
        'publish',
        {
          schoolId: ids.school,
          contentId: c.id,
          publicationId: intent.publicationId,
        },
        new Date(Date.now() + 100),
      );
      expect(
        (
          await prisma.academicContentPublication.findUniqueOrThrow({
            where: { id: intent.publicationId },
          })
        ).status,
      ).toBe('PUBLISHED');
    } finally {
      await prisma.teacherSubjectAllocation.update({
        where: { id: ids.a },
        data: { teacherUserId: ids.teacher },
      });
    }
    const future = await createContent(randomUUID());
    const scheduled = await publish(future.id, {
      publishAt: new Date(Date.now() + 3600000),
    });
    expect(new Date(scheduled.publishAt).getTime()).toBeGreaterThan(Date.now());
    expect(
      (await asTeacher(() => detail.execute(future.id))).capabilities
        .canUnschedule,
    ).toBe(true);
    const cancelled = await asTeacher(() =>
      teacher.unschedule(future.id, scheduled.publicationId),
    );
    expect(cancelled.cancellationReason).toBe('UNSCHEDULED');
    expect(
      (
        await prisma.academicContent.findUniqueOrThrow({
          where: { id: future.id },
        })
      ).status,
    ).toBe(Status.DRAFT);
    await worker.process(
      'publish',
      {
        schoolId: ids.school,
        contentId: future.id,
        publicationId: scheduled.publicationId,
      },
      new Date(Date.now() + 7200000),
    );
    expect(
      (
        await prisma.academicContentPublication.findUniqueOrThrow({
          where: { id: scheduled.publicationId },
        })
      ).status,
    ).toBe('CANCELLED');
  });
  it('withdraws with the existing post-commit cancellation notification path and reauthorizes terminal replay', async () => {
    const c = await createContent(randomUUID());
    const p = await published(c.id);
    const actions = (await asTeacher(() => detail.execute(c.id))).capabilities;
    expect(actions.canCancelPublication).toBe(true);
    expect(actions.canStartRevision).toBe(true);
    const cancelled = await asTeacher(() =>
      teacher.withdraw(c.id, p.publicationId),
    );
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'WITHDRAWN',
    });
    expect(
      notifications.ensureAcademicContentCancellationNotifications,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationId: p.publicationId,
        actorUserId: null,
        actorUserType: null,
      }),
    );
    expect(
      (await prisma.academicContent.findUniqueOrThrow({ where: { id: c.id } }))
        .status,
    ).toBe(Status.CANCELLED);
    await asTeacher(() => teacher.withdraw(c.id, p.publicationId));
    await prisma.teacherSubjectAllocation.update({
      where: { id: ids.a },
      data: { teacherUserId: ids.other },
    });
    try {
      await expect(
        asTeacher(() => teacher.withdraw(c.id, p.publicationId)),
      ).rejects.toMatchObject({ httpStatus: 404 });
    } finally {
      await prisma.teacherSubjectAllocation.update({
        where: { id: ids.a },
        data: { teacherUserId: ids.teacher },
      });
    }
  });
  it.each(['MINOR', 'SIGNIFICANT', 'IDENTICAL'] as const)(
    'preserves immutable revision/audience snapshots and Core successor %s classification',
    async (kind) => {
      const c = await createContent(randomUUID());
      const old = await published(c.id);
      const frozen = await revisions.detail({
        schoolId: ids.school,
        contentId: c.id,
        revisionId: old.revisionId,
      });
      const audience = await prisma.academicContentAudienceRecipient.findMany({
        where: { publicationId: old.publicationId },
      });
      const started = await asTeacher(() =>
        teacher.revise(c.id, old.publicationId),
      );
      expect(started).toMatchObject({
        cancellationReason: 'REVISION_STARTED',
        restoredContentStatus: 'DRAFT',
      });
      if (kind === 'MINOR')
        await asTeacher(() =>
          authoring.update(c.id, { description: 'Minor description' }),
        );
      if (kind === 'SIGNIFICANT')
        await asTeacher(() =>
          authoring.links(c.id, [
            { url: 'https://example.test/new', label: 'New', sortOrder: 0 },
          ]),
        );
      if (kind === 'IDENTICAL')
        await expect(publish(c.id)).rejects.toMatchObject({
          code: 'academic_content.publication.identical_revision',
        });
      else {
        const next = await publish(c.id, { notifyMinorUpdate: true });
        expect(next).toMatchObject({
          supersedesPublicationId: old.publicationId,
          changeSignificance: kind,
          notifyMinorUpdate: true,
        });
        await asTeacher(() => teacher.unschedule(c.id, next.publicationId));
        await expect(publish(c.id)).rejects.toMatchObject({
          code: 'academic_content.publication.lineage_conflict',
        });
      }
      expect(
        await revisions.detail({
          schoolId: ids.school,
          contentId: c.id,
          revisionId: old.revisionId,
        }),
      ).toEqual(frozen);
      expect(
        await prisma.academicContentAudienceRecipient.findMany({
          where: { publicationId: old.publicationId },
        }),
      ).toEqual(audience);
    },
  );
  it.each([
    'school-created',
    'other',
    'mixed',
    'reassigned',
    'foreign',
  ] as const)(
    'gates every final write against %s current ownership',
    async (kind) => {
      const options =
        kind === 'school-created'
          ? { creator: ids.manager }
          : kind === 'other'
            ? { creator: ids.other }
            : kind === 'mixed'
              ? { allocations: [ids.a, ids.b] }
              : kind === 'foreign'
                ? { foreign: true, allocations: [ids.foreigna] }
                : {};
      const c = await createContent(randomUUID());
      const p = await published(c.id);
      const draft = await prep(options);
      if (kind === 'school-created' || kind === 'other')
        await prisma.academicContent.update({
          where: { id: c.id },
          data: { createdByUserId: kind === 'other' ? ids.other : ids.manager },
        });
      if (kind === 'mixed') {
        const allocation =
          await prisma.teacherSubjectAllocation.findUniqueOrThrow({
            where: { id: ids.b },
          });
        await prisma.academicContentTarget.create({
          data: {
            schoolId: ids.school,
            academicContentId: c.id,
            scopeType: Scope.CLASSROOM,
            classroomId: allocation.classroomId,
            subjectId: allocation.subjectId,
            teacherSubjectAllocationId: ids.b,
            identityFingerprint: randomUUID(),
            createdByUserId: ids.teacher,
          },
        });
      }
      if (kind === 'reassigned')
        await prisma.teacherSubjectAllocation.update({
          where: { id: ids.a },
          data: { teacherUserId: ids.other },
        });
      try {
        const targetId = kind === 'foreign' ? draft.id : c.id;
        const actions = [
          () => teacher.submit(draft.id),
          () =>
            teacher.publish(kind === 'foreign' ? draft.id : c.id, {
              clientRequestId: randomUUID(),
            }),
          () => teacher.unschedule(targetId, p.publicationId),
          () => teacher.withdraw(targetId, p.publicationId),
          () => teacher.revise(targetId, p.publicationId),
        ];
        for (const action of actions)
          await expect(
            Promise.resolve().then(() => asTeacher(action)),
          ).rejects.toMatchObject({ httpStatus: 404 });
        if (kind !== 'reassigned' && kind !== 'foreign')
          expect(
            Object.values(
              (await asTeacher(() => detail.execute(c.id))).capabilities,
            ).every((v) => v === false),
          ).toBe(true);
      } finally {
        await prisma.teacherSubjectAllocation.update({
          where: { id: ids.a },
          data: { teacherUserId: ids.teacher },
        });
      }
    },
  );
  it('authorizes history through current targets, never historical creator/revision/publication authority', async () => {
    const c = await createContent(randomUUID(), {
      allocations: [ids.a, ids.c],
    });
    const p = await published(c.id);
    await prisma.teacherSubjectAllocation.update({
      where: { id: ids.a },
      data: { teacherUserId: ids.other },
    });
    const reads = [
      () => teacher.revisions(c.id),
      () => teacher.revision(c.id, p.revisionId),
      () => teacher.approvals(c.id),
      () => teacher.publicationReadiness(c.id),
      () => teacher.audiencePreview(c.id),
      () => teacher.publications(c.id),
      () => teacher.publication(c.id, p.publicationId),
    ];
    try {
      for (const action of reads) await asTeacher(action);
      await prisma.academicContentTarget.deleteMany({
        where: { academicContentId: c.id, teacherSubjectAllocationId: ids.c },
      });
      for (const action of reads)
        await expect(asTeacher(action)).rejects.toMatchObject({
          httpStatus: 404,
        });
    } finally {
      await prisma.teacherSubjectAllocation.update({
        where: { id: ids.a },
        data: { teacherUserId: ids.teacher },
      });
    }
    const school = await createContent(randomUUID(), { creator: ids.manager });
    const preview = await asTeacher(() => teacher.audiencePreview(school.id));
    expect(Object.keys(preview).sort()).toEqual(
      [
        'asOf',
        'students',
        'guardianContexts',
        'guardianUsersWithAccounts',
        'guardianNotificationOptOutContexts',
      ].sort(),
    );
    expect(
      await prisma.academicContentAudienceRecipient.count({
        where: { publication: { academicContentId: school.id } },
      }),
    ).toBe(0);
    await expect(
      asTeacher(() => teacher.revision(school.id, p.revisionId)),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      asTeacher(() => teacher.publication(school.id, p.publicationId)),
    ).rejects.toMatchObject({ httpStatus: 404 });
    for (const action of [
      () => teacher.revisions(school.id, { limit: 101 }),
      () => teacher.approvals(school.id, { page: 0 }),
      () => teacher.publications(school.id, { limit: 101 }),
    ])
      await expect(asTeacher(action)).rejects.toThrow();
  });
  it('checks actor and method permissions on every direct use case, including both revise permissions', async () => {
    const id = randomUUID();
    const actions: Array<[string[], () => unknown]> = [
      [['view'], () => teacher.revisions(id)],
      [['view'], () => teacher.revision(id, id)],
      [['manage'], () => teacher.submit(id)],
      [['view'], () => teacher.approvals(id)],
      [['view'], () => teacher.publicationReadiness(id)],
      [['view'], () => teacher.audiencePreview(id)],
      [['view'], () => teacher.publications(id)],
      [['view'], () => teacher.publication(id, id)],
      [['publish'], () => teacher.publish(id, { clientRequestId: id })],
      [['publish'], () => teacher.unschedule(id, id)],
      [['publish'], () => teacher.withdraw(id, id)],
      [['manage', 'publish'], () => teacher.revise(id, id)],
    ];
    for (const [permissions, action] of actions) {
      await expect(
        Promise.resolve().then(() =>
          asTeacher(action, ids.teacher, grants, UserType.SCHOOL_USER),
        ),
      ).rejects.toThrow();
      for (const permission of permissions)
        await expect(
          Promise.resolve().then(() =>
            asTeacher(
              action,
              ids.teacher,
              grants.filter(
                (p) => p !== 'academics.academic_content.' + permission,
              ),
            ),
          ),
        ).rejects.toThrow();
    }
  });
  it('serves all twelve HTTP routes with Core DTO validation and no Teacher review/capture routes', async () => {
    await policy(true);
    const c = await prep();
    const root = '/api/v1/teacher/academic-content/' + c.id;
    const submitted = await request(app.getHttpServer())
      .post(root + '/submit')
      .send({})
      .expect(200);
    const result = submitted.body as { revisionId: string };
    await request(app.getHttpServer())
      .get(root + '/revisions')
      .expect(200);
    await request(app.getHttpServer())
      .get(root + '/revisions/' + result.revisionId)
      .expect(200);
    await request(app.getHttpServer())
      .get(root + '/approvals')
      .expect(200);
    const d = await createContent(randomUUID());
    const path = '/api/v1/teacher/academic-content/' + d.id;
    await request(app.getHttpServer())
      .get(path + '/publication-readiness')
      .expect(200);
    await request(app.getHttpServer())
      .get(path + '/audience-preview')
      .expect(200);
    const scheduled = await request(app.getHttpServer())
      .post(path + '/publications')
      .send({ clientRequestId: randomUUID() })
      .expect(201);
    const intent = scheduled.body as { publicationId: string };
    await request(app.getHttpServer())
      .get(path + '/publications')
      .expect(200);
    await request(app.getHttpServer())
      .get(path + '/publications/' + intent.publicationId)
      .expect(200);
    await request(app.getHttpServer())
      .post(path + '/publications/' + intent.publicationId + '/unschedule')
      .send({})
      .expect(200);
    const current = await published(d.id);
    await request(app.getHttpServer())
      .post(path + '/publications/' + current.publicationId + '/revise')
      .send({})
      .expect(200);
    await asTeacher(() => authoring.update(d.id, { description: 'Updated' }));
    const next = await published(d.id);
    await request(app.getHttpServer())
      .post(path + '/publications/' + next.publicationId + '/cancel')
      .send({})
      .expect(200);
    for (const field of [
      'schoolId',
      'actorId',
      'revisionId',
      'status',
      'recipientList',
      'targetIds',
      'storageIds',
      'changeSignificance',
      'supersedesPublicationId',
    ])
      await request(app.getHttpServer())
        .post(path + '/publications')
        .send({ clientRequestId: randomUUID(), [field]: randomUUID() })
        .expect(400);
    for (const extra of [
      'approve',
      'request-changes',
      'review-queue',
      'revisions/capture',
      'resubmit',
      'publish-now',
      'schedule',
    ])
      await request(app.getHttpServer())
        .post(root + '/' + extra)
        .send({})
        .expect(404);
    await request(app.getHttpServer())
      .post(root + '/submit')
      .send({ schoolId: ids.school })
      .expect(400);
  });
  it.each([
    'preparation-approved',
    'internal-resource',
    'future-term',
    'ended-term',
    'bad-timing',
    'missing-target',
    'missing-detail',
    'invalid-asset',
    'active-conflict',
    'session-ended',
    'session-outside-end',
    'minor-override-initial',
  ] as const)(
    'preserves Core publication rejection for Teacher %s',
    async (kind) => {
      const type =
        kind === 'preparation-approved'
          ? Type.TEACHER_PREPARATION
          : kind === 'missing-detail'
            ? Type.SUBJECT_RESOURCE
            : kind.startsWith('session-')
              ? Type.ONLINE_SESSION
              : Type.GENERAL_RESOURCE;
      const audience = ['preparation-approved', 'internal-resource'].includes(
        kind,
      )
        ? Audience.INTERNAL_STAFF
        : Audience.STUDENTS;
      const c = await createContent(randomUUID(), {
        type,
        audience,
        status:
          kind === 'preparation-approved' ? Status.APPROVED : Status.DRAFT,
        allocations: kind === 'missing-target' ? [] : undefined,
      });
      if (kind.startsWith('session-'))
        await asTeacher(() =>
          authoring.onlineSession(c.id, {
            platform: 'ZOOM',
            joinUrl: 'https://example.test/session',
            startAt: new Date(Date.now() + 3600000).toISOString(),
            endAt: new Date(Date.now() + 7200000).toISOString(),
            timezone: 'Africa/Cairo',
          }),
        );
      if (kind === 'future-term')
        await prisma.term.update({
          where: { id: ids.term },
          data: { startDate: new Date('2030-01-01') },
        });
      if (kind === 'ended-term')
        await prisma.term.update({
          where: { id: ids.term },
          data: { endDate: new Date('2026-01-02') },
        });
      if (kind === 'session-ended')
        await prisma.academicContentOnlineSessionDetail.updateMany({
          where: { academicContentId: c.id },
          data: {
            startAt: new Date(Date.now() - 7200000),
            endAt: new Date(Date.now() - 3600000),
          },
        });
      if (kind === 'invalid-asset') {
        const file = await prisma.file.create({
          data: {
            schoolId: ids.school,
            bucket: 'test-fixture',
            objectKey: randomUUID(),
            originalName: 'test.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1n,
          },
        });
        await prisma.academicContentAsset.create({
          data: {
            schoolId: ids.school,
            academicContentId: c.id,
            fileId: file.id,
            createdByUserId: ids.teacher,
            sortOrder: 0,
          },
        });
        // Preserve an existing invalid-asset fixture without creating a new
        // reference to a File that the live-reference invariant rejects.
        await prisma.file.update({
          where: { id: file.id },
          data: { deletedAt: now },
        });
      }
      if (kind === 'active-conflict') await publish(c.id);
      const extra =
        kind === 'bad-timing'
          ? { publishAt: new Date('2032-01-01') }
          : kind === 'session-outside-end'
            ? { publishAt: new Date(Date.now() + 10800000) }
            : kind === 'minor-override-initial'
              ? { notifyMinorUpdate: true }
              : {};
      const before = await prisma.academicContentPublication.count({
        where: { academicContentId: c.id },
      });
      try {
        await expect(publish(c.id, extra)).rejects.toThrow();
        if (
          ![
            'bad-timing',
            'session-outside-end',
            'minor-override-initial',
            'missing-target',
            'future-term',
          ].includes(kind)
        )
          expect(
            (await asTeacher(() => detail.execute(c.id))).capabilities
              .canPublish,
          ).toBe(false);
        if (kind === 'future-term')
          expect(
            (await asTeacher(() => detail.execute(c.id))).capabilities
              .canPublish,
          ).toBe(true);
      } finally {
        await prisma.term.update({
          where: { id: ids.term },
          data: {
            startDate: new Date('2026-01-01'),
            endDate: new Date('2031-12-31'),
          },
        });
      }
      expect(
        await prisma.academicContentPublication.count({
          where: { academicContentId: c.id },
        }),
      ).toBe(before);
    },
  );
  it.each(['foreign', 'other-targets', 'reassigned'] as const)(
    'hides all historical and publication reads for %s current parent',
    async (kind) => {
      const c = await createContent(randomUUID());
      const publishedContent = await published(c.id);
      const reads = [
        () => teacher.revisions(c.id),
        () => teacher.revision(c.id, publishedContent.revisionId),
        () => teacher.approvals(c.id),
        () => teacher.publicationReadiness(c.id),
        () => teacher.audiencePreview(c.id),
        () => teacher.publications(c.id),
        () => teacher.publication(c.id, publishedContent.publicationId),
      ];
      if (kind === 'other-targets') {
        await prisma.academicContentTarget.deleteMany({
          where: { academicContentId: c.id },
        });
        const allocation =
          await prisma.teacherSubjectAllocation.findUniqueOrThrow({
            where: { id: ids.b },
          });
        await prisma.academicContentTarget.create({
          data: {
            schoolId: ids.school,
            academicContentId: c.id,
            scopeType: Scope.CLASSROOM,
            classroomId: allocation.classroomId,
            subjectId: allocation.subjectId,
            teacherSubjectAllocationId: ids.b,
            identityFingerprint: randomUUID(),
            createdByUserId: ids.other,
          },
        });
      }
      if (kind === 'reassigned')
        await prisma.teacherSubjectAllocation.update({
          where: { id: ids.a },
          data: { teacherUserId: ids.other },
        });
      try {
        for (const action of reads) {
          const context = createRequestContext();
          context.actor = { id: ids.teacher, userType: UserType.TEACHER };
          context.activeMembership = {
            schoolId: kind === 'foreign' ? ids.foreignschool : ids.school,
            organizationId: kind === 'foreign' ? ids.foreignorg : ids.org,
            membershipId: randomUUID(),
            roleId: randomUUID(),
            permissions: grants,
          };
          await expect(
            runWithRequestContext(context, action),
          ).rejects.toMatchObject({ httpStatus: 404 });
        }
      } finally {
        await prisma.teacherSubjectAllocation.update({
          where: { id: ids.a },
          data: { teacherUserId: ids.teacher },
        });
      }
    },
  );
  it('fails closed on all five Teacher writers when service-only DI has no allocation gate', async () => {
    await policy(true);
    const scope = {
      schoolId: ids.school,
      organizationId: ids.org,
      actorId: ids.teacher,
      teacherUserId: ids.teacher,
    };
    const workflowWithoutGate = new AcademicContentWorkflowRepository(
      prisma,
      revisions,
    );
    const publicationsWithoutGate = new AcademicContentPublicationRepository(
      prisma,
      revisions,
    );
    const lifecycleWithoutGate =
      new AcademicContentPublicationLifecycleRepository(prisma);
    const preparationContent = await prep();
    await expect(
      workflowWithoutGate.submit({
        ...scope,
        contentId: preparationContent.id,
      }),
    ).rejects.toThrow('Teacher write gate is unavailable');
    expect(
      await prisma.academicContentApproval.count({
        where: { academicContentId: preparationContent.id },
      }),
    ).toBe(0);
    const draft = await createContent(randomUUID());
    await expect(
      publicationsWithoutGate.schedule({
        ...scope,
        contentId: draft.id,
        command: { clientRequestId: randomUUID() },
      }),
    ).rejects.toThrow('Teacher write gate is unavailable');
    expect(
      await prisma.academicContentPublication.count({
        where: { academicContentId: draft.id },
      }),
    ).toBe(0);
    const scheduled = await publish(draft.id);
    await expect(
      publicationsWithoutGate.unschedule({
        ...scope,
        contentId: draft.id,
        publicationId: scheduled.publicationId,
      }),
    ).rejects.toThrow('Teacher write gate is unavailable');
    const publishedContent = await createContent(randomUUID());
    const publication = await published(publishedContent.id);
    const command = {
      ...scope,
      contentId: publishedContent.id,
      publicationId: publication.publicationId,
      now: new Date(),
    };
    await expect(lifecycleWithoutGate.cancel(command)).rejects.toThrow(
      'Teacher write gate is unavailable',
    );
    await expect(lifecycleWithoutGate.startRevision(command)).rejects.toThrow(
      'Teacher write gate is unavailable',
    );
    expect(
      (
        await prisma.academicContent.findUniqueOrThrow({
          where: { id: publishedContent.id },
        })
      ).status,
    ).toBe(Status.PUBLISHED);
    expect(
      (
        await prisma.academicContentPublication.findUniqueOrThrow({
          where: { id: publication.publicationId },
        })
      ).status,
    ).toBe('PUBLISHED');
  });
});
