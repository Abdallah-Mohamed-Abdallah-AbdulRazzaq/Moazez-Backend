import { randomUUID } from 'node:crypto';
import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentPublicationStatus,
  AcademicContentTargetScopeType,
  AcademicContentType,
  AcademicGuardianNotePriority,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
  FileUploadSessionStatus,
  UserType,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { SCHOOL_MANAGEMENT_ONLY_METADATA } from '../../src/common/decorators/school-management-only.decorator';
import { GlobalExceptionFilter } from '../../src/common/exceptions/global-exception.filter';
import {
  DomainException,
  NotFoundDomainException,
} from '../../src/common/exceptions/domain-exception';
import {
  CancelAcademicContentPublicationUseCase,
  GetAcademicContentAudiencePreviewUseCase,
  GetAcademicContentPublicationReadinessUseCase,
  GetAcademicContentPublicationUseCase,
  ListAcademicContentPublicationHistoryUseCase,
  ScheduleAcademicContentPublicationUseCase,
  UnscheduleAcademicContentPublicationUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-publication.use-cases';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import {
  GetAcademicContentForManagementUseCase,
  ListAcademicContentForManagementUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-management-read.use-cases';
import { GetAcademicContentReadinessUseCase } from '../../src/modules/academics/academic-content/application/academic-content-readiness.use-case';
import { AcademicContentTypeDetailUseCases } from '../../src/modules/academics/academic-content/application/academic-content-type-detail.use-cases';
import { AcademicContentLifecycleUseCases } from '../../src/modules/academics/academic-content/application/academic-content-lifecycle.use-cases';
import { CreateAcademicContentUseCase } from '../../src/modules/academics/academic-content/application/create-academic-content.use-case';
import { ReplaceAcademicContentTargetsUseCase } from '../../src/modules/academics/academic-content/application/replace-academic-content-targets.use-case';
import {
  ReplaceAcademicContentLinksUseCase,
  ReplaceAcademicContentTagsUseCase,
} from '../../src/modules/academics/academic-content/application/replace-academic-content-links-tags.use-cases';
import {
  GetAcademicContentRevisionUseCase,
  ListAcademicContentRevisionsUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-revision.use-cases';
import { AcademicContentController } from '../../src/modules/academics/academic-content/controller/academic-content.controller';
import { AcademicContentPreparationTemplateController } from '../../src/modules/academics/academic-content/controller/academic-content-preparation-template.controller';
import { AcademicContentPreparationTemplateUseCases } from '../../src/modules/academics/academic-content/application/academic-content-preparation-template.use-cases';
import { AcademicContentFilePolicyController } from '../../src/modules/academics/academic-content/controller/academic-content-file-policy.controller';
import { AcademicContentNotificationPolicyController } from '../../src/modules/academics/academic-content/controller/academic-content-notification-policy.controller';
import {
  GetAcademicContentNotificationPolicyUseCase,
  UpdateAcademicContentNotificationPolicyUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-notification-policy.use-cases';
import {
  effectiveAcademicContentNotificationPolicy,
  normalizeAcademicContentNotificationPolicyPatch,
} from '../../src/modules/academics/academic-content/domain/academic-content-notification.policy';
import { AcademicContentWorkflowPolicyController } from '../../src/modules/academics/academic-content/controller/academic-content-workflow-policy.controller';
import { AcademicContentWorkflowController } from '../../src/modules/academics/academic-content/controller/academic-content-workflow.controller';
import {
  ApproveAcademicContentUseCase,
  RequestAcademicContentChangesUseCase,
  SubmitAcademicContentUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-workflow.use-cases';
import {
  ListAcademicContentApprovalHistoryUseCase,
  ListAcademicContentReviewQueueUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-review.use-cases';
import {
  GetAcademicContentWorkflowPolicyUseCase,
  UpdateAcademicContentWorkflowPolicyUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-workflow-policy.use-cases';
import {
  GetAcademicContentFilePolicyUseCase,
  UpdateAcademicContentFilePolicyUseCase,
} from '../../src/modules/academics/academic-content/files/application/academic-content-file-policy.use-cases';
import {
  CancelAcademicContentUploadUseCase,
  CompleteAcademicContentUploadUseCase,
  CreateAcademicContentUploadUseCase,
  UnlinkAcademicContentAssetUseCase,
} from '../../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases';

const base = '/api/v1/academics/academic-content';
const schoolId = randomUUID();
const organizationId = randomUUID();
const actorId = randomUUID();
const contentId = randomUUID();
const uploadId = randomUUID();
const assetId = randomUUID();
const fileId = randomUUID();
const revisionId = randomUUID();
const publicationId = randomUUID();
const now = new Date('2030-09-15T12:00:00.000Z');
const secret = 'https://provider.example/upload?secret=capability';
const permissions = [
  'academics.academic_content.view',
  'academics.academic_content.manage',
  'academics.academic_content.settings.manage',
  'academics.academic_content.approve',
  'academics.academic_content.publish',
];
const content = {
  id: contentId,
  schoolId,
  academicYearId: randomUUID(),
  termId: randomUUID(),
  type: AcademicContentType.GENERAL_RESOURCE,
  audience: AcademicContentAudienceType.STUDENTS,
  title: 'Resource',
  description: null,
  status: AcademicContentStatus.DRAFT,
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
  createdByUserId: actorId,
  updatedByUserId: null,
  deletedAt: null,
};
const target = {
  id: randomUUID(),
  scopeType: AcademicContentTargetScopeType.SCHOOL,
  stageId: null,
  gradeId: null,
  sectionId: null,
  classroomId: null,
  subjectId: null,
  teacherSubjectAllocationId: null,
  identityFingerprint: 'internal-fingerprint',
  createdByUserId: actorId,
};
const file = {
  id: fileId,
  originalName: 'lesson.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 123n,
  bucket: 'internal-bucket',
  objectKey: 'internal-object-key',
};
const policy = {
  attachmentsEnabled: true,
  maximumFileSizeBytes: 536870912n,
  documentsEnabled: true,
  imagesEnabled: true,
  videosEnabled: true,
  audioEnabled: true,
  archivesEnabled: false,
  otherFilesEnabled: false,
  allowStudentDownload: true,
  allowGuardianDownload: true,
  allowInlinePreview: true,
};
const link = {
  id: randomUUID(),
  label: 'Reference',
  url: 'https://example.test/ref',
  sortOrder: 0,
};
const tag = {
  id: randomUUID(),
  displayValue: 'Algebra',
  normalizedValue: 'algebra',
  sortOrder: 0,
};
const revision = {
  id: revisionId,
  schoolId,
  academicContentId: contentId,
  revisionNumber: 1,
  snapshotContractVersion: 1,
  typeSpecificSnapshot: null,
  academicYearId: content.academicYearId,
  termId: content.termId,
  type: content.type,
  audience: content.audience,
  title: content.title,
  description: null,
  sourceStatus: AcademicContentStatus.DRAFT,
  capturedByUserId: actorId,
  capturedAt: now,
  createdAt: now,
  targets: [target],
  assets: [{ id: randomUUID(), fileId, sortOrder: 0, file }],
  links: [link],
  tags: [tag],
};

const services = {
  publicationReadiness: { execute: jest.fn() },
  audiencePreview: { execute: jest.fn() },
  createPublication: { execute: jest.fn() },
  publicationHistory: { execute: jest.fn() },
  publicationDetail: { execute: jest.fn() },
  unschedule: { execute: jest.fn() },
  cancel: { execute: jest.fn() },
  create: { execute: jest.fn() },
  list: { execute: jest.fn() },
  detail: { execute: jest.fn() },
  readiness: { execute: jest.fn() },
  typeDetails: {
    replacePreparation: jest.fn(),
    replaceWeeklyPlan: jest.fn(),
    replaceGuardianNote: jest.fn(),
    replaceSubjectResource: jest.fn(),
    replaceOnlineSession: jest.fn(),
  },
  lifecycle: {
    update: jest.fn(),
    archive: jest.fn(),
    restore: jest.fn(),
    delete: jest.fn(),
  },
  targets: { execute: jest.fn() },
  links: { execute: jest.fn() },
  tags: { execute: jest.fn() },
  revisionList: { execute: jest.fn() },
  revisionDetail: { execute: jest.fn() },
  uploadIntent: { execute: jest.fn() },
  uploadComplete: { execute: jest.fn() },
  uploadCancel: { execute: jest.fn() },
  assetUnlink: { execute: jest.fn() },
  getPolicy: { execute: jest.fn() },
  updatePolicy: { execute: jest.fn() },
  getNotificationPolicy: { execute: jest.fn() },
  updateNotificationPolicy: { execute: jest.fn() },
  getWorkflowPolicy: { execute: jest.fn() },
  updateWorkflowPolicy: { execute: jest.fn() },
  submit: { execute: jest.fn() },
  approve: { execute: jest.fn() },
  requestChanges: { execute: jest.fn() },
  reviewQueue: { execute: jest.fn() },
  approvalHistory: { execute: jest.fn() },
  templates: {
    list: jest.fn(),
    detail: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const publication = {
  publicationId,
  revisionId,
  status: AcademicContentPublicationStatus.SCHEDULED,
  sourceContentStatus: AcademicContentStatus.DRAFT,
  publishAt: now,
  visibleFrom: now,
  visibleUntil: null,
  publishedAt: null,
  expiredAt: null,
  cancelledAt: null,
  studentRecipientCount: 2,
  guardianRecipientContextCount: 3,
  createdByUserId: actorId,
  createdAt: now,
  schoolId,
  academicContentId: contentId,
  clientRequestId: randomUUID(),
  requestFingerprint: 'internal-request-fingerprint',
  updatedAt: now,
  cancelledByUserId: actorId,
  recipients: [{ studentId: randomUUID(), identityFingerprint: 'recipient' }],
  typeSpecificSnapshot: { bucket: 'private', objectKey: 'private' },
};
const publicationKeys = [
  'publicationId',
  'revisionId',
  'status',
  'sourceContentStatus',
  'publishAt',
  'visibleFrom',
  'visibleUntil',
  'publishedAt',
  'expiredAt',
  'cancelledAt',
  'studentRecipientCount',
  'guardianRecipientContextCount',
  'createdByUserId',
  'createdAt',
].sort();
const publicationRoutes = [
  {
    handler: 'publicationReadiness',
    method: 'get',
    suffix: 'publication-readiness',
    permission: 'view',
    status: 200,
  },
  {
    handler: 'audiencePreview',
    method: 'get',
    suffix: 'audience-preview',
    permission: 'view',
    status: 200,
  },
  {
    handler: 'createPublication',
    method: 'post',
    suffix: 'publications',
    permission: 'publish',
    status: 201,
  },
  {
    handler: 'publicationHistory',
    method: 'get',
    suffix: 'publications',
    permission: 'view',
    status: 200,
  },
  {
    handler: 'publicationDetail',
    method: 'get',
    suffix: `publications/${publicationId}`,
    permission: 'view',
    status: 200,
  },
  {
    handler: 'unschedule',
    method: 'post',
    suffix: `publications/${publicationId}/unschedule`,
    permission: 'publish',
    status: 200,
  },
  {
    handler: 'cancel',
    method: 'post',
    suffix: `publications/${publicationId}/cancel`,
    permission: 'publish',
    status: 200,
  },
] as const;

describe('Academic Content management HTTP security and transport', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AcademicContentFilePolicyController,
        AcademicContentWorkflowPolicyController,
        AcademicContentNotificationPolicyController,
        AcademicContentWorkflowController,
        AcademicContentPreparationTemplateController,
        AcademicContentController,
      ],
      providers: [
        {
          provide: GetAcademicContentPublicationReadinessUseCase,
          useValue: services.publicationReadiness,
        },
        {
          provide: GetAcademicContentAudiencePreviewUseCase,
          useValue: services.audiencePreview,
        },
        {
          provide: ScheduleAcademicContentPublicationUseCase,
          useValue: services.createPublication,
        },
        {
          provide: ListAcademicContentPublicationHistoryUseCase,
          useValue: services.publicationHistory,
        },
        {
          provide: GetAcademicContentPublicationUseCase,
          useValue: services.publicationDetail,
        },
        {
          provide: UnscheduleAcademicContentPublicationUseCase,
          useValue: services.unschedule,
        },
        {
          provide: CancelAcademicContentPublicationUseCase,
          useValue: services.cancel,
        },
        {
          provide: AcademicContentPreparationTemplateUseCases,
          useValue: services.templates,
        },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        { provide: CreateAcademicContentUseCase, useValue: services.create },
        {
          provide: ListAcademicContentForManagementUseCase,
          useValue: services.list,
        },
        {
          provide: GetAcademicContentForManagementUseCase,
          useValue: services.detail,
        },
        {
          provide: GetAcademicContentReadinessUseCase,
          useValue: services.readiness,
        },
        {
          provide: AcademicContentTypeDetailUseCases,
          useValue: services.typeDetails,
        },
        {
          provide: AcademicContentLifecycleUseCases,
          useValue: services.lifecycle,
        },
        {
          provide: ReplaceAcademicContentTargetsUseCase,
          useValue: services.targets,
        },
        {
          provide: ReplaceAcademicContentLinksUseCase,
          useValue: services.links,
        },
        { provide: ReplaceAcademicContentTagsUseCase, useValue: services.tags },
        {
          provide: ListAcademicContentRevisionsUseCase,
          useValue: services.revisionList,
        },
        {
          provide: GetAcademicContentRevisionUseCase,
          useValue: services.revisionDetail,
        },
        {
          provide: CreateAcademicContentUploadUseCase,
          useValue: services.uploadIntent,
        },
        {
          provide: CompleteAcademicContentUploadUseCase,
          useValue: services.uploadComplete,
        },
        {
          provide: CancelAcademicContentUploadUseCase,
          useValue: services.uploadCancel,
        },
        {
          provide: UnlinkAcademicContentAssetUseCase,
          useValue: services.assetUnlink,
        },
        {
          provide: GetAcademicContentFilePolicyUseCase,
          useValue: services.getPolicy,
        },
        {
          provide: UpdateAcademicContentFilePolicyUseCase,
          useValue: services.updatePolicy,
        },
        {
          provide: GetAcademicContentWorkflowPolicyUseCase,
          useValue: services.getWorkflowPolicy,
        },
        {
          provide: UpdateAcademicContentWorkflowPolicyUseCase,
          useValue: services.updateWorkflowPolicy,
        },
        {
          provide: GetAcademicContentNotificationPolicyUseCase,
          useValue: services.getNotificationPolicy,
        },
        {
          provide: UpdateAcademicContentNotificationPolicyUseCase,
          useValue: services.updateNotificationPolicy,
        },
        { provide: SubmitAcademicContentUseCase, useValue: services.submit },
        { provide: ApproveAcademicContentUseCase, useValue: services.approve },
        {
          provide: ListAcademicContentReviewQueueUseCase,
          useValue: services.reviewQueue,
        },
        {
          provide: ListAcademicContentApprovalHistoryUseCase,
          useValue: services.approvalHistory,
        },
        {
          provide: RequestAcademicContentChangesUseCase,
          useValue: services.requestChanges,
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(
      (
        req: { headers: Record<string, string> },
        _res: unknown,
        next: () => void,
      ) => {
        const label = req.headers['x-test-actor'] ?? 'school';
        const context = createRequestContext();
        context.actor = {
          id: actorId,
          userType:
            label === 'organization'
              ? UserType.ORGANIZATION_USER
              : label === 'teacher'
                ? UserType.TEACHER
                : label === 'student'
                  ? UserType.STUDENT
                  : label === 'parent'
                    ? UserType.PARENT
                    : label === 'applicant'
                      ? UserType.APPLICANT
                      : label === 'service'
                        ? UserType.SERVICE_ACCOUNT
                        : UserType.SCHOOL_USER,
        };
        context.activeMembership = {
          membershipId: randomUUID(),
          schoolId,
          organizationId,
          roleId: randomUUID(),
          permissions:
            label === 'missing'
              ? []
              : label === 'viewOnly'
                ? [permissions[0]]
                : label === 'manageOnly'
                  ? [permissions[1]]
                  : label === 'settingsOnly'
                    ? [permissions[2]]
                    : label === 'approveOnly'
                      ? [permissions[3]]
                      : label === 'publishOnly'
                        ? [permissions[4]]
                        : permissions,
        };
        runWithRequestContext(context, next);
      },
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    services.publicationReadiness.execute.mockResolvedValue({
      canPublish: true,
      canSchedule: true,
      blockingReasons: [],
      schoolId,
    });
    services.audiencePreview.execute.mockResolvedValue({
      asOf: now,
      students: 2,
      guardianContexts: 3,
      guardianUsersWithAccounts: 1,
      guardianNotificationOptOutContexts: 1,
      recipients: [{ studentId: randomUUID() }],
    });
    services.createPublication.execute.mockResolvedValue(publication);
    services.publicationHistory.execute.mockResolvedValue({
      items: [publication],
      page: 1,
      limit: 20,
      total: 1,
    });
    services.publicationDetail.execute.mockResolvedValue(publication);
    services.unschedule.execute.mockResolvedValue({
      ...publication,
      status: AcademicContentPublicationStatus.CANCELLED,
      cancelledAt: now,
    });
    services.cancel.execute.mockResolvedValue({
      ...publication,
      status: AcademicContentPublicationStatus.CANCELLED,
      publishedAt: now,
      cancelledAt: now,
    });
    services.templates.list.mockResolvedValue({
      items: [],
      page: 1,
      limit: 50,
      total: 0,
    });
    services.templates.detail.mockResolvedValue({
      id: contentId,
      name: 'Preset',
    });
    services.templates.create.mockResolvedValue({
      id: contentId,
      name: 'Preset',
    });
    services.templates.update.mockResolvedValue({
      id: contentId,
      name: 'Preset',
    });
    services.templates.delete.mockResolvedValue({ ok: true });
    services.create.execute.mockResolvedValue(content);
    services.list.execute.mockResolvedValue({
      items: [content],
      page: 1,
      limit: 50,
      total: 1,
    });
    services.detail.execute.mockResolvedValue({
      ...content,
      targets: [target],
      assets: [{ id: assetId, fileId, sortOrder: 0, createdAt: now, file }],
      links: [],
      tags: [],
      publications: [],
    });
    services.readiness.execute.mockResolvedValue({
      canAdvance: true,
      blockingReasons: [],
    });
    services.typeDetails.replacePreparation.mockResolvedValue({
      changed: true,
      state: {
        topic: null,
        objectives: [],
        learningOutcomes: [],
        teachingStrategies: [],
        activities: [],
        resourceNotes: null,
        assessmentNotes: null,
        teacherNotes: null,
        curriculumId: null,
        curriculumUnitId: null,
        curriculumLessonId: null,
        lessonPlanId: null,
        lessonPlanItemId: null,
        timetableEntryId: null,
      },
    });
    services.typeDetails.replaceWeeklyPlan.mockResolvedValue({
      changed: true,
      state: {
        weekStartDate: '2028-09-10',
        weekEndDate: '2028-09-16',
        objectives: [],
        topics: [],
        expectedHomework: null,
        upcomingAssessments: null,
        notes: null,
        homeworkAssignmentIds: [],
        gradeAssessmentIds: [],
      },
    });
    services.typeDetails.replaceGuardianNote.mockResolvedValue({
      changed: true,
      state: {
        body: 'Notice',
        priority: AcademicGuardianNotePriority.NORMAL,
        requiresAcknowledgement: false,
      },
    });
    services.typeDetails.replaceSubjectResource.mockResolvedValue({
      changed: true,
      state: {
        resourceCategory: AcademicSubjectResourceCategory.WORKSHEET,
        curriculumId: null,
        curriculumUnitId: null,
        curriculumLessonId: null,
      },
    });
    services.typeDetails.replaceOnlineSession.mockResolvedValue({
      changed: true,
      state: {
        platform: AcademicOnlineSessionPlatform.ZOOM,
        providerName: null,
        joinUrl: 'https://example.test/meeting',
        accessCode: null,
        instructions: null,
        startAt: '2028-09-10T10:00:00.000Z',
        endAt: '2028-09-10T11:00:00.000Z',
        timezone: 'Africa/Cairo',
        timetableEntryId: null,
      },
    });
    services.lifecycle.update.mockResolvedValue(content);
    services.lifecycle.archive.mockResolvedValue({
      ...content,
      status: AcademicContentStatus.ARCHIVED,
      archivedAt: now,
    });
    services.lifecycle.restore.mockResolvedValue(content);
    services.lifecycle.delete.mockResolvedValue({ ...content, deletedAt: now });
    services.targets.execute.mockResolvedValue([target]);
    services.links.execute.mockResolvedValue([link]);
    services.tags.execute.mockResolvedValue([tag]);
    services.revisionList.execute.mockResolvedValue({
      items: [revision],
      page: 1,
      limit: 50,
      total: 1,
    });
    services.revisionDetail.execute.mockResolvedValue(revision);
    services.uploadIntent.execute.mockResolvedValue({
      uploadId,
      status: FileUploadSessionStatus.UPLOADING,
      sessionUrl: secret,
      capabilityExpiresAt: now,
      expiresAt: now,
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: 123n,
      uploadMode: 'resumable',
      bucket: 'internal-bucket',
      objectKey: 'internal-object-key',
    });
    services.uploadComplete.execute.mockResolvedValue({
      asset: {
        id: assetId,
        academicContentId: contentId,
        fileId,
        createdAt: now,
        bucket: 'internal-bucket',
      },
      file,
    });
    services.uploadCancel.execute.mockResolvedValue({
      id: uploadId,
      status: FileUploadSessionStatus.CANCELLED,
      cancelledAt: now,
      finalBucket: 'internal-bucket',
      finalObjectKey: 'internal-object-key',
    });
    services.assetUnlink.execute.mockResolvedValue({ id: assetId, file });
    services.getPolicy.execute.mockResolvedValue(policy);
    services.updatePolicy.execute.mockResolvedValue(policy);
    services.getNotificationPolicy.execute.mockResolvedValue(
      effectiveAcademicContentNotificationPolicy(),
    );
    services.updateNotificationPolicy.execute.mockImplementation(
      (patch: unknown) =>
        Promise.resolve(
          effectiveAcademicContentNotificationPolicy(
            normalizeAcademicContentNotificationPolicyPatch(patch),
          ),
        ),
    );
    services.getWorkflowPolicy.execute.mockResolvedValue({
      preparationApprovalRequired: false,
    });
    services.updateWorkflowPolicy.execute.mockResolvedValue({
      preparationApprovalRequired: true,
    });
    const transition = {
      contentId,
      contentStatus: AcademicContentStatus.SUBMITTED,
      approvalId: randomUUID(),
      approvalStatus: 'PENDING',
      revisionId,
      roundNumber: 1,
      submittedAt: now,
      decidedAt: null,
    };
    services.submit.execute.mockResolvedValue(transition);
    services.approve.execute.mockResolvedValue({
      ...transition,
      contentStatus: AcademicContentStatus.APPROVED,
      approvalStatus: 'APPROVED',
      decidedAt: now,
    });
    services.requestChanges.execute.mockResolvedValue({
      ...transition,
      contentStatus: AcademicContentStatus.CHANGES_REQUESTED,
      approvalStatus: 'CHANGES_REQUESTED',
      decidedAt: now,
    });
    services.reviewQueue.execute.mockResolvedValue({
      items: [
        {
          contentId,
          title: 'Submitted Preparation',
          academicYearId: content.academicYearId,
          termId: content.termId,
          approvalId: transition.approvalId,
          submittedRevisionId: revisionId,
          roundNumber: 1,
          submittedAt: now,
          submittedByUserId: actorId,
          targets: [target],
          typeSpecificSnapshot: { teacherNotes: 'private' },
          schoolId,
        },
      ],
      page: 1,
      limit: 50,
      total: 1,
    });
    services.approvalHistory.execute.mockResolvedValue({
      items: [
        {
          id: transition.approvalId,
          revisionId,
          roundNumber: 1,
          status: 'CHANGES_REQUESTED',
          submittedByUserId: actorId,
          submittedAt: now,
          decidedByUserId: actorId,
          decidedAt: now,
          decisionNote: 'Revise the examples',
          schoolId,
          createdAt: now,
        },
      ],
      page: 1,
      limit: 50,
      total: 1,
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('ACC-7E publication management HTTP', () => {
    it.each(publicationRoutes)(
      'registers exact method, path and permission for $handler',
      (route) => {
        const handler = AcademicContentController.prototype[route.handler];
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
          `:contentId/${route.suffix.replace(publicationId, ':publicationId')}`,
        );
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
          route.method === 'get' ? RequestMethod.GET : RequestMethod.POST,
        );
        expect(
          Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, handler),
        ).toEqual([`academics.academic_content.${route.permission}`]);
        expect(
          Reflect.getMetadata(
            SCHOOL_MANAGEMENT_ONLY_METADATA,
            AcademicContentController,
          ),
        ).toBe(true);
      },
    );

    it.each(publicationRoutes)(
      'separates every permission profile on $handler',
      async (route) => {
        for (const actor of [
          'viewOnly',
          'publishOnly',
          'manageOnly',
          'approveOnly',
          'settingsOnly',
          'missing',
        ]) {
          services[route.handler].execute.mockClear();
          const allowed = actor === `${route.permission}Only`;
          await request(app.getHttpServer())
            [route.method](`${base}/${contentId}/${route.suffix}`)
            .set('x-test-actor', actor)
            .send(
              route.handler === 'createPublication'
                ? { clientRequestId: randomUUID() }
                : {},
            )
            .expect(allowed ? route.status : 403);
          expect(services[route.handler].execute).toHaveBeenCalledTimes(
            allowed ? 1 : 0,
          );
        }
      },
    );

    it.each(publicationRoutes)(
      'allows School and Organization managers on $handler',
      async (route) => {
        for (const actor of ['school', 'organization']) {
          await request(app.getHttpServer())
            [route.method](`${base}/${contentId}/${route.suffix}`)
            .set('x-test-actor', actor)
            .send(
              route.handler === 'createPublication'
                ? { clientRequestId: randomUUID() }
                : {},
            )
            .expect(route.status);
        }
      },
    );

    it.each(publicationRoutes)(
      'rejects every application actor even with permission on $handler',
      async (route) => {
        for (const actor of [
          'teacher',
          'student',
          'parent',
          'applicant',
          'service',
        ]) {
          await request(app.getHttpServer())
            [route.method](`${base}/${contentId}/${route.suffix}`)
            .set('x-test-actor', actor)
            .send(
              route.handler === 'createPublication'
                ? { clientRequestId: randomUUID() }
                : {},
            )
            .expect(403);
        }
        expect(services[route.handler].execute).not.toHaveBeenCalled();
      },
    );

    it.each(publicationRoutes)(
      'rejects malformed route UUIDs before $handler',
      async (route) => {
        const paths = [`${base}/bad/${route.suffix}`];
        if (route.suffix.includes(publicationId))
          paths.push(
            `${base}/${contentId}/${route.suffix.replace(publicationId, 'bad')}`,
          );
        for (const path of paths) {
          await request(app.getHttpServer())
            [route.method](path)
            .send(
              route.handler === 'createPublication'
                ? { clientRequestId: randomUUID() }
                : {},
            )
            .expect(400);
        }
        expect(services[route.handler].execute).not.toHaveBeenCalled();
      },
    );

    it.each(publicationRoutes)(
      'maps owned lookup failure to a non-disclosing 404 on $handler',
      async (route) => {
        const foreignContent = randomUUID();
        const foreignPublication = randomUUID();
        const paths = [`${base}/${foreignContent}/${route.suffix}`];
        if (route.suffix.includes(publicationId))
          paths.push(
            `${base}/${contentId}/${route.suffix.replace(publicationId, foreignPublication)}`,
          );
        for (const path of paths) {
          services[route.handler].execute.mockRejectedValueOnce(
            new NotFoundDomainException('Academic content not found'),
          );
          const response = await request(app.getHttpServer())
            [route.method](path)
            .send(
              route.handler === 'createPublication'
                ? { clientRequestId: randomUUID() }
                : {},
            )
            .expect(404);
          expect(JSON.stringify(response.body)).not.toMatch(
            new RegExp(
              `${schoolId}|${revisionId}|${foreignContent}|${foreignPublication}|requestFingerprint`,
            ),
          );
        }
      },
    );

    it('preserves omitted versus explicit null timing and delegates Dates only', async () => {
      const requestId = randomUUID();
      const result = await request(app.getHttpServer())
        .post(`${base}/${contentId}/publications`)
        .send({ clientRequestId: requestId })
        .expect(201);
      expect(services.createPublication.execute).toHaveBeenLastCalledWith(
        contentId,
        { clientRequestId: requestId },
      );
      expect(Object.keys(result.body as object).sort()).toEqual(
        publicationKeys,
      );
      expect((result.body as { status: string }).status).toBe('SCHEDULED');
      const nullId = randomUUID();
      await request(app.getHttpServer())
        .post(`${base}/${contentId}/publications`)
        .send({ clientRequestId: nullId, visibleUntil: null })
        .expect(201);
      expect(services.createPublication.execute).toHaveBeenLastCalledWith(
        contentId,
        { clientRequestId: nullId, visibleUntil: null },
      );
      const explicitId = randomUUID();
      await request(app.getHttpServer())
        .post(`${base}/${contentId}/publications`)
        .send({
          clientRequestId: explicitId,
          publishAt: now.toISOString(),
          visibleFrom: '2030-09-15T14:00:00+02:00',
          visibleUntil: '2030-09-16T12:00:00Z',
        })
        .expect(201);
      expect(services.createPublication.execute).toHaveBeenLastCalledWith(
        contentId,
        {
          clientRequestId: explicitId,
          publishAt: now,
          visibleFrom: now,
          visibleUntil: new Date('2030-09-16T12:00:00Z'),
        },
      );
    });

    it('rejects malformed publication bodies before calling schedule', async () => {
      const valid = { clientRequestId: randomUUID() };
      const bodies: unknown[] = [
        {},
        { clientRequestId: 'bad' },
        { clientRequestId: null },
      ];
      for (const field of ['publishAt', 'visibleFrom', 'visibleUntil']) {
        for (const value of [
          42,
          '',
          'arbitrary',
          '2030-02-30T12:00:00Z',
          '2030-09-15',
          '2030-09-15T12:00:00',
          '2030-09-15 12:00:00Z',
        ])
          bodies.push({ ...valid, [field]: value });
      }
      bodies.push(
        { ...valid, publishAt: null },
        { ...valid, visibleFrom: null },
      );
      for (const field of [
        'unknown',
        'schoolId',
        'organizationId',
        'contentId',
        'publicationId',
        'revisionId',
        'status',
        'createdByUserId',
        'requestFingerprint',
        'studentRecipientCount',
        'guardianRecipientContextCount',
        'now',
      ])
        bodies.push({ ...valid, [field]: 'injected' });
      for (const body of bodies)
        await request(app.getHttpServer())
          .post(`${base}/${contentId}/publications`)
          .send(body as object)
          .expect(400);
      expect(services.createPublication.execute).not.toHaveBeenCalled();
    });

    it.each(['unschedule', 'cancel'] as const)(
      'requires an empty %s action body',
      async (action) => {
        const path = `${base}/${contentId}/publications/${publicationId}/${action}`;
        await request(app.getHttpServer()).post(path).expect(200);
        await request(app.getHttpServer()).post(path).send({}).expect(200);
        expect(services[action].execute).toHaveBeenCalledTimes(2);
        expect(services[action].execute).toHaveBeenLastCalledWith(
          contentId,
          publicationId,
        );
        services[action].execute.mockClear();
        for (const field of [
          'schoolId',
          'now',
          'status',
          'reason',
          'unknown',
        ]) {
          await request(app.getHttpServer())
            .post(path)
            .send({ [field]: 'injected' })
            .expect(400);
        }
        expect(services[action].execute).not.toHaveBeenCalled();
      },
    );

    it('accepts only publication pagination with default 20 and maximum 100', async () => {
      const path = `${base}/${contentId}/publications`;
      await request(app.getHttpServer()).get(path).expect(200);
      expect(services.publicationHistory.execute).toHaveBeenLastCalledWith(
        contentId,
        { page: 1, limit: 20 },
      );
      await request(app.getHttpServer())
        .get(`${path}?page=2&limit=100`)
        .expect(200);
      expect(services.publicationHistory.execute).toHaveBeenLastCalledWith(
        contentId,
        { page: 2, limit: 100 },
      );
      services.publicationHistory.execute.mockClear();
      for (const query of [
        'page=0',
        'page=-1',
        'page=1.5',
        'limit=0',
        'limit=-1',
        'limit=101',
        'limit=abc',
        'schoolId=x',
        'status=PUBLISHED',
        'createdByUserId=x',
        'search=x',
        'academicYearId=x',
        'unknown=x',
      ]) {
        await request(app.getHttpServer()).get(`${path}?${query}`).expect(400);
      }
      expect(services.publicationHistory.execute).not.toHaveBeenCalled();
    });

    it('keeps publication readiness separate from authoring and preview aggregate only', async () => {
      services.readiness.execute.mockResolvedValueOnce({
        canAdvance: false,
        blockingReasons: [
          { code: 'authoring.empty', message: 'Author the content' },
        ],
      });
      const authoring = await request(app.getHttpServer())
        .get(`${base}/${contentId}/readiness`)
        .expect(200);
      expect(authoring.body).toEqual({
        canAdvance: false,
        blockingReasons: [
          { code: 'authoring.empty', message: 'Author the content' },
        ],
      });
      expect(services.publicationReadiness.execute).not.toHaveBeenCalled();
      services.publicationReadiness.execute.mockResolvedValueOnce({
        canPublish: false,
        canSchedule: true,
        blockingReasons: ['publication.term_not_started'],
        canAdvance: false,
      });
      const readiness = await request(app.getHttpServer())
        .get(`${base}/${contentId}/publication-readiness`)
        .expect(200);
      expect(readiness.body).toEqual({
        canPublish: false,
        canSchedule: true,
        blockingReasons: ['publication.term_not_started'],
      });
      const preview = await request(app.getHttpServer())
        .get(`${base}/${contentId}/audience-preview`)
        .expect(200);
      expect(preview.body).toEqual({
        asOf: now.toISOString(),
        students: 2,
        guardianContexts: 3,
        guardianUsersWithAccounts: 1,
        guardianNotificationOptOutContexts: 1,
      });
      expect(services.audiencePreview.execute).toHaveBeenCalledWith(contentId);
      expect(readiness.headers['cache-control']).toBe(
        'no-store, private, max-age=0',
      );
      expect(preview.headers['cache-control']).toBe(
        'no-store, private, max-age=0',
      );
    });

    it('presents history and detail using the canonical allowlist, ISO timestamps and nulls', async () => {
      const history = await request(app.getHttpServer())
        .get(`${base}/${contentId}/publications`)
        .expect(200);
      expect(history.headers['cache-control']).toBe(
        'no-store, private, max-age=0',
      );
      expect(Object.keys(history.body as object).sort()).toEqual([
        'items',
        'limit',
        'page',
        'total',
      ]);
      const item = (history.body as { items: Record<string, unknown>[] })
        .items[0];
      expect(Object.keys(item).sort()).toEqual(publicationKeys);
      expect(item).toMatchObject({
        publishAt: now.toISOString(),
        visibleFrom: now.toISOString(),
        visibleUntil: null,
        publishedAt: null,
        expiredAt: null,
        cancelledAt: null,
        createdAt: now.toISOString(),
      });
      const timed = {
        ...publication,
        visibleUntil: new Date('2030-09-17T12:00:00Z'),
        publishedAt: new Date('2030-09-15T12:01:00Z'),
        expiredAt: new Date('2030-09-17T12:00:00Z'),
        cancelledAt: new Date('2030-09-18T12:00:00Z'),
      };
      services.publicationDetail.execute.mockResolvedValueOnce(timed);
      const detail = await request(app.getHttpServer())
        .get(`${base}/${contentId}/publications/${publicationId}`)
        .expect(200);
      expect(detail.headers['cache-control']).toBe(
        'no-store, private, max-age=0',
      );
      expect(Object.keys(detail.body as object).sort()).toEqual(
        publicationKeys,
      );
      expect(detail.body).toMatchObject({
        visibleUntil: timed.visibleUntil.toISOString(),
        publishedAt: timed.publishedAt.toISOString(),
        expiredAt: timed.expiredAt.toISOString(),
        cancelledAt: timed.cancelledAt.toISOString(),
      });
      for (const action of ['unschedule', 'cancel'] as const) {
        const response = await request(app.getHttpServer())
          .post(`${base}/${contentId}/publications/${publicationId}/${action}`)
          .send({})
          .expect(200);
        expect(Object.keys(response.body as object).sort()).toEqual(
          publicationKeys,
        );
        expect(response.body).toMatchObject({
          status: 'CANCELLED',
          cancelledAt: now.toISOString(),
        });
      }
    });

    it('preserves domain lifecycle and idempotency conflict mapping', async () => {
      for (const route of publicationRoutes.filter(
        (route) => route.permission === 'publish',
      )) {
        services[route.handler].execute.mockRejectedValueOnce(
          new DomainException({
            code: 'academic_content.publication.conflict',
            message: 'Publication intent conflicts',
            httpStatus: 409,
          }),
        );
        await request(app.getHttpServer())
          .post(`${base}/${contentId}/${route.suffix}`)
          .send(
            route.handler === 'createPublication'
              ? { clientRequestId: randomUUID() }
              : {},
          )
          .expect(409);
      }
    });

    it('presents a stable nullable latest attempt summary without embedded history', async () => {
      const empty = await request(app.getHttpServer())
        .get(`${base}/${contentId}`)
        .expect(200);
      expect(empty.body).toMatchObject({
        latestPublicationId: null,
        publicationStatus: null,
        publishAt: null,
        visibleFrom: null,
        visibleUntil: null,
      });
      for (const status of [
        AcademicContentPublicationStatus.SCHEDULED,
        AcademicContentPublicationStatus.CANCELLED,
        AcademicContentPublicationStatus.EXPIRED,
      ]) {
        services.detail.execute.mockResolvedValueOnce({
          ...content,
          targets: [],
          assets: [],
          links: [],
          tags: [],
          publications: [
            { ...publication, id: publicationId, status, visibleUntil: now },
            { ...publication, id: randomUUID() },
          ],
        });
        const response = await request(app.getHttpServer())
          .get(`${base}/${contentId}`)
          .expect(200);
        expect(response.headers['cache-control']).toBe(
          'no-store, private, max-age=0',
        );
        expect(response.body).toMatchObject({
          latestPublicationId: publicationId,
          publicationStatus: status,
          publishAt: now.toISOString(),
          visibleFrom: now.toISOString(),
          visibleUntil: now.toISOString(),
        });
        expect(JSON.stringify(response.body)).not.toMatch(
          /publications|requestFingerprint|clientRequestId|recipients|schoolId|cancelledByUserId/,
        );
      }
    });

    it.each(['SCHEDULED', 'PUBLISHED', 'EXPIRED', 'CANCELLED'])(
      'preserves Library transport for %s',
      async (status) => {
        await request(app.getHttpServer())
          .get(`${base}?status=${status}`)
          .expect(200);
        expect(services.list.execute).toHaveBeenCalledWith(
          expect.objectContaining({ status }),
        );
      },
    );

    it('documents only the publication contract and the full content lifecycle', () => {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      const schemas = document.components!.schemas!;
      const schema = (name: string) => {
        const value = schemas[name];
        if (!value || '$ref' in value)
          throw new Error(`Missing schema ${name}`);
        return value;
      };
      const create = schema('CreateAcademicContentPublicationDto');
      expect(Object.keys(create.properties!).sort()).toEqual([
        'clientRequestId',
        'notifyMinorUpdate',
        'publishAt',
        'visibleFrom',
        'visibleUntil',
      ]);
      expect(create.required).toEqual(['clientRequestId']);
      expect(create.properties!.notifyMinorUpdate).toMatchObject({
        type: 'boolean',
        default: false,
      });
      expect(create.properties!.visibleUntil).toMatchObject({
        type: 'string',
        format: 'date-time',
        nullable: true,
      });
      expect(create.properties!.clientRequestId).toMatchObject({
        format: 'uuid',
      });
      expect(
        schema('AcademicContentPublicationResponseDto').properties,
      ).toBeDefined();
      expect(
        Object.keys(
          schema('AcademicContentPublicationResponseDto').properties!,
        ).sort(),
      ).toEqual(publicationKeys);
      expect(
        Object.keys(
          schema('AcademicContentPublicationReadinessResponseDto').properties!,
        ).sort(),
      ).toEqual(['blockingReasons', 'canPublish', 'canSchedule']);
      expect(
        Object.keys(
          schema('AcademicContentAudiencePreviewResponseDto').properties!,
        ).sort(),
      ).toEqual([
        'asOf',
        'guardianContexts',
        'guardianNotificationOptOutContexts',
        'guardianUsersWithAccounts',
        'students',
      ]);
      expect(
        Object.keys(
          schema('AcademicContentPublicationHistoryResponseDto').properties!,
        ).sort(),
      ).toEqual(['items', 'limit', 'page', 'total']);
      const safeSchemas = [
        'AcademicContentPublicationResponseDto',
        'AcademicContentPublicationReadinessResponseDto',
        'AcademicContentAudiencePreviewResponseDto',
        'AcademicContentPublicationHistoryResponseDto',
      ].map(schema);
      expect(JSON.stringify(safeSchemas)).not.toMatch(
        /requestFingerprint|clientRequestId|schoolId|academicContentId|cancelledByUserId|recipients|identityFingerprint|bucket|objectKey|typeSpecificSnapshot/,
      );
      expect(
        schema('AcademicContentResponseDto').properties!.status,
      ).toMatchObject({ enum: Object.values(AcademicContentStatus) });
      expect(Object.values(AcademicContentStatus)).toEqual([
        'DRAFT',
        'SUBMITTED',
        'CHANGES_REQUESTED',
        'APPROVED',
        'SCHEDULED',
        'PUBLISHED',
        'EXPIRED',
        'ARCHIVED',
        'CANCELLED',
      ]);
      for (const action of ['unschedule', 'cancel']) {
        expect(
          document.paths[
            `${base}/{contentId}/publications/{publicationId}/${action}`
          ].post!.requestBody,
        ).toEqual({
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
              },
            },
          },
        });
      }
      const parameters =
        document.paths[`${base}/{contentId}/publications`].get!.parameters!;
      expect(
        parameters
          .filter((p) => 'in' in p && p.in === 'query')
          .map((p) => ('name' in p ? p.name : ''))
          .sort(),
      ).toEqual(['limit', 'page']);
      expect(
        parameters.find((p) => 'name' in p && p.name === 'limit'),
      ).toMatchObject({ schema: { default: 20, minimum: 1, maximum: 100 } });
      expect(
        parameters.find((p) => 'name' in p && p.name === 'page'),
      ).toMatchObject({ schema: { default: 1, minimum: 1 } });
      expect(
        Object.keys(document.paths)
          .filter((path) => path.startsWith(base))
          .join('\n'),
      ).not.toMatch(/publications.*\/(recipients|audience|recipient-targets)/);
    });
  });

  it('registers exact guarded management routes and permission ownership', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AcademicContentController)).toBe(
      'academics/academic-content',
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, AcademicContentFilePolicyController),
    ).toBe('academics/academic-content/settings');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AcademicContentWorkflowPolicyController,
      ),
    ).toBe('academics/academic-content/settings');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AcademicContentPreparationTemplateController,
      ),
    ).toBe('academics/academic-content/templates/preparation');
    for (const controller of [
      AcademicContentController,
      AcademicContentFilePolicyController,
      AcademicContentWorkflowPolicyController,
      AcademicContentNotificationPolicyController,
      AcademicContentWorkflowController,
      AcademicContentPreparationTemplateController,
    ]) {
      expect(
        Reflect.getMetadata(SCHOOL_MANAGEMENT_ONLY_METADATA, controller),
      ).toBe(true);
    }
    const route = (
      method: string,
      path: string,
      permission: string,
      controller = AcademicContentController,
    ) => {
      const handler =
        controller.prototype[method as keyof typeof controller.prototype];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBeDefined();
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, handler),
      ).toEqual([permission]);
    };
    route('create', '/', 'academics.academic_content.manage');
    route('list', '/', 'academics.academic_content.view');
    route('detail', ':contentId', 'academics.academic_content.view');
    route(
      'readiness',
      ':contentId/readiness',
      'academics.academic_content.view',
    );
    route(
      'replacePreparation',
      ':contentId/details/preparation',
      'academics.academic_content.manage',
    );
    route(
      'replaceWeeklyPlan',
      ':contentId/details/weekly-plan',
      'academics.academic_content.manage',
    );
    route(
      'replaceGuardianNote',
      ':contentId/details/guardian-note',
      'academics.academic_content.manage',
    );
    route(
      'replaceSubjectResource',
      ':contentId/details/subject-resource',
      'academics.academic_content.manage',
    );
    route(
      'replaceOnlineSession',
      ':contentId/details/online-session',
      'academics.academic_content.manage',
    );
    route('update', ':contentId', 'academics.academic_content.manage');
    route('delete', ':contentId', 'academics.academic_content.manage');
    route('archive', ':contentId/archive', 'academics.academic_content.manage');
    route('restore', ':contentId/restore', 'academics.academic_content.manage');
    route('targets', ':contentId/targets', 'academics.academic_content.manage');
    route('links', ':contentId/links', 'academics.academic_content.manage');
    route('tags', ':contentId/tags', 'academics.academic_content.manage');
    route(
      'revisions',
      ':contentId/revisions',
      'academics.academic_content.view',
    );
    route(
      'revisionDetail',
      ':contentId/revisions/:revisionId',
      'academics.academic_content.view',
    );
    route(
      'uploadIntent',
      ':contentId/uploads',
      'academics.academic_content.manage',
    );
    route(
      'uploadComplete',
      ':contentId/uploads/:uploadId/complete',
      'academics.academic_content.manage',
    );
    route(
      'uploadCancel',
      ':contentId/uploads/:uploadId/cancel',
      'academics.academic_content.manage',
    );
    route(
      'assetUnlink',
      ':contentId/assets/:assetId',
      'academics.academic_content.manage',
    );
    route(
      'get',
      'file-policy',
      'academics.academic_content.view',
      AcademicContentFilePolicyController,
    );
    route(
      'update',
      'file-policy',
      'academics.academic_content.settings.manage',
      AcademicContentFilePolicyController,
    );
    route(
      'get',
      'workflow-policy',
      'academics.academic_content.view',
      AcademicContentWorkflowPolicyController,
    );
    route(
      'update',
      'workflow-policy',
      'academics.academic_content.settings.manage',
      AcademicContentWorkflowPolicyController,
    );
    route(
      'get',
      'notification-policy',
      'academics.academic_content.view',
      AcademicContentNotificationPolicyController,
    );
    route(
      'update',
      'notification-policy',
      'academics.academic_content.settings.manage',
      AcademicContentNotificationPolicyController,
    );
    route(
      'submit',
      ':contentId/submit',
      'academics.academic_content.manage',
      AcademicContentWorkflowController,
    );
    route(
      'approve',
      ':contentId/approve',
      'academics.academic_content.approve',
      AcademicContentWorkflowController,
    );
    route(
      'request',
      ':contentId/request-changes',
      'academics.academic_content.approve',
      AcademicContentWorkflowController,
    );
    route(
      'reviewQueue',
      'review-queue',
      'academics.academic_content.approve',
      AcademicContentWorkflowController,
    );
    route(
      'approvals',
      ':contentId/approvals',
      'academics.academic_content.view',
      AcademicContentWorkflowController,
    );
    for (const [method, path, permission, httpMethod] of [
      ['list', '/', 'academics.academic_content.view', RequestMethod.GET],
      [
        'detail',
        ':templateId',
        'academics.academic_content.view',
        RequestMethod.GET,
      ],
      [
        'create',
        '/',
        'academics.academic_content.settings.manage',
        RequestMethod.POST,
      ],
      [
        'update',
        ':templateId',
        'academics.academic_content.settings.manage',
        RequestMethod.PATCH,
      ],
      [
        'delete',
        ':templateId',
        'academics.academic_content.settings.manage',
        RequestMethod.DELETE,
      ],
    ] as const) {
      route(
        method,
        path,
        permission,
        AcademicContentPreparationTemplateController,
      );
      expect(
        Reflect.getMetadata(
          METHOD_METADATA,
          AcademicContentPreparationTemplateController.prototype[method],
        ),
      ).toBe(httpMethod);
    }
  });

  it('keeps Preparation template routes on the management boundary and separate permissions', async () => {
    const url = `${base}/templates/preparation`;
    await request(app.getHttpServer())
      .get(url)
      .set('x-test-actor', 'viewOnly')
      .expect(200)
      .expect('Cache-Control', 'no-store, private, max-age=0');
    await request(app.getHttpServer())
      .get(url)
      .set('x-test-actor', 'organization')
      .expect(200);
    await request(app.getHttpServer())
      .get(`${url}/${contentId}`)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    await request(app.getHttpServer())
      .post(url)
      .set('x-test-actor', 'viewOnly')
      .send({ name: 'Preset' })
      .expect(403);
    await request(app.getHttpServer())
      .post(url)
      .set('x-test-actor', 'settingsOnly')
      .send({ name: 'Preset' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${url}/${contentId}`)
      .set('x-test-actor', 'settingsOnly')
      .send({ name: 'Preset 2' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`${url}/${contentId}`)
      .set('x-test-actor', 'settingsOnly')
      .expect(200);
    for (const actor of ['settingsOnly', 'manageOnly', 'approveOnly'])
      await request(app.getHttpServer())
        .get(url)
        .set('x-test-actor', actor)
        .expect(403);
    for (const actor of [
      'manageOnly',
      'approveOnly',
      'teacher',
      'student',
      'parent',
      'applicant',
    ])
      await request(app.getHttpServer())
        .post(url)
        .set('x-test-actor', actor)
        .send({ name: 'Preset' })
        .expect(403);
    await request(app.getHttpServer())
      .post(url)
      .send({ name: 'Preset', departmentId: contentId })
      .expect(400);
    expect(services.detail.execute).not.toHaveBeenCalled();
  });

  it.each([
    [120, 200],
    [121, 400],
  ])(
    'bounds Preparation template search at %i characters',
    async (length, status) => {
      const search = 's'.repeat(length);
      await request(app.getHttpServer())
        .get(`${base}/templates/preparation`)
        .set('x-test-actor', 'viewOnly')
        .query({ search })
        .expect(status);
      if (status === 200)
        expect(services.templates.list).toHaveBeenCalledWith({ search });
      else expect(services.templates.list).not.toHaveBeenCalled();
      expect(services.detail.execute).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['name', 'name', 'n'.repeat(181)],
    ['description', 'description', 'd'.repeat(1001)],
    ['topic', 'topic', 't'.repeat(501)],
    ['objectives count', 'objectives', Array<string>(51).fill('Objective')],
    [
      'learningOutcomes count',
      'learningOutcomes',
      Array<string>(51).fill('Outcome'),
    ],
    [
      'teachingStrategies count',
      'teachingStrategies',
      Array<string>(51).fill('Strategy'),
    ],
    ['activities count', 'activities', Array<string>(51).fill('Activity')],
    ['objectives item', 'objectives', ['o'.repeat(501)]],
    ['learningOutcomes item', 'learningOutcomes', ['o'.repeat(501)]],
    ['teachingStrategies item', 'teachingStrategies', ['s'.repeat(501)]],
    ['activities item', 'activities', ['a'.repeat(501)]],
    ['resourceNotes', 'resourceNotes', 'r'.repeat(4001)],
    ['assessmentNotes', 'assessmentNotes', 'a'.repeat(4001)],
    ['teacherNotes', 'teacherNotes', 't'.repeat(4001)],
  ])(
    'rejects oversized template %s before create or update',
    async (_label, field, value) => {
      for (const method of ['post', 'patch'] as const) {
        const path = `${base}/templates/preparation${method === 'patch' ? `/${contentId}` : ''}`;
        await request(app.getHttpServer())
          [method](path)
          .set('x-test-actor', 'settingsOnly')
          .send({ name: 'Preset', [field]: value })
          .expect(400);
      }
      expect(services.templates.create).not.toHaveBeenCalled();
      expect(services.templates.update).not.toHaveBeenCalled();
    },
  );

  it('accepts template boundary values and a partial update without a name', async () => {
    const body = {
      name: 'n'.repeat(180),
      description: 'd'.repeat(1000),
      topic: 't'.repeat(500),
      objectives: Array<string>(50).fill('Objective'),
      learningOutcomes: ['o'.repeat(500)],
      teachingStrategies: ['s'.repeat(500)],
      activities: ['a'.repeat(500)],
      resourceNotes: 'r'.repeat(4000),
      assessmentNotes: 'a'.repeat(4000),
      teacherNotes: 't'.repeat(4000),
    };
    await request(app.getHttpServer())
      .post(`${base}/templates/preparation`)
      .set('x-test-actor', 'settingsOnly')
      .send(body)
      .expect(201);
    expect(services.templates.create).toHaveBeenCalledWith(body);
    const patch = { topic: null, teacherNotes: 't'.repeat(4000) };
    await request(app.getHttpServer())
      .patch(`${base}/templates/preparation/${contentId}`)
      .set('x-test-actor', 'settingsOnly')
      .send(patch)
      .expect(200);
    expect(services.templates.update).toHaveBeenCalledWith(contentId, patch);
  });

  it('publishes the exact Academic Content management Swagger surface and safe DTOs', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const registeredRoutes = Object.entries(document.paths)
      .filter(([path]) => path.startsWith(base))
      .flatMap(([path, operations]) =>
        Object.keys(operations)
          .filter((method) => /^(get|post|put|patch|delete)$/u.test(method))
          .map((method) => `${method.toUpperCase()} ${path}`),
      )
      .sort();
    expect(registeredRoutes).toHaveLength(45);
    expect(registeredRoutes).toEqual(
      [
        `GET ${base}`,
        `POST ${base}`,
        `GET ${base}/{contentId}`,
        `GET ${base}/{contentId}/readiness`,
        `GET ${base}/{contentId}/publication-readiness`,
        `GET ${base}/{contentId}/audience-preview`,
        `POST ${base}/{contentId}/publications`,
        `GET ${base}/{contentId}/publications`,
        `GET ${base}/{contentId}/publications/{publicationId}`,
        `POST ${base}/{contentId}/publications/{publicationId}/unschedule`,
        `POST ${base}/{contentId}/publications/{publicationId}/cancel`,
        `PATCH ${base}/{contentId}`,
        `DELETE ${base}/{contentId}`,
        `POST ${base}/{contentId}/archive`,
        `POST ${base}/{contentId}/restore`,
        `PUT ${base}/{contentId}/targets`,
        `PUT ${base}/{contentId}/links`,
        `PUT ${base}/{contentId}/tags`,
        `PUT ${base}/{contentId}/details/preparation`,
        `PUT ${base}/{contentId}/details/weekly-plan`,
        `PUT ${base}/{contentId}/details/guardian-note`,
        `PUT ${base}/{contentId}/details/subject-resource`,
        `PUT ${base}/{contentId}/details/online-session`,
        `GET ${base}/{contentId}/revisions`,
        `GET ${base}/{contentId}/revisions/{revisionId}`,
        `POST ${base}/{contentId}/uploads`,
        `POST ${base}/{contentId}/uploads/{uploadId}/complete`,
        `POST ${base}/{contentId}/uploads/{uploadId}/cancel`,
        `DELETE ${base}/{contentId}/assets/{assetId}`,
        `GET ${base}/settings/file-policy`,
        `PATCH ${base}/settings/file-policy`,
        `GET ${base}/settings/notification-policy`,
        `PATCH ${base}/settings/notification-policy`,
        `GET ${base}/settings/workflow-policy`,
        `PATCH ${base}/settings/workflow-policy`,
        `POST ${base}/{contentId}/submit`,
        `POST ${base}/{contentId}/approve`,
        `POST ${base}/{contentId}/request-changes`,
        `GET ${base}/review-queue`,
        `GET ${base}/templates/preparation`,
        `GET ${base}/templates/preparation/{templateId}`,
        `POST ${base}/templates/preparation`,
        `PATCH ${base}/templates/preparation/{templateId}`,
        `DELETE ${base}/templates/preparation/{templateId}`,
        `GET ${base}/{contentId}/approvals`,
      ].sort(),
    );
    for (const action of ['submit', 'approve']) {
      expect(
        document.paths[`${base}/{contentId}/${action}`].post?.requestBody,
      ).toEqual({
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
        },
      });
    }
    const templatePath = `${base}/templates/preparation`;
    expect(
      (document.paths[templatePath].get?.parameters ?? [])
        .filter((p) => 'name' in p)
        .map((p) => p.name)
        .sort(),
    ).toEqual(['limit', 'page', 'search', 'stageId', 'subjectId']);
    expect(
      JSON.stringify(document.paths[templatePath].post?.requestBody),
    ).toContain('CreateAcademicContentPreparationTemplateDto');
    const templateSchemas = JSON.stringify(
      Object.fromEntries(
        Object.entries(document.components?.schemas ?? {}).filter(([name]) =>
          name.includes('PreparationTemplate'),
        ),
      ),
    );
    expect(templateSchemas).not.toMatch(
      /normalizedName|schoolId|deletedAt|curriculumId|lessonPlanId|timetableEntryId|departmentId/,
    );
    const accPaths = Object.keys(document.paths).filter((path) =>
      path.startsWith(base),
    );
    expect(accPaths.some((path) => /publish|multipart/.test(path))).toBe(false);
    const schemas = JSON.stringify(document.components?.schemas ?? {});
    expect(schemas).not.toMatch(
      /trustedOrigin|bucket|objectKey|finalBucket|cleanup/,
    );
    expect(registeredRoutes.join('\n')).not.toMatch(
      /publish|general-resource|multipart/,
    );
    const detailSchema =
      document.components?.schemas?.AcademicContentDetailResponseDto;
    expect(JSON.stringify(detailSchema)).toContain('details');
    expect(JSON.stringify(detailSchema)).toContain('oneOf');
    const revisionDetailSchema =
      document.components?.schemas?.AcademicContentRevisionDetailDto;
    expect(JSON.stringify(revisionDetailSchema)).toContain('details');
    expect(JSON.stringify(revisionDetailSchema)).toContain('oneOf');
    expect(JSON.stringify(revisionDetailSchema)).not.toContain(
      'typeSpecificSnapshot',
    );
    const libraryItemSchema =
      document.components?.schemas?.AcademicContentLibraryItemResponseDto;
    expect(JSON.stringify(libraryItemSchema)).toContain('summary');
    expect(JSON.stringify(libraryItemSchema)).toContain('oneOf');
    expect(JSON.stringify(libraryItemSchema)).toContain('nullable');
    const libraryListSchema =
      document.components?.schemas?.AcademicContentListResponseDto;
    expect(JSON.stringify(libraryListSchema)).toContain(
      'AcademicContentLibraryItemResponseDto',
    );
    const libraryParameters = document.paths[base].get?.parameters ?? [];
    for (const name of [
      'resourceCategory',
      'weeklyDateFrom',
      'weeklyDateTo',
      'sessionStartAtFrom',
      'sessionStartAtTo',
      'sessionPlatform',
      'guardianPriority',
    ])
      expect(
        libraryParameters.some(
          (parameter) => 'name' in parameter && parameter.name === name,
        ),
      ).toBe(true);
    for (const [route, requestDto, responseDto] of [
      [
        'preparation',
        'ReplaceAcademicContentPreparationDetailDto',
        'AcademicContentPreparationDetailResponseDto',
      ],
      [
        'weekly-plan',
        'ReplaceAcademicContentWeeklyPlanDetailDto',
        'AcademicContentWeeklyPlanDetailResponseDto',
      ],
      [
        'guardian-note',
        'ReplaceAcademicContentGuardianNoteDetailDto',
        'AcademicContentGuardianNoteDetailResponseDto',
      ],
      [
        'subject-resource',
        'ReplaceAcademicContentSubjectResourceDetailDto',
        'AcademicContentSubjectResourceDetailResponseDto',
      ],
      [
        'online-session',
        'ReplaceAcademicContentOnlineSessionDetailDto',
        'AcademicContentOnlineSessionDetailResponseDto',
      ],
    ] as const) {
      const operation =
        document.paths[`${base}/{contentId}/details/${route}`].put;
      expect(JSON.stringify(operation?.requestBody)).toContain(requestDto);
      expect(JSON.stringify(operation?.responses?.['200'])).toContain(
        responseDto,
      );
      expect(document.components?.schemas?.[responseDto]).toBeDefined();
    }
    const readinessSchema =
      document.components?.schemas?.AcademicContentReadinessResponseDto;
    expect(JSON.stringify(readinessSchema)).toContain('blockingReasons');
    const transitionSchema =
      document.components?.schemas?.AcademicContentTransitionResponseDto;
    const transitionProperties =
      (
        transitionSchema as {
          properties?: Record<string, unknown>;
        }
      )?.properties ?? {};
    expect(Object.keys(transitionProperties).sort()).toEqual([
      'approvalId',
      'approvalStatus',
      'contentId',
      'contentStatus',
      'decidedAt',
      'revisionId',
      'roundNumber',
      'submittedAt',
    ]);
    expect(JSON.stringify(transitionSchema)).not.toMatch(
      /schoolId|organizationId|decisionNote|typeSpecificSnapshot/,
    );
    const revisionParameters =
      document.paths[`${base}/{contentId}/revisions`].get?.parameters ?? [];
    expect(
      revisionParameters
        .filter((parameter) => 'name' in parameter)
        .map((parameter) => parameter.name)
        .sort(),
    ).toEqual(['contentId', 'limit', 'page']);
    const reviewParameters =
      document.paths[`${base}/review-queue`].get?.parameters ?? [];
    expect(
      reviewParameters
        .filter((p) => 'name' in p)
        .map((p) => p.name)
        .sort(),
    ).toEqual([
      'academicYearId',
      'classroomId',
      'gradeId',
      'limit',
      'page',
      'search',
      'sectionId',
      'stageId',
      'subjectId',
      'teacherUserId',
      'termId',
    ]);
    const historyParameters =
      document.paths[`${base}/{contentId}/approvals`].get?.parameters ?? [];
    expect(
      historyParameters
        .filter((p) => 'name' in p)
        .map((p) => p.name)
        .sort(),
    ).toEqual(['contentId', 'limit', 'page']);
    const queueSchema = document.components?.schemas
      ?.AcademicContentReviewQueueItemDto as {
      properties?: Record<string, unknown>;
    };
    expect(Object.keys(queueSchema.properties ?? {}).sort()).toEqual([
      'academicYearId',
      'approvalId',
      'contentId',
      'roundNumber',
      'submittedAt',
      'submittedByUserId',
      'submittedRevisionId',
      'targets',
      'termId',
      'title',
    ]);
    const historySchema = document.components?.schemas
      ?.AcademicContentApprovalHistoryItemDto as {
      properties?: Record<string, unknown>;
    };
    expect(Object.keys(historySchema.properties ?? {}).sort()).toEqual([
      'approvalId',
      'decidedAt',
      'decidedByUserId',
      'decisionNote',
      'revisionId',
      'roundNumber',
      'status',
      'submittedAt',
      'submittedByUserId',
    ]);
  });

  it('routes review-queue statically and presents safe submitted and history rows', async () => {
    const queue = await request(app.getHttpServer())
      .get(`${base}/review-queue`)
      .expect(200);
    expect(services.reviewQueue.execute).toHaveBeenCalledWith({});
    expect(services.detail.execute).not.toHaveBeenCalled();
    expect(queue.headers['cache-control']).toBe('no-store, private, max-age=0');
    const queueBody = queue.body as { items: Array<Record<string, unknown>> };
    expect(typeof queueBody.items[0].approvalId).toBe('string');
    expect(queueBody.items[0]).toEqual({
      contentId,
      title: 'Submitted Preparation',
      academicYearId: content.academicYearId,
      termId: content.termId,
      approvalId: queueBody.items[0].approvalId,
      submittedRevisionId: revisionId,
      roundNumber: 1,
      submittedAt: now.toISOString(),
      submittedByUserId: actorId,
      targets: [
        {
          scopeType: target.scopeType,
          stageId: null,
          gradeId: null,
          sectionId: null,
          classroomId: null,
          subjectId: null,
          teacherSubjectAllocationId: null,
        },
      ],
    });
    const history = await request(app.getHttpServer())
      .get(`${base}/${contentId}/approvals`)
      .expect(200);
    expect(history.headers['cache-control']).toBe(
      'no-store, private, max-age=0',
    );
    const historyBody = history.body as {
      items: Array<Record<string, unknown>>;
    };
    expect(typeof historyBody.items[0].approvalId).toBe('string');
    expect(historyBody.items[0]).toEqual({
      approvalId: historyBody.items[0].approvalId,
      revisionId,
      roundNumber: 1,
      status: 'CHANGES_REQUESTED',
      submittedByUserId: actorId,
      submittedAt: now.toISOString(),
      decidedByUserId: actorId,
      decidedAt: now.toISOString(),
      decisionNote: 'Revise the examples',
    });
    expect(historyBody.items[0]).not.toHaveProperty('schoolId');
  });

  it('separates review permissions and rejects app actors and unowned query fields', async () => {
    for (const [actor, queueStatus, historyStatus] of [
      ['viewOnly', 403, 200],
      ['manageOnly', 403, 403],
      ['approveOnly', 200, 403],
      ['settingsOnly', 403, 403],
      ['organization', 200, 200],
      ['teacher', 403, 403],
      ['student', 403, 403],
      ['parent', 403, 403],
      ['applicant', 403, 403],
    ] as const) {
      await request(app.getHttpServer())
        .get(`${base}/review-queue`)
        .set('x-test-actor', actor)
        .expect(queueStatus);
      await request(app.getHttpServer())
        .get(`${base}/${contentId}/approvals`)
        .set('x-test-actor', actor)
        .expect(historyStatus);
    }
    await request(app.getHttpServer())
      .get(`${base}/review-queue?status=SUBMITTED`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${base}/${contentId}/approvals?schoolId=${schoolId}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${base}/review-queue?page=1.5`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${base}/review-queue?limit=101`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${base}/${contentId}/approvals?limit=0`)
      .expect(400);
    services.approvalHistory.execute.mockRejectedValueOnce(
      new NotFoundDomainException('Academic content not found'),
    );
    await request(app.getHttpServer())
      .get(`${base}/${contentId}/approvals`)
      .expect(404);
  });

  it.each([
    [120, 200],
    [121, 400],
  ])('bounds review queue search at %i characters', async (length, status) => {
    const search = 's'.repeat(length);
    await request(app.getHttpServer())
      .get(`${base}/review-queue`)
      .set('x-test-actor', 'approveOnly')
      .query({ search })
      .expect(status);
    if (status === 200)
      expect(services.reviewQueue.execute).toHaveBeenCalledWith({ search });
    else expect(services.reviewQueue.execute).not.toHaveBeenCalled();
    expect(services.detail.execute).not.toHaveBeenCalled();
  });

  it('allows School and Organization managers and presents a safe draft', async () => {
    const dto = {
      academicYearId: content.academicYearId,
      termId: content.termId,
      type: content.type,
      audience: content.audience,
      title: ' Resource ',
    };
    const created = await request(app.getHttpServer())
      .post(base)
      .send(dto)
      .expect(201);
    expect(created.body).toMatchObject({
      id: contentId,
      status: 'DRAFT',
      title: 'Resource',
    });
    expect(created.body).not.toHaveProperty('schoolId');
    expect(created.body).not.toHaveProperty('deletedAt');
    expect(services.create.execute).toHaveBeenCalledWith(dto);
    await request(app.getHttpServer())
      .get(base)
      .set('x-test-actor', 'organization')
      .expect(200);
    expect(services.list.execute).toHaveBeenCalled();
  });

  it.each(['status', 'schoolId', 'createdByUserId', 'unknown'])(
    'rejects unowned create field %s',
    async (field) => {
      await request(app.getHttpServer())
        .post(base)
        .send({
          academicYearId: content.academicYearId,
          termId: content.termId,
          type: content.type,
          audience: content.audience,
          title: 'Resource',
          [field]: 'injected',
        })
        .expect(400);
      expect(services.create.execute).not.toHaveBeenCalled();
    },
  );

  it('applies view and management permissions and blocks app actors even when granted permissions', async () => {
    await request(app.getHttpServer())
      .get(base)
      .set('x-test-actor', 'missing')
      .expect(403);
    await request(app.getHttpServer())
      .post(base)
      .set('x-test-actor', 'missing')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .set('x-test-actor', 'missing')
      .send({ imagesEnabled: false })
      .expect(403);
    for (const actor of ['teacher', 'student', 'parent', 'applicant']) {
      await request(app.getHttpServer())
        .get(base)
        .set('x-test-actor', actor)
        .expect(403);
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/targets`)
        .set('x-test-actor', actor)
        .send({ targets: [] })
        .expect(403);
      await request(app.getHttpServer())
        .post(`${base}/${contentId}/uploads`)
        .set('x-test-actor', actor)
        .send({})
        .expect(403);
    }
  });

  it('keeps view, manage, and settings permissions separate at HTTP', async () => {
    await request(app.getHttpServer())
      .get(base)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/settings/file-policy`)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    await request(app.getHttpServer())
      .post(base)
      .set('x-test-actor', 'viewOnly')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .set('x-test-actor', 'viewOnly')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .get(base)
      .set('x-test-actor', 'manageOnly')
      .expect(403);
    await request(app.getHttpServer())
      .post(base)
      .set('x-test-actor', 'manageOnly')
      .send({
        academicYearId: content.academicYearId,
        termId: content.termId,
        type: content.type,
        audience: content.audience,
        title: content.title,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .set('x-test-actor', 'manageOnly')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .set('x-test-actor', 'settingsOnly')
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/settings/file-policy`)
      .set('x-test-actor', 'settingsOnly')
      .expect(403);
    await request(app.getHttpServer())
      .post(base)
      .set('x-test-actor', 'settingsOnly')
      .send({})
      .expect(403);
  });

  it('guards static notification policy routes, strict DTOs and safe Swagger fields', async () => {
    const path = `${base}/settings/notification-policy`;
    const response = await request(app.getHttpServer())
      .get(path)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    expect(response.body).toEqual(effectiveAcademicContentNotificationPolicy());
    await request(app.getHttpServer())
      .get(path)
      .set('x-test-actor', 'settingsOnly')
      .expect(403);
    for (const actor of [
      'viewOnly',
      'manageOnly',
      'publishOnly',
      'approveOnly',
    ])
      await request(app.getHttpServer())
        .patch(path)
        .set('x-test-actor', actor)
        .send({ notificationsEnabled: false })
        .expect(403);
    await request(app.getHttpServer())
      .patch(path)
      .set('x-test-actor', 'settingsOnly')
      .send({
        notificationsEnabled: false,
        onlineSessionReminderOffsetsMinutes: [1440, 5, 60],
      })
      .expect(200);
    expect(services.updateNotificationPolicy.execute).toHaveBeenCalledWith({
      notificationsEnabled: false,
      onlineSessionReminderOffsetsMinutes: [1440, 5, 60],
    });
    for (const actor of [
      'teacher',
      'student',
      'parent',
      'applicant',
      'service',
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .set('x-test-actor', actor)
        .expect(403);
      await request(app.getHttpServer())
        .patch(path)
        .set('x-test-actor', actor)
        .send({ notificationsEnabled: false })
        .expect(403);
    }
    for (const body of [
      { notificationsEnabled: null },
      { notificationsEnabled: 'false' },
      { notificationsEnabled: 0 },
      { notificationsEnabled: false, schoolId },
      { notificationsEnabled: false, id: actorId },
      { onlineSessionReminderOffsetsMinutes: null },
      { onlineSessionReminderOffsetsMinutes: [60, 60] },
      { onlineSessionReminderOffsetsMinutes: [4] },
      { onlineSessionReminderOffsetsMinutes: [10081] },
      { onlineSessionReminderOffsetsMinutes: [60.5] },
      { onlineSessionReminderOffsetsMinutes: ['60'] },
      { onlineSessionReminderOffsetsMinutes: [5, 6, 7, 8, 9, 10] },
    ])
      await request(app.getHttpServer())
        .patch(path)
        .set('x-test-actor', 'settingsOnly')
        .send(body)
        .expect(400);
    await request(app.getHttpServer())
      .patch(path)
      .set('x-test-actor', 'settingsOnly')
      .send({})
      .expect(400);
    expect(services.detail.execute).not.toHaveBeenCalled();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = document.components!.schemas!;
    for (const name of [
      'AcademicContentNotificationPolicyResponseDto',
      'UpdateAcademicContentNotificationPolicyDto',
    ]) {
      const schema = schemas[name] as {
        properties: Record<string, unknown>;
        required?: string[];
      };
      expect(Object.keys(schema.properties).sort()).toEqual(
        Object.keys(effectiveAcademicContentNotificationPolicy()).sort(),
      );
      expect(
        schema.properties.onlineSessionReminderOffsetsMinutes,
      ).toMatchObject({
        type: 'array',
        maxItems: 5,
        uniqueItems: true,
        items: { type: 'integer', minimum: 5, maximum: 10080 },
      });
      if (name.startsWith('Update')) expect(schema.required ?? []).toEqual([]);
    }
  });

  it('guards the workflow policy routes and accepts only a boolean setting', async () => {
    const path = `${base}/settings/workflow-policy`;
    const response = await request(app.getHttpServer())
      .get(path)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    expect(response.body).toEqual({ preparationApprovalRequired: false });
    await request(app.getHttpServer())
      .patch(path)
      .set('x-test-actor', 'viewOnly')
      .send({ preparationApprovalRequired: true })
      .expect(403);
    await request(app.getHttpServer())
      .patch(path)
      .set('x-test-actor', 'manageOnly')
      .send({ preparationApprovalRequired: true })
      .expect(403);
    await request(app.getHttpServer())
      .get(path)
      .set('x-test-actor', 'settingsOnly')
      .expect(403);
    await request(app.getHttpServer())
      .patch(path)
      .set('x-test-actor', 'settingsOnly')
      .send({ preparationApprovalRequired: true })
      .expect(200);
    expect(services.updateWorkflowPolicy.execute).toHaveBeenCalledWith({
      preparationApprovalRequired: true,
    });
    for (const actor of ['teacher', 'student', 'parent', 'applicant']) {
      await request(app.getHttpServer())
        .get(path)
        .set('x-test-actor', actor)
        .expect(403);
      await request(app.getHttpServer())
        .patch(path)
        .set('x-test-actor', actor)
        .send({ preparationApprovalRequired: true })
        .expect(403);
    }
    for (const body of [
      { preparationApprovalRequired: 'true' },
      { preparationApprovalRequired: 1 },
      { preparationApprovalRequired: true, schoolId },
      { preparationApprovalRequired: true, publication: true },
    ])
      await request(app.getHttpServer()).patch(path).send(body).expect(400);
    expect(services.detail.execute).not.toHaveBeenCalled();
  });

  it('separates submit and review permissions on the three workflow routes', async () => {
    const submitPath = `${base}/${contentId}/submit`;
    const approvePath = `${base}/${contentId}/approve`;
    const changesPath = `${base}/${contentId}/request-changes`;
    for (const actor of ['viewOnly', 'settingsOnly']) {
      await request(app.getHttpServer())
        .post(submitPath)
        .set('x-test-actor', actor)
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post(approvePath)
        .set('x-test-actor', actor)
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post(changesPath)
        .set('x-test-actor', actor)
        .send({ note: 'Revise' })
        .expect(403);
    }
    await request(app.getHttpServer())
      .post(submitPath)
      .set('x-test-actor', 'manageOnly')
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .post(approvePath)
      .set('x-test-actor', 'manageOnly')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(changesPath)
      .set('x-test-actor', 'manageOnly')
      .send({ note: 'Revise' })
      .expect(403);
    await request(app.getHttpServer())
      .post(submitPath)
      .set('x-test-actor', 'approveOnly')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(approvePath)
      .set('x-test-actor', 'approveOnly')
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .post(approvePath)
      .set('x-test-actor', 'organization')
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .post(changesPath)
      .set('x-test-actor', 'approveOnly')
      .send({ note: 'Revise' })
      .expect(200);
    expect(services.submit.execute).toHaveBeenCalledWith(contentId, {});
    expect(services.approve.execute).toHaveBeenCalledWith(contentId, {});
    expect(services.requestChanges.execute).toHaveBeenCalledWith(contentId, {
      note: 'Revise',
    });
    for (const actor of ['teacher', 'student', 'parent', 'applicant']) {
      await request(app.getHttpServer())
        .post(submitPath)
        .set('x-test-actor', actor)
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post(approvePath)
        .set('x-test-actor', actor)
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post(changesPath)
        .set('x-test-actor', actor)
        .send({ note: 'Revise' })
        .expect(403);
    }
    await request(app.getHttpServer()).post(changesPath).send({}).expect(400);
    await request(app.getHttpServer())
      .post(changesPath)
      .send({ note: 'Revise', schoolId })
      .expect(400);
    await request(app.getHttpServer())
      .post(changesPath)
      .send({ note: 7 })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/bad/submit`)
      .send({})
      .expect(400);
  });

  it.each([
    ['submit', 'manageOnly', services.submit.execute],
    ['approve', 'approveOnly', services.approve.execute],
  ] as const)(
    'accepts an empty object or omitted %s body',
    async (action, actor, execute) => {
      const path = `${base}/${contentId}/${action}`;
      await request(app.getHttpServer())
        .post(path)
        .set('x-test-actor', actor)
        .send({})
        .expect(200);
      await request(app.getHttpServer())
        .post(path)
        .set('x-test-actor', actor)
        .expect(200);
      expect(execute).toHaveBeenCalledTimes(2);
      expect(execute).toHaveBeenNthCalledWith(1, contentId, {});
      expect(execute).toHaveBeenNthCalledWith(2, contentId, {});
    },
  );

  it.each([
    ['schoolId', schoolId],
    ['note', 'Injected note'],
    ['publication', true],
  ])(
    'rejects injected %s on submit and approve before the use case',
    async (field, value) => {
      for (const [action, actor] of [
        ['submit', 'manageOnly'],
        ['approve', 'approveOnly'],
      ]) {
        await request(app.getHttpServer())
          .post(`${base}/${contentId}/${action}`)
          .set('x-test-actor', actor)
          .send({ [field]: value })
          .expect(400);
      }
      expect(services.submit.execute).not.toHaveBeenCalled();
      expect(services.approve.execute).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing', {}],
    ['non-string', { note: 7 }],
    ['unknown field', { note: 'Revise', schoolId }],
    ['oversized', { note: 'n'.repeat(4001) }],
  ])(
    'rejects a %s request-changes note before the use case',
    async (_label, body) => {
      await request(app.getHttpServer())
        .post(`${base}/${contentId}/request-changes`)
        .set('x-test-actor', 'approveOnly')
        .send(body)
        .expect(400);
      expect(services.requestChanges.execute).not.toHaveBeenCalled();
    },
  );

  it('accepts a request-changes note at the 4000-character transport bound', async () => {
    const body = { note: 'n'.repeat(4000) };
    await request(app.getHttpServer())
      .post(`${base}/${contentId}/request-changes`)
      .set('x-test-actor', 'approveOnly')
      .send(body)
      .expect(200);
    expect(services.requestChanges.execute).toHaveBeenCalledWith(
      contentId,
      body,
    );
  });

  it.each([
    [
      'submit',
      'post',
      `${base}/not-a-uuid/submit`,
      {},
      services.submit.execute,
    ],
    [
      'approve',
      'post',
      `${base}/not-a-uuid/approve`,
      {},
      services.approve.execute,
    ],
    [
      'request-changes',
      'post',
      `${base}/not-a-uuid/request-changes`,
      { note: 'Revise' },
      services.requestChanges.execute,
    ],
    [
      'approvals',
      'get',
      `${base}/not-a-uuid/approvals`,
      undefined,
      services.approvalHistory.execute,
    ],
    [
      'template detail',
      'get',
      `${base}/templates/preparation/not-a-uuid`,
      undefined,
      services.templates.detail,
    ],
    [
      'template update',
      'patch',
      `${base}/templates/preparation/not-a-uuid`,
      { name: 'Preset' },
      services.templates.update,
    ],
    [
      'template delete',
      'delete',
      `${base}/templates/preparation/not-a-uuid`,
      undefined,
      services.templates.delete,
    ],
  ] as const)(
    'rejects malformed %s IDs before the use case',
    async (_label, method, path, body, execute) => {
      const call = request(app.getHttpServer())[method](path);
      if (body) call.send(body);
      await call.expect(400);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('delegates all five typed PUT routes to ACC-5B and presents only authoring state', async () => {
    const cases = [
      [
        'preparation',
        'replacePreparation',
        {
          objectives: [],
          learningOutcomes: [],
          teachingStrategies: [],
          activities: [],
        },
      ],
      [
        'weekly-plan',
        'replaceWeeklyPlan',
        {
          weekStartDate: '2028-09-10',
          weekEndDate: '2028-09-16',
          objectives: [],
          topics: [],
          homeworkAssignmentIds: [],
          gradeAssessmentIds: [],
        },
      ],
      [
        'guardian-note',
        'replaceGuardianNote',
        {
          body: 'Notice',
          priority: AcademicGuardianNotePriority.NORMAL,
          requiresAcknowledgement: false,
        },
      ],
      [
        'subject-resource',
        'replaceSubjectResource',
        { resourceCategory: AcademicSubjectResourceCategory.WORKSHEET },
      ],
      [
        'online-session',
        'replaceOnlineSession',
        {
          platform: AcademicOnlineSessionPlatform.ZOOM,
          joinUrl: 'https://example.test/meeting',
          startAt: '2028-09-10T10:00:00Z',
          endAt: '2028-09-10T11:00:00Z',
          timezone: 'Africa/Cairo',
        },
      ],
    ] as const;
    for (const [route, method, body] of cases) {
      const response = await request(app.getHttpServer())
        .put(`${base}/${contentId}/details/${route}`)
        .send(body)
        .expect(200);
      expect(services.typeDetails[method]).toHaveBeenCalledWith(
        contentId,
        body,
      );
      expect(response.body).not.toHaveProperty('changed');
      expect(JSON.stringify(response.body)).not.toMatch(
        /schoolId|createdBy|updatedBy|audit|contentType/,
      );
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/details/${route}`)
        .send({ ...body, schoolId })
        .expect(400);
      await request(app.getHttpServer())
        .put(`${base}/bad/details/${route}`)
        .send(body)
        .expect(400);
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/details/${route}`)
        .set('x-test-actor', 'viewOnly')
        .send(body)
        .expect(403);
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/details/${route}`)
        .set('x-test-actor', 'manageOnly')
        .send(body)
        .expect(200);
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/details/${route}`)
        .set('x-test-actor', 'organization')
        .send(body)
        .expect(200);
      for (const actor of ['teacher', 'student', 'parent', 'applicant']) {
        await request(app.getHttpServer())
          .put(`${base}/${contentId}/details/${route}`)
          .set('x-test-actor', actor)
          .send(body)
          .expect(403);
      }
    }
    await request(app.getHttpServer())
      .put(`${base}/${contentId}/details/general-resource`)
      .send({})
      .expect(404);
  });

  it('keeps readiness view-only, scoped, and read-only at HTTP', async () => {
    const response = await request(app.getHttpServer())
      .get(`${base}/${contentId}/readiness`)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    expect(response.body).toEqual({ canAdvance: true, blockingReasons: [] });
    expect(services.readiness.execute).toHaveBeenCalledWith(contentId);
    await request(app.getHttpServer())
      .get(`${base}/${contentId}/readiness`)
      .set('x-test-actor', 'organization')
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/${contentId}`)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/${contentId}/readiness`)
      .set('x-test-actor', 'manageOnly')
      .expect(403);
    await request(app.getHttpServer())
      .get(`${base}/${contentId}`)
      .set('x-test-actor', 'manageOnly')
      .expect(403);
    for (const actor of ['teacher', 'student', 'parent', 'applicant']) {
      await request(app.getHttpServer())
        .get(`${base}/${contentId}/readiness`)
        .set('x-test-actor', actor)
        .expect(403);
    }
    await request(app.getHttpServer()).get(`${base}/bad/readiness`).expect(400);
    services.readiness.execute.mockRejectedValueOnce(
      new NotFoundDomainException('Academic content not found'),
    );
    await request(app.getHttpServer())
      .get(`${base}/${randomUUID()}/readiness`)
      .expect(404);
  });

  it('preserves ACC-5B Online Session semantic validation through HTTP', async () => {
    const unitOfWork = { mutate: jest.fn() };
    const core = new AcademicContentTypeDetailUseCases(unitOfWork);
    services.typeDetails.replaceOnlineSession.mockImplementation(
      (
        id: string,
        dto: Parameters<
          AcademicContentTypeDetailUseCases['replaceOnlineSession']
        >[1],
      ) => core.replaceOnlineSession(id, dto),
    );
    const valid = {
      platform: AcademicOnlineSessionPlatform.ZOOM,
      joinUrl: 'https://example.test/meeting',
      startAt: '2028-09-10T10:00:00Z',
      endAt: '2028-09-10T11:00:00Z',
      timezone: 'Africa/Cairo',
    };
    for (const body of [
      { ...valid, joinUrl: 'http://example.test/meeting' },
      { ...valid, joinUrl: 'https://user:secret@example.test/meeting' },
      { ...valid, endAt: valid.startAt },
      { ...valid, timezone: 'Not/A_Timezone' },
    ]) {
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/details/online-session`)
        .send(body)
        .expect(400);
    }
    expect(unitOfWork.mutate).not.toHaveBeenCalled();
  });

  it('presents each current management detail without persistence internals', async () => {
    const preparation = {
      id: randomUUID(),
      schoolId,
      contentType: AcademicContentType.TEACHER_PREPARATION,
      topic: 'Fractions',
      objectives: ['Understand fractions'],
      learningOutcomes: [],
      teachingStrategies: [],
      activities: [],
      resourceNotes: null,
      assessmentNotes: null,
      teacherNotes: null,
      curriculumId: null,
      curriculumUnitId: null,
      curriculumLessonId: null,
      lessonPlanId: null,
      lessonPlanItemId: null,
      timetableEntryId: null,
    };
    const weekly = {
      id: randomUUID(),
      schoolId,
      contentType: AcademicContentType.WEEKLY_PLAN,
      weekStartDate: new Date('2028-09-10T00:00:00Z'),
      weekEndDate: new Date('2028-09-16T00:00:00Z'),
      objectives: ['A', 'B'],
      topics: ['X'],
      expectedHomework: null,
      upcomingAssessments: null,
      notes: null,
      homeworkReferences: [
        { id: randomUUID(), homeworkAssignmentId: randomUUID() },
      ],
      assessmentReferences: [
        { id: randomUUID(), gradeAssessmentId: randomUUID() },
      ],
    };
    const note = {
      id: randomUUID(),
      schoolId,
      body: 'Notice',
      priority: AcademicGuardianNotePriority.NORMAL,
      requiresAcknowledgement: true,
    };
    const resource = {
      id: randomUUID(),
      schoolId,
      resourceCategory: AcademicSubjectResourceCategory.WORKSHEET,
      curriculumId: null,
      curriculumUnitId: null,
      curriculumLessonId: null,
    };
    const online = {
      id: randomUUID(),
      schoolId,
      platform: AcademicOnlineSessionPlatform.ZOOM,
      providerName: null,
      joinUrl: 'https://example.test/private',
      accessCode: 'private-code',
      instructions: null,
      startAt: new Date('2028-09-10T10:00:00Z'),
      endAt: new Date('2028-09-10T11:00:00Z'),
      timezone: 'Africa/Cairo',
      timetableEntryId: null,
    };
    const cases = [
      [
        AcademicContentType.TEACHER_PREPARATION,
        'preparationDetail',
        preparation,
        { topic: 'Fractions', objectives: ['Understand fractions'] },
      ],
      [
        AcademicContentType.WEEKLY_PLAN,
        'weeklyPlanDetail',
        weekly,
        {
          weekStartDate: '2028-09-10',
          weekEndDate: '2028-09-16',
          objectives: ['A', 'B'],
          homeworkAssignmentIds: [
            weekly.homeworkReferences[0].homeworkAssignmentId,
          ],
          gradeAssessmentIds: [
            weekly.assessmentReferences[0].gradeAssessmentId,
          ],
        },
      ],
      [
        AcademicContentType.GUARDIAN_WEEKLY_NOTE,
        'guardianNoteDetail',
        note,
        { body: 'Notice', requiresAcknowledgement: true },
      ],
      [
        AcademicContentType.SUBJECT_RESOURCE,
        'subjectResourceDetail',
        resource,
        { resourceCategory: AcademicSubjectResourceCategory.WORKSHEET },
      ],
      [
        AcademicContentType.ONLINE_SESSION,
        'onlineSessionDetail',
        online,
        {
          joinUrl: 'https://example.test/private',
          accessCode: 'private-code',
          startAt: '2028-09-10T10:00:00.000Z',
        },
      ],
    ] as const;
    for (const [type, relation, detail, expected] of cases) {
      services.detail.execute.mockResolvedValueOnce({
        ...content,
        type,
        targets: [],
        assets: [],
        links: [],
        tags: [],
        publications: [],
        [relation]: detail,
      });
      const response = await request(app.getHttpServer())
        .get(`${base}/${contentId}`)
        .expect(200);
      const body = response.body as { details: unknown };
      expect(body.details).toMatchObject(expected);
      expect(JSON.stringify(body.details)).not.toMatch(
        /schoolId|contentType|createdBy|updatedBy|homeworkReferences|assessmentReferences|"id"/,
      );
    }
    services.detail.execute.mockResolvedValueOnce({
      ...content,
      type: AcademicContentType.TEACHER_PREPARATION,
      targets: [],
      assets: [],
      links: [],
      tags: [],
      preparationDetail: null,
      publications: [],
    });
    const missing = await request(app.getHttpServer())
      .get(`${base}/${contentId}`)
      .expect(200);
    expect((missing.body as { details: unknown }).details).toBeNull();
    const general = await request(app.getHttpServer())
      .get(`${base}/${contentId}`)
      .expect(200);
    expect((general.body as { details: unknown }).details).toBeNull();
  });

  it('lists bounded inventory, gives safe detail, and hides foreign School content', async () => {
    const list = await request(app.getHttpServer())
      .get(`${base}?page=1&limit=100`)
      .expect(200);
    expect(list.body).toMatchObject({ page: 1, limit: 50, total: 1 });
    expect(
      (list.body as { items: Record<string, unknown>[] }).items[0],
    ).not.toHaveProperty('schoolId');
    await request(app.getHttpServer()).get(`${base}?limit=101`).expect(400);
    const detail = await request(app.getHttpServer())
      .get(`${base}/${contentId}`)
      .expect(200);
    expect(detail.headers['cache-control']).toBe(
      'no-store, private, max-age=0',
    );
    const detailBody = detail.body as {
      targets: Record<string, unknown>[];
      assets: Record<string, unknown>[];
    };
    expect(detailBody.targets[0]).not.toHaveProperty('identityFingerprint');
    expect(detailBody.assets[0]).toMatchObject({
      sizeBytes: '123',
      originalName: 'lesson.pdf',
    });
    expect(JSON.stringify(detail.body)).not.toMatch(
      /bucket|objectKey|deletedAt/,
    );
    services.detail.execute.mockRejectedValueOnce(
      new NotFoundDomainException('Academic content not found'),
    );
    await request(app.getHttpServer())
      .get(`${base}/${randomUUID()}`)
      .expect(404);
  });

  it('accepts the Library query contract on the existing management collection', async () => {
    const filters = {
      academicYearId: randomUUID(),
      termId: randomUUID(),
      type: AcademicContentType.GENERAL_RESOURCE,
      status: AcademicContentStatus.ARCHIVED,
      audience: AcademicContentAudienceType.STUDENTS,
      stageId: randomUUID(),
      gradeId: randomUUID(),
      sectionId: randomUUID(),
      classroomId: randomUUID(),
      subjectId: randomUUID(),
      teacherUserId: randomUUID(),
      resourceCategory: AcademicSubjectResourceCategory.WORKSHEET,
      weeklyDateFrom: '2028-09-10',
      weeklyDateTo: '2028-09-16',
      sessionStartAtFrom: '2028-09-10T10:00:00Z',
      sessionStartAtTo: '2028-09-10T11:00:00Z',
      sessionPlatform: AcademicOnlineSessionPlatform.ZOOM,
      guardianPriority: AcademicGuardianNotePriority.URGENT,
      tag: 'x'.repeat(80),
      search: 'y'.repeat(120),
      page: 2,
      limit: 100,
    };
    await request(app.getHttpServer()).get(base).query(filters).expect(200);
    expect(services.list.execute).toHaveBeenCalledWith(filters);
    await request(app.getHttpServer())
      .get(base)
      .set('x-test-actor', 'organization')
      .query({ gradeId: randomUUID() })
      .expect(200);
  });

  it('presents only the Online Session Library summary from selected fields', async () => {
    services.list.execute.mockResolvedValueOnce({
      items: [
        {
          ...content,
          type: AcademicContentType.ONLINE_SESSION,
          onlineSessionDetail: {
            platform: AcademicOnlineSessionPlatform.ZOOM,
            startAt: now,
            endAt: new Date(now.getTime() + 3_600_000),
            joinUrl: 'https://provider.example/private',
            accessCode: 'private-code',
            instructions: 'private instructions',
          },
        },
      ],
      page: 1,
      limit: 50,
      total: 1,
    });
    const response = await request(app.getHttpServer()).get(base).expect(200);
    const body = response.body as { items: Array<{ summary: unknown }> };
    expect(body.items[0].summary).toEqual({
      type: AcademicContentType.ONLINE_SESSION,
      platform: AcademicOnlineSessionPlatform.ZOOM,
      startAt: now.toISOString(),
      endAt: new Date(now.getTime() + 3_600_000).toISOString(),
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /joinUrl|accessCode|instructions|private-code|schoolId/u,
    );
  });

  it.each([
    ['academicYearId', 'not-a-uuid'],
    ['termId', 'not-a-uuid'],
    ['stageId', 'not-a-uuid'],
    ['gradeId', 'not-a-uuid'],
    ['sectionId', 'not-a-uuid'],
    ['classroomId', 'not-a-uuid'],
    ['subjectId', 'not-a-uuid'],
    ['teacherUserId', 'not-a-uuid'],
    ['type', 'NOT_A_TYPE'],
    ['status', 'NOT_A_STATUS'],
    ['audience', 'NOT_AN_AUDIENCE'],
    ['resourceCategory', 'NOT_A_CATEGORY'],
    ['weeklyDateFrom', '2028/09/10'],
    ['weeklyDateTo', 'not-a-date'],
    ['sessionStartAtFrom', 'not-a-time'],
    ['sessionStartAtTo', '2028-02-30T10:00:00Z'],
    ['sessionPlatform', 'NOT_A_PLATFORM'],
    ['guardianPriority', 'NOT_A_PRIORITY'],
    ['search', 'x'.repeat(121)],
    ['tag', 'x'.repeat(81)],
    ['page', '0'],
    ['limit', '0'],
    ['limit', '101'],
    ['schoolId', randomUUID()],
    ['createdByUserId', randomUUID()],
    ['week', '1'],
    ['date', '2030-01-01'],
    ['priority', 'URGENT'],
    ['platform', 'ZOOM'],
    ['category', 'WORKSHEET'],
    ['requiresAcknowledgement', 'true'],
    ['unknown', 'x'],
  ])('rejects invalid or unowned Library query %s', async (field, value) => {
    await request(app.getHttpServer())
      .get(base)
      .query({ [field]: value })
      .expect(400);
    expect(services.list.execute).not.toHaveBeenCalled();
  });

  it('delegates lifecycle and targets while rejecting immutable and malformed fields', async () => {
    await request(app.getHttpServer())
      .patch(`${base}/${contentId}`)
      .send({ title: 'Changed' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${base}/${contentId}`)
      .send({ type: content.type })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/${contentId}/archive`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`${base}/${contentId}/restore`)
      .expect(200);
    const deleted = await request(app.getHttpServer())
      .delete(`${base}/${contentId}`)
      .expect(200);
    expect(deleted.body).toEqual({ ok: true });
    const replaced = await request(app.getHttpServer())
      .put(`${base}/${contentId}/targets`)
      .send({ targets: [{ scopeType: 'SCHOOL' }] })
      .expect(200);
    expect(
      (replaced.body as { targets: Record<string, unknown>[] }).targets[0],
    ).not.toHaveProperty('identityFingerprint');
    await request(app.getHttpServer())
      .put(`${base}/${contentId}/targets`)
      .send({ targets: [{ scopeType: 'GRADE', gradeId: 'bad' }] })
      .expect(400);
    await request(app.getHttpServer()).get(`${base}/not-a-uuid`).expect(400);
  });

  it('returns one no-store capability and rejects origin and storage coordinates from body', async () => {
    const dto = {
      clientRequestId: randomUUID(),
      originalName: 'lesson.pdf',
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: '123',
    };
    const intent = await request(app.getHttpServer())
      .post(`${base}/${contentId}/uploads`)
      .send(dto)
      .expect(201);
    expect(intent.headers['cache-control']).toContain('no-store');
    expect(intent.body).toMatchObject({
      uploadId,
      sessionUrl: secret,
      expectedSizeBytes: '123',
    });
    expect(JSON.stringify(intent.body)).not.toMatch(/bucket|objectKey/);
    expect(services.uploadIntent.execute).toHaveBeenCalledWith({
      contentId,
      ...dto,
    });
    for (const field of ['trustedOrigin', 'schoolId', 'bucket', 'objectKey']) {
      await request(app.getHttpServer())
        .post(`${base}/${contentId}/uploads`)
        .send({ ...dto, [field]: 'injected' })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post(`${base}/${contentId}/uploads`)
      .send({ ...dto, expectedSizeBytes: 123 })
      .expect(400);
    expect(services.uploadIntent.execute).toHaveBeenCalledTimes(1);
  });

  it('presents completion, cancellation, and unlink without persistence internals', async () => {
    const completed = await request(app.getHttpServer())
      .post(`${base}/${contentId}/uploads/${uploadId}/complete`)
      .expect(200);
    expect(
      (completed.body as { file: { sizeBytes: string } }).file.sizeBytes,
    ).toBe('123');
    expect(JSON.stringify(completed.body)).not.toMatch(
      /bucket|objectKey|checksum/,
    );
    const cancelled = await request(app.getHttpServer())
      .post(`${base}/${contentId}/uploads/${uploadId}/cancel`)
      .expect(200);
    expect(cancelled.body).toEqual({
      uploadId,
      status: 'CANCELLED',
      cancelledAt: now.toISOString(),
    });
    const unlinked = await request(app.getHttpServer())
      .delete(`${base}/${contentId}/assets/${assetId}`)
      .expect(200);
    expect(unlinked.body).toEqual({ ok: true, assetId });
    expect(services.uploadComplete.execute).toHaveBeenCalledWith({
      contentId,
      uploadId,
    });
    expect(services.uploadCancel.execute).toHaveBeenCalledWith({
      contentId,
      uploadId,
    });
    await request(app.getHttpServer())
      .post(`${base}/${contentId}/uploads/not-a-uuid/complete`)
      .expect(400);
  });

  it('resolves settings/file-policy before dynamic content detail and keeps BigInt safe', async () => {
    const read = await request(app.getHttpServer())
      .get(`${base}/settings/file-policy`)
      .expect(200);
    expect(
      (read.body as { maximumFileSizeBytes: string }).maximumFileSizeBytes,
    ).toBe('536870912');
    expect(services.detail.execute).not.toHaveBeenCalled();
    const changed = await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .send({ maximumFileSizeBytes: '10737418240' })
      .expect(200);
    expect(
      (changed.body as { maximumFileSizeBytes: string }).maximumFileSizeBytes,
    ).toBe('536870912');
    expect(services.updatePolicy.execute).toHaveBeenCalledWith({
      maximumFileSizeBytes: '10737418240',
    });
    await request(app.getHttpServer())
      .patch(`${base}/settings/file-policy`)
      .send({ schoolId })
      .expect(400);
    for (const maximumFileSizeBytes of ['0', '-1', '1.5', 'not-decimal', 100]) {
      await request(app.getHttpServer())
        .patch(`${base}/settings/file-policy`)
        .send({ maximumFileSizeBytes })
        .expect(400);
    }
  });

  it('validates ordered link and tag replacement bodies and presents safe values', async () => {
    const links = await request(app.getHttpServer())
      .put(`${base}/${contentId}/links`)
      .send({
        links: [{ label: 'Reference', url: 'https://example.test/ref' }],
      })
      .expect(200);
    expect(links.body).toEqual({ links: [link] });
    expect(services.links.execute).toHaveBeenCalledWith(contentId, [
      { label: 'Reference', url: 'https://example.test/ref' },
    ]);
    const tags = await request(app.getHttpServer())
      .put(`${base}/${contentId}/tags`)
      .send({ tags: [{ value: 'Algebra' }] })
      .expect(200);
    expect(tags.body).toEqual({
      tags: [{ id: tag.id, value: 'Algebra', sortOrder: 0 }],
    });
    for (const [route, body] of [
      [
        'links',
        {
          links: [
            { label: 'Reference', url: 'https://example.test', schoolId },
          ],
        },
      ],
      [
        'links',
        {
          links: [
            { label: 'Reference', url: 'https://example.test', sortOrder: 9 },
          ],
        },
      ],
      ['tags', { tags: [{ value: 'Algebra', normalizedValue: 'algebra' }] }],
      ['tags', { tags: [{ value: 'Algebra', id: randomUUID() }] }],
    ] as const) {
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/${route}`)
        .send(body)
        .expect(400);
    }
    await request(app.getHttpServer())
      .put(`${base}/bad/links`)
      .send({ links: [] })
      .expect(400);
    await request(app.getHttpServer())
      .put(`${base}/bad/tags`)
      .send({ tags: [] })
      .expect(400);
    for (const actor of [
      'viewOnly',
      'teacher',
      'student',
      'parent',
      'applicant',
      'missing',
    ]) {
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/links`)
        .set('x-test-actor', actor)
        .send({ links: [] })
        .expect(403);
      await request(app.getHttpServer())
        .put(`${base}/${contentId}/tags`)
        .set('x-test-actor', actor)
        .send({ tags: [] })
        .expect(403);
    }
  });

  it('exposes read-only revision history with view permission and safe BigInt output', async () => {
    const list = await request(app.getHttpServer())
      .get(`${base}/${contentId}/revisions`)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    const listBody = list.body as { items: Record<string, unknown>[] };
    expect(listBody.items[0]).toMatchObject({
      revisionNumber: 1,
      snapshotContractVersion: 1,
    });
    const detail = await request(app.getHttpServer())
      .get(`${base}/${contentId}/revisions/${revisionId}`)
      .set('x-test-actor', 'organization')
      .expect(200);
    const detailBody = detail.body as {
      assets: Record<string, unknown>[];
      links: Record<string, unknown>[];
      tags: Record<string, unknown>[];
    };
    expect(detailBody.assets[0]).toMatchObject({
      fileId,
      sizeBytes: '123',
      sortOrder: 0,
    });
    expect(detailBody.links[0]).toMatchObject(link);
    expect(detailBody.tags[0]).toMatchObject({ value: 'Algebra' });
    expect(detail.body).toMatchObject({ details: null });
    expect(JSON.stringify(detail.body)).not.toMatch(
      /schoolId|createdByUserId|capturedByUserId|normalizedValue|bucket|objectKey|identityFingerprint|typeSpecificSnapshot/,
    );
    await request(app.getHttpServer())
      .get(`${base}/${contentId}/revisions/${revisionId}`)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/${contentId}/revisions/${revisionId}`)
      .set('x-test-actor', 'school')
      .expect(200);
    for (const actor of [
      'manageOnly',
      'teacher',
      'student',
      'parent',
      'applicant',
      'missing',
    ]) {
      await request(app.getHttpServer())
        .get(`${base}/${contentId}/revisions`)
        .set('x-test-actor', actor)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${base}/${contentId}/revisions/${revisionId}`)
        .set('x-test-actor', actor)
        .expect(403);
    }
    await request(app.getHttpServer()).get(`${base}/bad/revisions`).expect(400);
    await request(app.getHttpServer())
      .get(`${base}/${contentId}/revisions/bad`)
      .expect(400);
    services.revisionDetail.execute.mockRejectedValueOnce(
      new NotFoundDomainException('Academic content revision not found'),
    );
    await request(app.getHttpServer())
      .get(`${base}/${contentId}/revisions/${randomUUID()}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${base}/${contentId}/revisions`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .patch(`${base}/${contentId}/revisions/${revisionId}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .delete(`${base}/${contentId}/revisions/${revisionId}`)
      .expect(404);
  });

  it('presents an authorized V2 Online Session snapshot without exposing raw JSON', async () => {
    services.revisionDetail.execute.mockResolvedValueOnce({
      ...revision,
      snapshotContractVersion: 2,
      type: AcademicContentType.ONLINE_SESSION,
      typeSpecificSnapshot: {
        type: AcademicContentType.ONLINE_SESSION,
        state: {
          platform: AcademicOnlineSessionPlatform.ZOOM,
          providerName: null,
          joinUrl: 'https://example.test/meeting',
          accessCode: 'historical-code',
          instructions: null,
          startAt: '2028-09-10T10:00:00.000Z',
          endAt: '2028-09-10T11:00:00.000Z',
          timezone: 'Africa/Cairo',
          timetableEntryId: null,
          internalExtra: 'must stay private',
        },
      },
    });
    const response = await request(app.getHttpServer())
      .get(`${base}/${contentId}/revisions/${revisionId}`)
      .set('x-test-actor', 'viewOnly')
      .expect(200);
    expect(response.headers['cache-control']).toBe(
      'no-store, private, max-age=0',
    );
    expect(response.body).toMatchObject({
      snapshotContractVersion: 2,
      details: {
        joinUrl: 'https://example.test/meeting',
        accessCode: 'historical-code',
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /typeSpecificSnapshot|internalExtra/,
    );
  });

  it('accepts only bounded pagination on revision history', async () => {
    for (const [query, expected] of [
      [{ page: '1' }, { page: 1 }],
      [{ limit: '100' }, { limit: 100 }],
      [
        { page: '2', limit: '50' },
        { page: 2, limit: 50 },
      ],
    ] as const) {
      await request(app.getHttpServer())
        .get(`${base}/${contentId}/revisions`)
        .query(query)
        .expect(200);
      expect(services.revisionList.execute).toHaveBeenLastCalledWith(
        contentId,
        expected,
      );
    }

    for (const query of [{ page: '0' }, { limit: '101' }]) {
      services.revisionList.execute.mockClear();
      await request(app.getHttpServer())
        .get(`${base}/${contentId}/revisions`)
        .query(query)
        .expect(400);
      expect(services.revisionList.execute).not.toHaveBeenCalled();
    }
  });

  it('rejects Library-only and unknown revision-history filters', async () => {
    const uuid = randomUUID();
    const rejectedQueries = {
      academicYearId: uuid,
      termId: uuid,
      type: AcademicContentType.GENERAL_RESOURCE,
      status: AcademicContentStatus.DRAFT,
      audience: AcademicContentAudienceType.STUDENTS,
      stageId: uuid,
      gradeId: uuid,
      sectionId: uuid,
      classroomId: uuid,
      subjectId: uuid,
      teacherUserId: uuid,
      tag: 'x',
      search: 'test',
      schoolId: uuid,
      createdByUserId: uuid,
      unknown: 'x',
    };
    for (const [field, value] of Object.entries(rejectedQueries)) {
      await request(app.getHttpServer())
        .get(`${base}/${contentId}/revisions`)
        .query({ [field]: value })
        .expect(400);
      expect(services.revisionList.execute).not.toHaveBeenCalled();
    }
  });
});
