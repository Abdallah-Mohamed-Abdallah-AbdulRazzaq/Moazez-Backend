import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentStatus as Status,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as Type,
  FileUploadPurpose,
  FileUploadSessionStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  MODULE_METADATA,
  PATH_METADATA,
  METHOD_METADATA,
} from '@nestjs/common/constants';
import { AppModule } from '../../src/app.module';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { DomainException } from '../../src/common/exceptions/domain-exception';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import type { ObjectStoragePort } from '../../src/infrastructure/storage/object-storage.port';
import type { SignedUrlService } from '../../src/infrastructure/storage/signed-url.service';
import { PERMISSIONS } from '../../src/modules/iam/reference-data/permission-catalog';
import { TEACHER_PERMISSIONS } from '../../src/modules/iam/reference-data/system-role-catalog';
import { TeacherAppModule } from '../../src/modules/teacher-app/teacher-app.module';
import { AcademicContentModule } from '../../src/modules/academics/academic-content/academic-content.module';
import { TeacherLessonPreparationController } from '../../src/modules/teacher-app/lesson-preparation/controller/teacher-lesson-preparation.controller';
import { TeacherAcademicContentAuthoringUseCases } from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases';
import { TeacherAcademicContentFilesUseCases } from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-files.use-cases';
import { TeacherAcademicContentWorkflowPublicationUseCases } from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases';
import { TeacherAcademicContentReadAdapter } from '../../src/modules/teacher-app/academic-content/infrastructure/teacher-academic-content-read.adapter';
import {
  hasTeacherAcademicContentMutableOwnership,
  teacherAcademicContentCapabilities,
} from '../../src/modules/teacher-app/academic-content/domain/teacher-academic-content-ownership.policy';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';
import { AcademicContentTargetRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-target.repository';
import { AcademicContentLinksTagsRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-links-tags.repository';
import { AcademicContentTypeDetailRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-type-detail.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import { AcademicContentWorkflowRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-workflow.repository';
import { AcademicContentPublicationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.repository';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import { AcademicContentFileVerifier } from '../../src/modules/academics/academic-content/files/application/academic-content-file-verifier';
import {
  CompleteAcademicContentUploadUseCase,
  UnlinkAcademicContentAssetUseCase,
} from '../../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases';
import { normalizeAcademicContentTargets } from '../../src/modules/academics/academic-content/domain/academic-content-target.policy';
import { normalizeAcademicContentLinks } from '../../src/modules/academics/academic-content/domain/academic-content-links-tags.policy';
import { normalizeSubjectResource } from '../../src/modules/academics/academic-content/domain/academic-content-type-detail.policy';
import { isAcademicContentExternallyPublishable } from '../../src/modules/academics/academic-content/domain/academic-content-publication.policy';
import {
  CORE_WORKER_ASSIGNED_CONSUMERS,
  MEDIA_WORKER_ASSIGNED_CONSUMERS,
  MAINTENANCE_SCHEDULE_REGISTRATIONS,
  createOperationalRoleManifests,
} from '../../src/modules/health/operational-probe.manifests';
import { COMMUNICATION_ACADEMIC_CONTENT_REVIEW_NOTIFICATION_TYPES } from '../../src/modules/communication/domain/communication-notification-domain';
import {
  COMMUNICATION_APP_NOTIFICATION_CATEGORIES,
  COMMUNICATION_NOTIFICATION_TYPES,
} from '../../src/modules/communication/dto/communication-notification.dto';
import { buildAcademicContentReviewDecisionJobId } from '../../src/modules/communication/domain/communication-notification-generation-domain';

type ModuleType = { prototype: object; name: string };
type ModuleEntry =
  | ModuleType
  | { module: ModuleType; imports?: ModuleEntry[] }
  | { forwardRef: () => ModuleEntry };
function teacherRoutes() {
  const visited = new Set<ModuleType>(),
    controllers = new Set<ModuleType>();
  function visit(entry: ModuleEntry) {
    const module = 'forwardRef' in entry ? entry.forwardRef() : entry;
    const type = 'module' in module ? module.module : (module as ModuleType);
    if (visited.has(type)) return;
    visited.add(type);
    for (const controller of (Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      type,
    ) as ModuleType[]) ?? [])
      controllers.add(controller);
    for (const imported of (Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      type,
    ) as ModuleEntry[]) ?? [])
      visit(imported);
    if ('imports' in module)
      for (const imported of module.imports ?? []) visit(imported);
  }
  visit(AppModule);
  const routes: Array<{
    controller: string;
    handler: string;
    prefix: string;
    path: string;
    permissions: string[];
  }> = [];
  for (const controller of controllers) {
    const prefixes = [
      Reflect.getMetadata(PATH_METADATA, controller) as string | string[],
    ]
      .flat()
      .filter(
        (prefix) => prefix === 'teacher' || prefix?.startsWith('teacher/'),
      );
    for (const prefix of prefixes)
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[name];
        if (
          typeof handler !== 'function' ||
          Reflect.getMetadata(METHOD_METADATA, handler) === undefined
        )
          continue;
        for (const path of [
          Reflect.getMetadata(PATH_METADATA, handler) as string | string[],
        ].flat())
          routes.push({
            controller: controller.name,
            handler: name,
            prefix,
            path,
            permissions: (Reflect.getMetadata(
              REQUIRED_PERMISSIONS_METADATA,
              handler,
            ) ??
              Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, controller) ??
              []) as string[],
          });
      }
  }
  return routes;
}

describe('ACC-9 final cross-slice exported contracts', () => {
  it('discovers the complete Teacher route graph and preserves the accepted ACC controllers with own analytics', () => {
    const routes = teacherRoutes(),
      acc = routes.filter((route) =>
        route.controller.startsWith('TeacherAcademicContent'),
      );
    expect(routes).toHaveLength(151);
    expect(acc).toHaveLength(39);
    expect(routes.filter((route) => route.permissions.length === 0)).toEqual(
      [],
    );
    expect(new Set(acc.map((route) => route.controller))).toEqual(
      new Set([
        'TeacherAcademicContentController',
        'TeacherAcademicContentAuthoringController',
        'TeacherAcademicContentFilesController',
        'TeacherAcademicContentWorkflowPublicationController',
        'TeacherAcademicContentAnalyticsController',
      ]),
    );
    expect(
      acc
        .flatMap((route) => route.permissions)
        .every((code) =>
          [
            'academics.academic_content.view',
            'academics.academic_content.manage',
            'academics.academic_content.publish',
            'academics.academic_content.analytics.own.view',
          ].includes(code),
        ),
    ).toBe(true);
    expect(
      acc.some((route) =>
        ['approve', 'request-changes', 'review-queue'].includes(route.path),
      ),
    ).toBe(false);
    process.stdout.write(
      `ACC9_CONTRACT_ROUTES=${JSON.stringify({ teacher: routes.length, academicContent: acc.length, undecorated: 0 })}\n`,
    );
  });
  it('discovers permission catalogs and withholds Management approval/settings/analytics', () => {
    expect(PERMISSIONS).toHaveLength(243);
    expect(TEACHER_PERMISSIONS).toHaveLength(58);
    expect(
      TEACHER_PERMISSIONS.filter((code) =>
        code.startsWith('academics.academic_content.'),
      ),
    ).toEqual([
      'academics.academic_content.view',
      'academics.academic_content.manage',
      'academics.academic_content.publish',
      'academics.academic_content.analytics.own.view',
    ]);
    for (const action of ['approve', 'settings.manage', 'analytics.view'])
      expect(TEACHER_PERMISSIONS).not.toContain(
        'academics.academic_content.' + action,
      );
  });
  it('uses Core persistence and allocation class identity while preserving independent lesson preparation', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      TeacherAppModule,
    ) as unknown[];
    expect(imports).toContain(AcademicContentModule);
    const target = Prisma.dmmf.datamodel.models.find(
      (model) => model.name === 'AcademicContentTarget',
    )!;
    expect(
      target.fields.find((field) => field.name === 'teacherSubjectAllocation')
        ?.type,
    ).toBe('TeacherSubjectAllocation');
    expect(
      Prisma.dmmf.datamodel.models.filter((model) =>
        model.name.startsWith('TeacherAcademicContent'),
      ),
    ).toEqual([]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, TeacherAppModule),
    ).toContain(TeacherLessonPreparationController);
    expect(
      Reflect.getMetadata(PATH_METADATA, TeacherLessonPreparationController),
    ).toBe('teacher/lesson-preparation');
    expect(
      Prisma.dmmf.datamodel.models.some((model) => model.name === 'LessonPlan'),
    ).toBe(true);
  });
  it('delegates Teacher reads with current allocation identity to the Core repository', async () => {
    const findAllocationReaderDetail = jest
      .fn()
      .mockResolvedValue({ id: 'core-content' });
    const adapter = new TeacherAcademicContentReadAdapter(
      { findAllocationReaderDetail } as unknown as AcademicContentRepository,
      {} as never,
      {} as never,
    );
    await expect(
      adapter.detail('content', 'school', 'current-teacher'),
    ).resolves.toEqual({ id: 'core-content' });
    expect(findAllocationReaderDetail).toHaveBeenCalledWith(
      'content',
      'school',
      { teacherUserId: 'current-teacher' },
    );
  });
  it('requires authorship and every current allocation, without historical identity authority', () => {
    const own = {
      schoolId: 'school',
      createdByUserId: 'teacher',
      targets: [
        {
          teacherSubjectAllocationId: 'allocation',
          teacherSubjectAllocation: {
            schoolId: 'school',
            teacherUserId: 'teacher',
          },
        },
      ],
    };
    expect(hasTeacherAcademicContentMutableOwnership(own, 'teacher')).toBe(
      true,
    );
    expect(
      hasTeacherAcademicContentMutableOwnership(
        { ...own, createdByUserId: 'school-manager' },
        'teacher',
      ),
    ).toBe(false);
    expect(
      hasTeacherAcademicContentMutableOwnership(
        { ...own, createdByUserId: 'other-teacher' },
        'teacher',
      ),
    ).toBe(false);
    expect(
      hasTeacherAcademicContentMutableOwnership(
        {
          ...own,
          targets: [
            ...own.targets,
            {
              teacherSubjectAllocationId: 'reassigned',
              teacherSubjectAllocation: {
                schoolId: 'school',
                teacherUserId: 'other-teacher',
              },
            },
          ],
        },
        'teacher',
      ),
    ).toBe(false);
    expect(
      hasTeacherAcademicContentMutableOwnership(
        {
          ...own,
          targets: [
            {
              ...own.targets[0],
              teacherSubjectAllocation: {
                schoolId: 'school',
                teacherUserId: 'other-teacher',
              },
            },
          ],
        },
        'teacher',
      ),
    ).toBe(false);
    expect(
      hasTeacherAcademicContentMutableOwnership(
        { ...own, targets: [] },
        'teacher',
      ),
    ).toBe(false);
    expect(
      teacherAcademicContentCapabilities({
        content: {
          ...own,
          type: Type.GENERAL_RESOURCE,
          audience: Audience.STUDENTS,
          status: Status.SUBMITTED,
        },
        teacherUserId: 'teacher',
        permissions: TEACHER_PERMISSIONS,
        term: {
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
          isActive: true,
        },
        workflow: { preparationApprovalRequired: true },
        now: new Date('2026-10-07'),
      }).canEdit,
    ).toBe(false);
  });
  it('composes authoring, resource-authorized files/templates and existing workflow/publication contracts', () => {
    for (const name of [
      'create',
      'update',
      'targets',
      'preparation',
      'weeklyPlan',
      'guardianNote',
      'subjectResource',
      'onlineSession',
      'links',
      'tags',
      'readiness',
    ])
      expect(
        typeof (
          TeacherAcademicContentAuthoringUseCases.prototype as unknown as Record<
            string,
            unknown
          >
        )[name],
      ).toBe('function');
    for (const name of [
      'uploadIntent',
      'complete',
      'cancel',
      'unlink',
      'currentAccess',
      'revisionAccess',
      'listTemplates',
      'templateDetail',
    ])
      expect(
        typeof (
          TeacherAcademicContentFilesUseCases.prototype as unknown as Record<
            string,
            unknown
          >
        )[name],
      ).toBe('function');
    for (const name of [
      'submit',
      'approvals',
      'publicationReadiness',
      'audiencePreview',
      'publish',
      'unschedule',
      'withdraw',
      'revise',
      'revisions',
      'revision',
    ])
      expect(
        typeof (
          TeacherAcademicContentWorkflowPublicationUseCases.prototype as unknown as Record<
            string,
            unknown
          >
        )[name],
      ).toBe('function');
    expect(
      isAcademicContentExternallyPublishable(
        Type.TEACHER_PREPARATION,
        Audience.INTERNAL_STAFF,
      ),
    ).toBe(false);
    expect(
      isAcademicContentExternallyPublishable(
        Type.TEACHER_PREPARATION,
        Audience.STUDENTS,
      ),
    ).toBe(false);
  });
  it('reuses Communication review-decision category and deterministic approval identity', () => {
    expect(COMMUNICATION_ACADEMIC_CONTENT_REVIEW_NOTIFICATION_TYPES).toEqual([
      'ACADEMIC_CONTENT_APPROVED',
      'ACADEMIC_CONTENT_CHANGES_REQUESTED',
    ]);
    expect(COMMUNICATION_APP_NOTIFICATION_CATEGORIES).toContain(
      'academic_content',
    );
    for (const type of COMMUNICATION_ACADEMIC_CONTENT_REVIEW_NOTIFICATION_TYPES)
      expect(COMMUNICATION_NOTIFICATION_TYPES).toContain(type.toLowerCase());
    const identity = { schoolId: randomUUID(), approvalId: randomUUID() };
    const first = buildAcademicContentReviewDecisionJobId(identity);
    expect(buildAcademicContentReviewDecisionJobId({ ...identity })).toBe(
      first,
    );
    expect(
      buildAcademicContentReviewDecisionJobId({
        ...identity,
        approvalId: randomUUID(),
      }),
    ).not.toBe(first);
  });
  it('preserves worker and API topology without another notification center', () => {
    expect(CORE_WORKER_ASSIGNED_CONSUMERS).toHaveLength(8);
    expect(MEDIA_WORKER_ASSIGNED_CONSUMERS).toHaveLength(1);
    expect(MAINTENANCE_SCHEDULE_REGISTRATIONS).toHaveLength(9);
    const roles = createOperationalRoleManifests();
    expect(roles.api.assignedConsumers).toEqual([]);
    expect(roles.api.assignedSchedules).toEqual([]);
    expect(
      Prisma.dmmf.datamodel.models.filter(
        (model) =>
          model.name.startsWith('Teacher') &&
          model.name.includes('Notification'),
      ),
    ).toEqual([]);
  });
});

const url = process.env.DATABASE_URL;
const describeDatabase = url ? describe : describe.skip;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function awaitBarrier(
  signal: Promise<void>,
  operation: Promise<unknown>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      signal,
      operation.then(() => {
        throw new Error('Operation completed before reaching its lock barrier');
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Lock barrier deadline exceeded')),
          10_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function expectDomainRejection(
  result: PromiseSettledResult<unknown>,
  code: string,
  allowSerialization = false,
) {
  expect(result.status).toBe('rejected');
  if (result.status === 'rejected') {
    const reason: unknown = result.reason;
    if (
      allowSerialization &&
      reason instanceof Prisma.PrismaClientKnownRequestError &&
      (reason.code === 'P2034' ||
        (reason.code === 'P2010' && reason.meta?.code === '40001'))
    ) {
      return;
    }
    expect(reason).toBeInstanceOf(DomainException);
    expect(reason).toMatchObject({ code });
  }
}
describeDatabase(
  'ACC-9 bounded G03–G05 PostgreSQL parent serialization',
  () => {
    jest.setTimeout(120_000);
    const suffix = randomUUID().slice(0, 8);
    const names = {
      winner: `acc9-winner-${suffix}`,
      loser: `acc9-loser-${suffix}`,
    };
    function client(name: string) {
      const fixtureUrl = new URL(
        url ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
      );
      fixtureUrl.searchParams.set('application_name', name);
      const options: Prisma.PrismaClientOptions = {
        datasourceUrl: fixtureUrl.toString(),
        transactionOptions: { maxWait: 20_000, timeout: 20_000 },
      };
      return new PrismaService(options);
    }
    const prisma = client(`acc9-observer-${suffix}`),
      winner = client(names.winner),
      loser = client(names.loser);
    const ids: Record<string, string> = {};
    const now = new Date('2026-10-07T12:00:00Z');
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
    const storage = new StorageService(
      {
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
      {} as SignedUrlService,
    );
    const command = (contentId: string) => ({
      contentId,
      schoolId: ids.school,
      organizationId: ids.org,
      actorId: ids.actor,
      now,
    });
    function repositories(p: PrismaService) {
      const revisions = new AcademicContentRevisionRepository(p);
      return {
        workflow: new AcademicContentWorkflowRepository(p, revisions),
        publication: new AcademicContentPublicationRepository(p, revisions),
        metadata: new AcademicContentRepository(p),
        targets: new AcademicContentTargetRepository(p),
        links: new AcademicContentLinksTagsRepository(p),
        details: new AcademicContentTypeDetailRepository(p),
        files: new AcademicContentFileRepository(p),
      };
    }
    function asManager<T>(action: () => Promise<T>) {
      const context = createRequestContext();
      context.actor = { id: ids.actor, userType: UserType.SCHOOL_USER };
      context.activeMembership = {
        schoolId: ids.school,
        organizationId: ids.org,
        membershipId: randomUUID(),
        roleId: randomUUID(),
        permissions: ['academics.academic_content.manage'],
      };
      return runWithRequestContext(context, action);
    }
    function heldParent() {
      const acquired = deferred(),
        release = deferred();
      const control = { armed: true, held: false };
      const p = winner.$extends({
        query: {
          async $queryRaw({ args, query }) {
            const rows: unknown = await query(args);
            const sql = args.strings
              .join('')
              .replace(/"/gu, '')
              .replace(/\s+/gu, ' ');
            if (
              control.armed &&
              !control.held &&
              sql.includes('FROM academic_contents') &&
              sql.includes('FOR UPDATE')
            ) {
              control.held = true;
              acquired.resolve();
              await release.promise;
            }
            return rows;
          },
        },
      }) as unknown as PrismaService;
      return { p, acquired, release, control };
    }
    async function waitForBlockedParent() {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
        SELECT (wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0) AS waiting
        FROM pg_stat_activity WHERE application_name = ${names.loser}
          AND query LIKE '%academic_contents%' AND query LIKE '%FOR UPDATE%'`;
        if (rows.some((row) => row.waiting)) return;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      throw new Error(
        'The separate PostgreSQL connection did not block on the parent lock',
      );
    }
    async function runPair(
      held: ReturnType<typeof heldParent>,
      first: () => Promise<unknown>,
      second: () => Promise<unknown>,
    ) {
      const firstPromise = first();
      const firstResult = Promise.allSettled([firstPromise]);
      let results: Promise<PromiseSettledResult<unknown>[]>;
      try {
        await awaitBarrier(held.acquired.promise, firstPromise);
        const secondPromise = second();
        results = Promise.allSettled([firstPromise, secondPromise]);
        await waitForBlockedParent();
      } finally {
        held.release.resolve();
      }
      await firstResult;
      return results!;
    }
    async function content(type: Type = Type.TEACHER_PREPARATION) {
      const c = await prisma.academicContent.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          type,
          audience:
            type === Type.TEACHER_PREPARATION
              ? Audience.INTERNAL_STAFF
              : Audience.STUDENTS,
          title: 'Original closeout content',
          createdByUserId: ids.actor,
        },
      });
      await prisma.academicContentTarget.create({
        data: {
          schoolId: ids.school,
          academicContentId: c.id,
          scopeType: Scope.SCHOOL,
          subjectId: ids.subject,
          identityFingerprint: randomUUID(),
          createdByUserId: ids.actor,
        },
      });
      if (type === Type.TEACHER_PREPARATION)
        await prisma.academicContentPreparationDetail.create({
          data: {
            schoolId: ids.school,
            academicContentId: c.id,
            topic: 'Closeout topic',
          },
        });
      else {
        await prisma.academicContentSubjectResourceDetail.create({
          data: {
            schoolId: ids.school,
            academicContentId: c.id,
            resourceCategory: 'REFERENCE',
          },
        });
        await prisma.academicContentLink.create({
          data: {
            schoolId: ids.school,
            academicContentId: c.id,
            label: 'Original link',
            url: 'https://example.test/original',
            sortOrder: 0,
            createdByUserId: ids.actor,
          },
        });
      }
      return c;
    }
    async function asset(contentId: string) {
      const file = await prisma.file.create({
        data: {
          schoolId: ids.school,
          organizationId: ids.org,
          uploaderId: ids.actor,
          bucket: 'closeout-provider',
          objectKey: randomUUID(),
          originalName: 'closeout.pdf',
          mimeType: 'application/pdf',
          sizeBytes: BigInt(pdf.length),
        },
      });
      return prisma.academicContentAsset.create({
        data: {
          schoolId: ids.school,
          academicContentId: contentId,
          fileId: file.id,
          createdByUserId: ids.actor,
          sortOrder: 0,
        },
      });
    }
    async function prepareCompletion(contentId: string, p: PrismaService) {
      const session = await prisma.fileUploadSession.create({
        data: {
          schoolId: ids.school,
          organizationId: ids.org,
          createdByUserId: ids.actor,
          purpose: FileUploadPurpose.ACADEMIC_CONTENT,
          purposeContextId: contentId,
          clientRequestId: randomUUID(),
          originalName: 'closeout.pdf',
          expectedMimeType: 'application/pdf',
          expectedSizeBytes: BigInt(pdf.length),
          finalBucket: 'closeout-provider',
          finalObjectKey: randomUUID(),
          status: FileUploadSessionStatus.UPLOADING,
          expiresAt: new Date(Date.now() + 86400_000),
        },
      });
      const started = deferred(),
        release = deferred();
      const verifier = new AcademicContentFileVerifier(storage);
      const useCase = new CompleteAcademicContentUploadUseCase(
        new AcademicContentFileRepository(p),
        {
          verify: async (s: Parameters<typeof verifier.verify>[0]) => {
            const result = await verifier.verify(s);
            started.resolve();
            await release.promise;
            return result;
          },
        } as AcademicContentFileVerifier,
      );
      const promise = asManager(() =>
        useCase.execute({ contentId, uploadId: session.id }),
      );
      const result = Promise.allSettled([promise]);
      await awaitBarrier(started.promise, promise);
      return { session, release, promise, result };
    }
    beforeAll(async () => {
      await Promise.all([
        prisma.$connect(),
        winner.$connect(),
        loser.$connect(),
      ]);
      ids.org = (
        await prisma.organization.create({
          data: {
            name: `ACC9 closeout ${suffix}`,
            slug: `acc9-closeout-${suffix}`,
          },
        })
      ).id;
      ids.school = (
        await prisma.school.create({
          data: {
            organizationId: ids.org,
            name: `ACC9 ${suffix}`,
            slug: `acc9-${suffix}`,
          },
        })
      ).id;
      ids.actor = (
        await prisma.user.create({
          data: {
            email: `acc9-${suffix}@example.test`,
            firstName: 'Closeout',
            lastName: 'Reviewer',
            userType: UserType.SCHOOL_USER,
          },
        })
      ).id;
      ids.year = (
        await prisma.academicYear.create({
          data: {
            schoolId: ids.school,
            nameAr: 'سنة',
            nameEn: 'Closeout year',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2031-12-31'),
          },
        })
      ).id;
      ids.term = (
        await prisma.term.create({
          data: {
            schoolId: ids.school,
            academicYearId: ids.year,
            nameAr: 'فصل',
            nameEn: 'Closeout term',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2031-12-31'),
            isActive: true,
          },
        })
      ).id;
      for (const key of ['subject', 'otherSubject'])
        ids[key] = (
          await prisma.subject.create({
            data: { schoolId: ids.school, nameAr: key, nameEn: key },
          })
        ).id;
      await prisma.academicContentWorkflowPolicy.create({
        data: { schoolId: ids.school, preparationApprovalRequired: true },
      });
    });
    afterAll(async () => {
      try {
        if (ids.school) {
          const where = { schoolId: ids.school };
          await prisma.academicContentApproval.deleteMany({ where });
          await prisma.academicContentPublication.deleteMany({ where });
          await prisma.academicContentRevisionAsset.deleteMany({ where });
          await prisma.academicContentRevisionTarget.deleteMany({ where });
          await prisma.academicContentRevisionLink.deleteMany({ where });
          await prisma.academicContentRevisionTag.deleteMany({ where });
          await prisma.academicContentRevision.deleteMany({ where });
          await prisma.fileUploadSession.deleteMany({ where });
          await prisma.academicContentAsset.deleteMany({ where });
          await prisma.file.deleteMany({ where });
          await prisma.auditLog.deleteMany({ where });
          await prisma.academicContentLink.deleteMany({ where });
          await prisma.academicContentTag.deleteMany({ where });
          await prisma.academicContentTarget.deleteMany({ where });
          await prisma.academicContentPreparationDetail.deleteMany({ where });
          await prisma.academicContentWeeklyPlanDetail.deleteMany({ where });
          await prisma.academicContentGuardianNoteDetail.deleteMany({ where });
          await prisma.academicContentSubjectResourceDetail.deleteMany({
            where,
          });
          await prisma.academicContentOnlineSessionDetail.deleteMany({ where });
          await prisma.academicContent.deleteMany({ where });
          await prisma.academicContentWorkflowPolicy.deleteMany({ where });
          await prisma.subject.deleteMany({ where });
          await prisma.term.deleteMany({ where });
          await prisma.academicYear.deleteMany({ where });
          await prisma.school.delete({ where: { id: ids.school } });
          await prisma.user.delete({ where: { id: ids.actor } });
          await prisma.organization.delete({ where: { id: ids.org } });
        }
      } finally {
        await Promise.all([
          prisma.$disconnect(),
          winner.$disconnect(),
          loser.$disconnect(),
        ]);
      }
    });
    it.each([true, false])(
      'G03 completion versus submit on separate connections (completion first=%s)',
      async (completionFirst) => {
        const c = await content(),
          held = heldParent();
        held.control.armed = false;
        const completion = await prepareCompletion(
          c.id,
          completionFirst ? held.p : loser,
        );
        held.control.armed = true;
        const submit = () =>
          repositories(completionFirst ? loser : held.p).workflow.submit(
            command(c.id),
          );
        const finish = () => {
          completion.release.resolve();
          return completion.promise;
        };
        const results = await runPair(
          held,
          completionFirst ? finish : submit,
          completionFirst ? submit : finish,
        );
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe(
          completionFirst ? 'fulfilled' : 'rejected',
        );
        if (!completionFirst)
          expectDomainRejection(
            results[1],
            'academic_content.status.read_only',
          );
        const revision = await prisma.academicContentRevision.findFirstOrThrow({
          where: { academicContentId: c.id },
          include: { assets: true },
        });
        expect(revision.assets).toHaveLength(completionFirst ? 1 : 0);
        const session = await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: completion.session.id },
        });
        expect(session.status).toBe(
          completionFirst
            ? FileUploadSessionStatus.READY
            : FileUploadSessionStatus.FAILED,
        );
        expect(
          await prisma.file.count({
            where: { schoolId: ids.school, objectKey: session.finalObjectKey },
          }),
        ).toBe(completionFirst ? 1 : 0);
      },
    );
    it.each([true, false])(
      'G03 unlink versus submit on separate connections (unlink first=%s)',
      async (unlinkFirst) => {
        const c = await content(),
          current = await asset(c.id),
          held = heldParent();
        const unlink = () =>
          asManager(() =>
            new UnlinkAcademicContentAssetUseCase(
              repositories(unlinkFirst ? held.p : loser).files,
            ).execute({ contentId: c.id, assetId: current.id }),
          );
        const submit = () =>
          repositories(unlinkFirst ? loser : held.p).workflow.submit(
            command(c.id),
          );
        const results = await runPair(
          held,
          unlinkFirst ? unlink : submit,
          unlinkFirst ? submit : unlink,
        );
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe(unlinkFirst ? 'fulfilled' : 'rejected');
        if (!unlinkFirst)
          expectDomainRejection(
            results[1],
            'academic_content.status.read_only',
          );
        const revision = await prisma.academicContentRevision.findFirstOrThrow({
          where: { academicContentId: c.id },
          include: { assets: true },
        });
        expect(revision.assets).toHaveLength(unlinkFirst ? 0 : 1);
        expect(
          (
            await prisma.academicContentAsset.findUniqueOrThrow({
              where: { id: current.id },
            })
          ).deletedAt !== null,
        ).toBe(unlinkFirst);
      },
    );
    it.each(
      ['metadata', 'target', 'asset'].flatMap((family) =>
        [true, false].map((decisionFirst) => ({ family, decisionFirst })),
      ),
    )(
      'G04 approval versus $family (decision first=$decisionFirst)',
      async ({ family, decisionFirst }) => {
        const c = await content(),
          current = await asset(c.id),
          held = heldParent();
        await repositories(prisma).workflow.submit(command(c.id));
        const decide = () =>
          repositories(decisionFirst ? held.p : loser).workflow.decide({
            ...command(c.id),
            decision: 'approve',
            note: null,
          });
        const mutate = () => {
          const r = repositories(decisionFirst ? loser : held.p);
          if (family === 'metadata')
            return r.metadata.mutate({
              ...command(c.id),
              id: c.id,
              action: 'update',
              changes: { title: 'Forbidden change' },
            });
          if (family === 'target')
            return r.targets.replace({
              content: c,
              actorId: ids.actor,
              targets: normalizeAcademicContentTargets(
                Type.TEACHER_PREPARATION,
                UserType.SCHOOL_USER,
                [{ scopeType: Scope.SCHOOL, subjectId: ids.otherSubject }],
              ),
            });
          return asManager(() =>
            new UnlinkAcademicContentAssetUseCase(r.files).execute({
              contentId: c.id,
              assetId: current.id,
            }),
          );
        };
        const results = await runPair(
          held,
          decisionFirst ? decide : mutate,
          decisionFirst ? mutate : decide,
        );
        expect(results[decisionFirst ? 0 : 1].status).toBe('fulfilled');
        expect(results[decisionFirst ? 1 : 0].status).toBe('rejected');
        expectDomainRejection(
          results[decisionFirst ? 1 : 0],
          'academic_content.status.read_only',
          family === 'target',
        );
        expect(
          (
            await prisma.academicContent.findUniqueOrThrow({
              where: { id: c.id },
            })
          ).status,
        ).toBe(Status.APPROVED);
        expect(
          (
            await prisma.academicContent.findUniqueOrThrow({
              where: { id: c.id },
            })
          ).title,
        ).toBe(c.title);
        expect(
          await prisma.academicContentTarget.count({
            where: { academicContentId: c.id, subjectId: ids.otherSubject },
          }),
        ).toBe(0);
        expect(
          (
            await prisma.academicContentAsset.findUniqueOrThrow({
              where: { id: current.id },
            })
          ).deletedAt,
        ).toBeNull();
        expect(
          await prisma.academicContentApproval.count({
            where: { academicContentId: c.id, status: 'APPROVED' },
          }),
        ).toBe(1);
      },
    );
    it.each([true, false])(
      'G04 prior-round decision versus resubmit (decision first=%s)',
      async (decisionFirst) => {
        const c = await content(),
          held = heldParent();
        const original = await repositories(prisma).workflow.submit(
          command(c.id),
        );
        const decide = () =>
          repositories(decisionFirst ? held.p : loser).workflow.decide({
            ...command(c.id),
            decision: 'request-changes',
            note: 'Revise this round',
          });
        const resubmit = () =>
          repositories(decisionFirst ? loser : held.p).workflow.submit(
            command(c.id),
          );
        const results = await runPair(
          held,
          decisionFirst ? decide : resubmit,
          decisionFirst ? resubmit : decide,
        );
        expect(results[decisionFirst ? 0 : 1].status).toBe('fulfilled');
        expect(results[decisionFirst ? 1 : 0].status).toBe(
          decisionFirst ? 'fulfilled' : 'rejected',
        );
        if (!decisionFirst)
          expectDomainRejection(
            results[0],
            'academic_content.approval.invalid_status',
          );
        const rounds = await prisma.academicContentApproval.findMany({
          where: { academicContentId: c.id },
          orderBy: { roundNumber: 'asc' },
        });
        expect(rounds).toHaveLength(decisionFirst ? 2 : 1);
        expect(rounds[0]).toMatchObject({
          id: original.approvalId,
          status: 'CHANGES_REQUESTED',
          roundNumber: 1,
        });
        if (decisionFirst)
          expect(rounds[1]).toMatchObject({
            status: 'PENDING',
            roundNumber: 2,
            decidedAt: null,
            decidedByUserId: null,
          });
        expect(
          (
            await prisma.academicContent.findUniqueOrThrow({
              where: { id: c.id },
            })
          ).status,
        ).toBe(decisionFirst ? Status.SUBMITTED : Status.CHANGES_REQUESTED);
      },
    );
    it.each(
      ['metadata', 'target', 'link', 'detail', 'asset'].flatMap((family) =>
        [true, false].map((scheduleFirst) => ({ family, scheduleFirst })),
      ),
    )(
      'G05 schedule versus $family (schedule first=$scheduleFirst)',
      async ({ family, scheduleFirst }) => {
        const c = await content(Type.SUBJECT_RESOURCE),
          current = await asset(c.id),
          held = heldParent();
        const schedule = () =>
          repositories(scheduleFirst ? held.p : loser).publication.schedule({
            ...command(c.id),
            command: {
              clientRequestId: randomUUID(),
              publishAt: new Date(now.getTime() + 3600_000),
            },
          });
        const mutate = () => {
          const r = repositories(scheduleFirst ? loser : held.p);
          if (family === 'metadata')
            return r.metadata.mutate({
              ...command(c.id),
              id: c.id,
              action: 'update',
              changes: { title: 'Captured change' },
            });
          if (family === 'target')
            return r.targets.replace({
              content: c,
              actorId: ids.actor,
              targets: normalizeAcademicContentTargets(
                Type.SUBJECT_RESOURCE,
                UserType.SCHOOL_USER,
                [{ scopeType: Scope.SCHOOL, subjectId: ids.otherSubject }],
              ),
            });
          if (family === 'link')
            return r.links.replaceLinks({
              ...command(c.id),
              links: normalizeAcademicContentLinks([
                {
                  label: 'Captured link',
                  url: 'https://example.test/captured',
                },
              ]),
            });
          if (family === 'detail')
            return r.details.mutate({
              ...command(c.id),
              detail: normalizeSubjectResource({ resourceCategory: 'OTHER' }),
            });
          return asManager(() =>
            new UnlinkAcademicContentAssetUseCase(r.files).execute({
              contentId: c.id,
              assetId: current.id,
            }),
          );
        };
        const results = await runPair(
          held,
          scheduleFirst ? schedule : mutate,
          scheduleFirst ? mutate : schedule,
        );
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe(
          scheduleFirst ? 'rejected' : 'fulfilled',
        );
        if (scheduleFirst)
          expectDomainRejection(
            results[1],
            'academic_content.status.read_only',
            family === 'target',
          );
        const saved = await prisma.academicContentRevision.findFirstOrThrow({
          where: { academicContentId: c.id },
          include: { assets: true, targets: true, links: true },
        });
        expect(
          (
            await prisma.academicContent.findUniqueOrThrow({
              where: { id: c.id },
            })
          ).status,
        ).toBe(Status.SCHEDULED);
        expect(
          await prisma.academicContentPublication.count({
            where: { academicContentId: c.id },
          }),
        ).toBe(1);
        expect(saved.title).toBe(
          !scheduleFirst && family === 'metadata' ? 'Captured change' : c.title,
        );
        expect(saved.targets[0].subjectId).toBe(
          !scheduleFirst && family === 'target'
            ? ids.otherSubject
            : ids.subject,
        );
        expect(saved.links[0].label).toBe(
          !scheduleFirst && family === 'link'
            ? 'Captured link'
            : 'Original link',
        );
        expect(saved.assets).toHaveLength(
          !scheduleFirst && family === 'asset' ? 0 : 1,
        );
        expect(JSON.stringify(saved.typeSpecificSnapshot)).toContain(
          !scheduleFirst && family === 'detail' ? 'OTHER' : 'REFERENCE',
        );
      },
    );
  },
);
