import { UnrecoverableError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { AcademicContentPublicationLifecycleRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-lifecycle.repository';
import { AcademicContentPublicationRuntimeRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-runtime.repository';
import { AcademicContentPublicationQueueService } from '../../src/modules/academics/academic-content/application/academic-content-publication-queue.service';
import { AcademicContentPublicationReconciliationService } from '../../src/modules/academics/academic-content/application/academic-content-publication-reconciliation.service';
import { AcademicContentPublicationWorker } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.worker';
import {
  CancelAcademicContentPublicationUseCase,
  ScheduleAcademicContentPublicationUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-publication.use-cases';
import {
  academicContentPublicationJobId,
  ACADEMIC_CONTENT_PUBLICATION_QUEUE,
} from '../../src/modules/academics/academic-content/domain/academic-content-publication-runtime.constants';
import { isAcademicContentPublicationVisibleAt } from '../../src/modules/academics/academic-content/domain/academic-content-publication.policy';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../src/common/context/request-context';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentPublicationStatus as PublicationStatus,
  AcademicContentStatus as ContentStatus,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as Type,
  UserType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentAudienceRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-audience.repository';
import { AcademicContentRevisionAudienceResolver } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision-audience.resolver';
import { AcademicContentPublicationSnapshotRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-snapshot.repository';
import { AcademicContentPublicationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import { AcademicContentPublicationCommand } from '../../src/modules/academics/academic-content/domain/academic-content-publication.policy';
import { AcademicContentPublicationNotificationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-notification.repository';
import { AcademicContentPublicationNotificationService } from '../../src/modules/academics/academic-content/application/academic-content-publication-notification.service';
import { CommunicationNotificationGenerationService } from '../../src/modules/communication/application/communication-notification-generation.service';
import { CommunicationNotificationGenerationRepository } from '../../src/modules/communication/infrastructure/communication-notification-generation.repository';
import { CommunicationNotificationPreferenceService } from '../../src/modules/communication/application/communication-notification-preference.service';
import { CommunicationNotificationPreferenceRepository } from '../../src/modules/communication/infrastructure/communication-notification-preference.repository';
import { CommunicationNotificationQueueService } from '../../src/modules/communication/application/communication-notification-queue.service';
import { CommunicationNotificationPushPayloadBuilder } from '../../src/modules/communication/application/communication-notification-push-payload.builder';
import {
  buildAcademicContentNotificationGenerationJobId,
  buildAcademicContentCancellationJobId,
  buildAcademicContentSessionReminderJobId,
  COMMUNICATION_ACADEMIC_CONTENT_CANCELLATION_GENERATE_JOB_NAME,
  COMMUNICATION_ACADEMIC_CONTENT_SESSION_REMINDER_GENERATE_JOB_NAME,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
} from '../../src/modules/communication/domain/communication-notification-generation-domain';

const url = process.env.DATABASE_URL;
const describeDatabase = url ? describe : describe.skip;
describeDatabase(
  'ACC-7D PostgreSQL revision audience publication snapshot',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService({
      datasourceUrl: url ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
    });
    const secondUrl = new URL(
      url ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
    );
    const applicationName = `acc7d-second-${randomUUID()}`;
    secondUrl.searchParams.set('application_name', applicationName);
    const second = new PrismaService({
      datasourceUrl: secondUrl.toString(),
    });
    const intentRepo = (client = prisma) =>
      new AcademicContentPublicationRepository(
        client,
        new AcademicContentRevisionRepository(client),
      );
    const revisionResolver = (client = prisma) =>
      new AcademicContentRevisionAudienceResolver(
        new AcademicContentAudienceRepository(client),
      );
    const snapshotRepo = (client = prisma) =>
      new AcademicContentPublicationSnapshotRepository(
        client,
        revisionResolver(client),
      );
    const now = new Date('2026-10-03T12:00:00Z');
    const lifecycle = (client = prisma) =>
      new AcademicContentPublicationLifecycleRepository(client);
    const discovery = new AcademicContentPublicationRuntimeRepository(prisma);
    const jobIdentity = (f: Fixture, p: Publication) => ({
      schoolId: f.schoolId,
      contentId: f.content.id,
      publicationId: p.publicationId,
    });
    const expiryTime = new Date(now.getTime() + 60_000);
    const expire = (
      f: Fixture,
      p: Publication,
      client = prisma,
      instant = expiryTime,
    ) => lifecycle(client).expire({ ...jobIdentity(f, p), now: instant });
    const cancel = (
      f: Fixture,
      p: Publication,
      client = prisma,
      instant = now,
    ) =>
      lifecycle(client).cancel({
        ...mutation(f),
        publicationId: p.publicationId,
        now: instant,
      });
    function runtime(queue: BullmqService, client = prisma) {
      const producer = new AcademicContentPublicationQueueService(
        queue,
        discovery,
      );
      const reconciliation =
        new AcademicContentPublicationReconciliationService(
          discovery,
          producer,
        );
      const worker = new AcademicContentPublicationWorker(
        queue,
        snapshotRepo(client),
        lifecycle(client),
        producer,
        reconciliation,
        { ensureAfterPublicationCommit: jest.fn() } as never,
      );
      return { producer, reconciliation, worker };
    }
    const schools: string[] = [],
      users: string[] = [];
    let organizationId: string, actorId: string;

    async function fixture(
      audience: Audience = Audience.STUDENTS_AND_GUARDIANS,
      scopes: Scope[] = [Scope.CLASSROOM],
      qualified = false,
    ) {
      const suffix = randomUUID();
      const schoolId = (
        await prisma.school.create({
          data: {
            organizationId,
            name: `ACC7D ${suffix}`,
            slug: `acc7d-${suffix}`,
          },
        })
      ).id;
      schools.push(schoolId);
      const academicYearId = (
        await prisma.academicYear.create({
          data: {
            schoolId,
            nameAr: 'سنة',
            nameEn: 'Year',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2027-12-31'),
          },
        })
      ).id;
      const termId = (
        await prisma.term.create({
          data: {
            schoolId,
            academicYearId,
            nameAr: 'فصل',
            nameEn: 'Term',
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-31'),
            isActive: true,
          },
        })
      ).id;
      const stageId = (
        await prisma.stage.create({
          data: { schoolId, nameAr: 'مرحلة', nameEn: 'Stage' },
        })
      ).id;
      const gradeId = (
        await prisma.grade.create({
          data: { schoolId, stageId, nameAr: 'صف', nameEn: 'Grade' },
        })
      ).id;
      const sectionId = (
        await prisma.section.create({
          data: { schoolId, gradeId, nameAr: 'قسم', nameEn: 'Section' },
        })
      ).id;
      const classroomId = (
        await prisma.classroom.create({
          data: { schoolId, sectionId, nameAr: 'فصل', nameEn: 'Classroom' },
        })
      ).id;
      const subjectId = (
        await prisma.subject.create({
          data: { schoolId, nameAr: 'موضوع', nameEn: 'Subject' },
        })
      ).id;
      const allocation = await prisma.subjectAllocation.create({
        data: {
          schoolId,
          academicYearId,
          termId,
          gradeId,
          subjectId,
          weeklyHours: 1,
        },
      });
      const content = await prisma.academicContent.create({
        data: {
          schoolId,
          academicYearId,
          termId,
          type: Type.GENERAL_RESOURCE,
          audience,
          title: `ACC7D ${suffix}`,
          description: 'Frozen resource',
          createdByUserId: actorId,
        },
      });
      const targets = await Promise.all(
        scopes.map((scopeType) =>
          prisma.academicContentTarget.create({
            data: {
              schoolId,
              academicContentId: content.id,
              scopeType,
              subjectId: qualified ? subjectId : null,
              stageId: scopeType === Scope.STAGE ? stageId : null,
              gradeId: scopeType === Scope.GRADE ? gradeId : null,
              sectionId: scopeType === Scope.SECTION ? sectionId : null,
              classroomId: scopeType === Scope.CLASSROOM ? classroomId : null,
              identityFingerprint: randomUUID().replace(/-/g, ''),
              createdByUserId: actorId,
            },
          }),
        ),
      );
      return {
        schoolId,
        academicYearId,
        termId,
        stageId,
        gradeId,
        sectionId,
        classroomId,
        subjectId,
        allocation,
        content,
        targets,
      };
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    const mutation = (f: Fixture) => ({
      schoolId: f.schoolId,
      contentId: f.content.id,
      organizationId,
      actorId,
      now,
    });
    const schedule = (
      f: Fixture,
      command: AcademicContentPublicationCommand = {
        clientRequestId: randomUUID(),
      },
    ) => intentRepo().schedule({ ...mutation(f), command });
    type Publication = Awaited<ReturnType<typeof schedule>>;
    const execute = (
      f: Fixture,
      p: Publication,
      client = prisma,
      instant = now,
    ) =>
      snapshotRepo(client).publishScheduledPublication({
        schoolId: f.schoolId,
        contentId: f.content.id,
        publicationId: p.publicationId,
        now: instant,
      });
    async function addStudent(f: Fixture, account = false) {
      let userId: string | null = null;
      if (account) {
        userId = (
          await prisma.user.create({
            data: {
              email: `acc7d-${randomUUID()}@example.test`,
              firstName: 'Student',
              lastName: 'Account',
              userType: UserType.STUDENT,
            },
          })
        ).id;
        users.push(userId);
      }
      const student = await prisma.student.create({
        data: {
          schoolId: f.schoolId,
          organizationId,
          firstName: 'Student',
          lastName: randomUUID(),
          userId,
        },
      });
      const enrollment = await prisma.enrollment.create({
        data: {
          schoolId: f.schoolId,
          studentId: student.id,
          enrolledAt: now,
          academicYearId: f.academicYearId,
          termId: f.termId,
          classroomId: f.classroomId,
        },
      });
      return { student, enrollment };
    }
    type Child = Awaited<ReturnType<typeof addStudent>>;
    async function addGuardian(
      f: Fixture,
      children: Child[],
      preference: boolean | null = false,
      account = false,
    ) {
      let userId: string | null = null;
      if (account) {
        userId = (
          await prisma.user.create({
            data: {
              email: `acc7d-${randomUUID()}@example.test`,
              firstName: 'Guardian',
              lastName: 'Account',
              userType: UserType.PARENT,
            },
          })
        ).id;
        users.push(userId);
      }
      const guardian = await prisma.guardian.create({
        data: {
          schoolId: f.schoolId,
          organizationId,
          firstName: 'Guardian',
          lastName: randomUUID(),
          phone: 'test-phone',
          relation: 'parent',
          userId,
          canReceiveNotifications: preference,
        },
      });
      await prisma.studentGuardian.createMany({
        data: children.map((child) => ({
          schoolId: f.schoolId,
          studentId: child.student.id,
          guardianId: guardian.id,
        })),
      });
      return guardian;
    }
    async function state(f: Fixture, p: Publication) {
      const [content, publication, recipients, audits] = await Promise.all([
        prisma.academicContent.findUniqueOrThrow({
          where: { id: f.content.id },
        }),
        prisma.academicContentPublication.findUniqueOrThrow({
          where: { id: p.publicationId },
        }),
        prisma.academicContentAudienceRecipient.findMany({
          where: { schoolId: f.schoolId, publicationId: p.publicationId },
          orderBy: { id: 'asc' },
          include: { targets: { orderBy: { id: 'asc' } } },
        }),
        prisma.auditLog.findMany({
          where: { schoolId: f.schoolId, resourceId: p.publicationId },
          orderBy: { id: 'asc' },
        }),
      ]);
      return { content, publication, recipients, audits };
    }
    function deferred() {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }
    async function waitForSignal(signal: Promise<void>) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          signal,
          new Promise<void>((_, reject) => {
            timeout = setTimeout(
              () =>
                reject(new Error('Timed out waiting for publication worker')),
              10_000,
            );
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
    async function waitForParentLock() {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const blocked = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
        SELECT (wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0) AS waiting
        FROM pg_stat_activity WHERE application_name = ${applicationName}
          AND query LIKE '%academic_contents%' AND query LIKE '%FOR UPDATE%'`;
        if (blocked.some((row) => row.waiting)) return;
        await new Promise((done) => setTimeout(done, 20));
      }
      throw new Error('Second PostgreSQL connection did not wait on Content');
    }
    beforeAll(async () => {
      await Promise.all([prisma.$connect(), second.$connect()]);
      const suffix = randomUUID();
      organizationId = (
        await prisma.organization.create({
          data: { name: `ACC7D ${suffix}`, slug: `acc7d-${suffix}` },
        })
      ).id;
      actorId = (
        await prisma.user.create({
          data: {
            email: `acc7d-${suffix}@example.test`,
            firstName: 'ACC',
            lastName: 'Author',
            userType: UserType.SCHOOL_USER,
          },
        })
      ).id;
      users.push(actorId);
    });
    afterAll(async () => {
      try {
        const where = { schoolId: { in: schools } };
        await prisma.communicationNotificationDelivery.deleteMany({ where });
        await prisma.communicationNotification.deleteMany({ where });
        await prisma.communicationNotificationPreference.deleteMany({ where });
        await prisma.academicContentNotificationPolicy.deleteMany({ where });
        await prisma.academicContentAudienceRecipientTarget.deleteMany({
          where,
        });
        await prisma.academicContentAudienceRecipient.deleteMany({ where });
        await prisma.academicContentPublication.deleteMany({ where });
        await prisma.academicContentApproval.deleteMany({ where });
        await prisma.academicContentRevisionTarget.deleteMany({ where });
        await prisma.academicContentRevisionAsset.deleteMany({ where });
        await prisma.academicContentRevisionLink.deleteMany({ where });
        await prisma.academicContentRevisionTag.deleteMany({ where });
        await prisma.academicContentRevision.deleteMany({ where });
        await prisma.academicContentTarget.deleteMany({ where });
        await prisma.academicContentAsset.deleteMany({ where });
        await prisma.academicContentLink.deleteMany({ where });
        await prisma.academicContentTag.deleteMany({ where });
        await prisma.file.deleteMany({ where });
        await prisma.academicContent.deleteMany({ where });
        await prisma.auditLog.deleteMany({ where });
        await prisma.studentGuardian.deleteMany({ where });
        await prisma.enrollment.deleteMany({ where });
        await prisma.guardian.deleteMany({ where });
        await prisma.student.deleteMany({ where });
        await prisma.subjectAllocation.deleteMany({ where });
        await prisma.subject.deleteMany({ where });
        await prisma.classroom.deleteMany({ where });
        await prisma.section.deleteMany({ where });
        await prisma.grade.deleteMany({ where });
        await prisma.stage.deleteMany({ where });
        await prisma.term.deleteMany({ where });
        await prisma.academicYear.deleteMany({ where });
        await prisma.school.deleteMany({ where: { id: { in: schools } } });
        await prisma.organization.delete({ where: { id: organizationId } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      } finally {
        await Promise.all([prisma.$disconnect(), second.$disconnect()]);
      }
    });

    const revise = (f: Fixture, p: Publication, client = prisma) =>
      lifecycle(client).startRevision({
        ...mutation(f),
        publicationId: p.publicationId,
      });
    const frozenRevision = (f: Fixture, p: Publication) =>
      prisma.academicContentRevision.findFirstOrThrow({
        where: {
          schoolId: f.schoolId,
          academicContentId: f.content.id,
          id: p.revisionId,
        },
        include: {
          targets: { orderBy: { id: 'asc' } },
          assets: { orderBy: { id: 'asc' } },
          links: { orderBy: { id: 'asc' } },
          tags: { orderBy: { id: 'asc' } },
        },
      });
    const scopedNotifications = <T>(f: Fixture, work: () => Promise<T>) =>
      runWithRequestContext(createRequestContext(), () => {
        setActiveMembership({
          membershipId: 'queue:test',
          schoolId: f.schoolId,
          organizationId,
          roleId: 'queue:test',
          permissions: [],
        });
        return work();
      });
    function notificationAdapter(
      queue?: CommunicationNotificationQueueService,
      client = prisma,
    ) {
      const realtime = jest.fn(),
        push = jest.fn().mockResolvedValue(undefined);
      const ensure = jest.fn().mockResolvedValue('created');
      const service = new AcademicContentPublicationNotificationService(
        new AcademicContentPublicationNotificationRepository(client),
        new CommunicationNotificationGenerationService(
          new CommunicationNotificationGenerationRepository(client),
          { publishNotificationCreated: realtime } as never,
          new CommunicationNotificationPreferenceService(
            new CommunicationNotificationPreferenceRepository(client),
          ),
          { enqueueNotificationPushDelivery: push } as never,
        ),
        queue ??
          ({
            ensureAcademicContentPublishedNotifications: ensure,
            ensureAcademicContentCancellationNotifications: jest
              .fn()
              .mockResolvedValue('created'),
            ensureAcademicContentSessionReminder: jest
              .fn()
              .mockResolvedValue('created'),
          } as never),
      );
      return { service, realtime, push, ensure };
    }
    const notificationInput = (f: Fixture, p: Publication) => ({
      ...jobIdentity(f, p),
      organizationId,
      actorUserId: actorId,
      actorUserType: UserType.SCHOOL_USER,
    });
    const savedNotifications = (f: Fixture, p: Publication) =>
      prisma.communicationNotification.findMany({
        where: { schoolId: f.schoolId, sourceId: p.publicationId },
        orderBy: { recipientUserId: 'asc' },
        include: { deliveries: { orderBy: { id: 'asc' } } },
      });
    const editTitle = (f: Fixture) =>
      prisma.academicContent.updateMany({
        where: {
          id: f.content.id,
          schoolId: f.schoolId,
          status: ContentStatus.DRAFT,
        },
        data: { title: 'Revised resource', updatedByUserId: actorId },
      });

    const sessionStart = new Date(now.getTime() + 3600000);
    const reminderDue = new Date(sessionStart.getTime() - 15 * 60000);
    async function sessionFixture() {
      const f = await fixture(
        Audience.STUDENTS_AND_GUARDIANS,
        [Scope.CLASSROOM],
        true,
      );
      await prisma.academicContent.update({
        where: { id: f.content.id },
        data: { type: Type.ONLINE_SESSION },
      });
      await prisma.academicContentOnlineSessionDetail.create({
        data: {
          schoolId: f.schoolId,
          academicContentId: f.content.id,
          platform: 'ZOOM',
          providerName: 'provider-secret-8d',
          joinUrl: 'https://example.test/join-secret-8d',
          accessCode: 'access-secret-8d',
          instructions: 'instructions-secret-8d',
          startAt: sessionStart,
          endAt: new Date(sessionStart.getTime() + 3600000),
          timezone: 'Africa/Cairo',
        },
      });
      await prisma.academicContentNotificationPolicy.create({
        data: {
          schoolId: f.schoolId,
          onlineSessionRemindersEnabled: true,
          onlineSessionReminderOffsetsMinutes: [15],
        },
      });
      return f;
    }
    type Later = 'cancel' | 'reminder';
    function holdNotificationTransaction(
      entered: ReturnType<typeof deferred>,
      release: ReturnType<typeof deferred>,
    ) {
      // Extend the scoped client actually used by Communication, preserving the real database transaction.
      const heldScoped = (prisma.scoped as unknown as PrismaClient).$extends({
        query: {
          communicationNotification: {
            async createManyAndReturn({ args, query }) {
              entered.resolve();
              await release.promise;
              return query(args);
            },
          },
        },
      });
      return new Proxy(prisma, {
        get(target, property): unknown {
          return property === 'scoped'
            ? heldScoped
            : Reflect.get(target, property);
        },
      });
    }
    async function laterPublication(
      f: Fixture,
      event: Later,
      command?: AcademicContentPublicationCommand,
    ) {
      const p = await schedule(f, command);
      await execute(f, p);
      if (event === 'cancel') await cancel(f, p);
      return p;
    }
    const generateLater = (
      f: Fixture,
      p: Publication,
      event: Later,
      client = prisma,
    ) =>
      scopedNotifications(f, () =>
        event === 'cancel'
          ? notificationAdapter(undefined, client).service.generateCancellation(
              notificationInput(f, p),
              now,
            )
          : notificationAdapter(
              undefined,
              client,
            ).service.generateSessionReminder(
              { ...notificationInput(f, p), reminderOffsetMinutes: 15 },
              reminderDue,
            ),
      );

    it.each(
      (['cancel', 'reminder'] as const).flatMap((event) =>
        [
          'active',
          'withdrawn',
          'completed',
          'enrollment_deleted',
          'enrollment_replaced',
          'classroom_changed',
          'student_inactive',
          'student_deleted',
          'account_missing',
          'user_inactive',
          'user_deleted',
          'wrong_type',
        ].map((change) => ({ event, change })),
      ),
    )(
      'ACC-8D current Student $change for $event',
      async ({ event, change }) => {
        const f = await sessionFixture(),
          child = await addStudent(f, true);
        const p = await laterPublication(f, event);
        const before = (await state(f, p)).recipients;
        if (change === 'withdrawn' || change === 'completed')
          await prisma.enrollment.update({
            where: { id: child.enrollment.id },
            data: {
              status: change === 'withdrawn' ? 'WITHDRAWN' : 'COMPLETED',
            },
          });
        if (
          change === 'enrollment_deleted' ||
          change === 'enrollment_replaced'
        ) {
          await prisma.enrollment.update({
            where: { id: child.enrollment.id },
            data: { deletedAt: now },
          });
          if (change === 'enrollment_replaced')
            await prisma.enrollment.create({
              data: { ...child.enrollment, id: randomUUID(), deletedAt: null },
            });
        }
        if (change === 'classroom_changed') {
          const other = await prisma.classroom.create({
            data: {
              schoolId: f.schoolId,
              sectionId: f.sectionId,
              nameAr: 'آخر',
              nameEn: 'Other',
            },
          });
          await prisma.enrollment.update({
            where: { id: child.enrollment.id },
            data: { classroomId: other.id },
          });
        }
        if (change === 'student_inactive')
          await prisma.student.update({
            where: { id: child.student.id },
            data: { status: 'SUSPENDED' },
          });
        if (change === 'student_deleted')
          await prisma.student.update({
            where: { id: child.student.id },
            data: { deletedAt: now },
          });
        if (change === 'account_missing')
          await prisma.student.update({
            where: { id: child.student.id },
            data: { userId: null },
          });
        if (change === 'user_inactive')
          await prisma.user.update({
            where: { id: child.student.userId! },
            data: { status: 'DISABLED' },
          });
        if (change === 'user_deleted')
          await prisma.user.update({
            where: { id: child.student.userId! },
            data: { deletedAt: now },
          });
        if (change === 'wrong_type')
          await prisma.user.update({
            where: { id: child.student.userId! },
            data: { userType: 'PARENT' },
          });
        await generateLater(f, p, event);
        expect(await savedNotifications(f, p)).toHaveLength(
          change === 'active' ? 1 : 0,
        );
        expect((await state(f, p)).recipients).toEqual(before);
      },
    );

    it.each(
      (['cancel', 'reminder'] as const).flatMap((event) =>
        [
          'true',
          'null',
          'optout',
          'link_removed',
          'guardian_deleted',
          'account_missing',
          'user_inactive',
          'user_deleted',
          'wrong_type',
        ].map((change) => ({ event, change })),
      ),
    )(
      'ACC-8D current Guardian $change for $event',
      async ({ event, change }) => {
        const f = await sessionFixture(),
          child = await addStudent(f, true);
        const guardian = await addGuardian(f, [child], true, true);
        const p = await laterPublication(f, event);
        if (change === 'null' || change === 'optout')
          await prisma.guardian.update({
            where: { id: guardian.id },
            data: { canReceiveNotifications: change === 'null' ? null : false },
          });
        if (change === 'link_removed')
          await prisma.studentGuardian.deleteMany({
            where: { schoolId: f.schoolId, guardianId: guardian.id },
          });
        if (change === 'guardian_deleted')
          await prisma.guardian.update({
            where: { id: guardian.id },
            data: { deletedAt: now },
          });
        if (change === 'account_missing')
          await prisma.guardian.update({
            where: { id: guardian.id },
            data: { userId: null },
          });
        if (change === 'user_inactive')
          await prisma.user.update({
            where: { id: guardian.userId! },
            data: { status: 'DISABLED' },
          });
        if (change === 'user_deleted')
          await prisma.user.update({
            where: { id: guardian.userId! },
            data: { deletedAt: now },
          });
        if (change === 'wrong_type')
          await prisma.user.update({
            where: { id: guardian.userId! },
            data: { userType: 'STUDENT' },
          });
        await generateLater(f, p, event);
        const notifications = await savedNotifications(f, p);
        expect(
          notifications.filter((n) => n.recipientUserId === guardian.userId),
        ).toHaveLength(change === 'true' || change === 'null' ? 1 : 0);
        expect(
          notifications.some((n) => n.recipientUserId === child.student.userId),
        ).toBe(true);
      },
    );

    it.each(
      (['cancel', 'reminder'] as const).flatMap((event) =>
        [1, 2].map((children) => ({ event, children })),
      ),
    )(
      'ACC-8D resolves snapshot-null current accounts and dedupes $children eligible children for $event',
      async ({ event, children }) => {
        const f = await sessionFixture(),
          first = await addStudent(f),
          secondChild = await addStudent(f);
        const guardian = await addGuardian(f, [first, secondChild], null);
        const p = await laterPublication(f, event);
        const before = (await state(f, p)).recipients;
        expect(before.every((r) => r.recipientUserId === null)).toBe(true);
        const studentAccount = await prisma.user.create({
          data: {
            email: `acc8d-${randomUUID()}@example.test`,
            firstName: 'New',
            lastName: 'Student',
            userType: 'STUDENT',
          },
        });
        const parentAccount = await prisma.user.create({
          data: {
            email: `acc8d-${randomUUID()}@example.test`,
            firstName: 'New',
            lastName: 'Parent',
            userType: 'PARENT',
          },
        });
        users.push(studentAccount.id, parentAccount.id);
        await prisma.student.update({
          where: { id: first.student.id },
          data: { userId: studentAccount.id },
        });
        await prisma.guardian.update({
          where: { id: guardian.id },
          data: { userId: parentAccount.id },
        });
        if (children === 1)
          await prisma.enrollment.update({
            where: { id: secondChild.enrollment.id },
            data: { status: 'WITHDRAWN' },
          });
        const unrelated = await addStudent(f, true);
        await addGuardian(f, [unrelated], true, true);
        const adapter = notificationAdapter();
        const work = () =>
          scopedNotifications(f, () =>
            event === 'cancel'
              ? adapter.service.generateCancellation(
                  notificationInput(f, p),
                  now,
                )
              : adapter.service.generateSessionReminder(
                  { ...notificationInput(f, p), reminderOffsetMinutes: 15 },
                  reminderDue,
                ),
          );
        await Promise.all([work(), generateLater(f, p, event, second)]);
        await work();
        const saved = await savedNotifications(f, p);
        expect(saved).toHaveLength(2);
        const parent = saved.find(
          (n) => n.recipientUserId === parentAccount.id,
        )!;
        expect(parent.metadata).toMatchObject({
          childContextCount: children,
          studentIds: (children === 2
            ? [first.student.id, secondChild.student.id]
            : [first.student.id]
          ).sort(),
        });
        expect(
          saved.some((n) => n.recipientUserId === unrelated.student.userId),
        ).toBe(false);
        for (const notification of saved) {
          expect(notification.deliveries).toHaveLength(2);
          expect(notification.deliveries.map((d) => d.channel).sort()).toEqual([
            'IN_APP',
            'PUSH',
          ]);
          expect(notification.idempotencyKey).toBe(
            event === 'cancel'
              ? `acc:cancelled:${p.publicationId}:${notification.recipientUserId}`
              : `acc:session-reminder:${p.publicationId}:15:${notification.recipientUserId}`,
          );
        }
        expect(adapter.realtime.mock.calls.length).toBeLessThanOrEqual(2);
        expect((await state(f, p)).recipients).toEqual(before);
      },
    );

    it('ACC-8D cancellation commit survives queue failure and idempotent use-case retry repairs the job', async () => {
      const f = await fixture();
      await addStudent(f, true);
      const p = await schedule(f);
      await execute(f, p);
      const ensure = jest
        .fn()
        .mockRejectedValueOnce(new Error('synthetic queue failure'))
        .mockResolvedValue('created');
      const useCase = new CancelAcademicContentPublicationUseCase(lifecycle(), {
        ensureAcademicContentCancellationNotifications: ensure,
      } as never);
      const invoke = () =>
        runWithRequestContext(createRequestContext(), () => {
          setActor({ id: actorId, userType: UserType.SCHOOL_USER });
          setActiveMembership({
            membershipId: 'test',
            schoolId: f.schoolId,
            organizationId,
            roleId: 'test',
            permissions: ['academics.academic_content.publish'],
          });
          return useCase.execute(f.content.id, p.publicationId);
        });
      await invoke();
      const committed = await state(f, p);
      expect(committed.publication).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'WITHDRAWN',
      });
      expect(committed.content.status).toBe('CANCELLED');
      expect(
        committed.audits.some(
          (a) => a.action === 'academics.academic_content.publication.cancel',
        ),
      ).toBe(true);
      await invoke();
      expect(await state(f, p)).toEqual(committed);
      expect(ensure).toHaveBeenCalledTimes(2);
      expect(ensure.mock.calls[0]).toEqual(ensure.mock.calls[1]);
      expect((ensure.mock.calls[1] as unknown[])[0]).toEqual({
        ...jobIdentity(f, p),
        organizationId,
        actorUserId: null,
        actorUserType: null,
      });
    });

    it.each([
      'notificationsEnabled',
      'onlineSessionNotificationsEnabled',
      'cancellationNotificationsEnabled',
      'studentNotificationsEnabled',
      'guardianNotificationsEnabled',
    ] as const)(
      'ACC-8D cancellation respects current %s policy',
      async (flag) => {
        const f = await sessionFixture(),
          child = await addStudent(f, true);
        await addGuardian(f, [child], true, true);
        const p = await laterPublication(f, 'cancel');
        await prisma.academicContentNotificationPolicy.update({
          where: { schoolId: f.schoolId },
          data: { [flag]: false },
        });
        await generateLater(f, p, 'cancel');
        expect(await savedNotifications(f, p)).toHaveLength(
          flag === 'studentNotificationsEnabled' ||
            flag === 'guardianNotificationsEnabled'
            ? 1
            : 0,
        );
      },
    );

    it('ACC-8D cancellation uses persisted valid cancelling actor, including inactive-actor fallback and post-visibility expiry', async () => {
      const f = await sessionFixture();
      await addStudent(f, true);
      const p = await laterPublication(f, 'cancel', {
        clientRequestId: randomUUID(),
        visibleUntil: expiryTime,
      });
      const inactive = await prisma.user.create({
        data: {
          email: `acc8d-${randomUUID()}@example.test`,
          firstName: 'Old',
          lastName: 'Actor',
          userType: 'SCHOOL_USER',
          status: 'DISABLED',
        },
      });
      users.push(inactive.id);
      await prisma.academicContentPublication.update({
        where: { id: p.publicationId },
        data: { cancelledByUserId: inactive.id },
      });
      await scopedNotifications(f, () =>
        notificationAdapter().service.generateCancellation(
          notificationInput(f, p),
          new Date(expiryTime.getTime() + 1),
        ),
      );
      const saved = await savedNotifications(f, p);
      expect(saved).toHaveLength(1);
      expect(saved[0].actorUserId).toBeNull();
      expect(saved[0].expiresAt).toBeNull();
    });

    it('ACC-8D reminder uses immutable timing, rechecks policy/offset and allows two idempotent offsets', async () => {
      const f = await sessionFixture();
      await addStudent(f, true);
      const p = await laterPublication(f, 'reminder');
      await prisma.academicContentOnlineSessionDetail.update({
        where: {
          schoolId_academicContentId: {
            schoolId: f.schoolId,
            academicContentId: f.content.id,
          },
        },
        data: {
          startAt: new Date(sessionStart.getTime() + 86400000),
          endAt: new Date(sessionStart.getTime() + 90000000),
        },
      });
      const adapter = notificationAdapter();
      const logs = jest.spyOn(adapter.service['logger'], 'log');
      const work = (offset: number, instant: Date) =>
        scopedNotifications(f, () =>
          adapter.service.generateSessionReminder(
            { ...notificationInput(f, p), reminderOffsetMinutes: offset },
            instant,
          ),
        );
      await work(15, new Date(reminderDue.getTime() - 1));
      await prisma.academicContentNotificationPolicy.update({
        where: { schoolId: f.schoolId },
        data: { onlineSessionRemindersEnabled: false },
      });
      await work(15, reminderDue);
      await prisma.academicContentNotificationPolicy.update({
        where: { schoolId: f.schoolId },
        data: {
          onlineSessionRemindersEnabled: true,
          onlineSessionReminderOffsetsMinutes: [5],
        },
      });
      await work(15, reminderDue);
      expect(await savedNotifications(f, p)).toHaveLength(0);
      await prisma.academicContentNotificationPolicy.update({
        where: { schoolId: f.schoolId },
        data: { onlineSessionReminderOffsetsMinutes: [5, 15] },
      });
      await Promise.all([
        work(15, reminderDue),
        generateLater(f, p, 'reminder', second),
      ]);
      await work(15, reminderDue);
      await work(5, new Date(sessionStart.getTime() - 5 * 60000));
      const saved = await savedNotifications(f, p);
      expect(saved).toHaveLength(2);
      for (const n of saved) {
        expect(n.title).toBe('Online session reminder');
        expect(n.body).toBe(f.content.title);
        expect(n.metadata).toMatchObject({
          sessionStartAt: sessionStart.toISOString(),
        });
        expect(Object.keys(n.metadata as object).sort()).toEqual(
          [
            'academicContentId',
            'publicationId',
            'revisionId',
            'contentType',
            'eventType',
            'publishedAt',
            'studentIds',
            'childContextCount',
            'sessionStartAt',
            'reminderOffsetMinutes',
          ].sort(),
        );
        expect(n.deliveries).toHaveLength(2);
        expect(JSON.stringify(n)).not.toContain('secret-8d');
        expect(
          JSON.stringify(
            new CommunicationNotificationPushPayloadBuilder().build(n),
          ),
        ).not.toContain('secret-8d');
      }
      expect(JSON.stringify(logs.mock.calls)).not.toContain('secret-8d');
      logs.mockRestore();
      const staleF = await sessionFixture();
      await addStudent(staleF, true);
      const stale = await laterPublication(staleF, 'reminder');
      await scopedNotifications(staleF, () =>
        adapter.service.generateSessionReminder(
          { ...notificationInput(staleF, stale), reminderOffsetMinutes: 15 },
          new Date(reminderDue.getTime() + 300000),
        ),
      );
      await scopedNotifications(staleF, () =>
        adapter.service.generateSessionReminder(
          { ...notificationInput(staleF, stale), reminderOffsetMinutes: 15 },
          sessionStart,
        ),
      );
      expect(await savedNotifications(staleF, stale)).toHaveLength(0);
    });

    it.each(
      (['cancel', 'expiry', 'revise'] as const).flatMap((transition) =>
        [false, true].map((reminderFirst) => ({ transition, reminderFirst })),
      ),
    )(
      'ACC-8D real PostgreSQL $transition vs reminder (reminder first=$reminderFirst)',
      async ({ transition, reminderFirst }) => {
        const f = await sessionFixture();
        await addStudent(f, true);
        const p = await laterPublication(f, 'reminder', {
          clientRequestId: randomUUID(),
          visibleUntil: new Date(reminderDue.getTime() + 1000),
        });
        const entered = deferred(),
          release = deferred();
        const lifecycleHolder = prisma.$extends({
          query: {
            academicContentPublication: {
              async updateMany({ args, query }) {
                entered.resolve();
                await release.promise;
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        const holder = reminderFirst
          ? holdNotificationTransaction(entered, release)
          : lifecycleHolder;
        const change = (client: PrismaService) =>
          transition === 'cancel'
            ? cancel(f, p, client, reminderDue)
            : transition === 'expiry'
              ? expire(f, p, client, new Date(reminderDue.getTime() + 1000))
              : revise(f, p, client);
        const first = reminderFirst
          ? generateLater(f, p, 'reminder', holder)
          : change(holder);
        await waitForSignal(entered.promise);
        const contender = (
          reminderFirst
            ? change(second)
            : generateLater(f, p, 'reminder', second)
        ).then(
          () => ({ error: null }),
          (error: unknown) => ({ error }),
        );
        try {
          await waitForParentLock();
        } finally {
          release.resolve();
        }
        await first;
        expect((await contender).error).toBeNull();
        const saved = await savedNotifications(f, p);
        expect(
          saved.filter((n) => n.type === 'ONLINE_SESSION_REMINDER'),
        ).toHaveLength(reminderFirst ? 1 : 0);
        await generateLater(f, p, 'reminder');
        expect(await savedNotifications(f, p)).toEqual(saved);
        await scopedNotifications(f, () =>
          notificationAdapter().service.generateCancellation(
            notificationInput(f, p),
            new Date(reminderDue.getTime() + 1000),
          ),
        );
        expect(
          (await savedNotifications(f, p)).filter(
            (n) => n.type === 'ACADEMIC_CONTENT_CANCELLED',
          ),
        ).toHaveLength(transition === 'cancel' ? 1 : 0);
      },
    );

    it.each(['policy', 'authorization'] as const)(
      'ACC-8D current $change mutation serializes with reminder authorization',
      async (change) => {
        const f = await sessionFixture(),
          child = await addStudent(f, true);
        const p = await laterPublication(f, 'reminder');
        const entered = deferred(),
          release = deferred();
        const holder = holdNotificationTransaction(entered, release);
        const first = generateLater(f, p, 'reminder', holder);
        await waitForSignal(entered.promise);
        const contender =
          change === 'policy'
            ? second.academicContentNotificationPolicy.update({
                where: { schoolId: f.schoolId },
                data: { onlineSessionRemindersEnabled: false },
              })
            : second.enrollment.update({
                where: { id: child.enrollment.id },
                data: { status: 'WITHDRAWN' },
              });
        let finished = false;
        const pending = contender.then(() => {
          finished = true;
        });
        try {
          const deadline = Date.now() + 10000;
          let blocked = false;
          while (Date.now() < deadline) {
            const rows = await prisma.$queryRaw<
              Array<{ blocked: boolean }>
            >`SELECT cardinality(pg_blocking_pids(pid)) > 0 AS blocked FROM pg_stat_activity WHERE application_name = ${applicationName}`;
            if (rows.some((row) => row.blocked)) {
              blocked = true;
              break;
            }
            await new Promise((done) => setTimeout(done, 20));
          }
          expect(blocked).toBe(true);
          expect(finished).toBe(false);
        } finally {
          release.resolve();
        }
        await first;
        await pending;
        expect(await savedNotifications(f, p)).toHaveLength(1);
        // Retry the original event after the mutation: no new notification or realtime event.
        await generateLater(f, p, 'reminder');
        expect(await savedNotifications(f, p)).toHaveLength(1);
      },
    );

    it.each(['cancel', 'reminder'] as const)(
      'ACC-8D real later-event $event generation processes 505 current users with bounded pages',
      async (event) => {
        const f = await sessionFixture();
        const accounts = Array.from({ length: 504 }, () => ({
          id: randomUUID(),
          email: `acc8d-${randomUUID()}@example.test`,
          firstName: 'Scale',
          lastName: 'Student',
          userType: UserType.STUDENT,
        }));
        users.push(...accounts.map((a) => a.id));
        await prisma.user.createMany({ data: accounts });
        const students = accounts.map((a) => ({
          id: randomUUID(),
          userId: a.id,
          schoolId: f.schoolId,
          organizationId,
          firstName: 'Scale',
          lastName: 'Student',
        }));
        await prisma.student.createMany({ data: students });
        await prisma.enrollment.createMany({
          data: students.map((s) => ({
            schoolId: f.schoolId,
            studentId: s.id,
            academicYearId: f.academicYearId,
            termId: f.termId,
            classroomId: f.classroomId,
            enrolledAt: now,
          })),
        });
        const first = await addStudent(f),
          secondChild = await addStudent(f);
        const parent = await addGuardian(f, [first, secondChild], null, true);
        const p = await laterPublication(f, event);
        const userPages = jest.spyOn(
          AcademicContentPublicationNotificationRepository.prototype,
          'listLaterRecipientUsers',
        );
        const contexts = jest.spyOn(
          AcademicContentPublicationNotificationRepository.prototype,
          'listCurrentLaterContexts',
        );
        try {
          const generated = await generateLater(f, p, event);
          expect(generated.createdNotificationCount).toBe(505);
          const pages = await Promise.all(
            userPages.mock.results.map((r) => r.value as Promise<string[]>),
          );
          expect(pages.map((page) => page.length)).toEqual([500, 5]);
          for (const call of contexts.mock.calls)
            expect(call[2].length).toBeLessThanOrEqual(500);
          for (const result of contexts.mock.results) {
            const page = await (result.value as ReturnType<
              AcademicContentPublicationNotificationRepository['listCurrentLaterContexts']
            >);
            expect(page.contexts.length).toBeLessThanOrEqual(500);
          }
          const saved = await savedNotifications(f, p);
          expect(new Set(saved.map((n) => n.recipientUserId)).size).toBe(505);
          expect(
            saved.find((n) => n.recipientUserId === parent.userId)?.metadata,
          ).toMatchObject({
            childContextCount: 2,
            studentIds: [first.student.id, secondChild.student.id].sort(),
          });
        } finally {
          userPages.mockRestore();
          contexts.mockRestore();
        }
      },
    );

    it('ACC-8D exact-school later jobs fail closed and historical non-withdrawal reasons emit no cancellation', async () => {
      const f = await sessionFixture();
      await addStudent(f, true);
      const p = await laterPublication(f, 'reminder'),
        foreign = await sessionFixture();
      const adapter = notificationAdapter();
      await scopedNotifications(foreign, () =>
        adapter.service.generateSessionReminder(
          {
            ...notificationInput(f, p),
            schoolId: foreign.schoolId,
            reminderOffsetMinutes: 15,
          },
          reminderDue,
        ),
      );
      await scopedNotifications(f, () =>
        adapter.service.generateCancellation(notificationInput(f, p), now),
      );
      expect(await savedNotifications(f, p)).toHaveLength(0);
      await revise(f, p);
      await scopedNotifications(f, () =>
        adapter.service.generateCancellation(notificationInput(f, p), now),
      );
      await editTitle(f);
      const next = await schedule(f);
      await intentRepo().unschedule({
        ...mutation(f),
        publicationId: next.publicationId,
      });
      await scopedNotifications(f, () =>
        adapter.service.generateCancellation(notificationInput(f, next), now),
      );
      expect(await savedNotifications(f, p)).toHaveLength(0);
      expect(await savedNotifications(f, next)).toHaveLength(0);
    });

    it('ACC-8C preserves Revision V2 relations, old audience and notification history across revise/edit/schedule/publish', async () => {
      const f = await fixture();
      const oldOnly = await addStudent(f, true),
        both = await addStudent(f, true);
      await prisma.academicContentLink.create({
        data: {
          schoolId: f.schoolId,
          academicContentId: f.content.id,
          url: 'https://example.test/resource',
          label: 'Resource',
          sortOrder: 0,
          createdByUserId: actorId,
        },
      });
      await prisma.academicContentTag.create({
        data: {
          schoolId: f.schoolId,
          academicContentId: f.content.id,
          displayValue: 'Resource',
          normalizedValue: 'resource',
          sortOrder: 0,
          createdByUserId: actorId,
        },
      });
      const file = await prisma.file.create({
        data: {
          schoolId: f.schoolId,
          organizationId,
          uploaderId: actorId,
          originalName: 'valid.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12n,
          bucket: 'private-test',
          objectKey: randomUUID(),
        },
      });
      await prisma.academicContentAsset.create({
        data: {
          schoolId: f.schoolId,
          academicContentId: f.content.id,
          fileId: file.id,
          sortOrder: 0,
          createdByUserId: actorId,
        },
      });
      const old = await schedule(f);
      await execute(f, old);
      const adapter = notificationAdapter();
      await scopedNotifications(f, () =>
        adapter.service.generate(notificationInput(f, old), now),
      );
      const oldRevision = await frozenRevision(f, old),
        oldState = await state(f, old),
        oldNotifications = await savedNotifications(f, old);
      await revise(f, old);
      await editTitle(f);
      const newRoom = await prisma.classroom.create({
        data: {
          schoolId: f.schoolId,
          sectionId: f.sectionId,
          nameAr: 'New room',
          nameEn: 'New room',
        },
      });
      await prisma.academicContentTarget.update({
        where: { id: f.targets[0].id },
        data: {
          classroomId: newRoom.id,
          identityFingerprint: randomUUID().replace(/-/g, ''),
        },
      });
      await prisma.enrollment.update({
        where: { id: both.enrollment.id },
        data: { classroomId: newRoom.id },
      });
      const newOnly = await addStudent(f, true);
      await prisma.enrollment.update({
        where: { id: newOnly.enrollment.id },
        data: { classroomId: newRoom.id },
      });
      const next = await schedule(f, {
        clientRequestId: randomUUID(),
        notifyMinorUpdate: true,
      });
      expect(next).toMatchObject({
        cancellationReason: null,
        supersedesPublicationId: old.publicationId,
        changeSignificance: 'SIGNIFICANT',
        notifyMinorUpdate: true,
      });
      expect((await state(f, next)).publication).toMatchObject({
        supersedesPublicationId: old.publicationId,
        changeSignificance: 'SIGNIFICANT',
        notifyMinorUpdate: true,
      });
      expect(next.revisionId).not.toBe(old.revisionId);
      expect((await frozenRevision(f, next)).revisionNumber).toBe(
        oldRevision.revisionNumber + 1,
      );
      await execute(f, next);
      const newSnapshot = (await state(f, next)).recipients;
      // Audience stays frozen; notification persistence requires current enrollment eligibility.
      await prisma.enrollment.updateMany({
        where: { schoolId: f.schoolId },
        data: { status: 'WITHDRAWN' },
      });
      adapter.realtime.mockClear();
      expect(
        await scopedNotifications(f, () =>
          adapter.service.generate(notificationInput(f, next), now),
        ),
      ).toMatchObject({ recipientCount: 0, createdNotificationCount: 0 });
      expect(await savedNotifications(f, next)).toHaveLength(0);
      expect(adapter.realtime).not.toHaveBeenCalled();
      expect((await state(f, next)).recipients).toEqual(newSnapshot);
      await prisma.enrollment.updateMany({
        where: { id: { in: [both.enrollment.id, newOnly.enrollment.id] } },
        data: { status: 'ACTIVE' },
      });
      await scopedNotifications(f, () =>
        Promise.all([
          adapter.service.generate(notificationInput(f, next), now),
          notificationAdapter(undefined, second).service.generate(
            notificationInput(f, next),
            now,
          ),
        ]),
      );
      await scopedNotifications(f, () =>
        adapter.service.generate(notificationInput(f, next), now),
      );
      const updated = await savedNotifications(f, next);
      expect(updated.map((row) => row.recipientUserId).sort()).toEqual(
        [both.student.userId, newOnly.student.userId].sort(),
      );
      expect(
        updated.some((row) => row.recipientUserId === oldOnly.student.userId),
      ).toBe(false);
      for (const row of updated) {
        expect(row).toMatchObject({
          type: 'ACADEMIC_CONTENT_UPDATED',
          sourceModule: 'ACADEMICS',
          sourceType: 'academic_content_publication',
          sourceId: next.publicationId,
          title: 'Academic content updated',
          body: 'Revised resource',
          idempotencyKey: `acc:updated:${next.publicationId}:${row.recipientUserId}`,
        });
        expect(
          row.deliveries.filter((delivery) => delivery.channel === 'IN_APP'),
        ).toHaveLength(1);
        expect(
          row.deliveries.filter((delivery) => delivery.channel === 'PUSH'),
        ).toHaveLength(1);
        expect(Object.keys(row.metadata as object).sort()).toEqual(
          [
            'academicContentId',
            'publicationId',
            'revisionId',
            'contentType',
            'eventType',
            'publishedAt',
            'studentIds',
            'childContextCount',
          ].sort(),
        );
        expect(row.metadata).toMatchObject({
          eventType: 'academic_content_updated',
          publicationId: next.publicationId,
          revisionId: next.revisionId,
        });
      }
      expect(await frozenRevision(f, old)).toEqual(oldRevision);
      expect((await state(f, old)).recipients).toEqual(oldState.recipients);
      expect((await state(f, next)).recipients).toEqual(newSnapshot);
      expect(await savedNotifications(f, old)).toEqual(oldNotifications);
      expect((await state(f, old)).publication).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'REVISION_STARTED',
        publishedAt: oldState.publication.publishedAt,
      });
      const classification = (await state(f, next)).audits.filter((audit) =>
        audit.action.endsWith('.update_classified'),
      );
      expect(classification).toHaveLength(1);
      expect(classification[0].after).toEqual({
        oldPublicationId: old.publicationId,
        oldRevisionId: old.revisionId,
        newPublicationId: next.publicationId,
        newRevisionId: next.revisionId,
        significance: 'SIGNIFICANT',
        notifyMinorUpdate: true,
      });
    });

    it('ACC-8C rejects identical draft capture and rolls its revision/audit back; preserves historical omitted-field retry', async () => {
      const f = await fixture(),
        command = { clientRequestId: randomUUID() };
      const old = await schedule(f, command);
      await execute(f, old);
      await revise(f, old);
      const before = await prisma.academicContentRevision.count({
        where: { schoolId: f.schoolId },
      });
      const audits = await prisma.auditLog.count({
        where: { schoolId: f.schoolId },
      });
      await expect(schedule(f)).rejects.toMatchObject({
        code: 'academic_content.publication.identical_revision',
      });
      expect(
        await prisma.academicContentRevision.count({
          where: { schoolId: f.schoolId },
        }),
      ).toBe(before);
      expect(
        await prisma.auditLog.count({ where: { schoolId: f.schoolId } }),
      ).toBe(audits);
      expect(await schedule(f, command)).toMatchObject({
        publicationId: old.publicationId,
      });
      await expect(
        schedule(f, { ...command, notifyMinorUpdate: false }),
      ).rejects.toMatchObject({
        code: 'academic_content.publication.idempotency_conflict',
      });
      expect((await state(f, old)).content.status).toBe('DRAFT');
    });

    it('ACC-8C identical approved successor rejection preserves the pre-existing approved Revision V2', async () => {
      const f = await fixture(),
        old = await schedule(f);
      await execute(f, old);
      await revise(f, old);
      const approved = await new AcademicContentRevisionRepository(
        prisma,
      ).capture(mutation(f));
      await prisma.academicContentApproval.create({
        data: {
          schoolId: f.schoolId,
          academicContentId: f.content.id,
          revisionId: approved.id,
          roundNumber: 1,
          status: 'APPROVED',
          submittedByUserId: actorId,
          submittedAt: now,
          decidedByUserId: actorId,
          decidedAt: now,
        },
      });
      await prisma.academicContent.update({
        where: { id: f.content.id },
        data: { status: ContentStatus.APPROVED },
      });
      await expect(schedule(f)).rejects.toMatchObject({
        code: 'academic_content.publication.identical_revision',
      });
      expect(
        await frozenRevision(f, { ...old, revisionId: approved.id }),
      ).toMatchObject({ id: approved.id });
    });

    it('ACC-8C uses the exact new approved Revision V2 for a changed successor', async () => {
      const f = await fixture(),
        old = await schedule(f);
      await execute(f, old);
      await revise(f, old);
      await editTitle(f);
      const approved = await new AcademicContentRevisionRepository(
        prisma,
      ).capture(mutation(f));
      await prisma.academicContentApproval.create({
        data: {
          schoolId: f.schoolId,
          academicContentId: f.content.id,
          revisionId: approved.id,
          roundNumber: 1,
          status: 'APPROVED',
          submittedByUserId: actorId,
          submittedAt: now,
          decidedByUserId: actorId,
          decidedAt: now,
        },
      });
      await prisma.academicContent.update({
        where: { id: f.content.id },
        data: {
          status: ContentStatus.APPROVED,
          title: 'Mutable title must not replace approval',
        },
      });
      const next = await schedule(f);
      expect(next.revisionId).toBe(approved.id);
      expect(next).toMatchObject({
        cancellationReason: null,
        supersedesPublicationId: old.publicationId,
        changeSignificance: 'MINOR',
        notifyMinorUpdate: false,
      });
      expect((await state(f, next)).publication).toMatchObject({
        supersedesPublicationId: old.publicationId,
        changeSignificance: 'MINOR',
        sourceContentStatus: 'APPROVED',
      });
      expect(
        await prisma.academicContentRevision.count({
          where: { schoolId: f.schoolId },
        }),
      ).toBe(2);
      await execute(f, next);
      expect((await frozenRevision(f, next)).title).toBe('Revised resource');
    });

    it('ACC-8C fails closed after an unscheduled successor consumes the lineage; preserves its historical retry', async () => {
      const f = await fixture(),
        old = await schedule(f);
      await execute(f, old);
      await revise(f, old);
      await editTitle(f);
      const command = { clientRequestId: randomUUID() };
      const next = await schedule(f, command);
      const unscheduled = await intentRepo().unschedule({
        ...mutation(f),
        publicationId: next.publicationId,
      });
      expect(unscheduled).toMatchObject({
        cancellationReason: 'UNSCHEDULED',
        supersedesPublicationId: old.publicationId,
        changeSignificance: 'MINOR',
        notifyMinorUpdate: false,
      });
      const before = await state(f, next);
      const revisions = await prisma.academicContentRevision.count({
        where: { schoolId: f.schoolId },
      });
      const audits = await prisma.auditLog.count({
        where: { schoolId: f.schoolId },
      });
      expect(before.content.status).toBe('DRAFT');
      expect(before.publication).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'UNSCHEDULED',
        supersedesPublicationId: old.publicationId,
      });
      await expect(schedule(f)).rejects.toMatchObject({
        code: 'academic_content.publication.lineage_conflict',
        httpStatus: 409,
      });
      expect(await schedule(f, command)).toMatchObject({
        publicationId: next.publicationId,
        status: 'CANCELLED',
      });
      expect(await state(f, next)).toEqual(before);
      expect(
        await prisma.academicContentRevision.count({
          where: { schoolId: f.schoolId },
        }),
      ).toBe(revisions);
      expect(
        await prisma.auditLog.count({ where: { schoolId: f.schoolId } }),
      ).toBe(audits);
      expect(
        await prisma.academicContentPublication.count({
          where: { schoolId: f.schoolId },
        }),
      ).toBe(2);
    });

    it('ACC-8C rejects ambiguous unresolved lineage before capture or audit', async () => {
      const f = await fixture(),
        old = await schedule(f);
      await execute(f, old);
      await revise(f, old);
      await editTitle(f);
      const saved = (await state(f, old)).publication;
      await prisma.academicContentPublication.create({
        data: { ...saved, id: randomUUID(), clientRequestId: randomUUID() },
      });
      const revisions = await prisma.academicContentRevision.count({
        where: { schoolId: f.schoolId },
      });
      const audits = await prisma.auditLog.count({
        where: { schoolId: f.schoolId },
      });
      await expect(schedule(f)).rejects.toMatchObject({
        code: 'academic_content.publication.lineage_conflict',
        httpStatus: 409,
        message: 'Publication revision lineage is inconsistent',
      });
      expect(
        await prisma.academicContentRevision.count({
          where: { schoolId: f.schoolId },
        }),
      ).toBe(revisions);
      expect(
        await prisma.auditLog.count({ where: { schoolId: f.schoolId } }),
      ).toBe(audits);
    });

    it.each(['revision_start', 'update_classified'] as const)(
      'ACC-8C rolls back %s audit failure atomically',
      async (action) => {
        const f = await fixture(),
          old = await schedule(f);
        await execute(f, old);
        if (action === 'update_classified') {
          await revise(f, old);
          await editTitle(f);
        }
        const before = await state(f, old),
          revisions = await prisma.academicContentRevision.count({
            where: { schoolId: f.schoolId },
          });
        const broken = prisma.$extends({
          query: {
            auditLog: {
              async create({ args, query }) {
                if (
                  args.data.action ===
                  `academics.academic_content.publication.${action}`
                )
                  throw new Error('Injected audit failure');
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        await expect(
          action === 'revision_start'
            ? revise(f, old, broken)
            : intentRepo(broken).schedule({
                ...mutation(f),
                command: { clientRequestId: randomUUID() },
              }),
        ).rejects.toThrow('Injected audit failure');
        expect(await state(f, old)).toEqual(before);
        expect(
          await prisma.academicContentRevision.count({
            where: { schoolId: f.schoolId },
          }),
        ).toBe(revisions);
        expect(
          await prisma.academicContentPublication.count({
            where: { schoolId: f.schoolId },
          }),
        ).toBe(1);
      },
    );

    it.each(['cancel', 'expiry', 'duplicate'] as const)(
      'ACC-8C serializes revise vs %s with revise winning',
      async (rival) => {
        const f = await fixture(),
          old = await schedule(f, {
            clientRequestId: randomUUID(),
            visibleUntil: expiryTime,
          });
        await execute(f, old);
        const entered = deferred(),
          release = deferred();
        const holder = prisma.$extends({
          query: {
            academicContentPublication: {
              async updateMany({ args, query }) {
                entered.resolve();
                await release.promise;
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        const first = revise(f, old, holder);
        await waitForSignal(entered.promise);
        const contender = (
          rival === 'cancel'
            ? cancel(f, old, second)
            : rival === 'expiry'
              ? expire(f, old, second)
              : revise(f, old, second)
        ).then(
          (value: unknown) => ({ value, error: null }),
          (error: unknown) => ({ value: null, error }),
        );
        try {
          await waitForParentLock();
        } finally {
          release.resolve();
        }
        await first;
        const loser = await contender;
        if (rival === 'expiry')
          expect(loser.value).toMatchObject({ outcome: 'TERMINAL_NOOP' });
        else
          expect(loser.error).toMatchObject({
            code: 'academic_content.publication.lifecycle_conflict',
          });
        const saved = await state(f, old);
        expect(saved.publication).toMatchObject({
          status: 'CANCELLED',
          cancellationReason: 'REVISION_STARTED',
        });
        expect(saved.content.status).toBe('DRAFT');
        expect(
          saved.audits.filter((audit) =>
            ['revision_start', 'cancel', 'expire'].some((action) =>
              audit.action.endsWith(`.${action}`),
            ),
          ),
        ).toHaveLength(1);
      },
    );

    it.each(['cancel', 'expiry'] as const)(
      'ACC-8C serializes %s winning before revision start',
      async (winner) => {
        const f = await fixture(),
          old = await schedule(f, {
            clientRequestId: randomUUID(),
            visibleUntil: expiryTime,
          });
        await execute(f, old);
        const entered = deferred(),
          release = deferred();
        const holder = prisma.$extends({
          query: {
            academicContentPublication: {
              async updateMany({ args, query }) {
                entered.resolve();
                await release.promise;
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        const first =
          winner === 'cancel' ? cancel(f, old, holder) : expire(f, old, holder);
        await waitForSignal(entered.promise);
        const contender = revise(f, old, second).catch(
          (error: unknown) => error,
        );
        try {
          await waitForParentLock();
        } finally {
          release.resolve();
        }
        await first;
        expect(await contender).toMatchObject({
          code: 'academic_content.publication.lifecycle_conflict',
        });
        const saved = await state(f, old);
        expect(saved.content.status).toBe(
          winner === 'cancel' ? 'CANCELLED' : 'EXPIRED',
        );
        expect(saved.publication.cancellationReason).toBe(
          winner === 'cancel' ? 'WITHDRAWN' : null,
        );
        expect(
          saved.audits.filter((audit) =>
            audit.action.endsWith('.revision_start'),
          ),
        ).toHaveLength(0);
      },
    );

    it('ACC-8C two successor writers serialize to one lineage and stable domain conflict', async () => {
      const f = await fixture(),
        old = await schedule(f);
      await execute(f, old);
      await revise(f, old);
      await editTitle(f);
      const entered = deferred(),
        release = deferred();
      const holder = prisma.$extends({
        query: {
          academicContentPublication: {
            async create({ args, query }) {
              entered.resolve();
              await release.promise;
              return query(args);
            },
          },
        },
      }) as unknown as PrismaService;
      const first = intentRepo(holder).schedule({
        ...mutation(f),
        command: { clientRequestId: randomUUID() },
      });
      await waitForSignal(entered.promise);
      const contender = intentRepo(second)
        .schedule({
          ...mutation(f),
          command: { clientRequestId: randomUUID() },
        })
        .catch((error: unknown) => error);
      try {
        await waitForParentLock();
      } finally {
        release.resolve();
      }
      const next = await first;
      expect(await contender).toMatchObject({
        code: 'academic_content.publication.not_ready',
      });
      expect(
        await prisma.academicContentPublication.count({
          where: {
            schoolId: f.schoolId,
            supersedesPublicationId: old.publicationId,
          },
        }),
      ).toBe(1);
      expect(
        await prisma.academicContentRevision.count({
          where: { schoolId: f.schoolId },
        }),
      ).toBe(2);
      expect(
        (await state(f, next)).audits.filter((audit) =>
          audit.action.endsWith('.update_classified'),
        ),
      ).toHaveLength(1);
    });

    it('ACC-8C rejects foreign publication/content identity and initial true override without writes', async () => {
      const f = await fixture(),
        foreign = await fixture(),
        old = await schedule(f);
      await execute(f, old);
      const before = await state(f, old);
      await expect(
        lifecycle().startRevision({
          ...mutation(foreign),
          publicationId: old.publicationId,
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(await state(f, old)).toEqual(before);
      await expect(
        schedule(foreign, {
          clientRequestId: randomUUID(),
          notifyMinorUpdate: true,
        }),
      ).rejects.toThrow();
      expect(
        await prisma.academicContentPublication.count({
          where: { schoolId: foreign.schoolId },
        }),
      ).toBe(0);
    });

    it('ACC-8C catalog and raw writes enforce cancellation, linkage, self FK and one successor', async () => {
      const constraints = await prisma.$queryRaw<
        Array<{ conname: string; definition: string }>
      >`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'academic_content_publications'::regclass`;
      for (const name of [
        'acc_publication_cancellation_reason_check',
        'acc_publication_cancellation_kind_check',
        'acc_publication_update_linkage_check',
        'acc_publication_no_self_supersede_check',
      ])
        expect(constraints.some((row) => row.conname === name)).toBe(true);
      expect(
        constraints.find(
          (row) =>
            row.conname ===
            'academic_content_publications_supersedes_publication_id_sc_fkey',
        )?.definition,
      ).toContain(
        'FOREIGN KEY (supersedes_publication_id, school_id, academic_content_id)',
      );
      const enums = await prisma.$queryRaw<
        Array<{ name: string; labels: string[] }>
      >`SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname IN ('AcademicContentPublicationCancellationReason', 'AcademicContentChangeSignificance') GROUP BY t.typname`;
      expect(
        enums.find(
          (row) => row.name === 'AcademicContentPublicationCancellationReason',
        )?.labels,
      ).toEqual(['UNSCHEDULED', 'WITHDRAWN', 'REVISION_STARTED']);
      expect(
        enums.find((row) => row.name === 'AcademicContentChangeSignificance')
          ?.labels,
      ).toEqual(['MINOR', 'SIGNIFICANT']);
      const columns = await prisma.$queryRaw<
        Array<{
          column_name: string;
          is_nullable: string;
          column_default: string | null;
        }>
      >`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'academic_content_publications' AND column_name IN ('cancellation_reason', 'supersedes_publication_id', 'change_significance', 'notify_minor_update')`;
      expect(columns).toHaveLength(4);
      expect(
        columns.find((row) => row.column_name === 'notify_minor_update'),
      ).toMatchObject({ is_nullable: 'NO', column_default: 'false' });
      const indexes = await prisma.$queryRaw<
        Array<{ indexdef: string }>
      >`SELECT indexdef FROM pg_indexes WHERE tablename = 'academic_content_publications' AND indexname = 'academic_content_publications_school_id_supersedes_publicat_key'`;
      expect(indexes[0].indexdef).toContain('UNIQUE INDEX');
      expect(indexes[0].indexdef).toContain(
        '(school_id, supersedes_publication_id)',
      );
      const f = await fixture(),
        old = await schedule(f);
      await execute(f, old);
      await revise(f, old);
      await editTitle(f);
      const next = await schedule(f);
      const saved = (await state(f, old)).publication;
      for (const change of [
        { cancellationReason: null },
        { cancellationReason: 'UNSCHEDULED' },
        {
          status: 'PUBLISHED',
          cancelledAt: null,
          cancellationReason: 'WITHDRAWN',
        },
        { supersedesPublicationId: null, changeSignificance: 'MINOR' },
        { notifyMinorUpdate: true },
      ] as const) {
        await expect(
          prisma.academicContentPublication.updateMany({
            where: { id: old.publicationId, schoolId: f.schoolId },
            data: change,
          }),
        ).rejects.toThrow('acc_publication_');
      }
      const self = randomUUID();
      await expect(
        prisma.academicContentPublication.create({
          data: {
            ...saved,
            id: self,
            clientRequestId: randomUUID(),
            supersedesPublicationId: self,
            changeSignificance: 'MINOR',
          },
        }),
      ).rejects.toThrow('acc_publication_');
      await expect(
        prisma.academicContentPublication.create({
          data: {
            ...saved,
            id: randomUUID(),
            clientRequestId: randomUUID(),
            supersedesPublicationId: old.publicationId,
            changeSignificance: 'MINOR',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      const foreign = await fixture(),
        q = await schedule(foreign);
      await execute(foreign, q);
      await revise(foreign, q);
      await expect(
        prisma.academicContentPublication.create({
          data: {
            ...(await state(foreign, q)).publication,
            id: randomUUID(),
            clientRequestId: randomUUID(),
            supersedesPublicationId: old.publicationId,
            changeSignificance: 'SIGNIFICANT',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
      const anotherContent = await prisma.academicContent.create({
        data: { ...foreign.content, id: randomUUID() },
      });
      const anotherRevision = await new AcademicContentRevisionRepository(
        prisma,
      ).capture({ ...mutation(foreign), contentId: anotherContent.id });
      await expect(
        prisma.academicContentPublication.create({
          data: {
            ...(await state(foreign, q)).publication,
            id: randomUUID(),
            clientRequestId: randomUUID(),
            academicContentId: anotherContent.id,
            revisionId: anotherRevision.id,
            supersedesPublicationId: q.publicationId,
            changeSignificance: 'MINOR',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
      expect((await state(f, next)).publication.supersedesPublicationId).toBe(
        old.publicationId,
      );
    });

    it.each([false, true])(
      'ACC-8C minor override=%s respects policy/preferences and no-op recovery',
      async (override) => {
        const f = await fixture();
        await addStudent(f, true);
        const old = await schedule(f);
        await execute(f, old);
        await revise(f, old);
        await editTitle(f);
        const next = await schedule(f, {
          clientRequestId: randomUUID(),
          notifyMinorUpdate: override,
        });
        await execute(f, next);
        const adapter = notificationAdapter();
        if (!override) {
          await adapter.service.ensureAfterPublicationCommit(
            jobIdentity(f, next),
            now,
          );
          expect(adapter.ensure).not.toHaveBeenCalled();
          expect(
            (
              await scopedNotifications(f, () =>
                adapter.service.generate(notificationInput(f, next), now),
              )
            ).skippedReason,
          ).toBe('no_notification_event');
          expect(await savedNotifications(f, next)).toHaveLength(0);
        } else {
          const policy = {
            notificationsEnabled: true,
            studentNotificationsEnabled: true,
            guardianNotificationsEnabled: true,
            weeklyPlanNotificationsEnabled: true,
            guardianWeeklyNoteNotificationsEnabled: true,
            subjectResourceNotificationsEnabled: true,
            onlineSessionNotificationsEnabled: true,
            generalResourceNotificationsEnabled: true,
            significantUpdateNotificationsEnabled: false,
            cancellationNotificationsEnabled: false,
            onlineSessionRemindersEnabled: false,
            onlineSessionReminderOffsetsMinutes: [15],
          };
          await prisma.academicContentNotificationPolicy.create({
            data: { schoolId: f.schoolId, ...policy },
          });
          await scopedNotifications(f, () =>
            adapter.service.generate(notificationInput(f, next), now),
          );
          expect(await savedNotifications(f, next)).toHaveLength(0);
          await prisma.academicContentNotificationPolicy.update({
            where: { schoolId: f.schoolId },
            data: { significantUpdateNotificationsEnabled: true },
          });
          await scopedNotifications(f, () =>
            adapter.service.generate(notificationInput(f, next), now),
          );
          expect(await savedNotifications(f, next)).toHaveLength(1);
        }
      },
    );

    it('publishes at publishAt before visibleFrom and preserves worker retry history', async () => {
      const f = await fixture();
      const child = await addStudent(f);
      await addGuardian(f, [child], false, true);
      const p = await schedule(f, {
        clientRequestId: randomUUID(),
        visibleFrom: new Date(now.getTime() + 30_000),
        visibleUntil: expiryTime,
      });
      const r = runtime({
        ensureJobFromPersistedTruth: jest.fn().mockResolvedValue('created'),
      } as never);
      await r.worker.process('publish', jobIdentity(f, p), now);
      const before = await state(f, p);
      expect(before.publication.status).toBe(PublicationStatus.PUBLISHED);
      expect(before.recipients).toHaveLength(2);
      expect(
        isAcademicContentPublicationVisibleAt(before.publication, now),
      ).toBe(false);
      expect(
        isAcademicContentPublicationVisibleAt(
          before.publication,
          new Date(now.getTime() + 30_000),
        ),
      ).toBe(true);
      await r.worker.process(
        'publish',
        jobIdentity(f, p),
        new Date(now.getTime() + 30_000),
      );
      expect(await state(f, p)).toEqual(before);
    });
    it('expires a published snapshot without changing recipients, counts, publishedAt or revision', async () => {
      const f = await fixture();
      const child = await addStudent(f);
      await addGuardian(f, [child]);
      const p = await schedule(f, {
        clientRequestId: randomUUID(),
        visibleUntil: expiryTime,
      });
      await execute(f, p);
      const before = await state(f, p);
      expect(
        (await expire(f, p, prisma, new Date(expiryTime.getTime() - 1)))
          .outcome,
      ).toBe('NOT_DUE');
      expect(await state(f, p)).toEqual(before);
      const result = await expire(f, p);
      expect(result.outcome).toBe('EXPIRED');
      const after = await state(f, p);
      expect(after.content.status).toBe(ContentStatus.EXPIRED);
      expect(after.recipients).toEqual(before.recipients);
      expect(after.publication).toMatchObject({
        revisionId: p.revisionId,
        publishedAt: before.publication.publishedAt,
        expiredAt: expiryTime,
        studentRecipientCount: 1,
        guardianRecipientContextCount: 1,
      });
      const audits = after.audits.filter((a) => a.action.endsWith('.expire'));
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorId: null,
        userType: UserType.SERVICE_ACCOUNT,
        organizationId,
      });
      expect(audits[0].after).toMatchObject({
        reason: 'VISIBILITY_WINDOW_ENDED',
      });
      expect(JSON.stringify(audits[0].after)).not.toMatch(
        /Student|Guardian|test-phone|Account/,
      );
      await expire(f, p, prisma, new Date(expiryTime.getTime() + 60_000));
      expect(await state(f, p)).toEqual(after);
    });
    it('routes a missed-window publish to one expiry with no published history', async () => {
      const f = await fixture();
      await addStudent(f);
      const p = await schedule(f, {
        clientRequestId: randomUUID(),
        visibleUntil: expiryTime,
      });
      const r = runtime({ ensureJobFromPersistedTruth: jest.fn() } as never);
      await r.worker.process('publish', jobIdentity(f, p), expiryTime);
      const after = await state(f, p);
      expect(after.content.status).toBe(ContentStatus.EXPIRED);
      expect(after.publication).toMatchObject({
        status: PublicationStatus.EXPIRED,
        publishedAt: null,
        expiredAt: expiryTime,
        studentRecipientCount: 0,
        guardianRecipientContextCount: 0,
      });
      expect(after.recipients).toEqual([]);
      expect(
        after.audits.filter((a) => a.action.endsWith('.publish')),
      ).toHaveLength(0);
      expect(
        after.audits.filter((a) => a.action.endsWith('.expire')),
      ).toHaveLength(1);
      expect(
        after.audits.find((a) => a.action.endsWith('.expire'))?.after,
      ).toMatchObject({ reason: 'MISSED_VISIBILITY_WINDOW' });
    });
    it('keeps publications without visibleUntil published as time passes', async () => {
      const f = await fixture();
      const p = await schedule(f);
      const ensure = jest.fn().mockResolvedValue('created');
      const r = runtime({ ensureJobFromPersistedTruth: ensure } as never);
      await r.worker.process('publish', jobIdentity(f, p), now);
      expect(ensure).not.toHaveBeenCalled();
      const before = await state(f, p);
      expect((await expire(f, p, prisma, new Date('2027-01-01'))).outcome).toBe(
        'NOT_DUE',
      );
      expect(await state(f, p)).toEqual(before);
      expect(
        (await discovery.listDueExpiry(new Date('2027-01-01'))).some(
          (row) => row.id === p.publicationId,
        ),
      ).toBe(false);
    });
    it('published cancellation and duplicate preserve historical snapshot and first actor/time', async () => {
      const f = await fixture();
      await addStudent(f, true);
      const p = await schedule(f);
      expect(p).toMatchObject({
        cancellationReason: null,
        supersedesPublicationId: null,
        changeSignificance: null,
        notifyMinorUpdate: false,
      });
      await execute(f, p);
      const before = await state(f, p);
      const cancelled = await cancel(f, p);
      expect(cancelled).toMatchObject({
        cancellationReason: 'WITHDRAWN',
        supersedesPublicationId: null,
        changeSignificance: null,
        notifyMinorUpdate: false,
      });
      expect(cancelled).not.toHaveProperty('cancelledByUserId');
      const after = await state(f, p);
      expect(after.content.status).toBe(ContentStatus.CANCELLED);
      expect(after.publication).toMatchObject({
        status: PublicationStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: actorId,
        publishedAt: before.publication.publishedAt,
      });
      expect(after.recipients).toEqual(before.recipients);
      const otherActor = await prisma.user.create({
        data: {
          email: `acc7d-${randomUUID()}@example.test`,
          firstName: 'Other',
          lastName: 'Manager',
          userType: UserType.ORGANIZATION_USER,
        },
      });
      users.push(otherActor.id);
      await lifecycle(second).cancel({
        ...mutation(f),
        actorId: otherActor.id,
        publicationId: p.publicationId,
        now: new Date(now.getTime() + 100),
      });
      expect(await state(f, p)).toEqual(after);
      expect(
        after.audits.filter((a) => a.action.endsWith('.cancel')),
      ).toHaveLength(1);
      await expire(f, p);
      expect(await state(f, p)).toEqual(after);
    });
    it('rejects scheduled, expired, unscheduled and mismatched content cancellation', async () => {
      const f = await fixture(),
        p = await schedule(f, {
          clientRequestId: randomUUID(),
          visibleUntil: expiryTime,
        });
      const before = await state(f, p);
      await expect(cancel(f, p)).rejects.toMatchObject({
        code: 'academic_content.publication.lifecycle_conflict',
      });
      expect(await state(f, p)).toEqual(before);
      await expire(f, p);
      await expect(cancel(f, p)).rejects.toMatchObject({
        code: 'academic_content.publication.lifecycle_conflict',
      });
      const g = await fixture(),
        q = await schedule(g);
      await intentRepo().unschedule({
        ...mutation(g),
        publicationId: q.publicationId,
      });
      await expect(cancel(g, q)).rejects.toMatchObject({
        code: 'academic_content.publication.lifecycle_conflict',
      });
      const h = await fixture(),
        z = await schedule(h);
      await execute(h, z);
      await prisma.academicContent.update({
        where: { id: h.content.id },
        data: { status: ContentStatus.DRAFT },
      });
      await expect(cancel(h, z)).rejects.toMatchObject({
        code: 'academic_content.publication.lifecycle_conflict',
      });
    });
    it.each(['expiry', 'cancel'] as const)(
      'serializes expiry vs cancel with %s winning on two PostgreSQL connections',
      async (winner) => {
        const f = await fixture();
        await addStudent(f);
        const p = await schedule(f, {
          clientRequestId: randomUUID(),
          visibleUntil: expiryTime,
        });
        await execute(f, p);
        const before = await state(f, p);
        const entered = deferred(),
          release = deferred();
        const locked = prisma.$extends({
          query: {
            academicContentPublication: {
              async updateMany({ args, query }) {
                entered.resolve();
                await release.promise;
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        const first =
          winner === 'expiry' ? expire(f, p, locked) : cancel(f, p, locked);
        await waitForSignal(entered.promise);
        const secondResult = (
          winner === 'expiry' ? cancel(f, p, second) : expire(f, p, second)
        ).then(
          (value: unknown) => ({ value, error: null }),
          (error: unknown) => ({ value: null, error }),
        );
        try {
          await waitForParentLock();
        } finally {
          release.resolve();
        }
        await first;
        const loser = await secondResult;
        if (winner === 'expiry')
          expect(loser.error).toMatchObject({
            code: 'academic_content.publication.lifecycle_conflict',
          });
        else expect(loser.value).toMatchObject({ outcome: 'TERMINAL_NOOP' });
        const after = await state(f, p);
        const status =
          winner === 'expiry'
            ? PublicationStatus.EXPIRED
            : PublicationStatus.CANCELLED;
        expect(after.publication.status).toBe(status);
        expect(after.content.status).toBe(status);
        expect(after.recipients).toEqual(before.recipients);
        expect(
          after.audits.filter(
            (a) => a.action.endsWith('.expire') || a.action.endsWith('.cancel'),
          ),
        ).toHaveLength(1);
      },
    );
    it('serializes duplicate cancellation into one audit on two connections', async () => {
      const f = await fixture();
      const p = await schedule(f);
      await execute(f, p);
      const entered = deferred(),
        release = deferred();
      const locked = prisma.$extends({
        query: {
          academicContentPublication: {
            async updateMany({ args, query }) {
              entered.resolve();
              await release.promise;
              return query(args);
            },
          },
        },
      }) as unknown as PrismaService;
      const first = cancel(f, p, locked);
      await waitForSignal(entered.promise);
      const contender = cancel(f, p, second, new Date(now.getTime() + 100));
      try {
        await waitForParentLock();
      } finally {
        release.resolve();
      }
      expect(await first).toEqual(await contender);
      expect(
        (await state(f, p)).audits.filter((a) => a.action.endsWith('.cancel')),
      ).toHaveLength(1);
    });
    it.each(['expire', 'cancel'] as const)(
      'rejects wrong-school, foreign content pair and ID-only %s inputs',
      async (command) => {
        const f = await fixture(),
          g = await fixture(),
          p = await schedule(f, {
            clientRequestId: randomUUID(),
            visibleUntil: expiryTime,
          });
        await execute(f, p);
        const before = await state(f, p);
        for (const bad of [
          { ...jobIdentity(f, p), schoolId: g.schoolId },
          { ...jobIdentity(f, p), contentId: g.content.id },
          {
            schoolId: undefined,
            contentId: undefined,
            publicationId: p.publicationId,
          },
        ]) {
          const input = { ...bad, organizationId, actorId, now: expiryTime };
          await expect(
            command === 'expire'
              ? lifecycle().expire(input as never)
              : lifecycle().cancel(input as never),
          ).rejects.toThrow();
        }
        expect(await state(f, p)).toEqual(before);
      },
    );
    it.each(['publish', 'expire'] as const)(
      'rejects foreign-school and mismatched %s worker jobs without mutation',
      async (job) => {
        const f = await fixture(),
          g = await fixture(),
          p = await schedule(f, {
            clientRequestId: randomUUID(),
            visibleUntil: expiryTime,
          });
        await execute(f, p);
        const before = await state(f, p),
          r = runtime({ ensureJobFromPersistedTruth: jest.fn() } as never);
        for (const payload of [
          { ...jobIdentity(f, p), schoolId: g.schoolId },
          { ...jobIdentity(f, p), contentId: g.content.id },
        ]) {
          await expect(
            r.worker.process(job, payload, expiryTime),
          ).rejects.toThrow();
        }
        expect(await state(f, p)).toEqual(before);
      },
    );
    it.each(['expire', 'cancel'] as const)(
      'rolls back %s on content write or audit failure',
      async (command) => {
        for (const failure of ['content', 'audit']) {
          const f = await fixture(),
            p = await schedule(f, {
              clientRequestId: randomUUID(),
              visibleUntil: expiryTime,
            });
          await execute(f, p);
          const before = await state(f, p);
          const client = prisma.$extends({
            query: {
              academicContent: {
                async updateMany({ args, query }) {
                  if (failure === 'content') return { count: 0 };
                  return query(args);
                },
              },
              auditLog: {
                create() {
                  throw new Error('injected audit failure');
                },
              },
            },
          }) as unknown as PrismaService;
          await expect(
            command === 'expire' ? expire(f, p, client) : cancel(f, p, client),
          ).rejects.toThrow();
          expect(await state(f, p)).toEqual(before);
        }
      },
    );
    it.each(['publish', 'expire'] as const)(
      'uses bounded stable keysets to scan over 100 due %s publications without duplicates',
      async (job) => {
        const f = await fixture();
        const p = await schedule(f, {
          clientRequestId: randomUUID(),
          visibleUntil: expiryTime,
        });
        if (job === 'expire') await execute(f, p);
        const persisted =
          await prisma.academicContentPublication.findUniqueOrThrow({
            where: { id: p.publicationId },
          });
        const contentIds = Array.from({ length: 205 }, () => randomUUID()),
          revisionIds = Array.from({ length: 205 }, () => randomUUID());
        const source = await prisma.academicContentRevision.findUniqueOrThrow({
          where: { id: p.revisionId },
        });
        const revision = source;
        const original = f.content;
        const content = original;
        await prisma.academicContent.createMany({
          data: contentIds.map((id) => ({
            ...content,
            id,
            status:
              job === 'publish'
                ? ContentStatus.SCHEDULED
                : ContentStatus.PUBLISHED,
          })),
        });
        await prisma.academicContentRevision.createMany({
          data: revisionIds.map((id, i) => ({
            ...revision,
            typeSpecificSnapshot:
              revision.typeSpecificSnapshot === null
                ? Prisma.DbNull
                : revision.typeSpecificSnapshot,
            id,
            schoolId: f.schoolId,
            academicContentId: contentIds[i],
          })),
        });
        const publication = persisted;
        await prisma.academicContentPublication.createMany({
          data: contentIds.map((id, i) => ({
            ...publication,
            id: randomUUID(),
            clientRequestId: randomUUID(),
            academicContentId: id,
            revisionId: revisionIds[i],
            publishAt: now,
            visibleFrom: now,
          })),
        });
        const calls: number[] = [];
        const client = prisma.$extends({
          query: {
            academicContentPublication: {
              async findMany({ args, query }) {
                expect(args.take).toBe(100);
                expect(args.skip).toBeUndefined();
                const rows = await query(args);
                calls.push(rows.length);
                return rows;
              },
            },
          },
        }) as unknown as PrismaService;
        const repo = new AcademicContentPublicationRuntimeRepository(client),
          found: string[] = [];
        let cursor: { at: Date; id: string } | undefined;
        for (;;) {
          const rows =
            job === 'publish'
              ? await repo.listDuePublish(now, cursor)
              : await repo.listDueExpiry(expiryTime, cursor);
          found.push(
            ...rows.filter((r) => r.schoolId === f.schoolId).map((r) => r.id),
          );
          if (rows.length < 100) break;
          const last = rows[rows.length - 1];
          cursor = {
            at: job === 'publish' ? last.publishAt : last.visibleUntil!,
            id: last.id,
          };
        }
        expect(new Set(found).size).toBe(206);
        expect(found).toHaveLength(206);
        expect(calls.length).toBeGreaterThan(2);
      },
    );

    const redisUrl =
      process.env.TEST_QUEUE_REDIS_URL ||
      (process.env.PRD3_G03_QUEUE_PORT
        ? `redis://127.0.0.1:${process.env.PRD3_G03_QUEUE_PORT}`
        : undefined);
    (redisUrl ? it : it.skip)(
      'ACC-8D reconstructs cancellation and delayed reminders after real Redis loss with current offset and immutable successor timing',
      async () => {
        const queue = new BullmqService(
          new ConfigService({ NODE_ENV: 'test', QUEUE_REDIS_URL: redisUrl }),
        );
        await queue.getQueueReadiness(COMMUNICATION_NOTIFICATION_QUEUE_NAME);
        const jobs = queue.getQueue(COMMUNICATION_NOTIFICATION_QUEUE_NAME);
        const producer = new CommunicationNotificationQueueService(queue);
        const adapter = notificationAdapter(producer);
        try {
          const f = await sessionFixture();
          await addStudent(f, true);
          const p = await laterPublication(f, 'reminder');
          const data = {
            ...notificationInput(f, p),
            reminderOffsetMinutes: 15,
          };
          const id = buildAcademicContentSessionReminderJobId(data);
          await adapter.service.ensureAfterPublicationCommit(
            jobIdentity(f, p),
            now,
          );
          expect((await jobs.getJob(id))?.name).toBe(
            COMMUNICATION_ACADEMIC_CONTENT_SESSION_REMINDER_GENERATE_JOB_NAME,
          );
          expect(await (await jobs.getJob(id))?.getState()).toBe('delayed');
          expect((await jobs.getJob(id))?.opts.delay).toBe(
            reminderDue.getTime() - now.getTime(),
          );
          expect(
            Object.keys((await jobs.getJob(id))?.data as object).sort(),
          ).toEqual(
            [
              'schoolId',
              'organizationId',
              'contentId',
              'publicationId',
              'actorUserId',
              'actorUserType',
              'reminderOffsetMinutes',
            ].sort(),
          );
          expect(JSON.stringify((await jobs.getJob(id))?.data)).not.toContain(
            'secret-8d',
          );
          await jobs.obliterate({ force: true });
          await adapter.service.recover(now);
          expect(await (await jobs.getJob(id))?.getState()).toBe('delayed');
          await adapter.service.ensureAfterPublicationCommit(
            jobIdentity(f, p),
            now,
          ); // ALREADY_PUBLISHED repair hook.
          expect(
            (await jobs.getJobs(['delayed'])).filter((j) => j.id === id),
          ).toHaveLength(1);
          await scopedNotifications(f, () =>
            adapter.service.generateSessionReminder(data, reminderDue),
          );
          const saved = await savedNotifications(f, p);
          await jobs.obliterate({ force: true });
          await adapter.service.recover(reminderDue);
          await scopedNotifications(f, () =>
            adapter.service.generateSessionReminder(data, reminderDue),
          );
          expect(await savedNotifications(f, p)).toEqual(saved);
          await jobs.obliterate({ force: true });
          await prisma.academicContentNotificationPolicy.update({
            where: { schoolId: f.schoolId },
            data: { onlineSessionReminderOffsetsMinutes: [5] },
          });
          await adapter.service.recover(now);
          expect(await jobs.getJob(id)).toBeUndefined();
          const newOffsetId = buildAcademicContentSessionReminderJobId({
            ...data,
            reminderOffsetMinutes: 5,
          });
          expect(await (await jobs.getJob(newOffsetId))?.getState()).toBe(
            'delayed',
          );
          await jobs.obliterate({ force: true });
          await adapter.service.recover(
            new Date(sessionStart.getTime() - 5 * 60000 + 300000),
          );
          expect(await jobs.getJob(newOffsetId)).toBeUndefined();
          const expiredF = await sessionFixture();
          await addStudent(expiredF, true);
          const expiredP = await laterPublication(expiredF, 'reminder', {
            clientRequestId: randomUUID(),
            visibleUntil: expiryTime,
          });
          await expire(expiredF, expiredP);
          await jobs.obliterate({ force: true });
          await adapter.service.recover(expiryTime);
          expect(
            await jobs.getJob(
              buildAcademicContentSessionReminderJobId({
                ...notificationInput(expiredF, expiredP),
                reminderOffsetMinutes: 15,
              }),
            ),
          ).toBeUndefined();
          expect((await state(expiredF, expiredP)).publication.status).toBe(
            'EXPIRED',
          );
          await revise(f, p);
          const successorStart = new Date(sessionStart.getTime() + 3600000);
          await prisma.academicContentOnlineSessionDetail.update({
            where: {
              schoolId_academicContentId: {
                schoolId: f.schoolId,
                academicContentId: f.content.id,
              },
            },
            data: {
              startAt: successorStart,
              endAt: new Date(successorStart.getTime() + 3600000),
            },
          });
          const next = await schedule(f);
          await execute(f, next);
          await jobs.obliterate({ force: true });
          await adapter.service.recover(now);
          expect(await jobs.getJob(id)).toBeUndefined();
          expect(await jobs.getJob(newOffsetId)).toBeUndefined();
          const successorId = buildAcademicContentSessionReminderJobId({
            ...notificationInput(f, next),
            reminderOffsetMinutes: 5,
          });
          expect((await jobs.getJob(successorId))?.opts.delay).toBe(
            successorStart.getTime() - 5 * 60000 - now.getTime(),
          );
          await scopedNotifications(f, () =>
            adapter.service.generateSessionReminder(data, reminderDue),
          );
          expect(await savedNotifications(f, p)).toEqual(saved);
          const outage = jest
            .spyOn(queue, 'ensureJobFromPersistedTruth')
            .mockRejectedValue(new Error('synthetic queue outage'));
          const useCase = new CancelAcademicContentPublicationUseCase(
            lifecycle(),
            producer,
          );
          await runWithRequestContext(createRequestContext(), () => {
            setActor({ id: actorId, userType: 'SCHOOL_USER' });
            setActiveMembership({
              membershipId: 'test',
              schoolId: f.schoolId,
              organizationId,
              roleId: 'test',
              permissions: ['academics.academic_content.publish'],
            });
            return useCase.execute(f.content.id, next.publicationId);
          });
          outage.mockRestore();
          const cancelId = buildAcademicContentCancellationJobId(
            notificationInput(f, next),
          );
          const committed = await state(f, next);
          expect(committed.publication.cancellationReason).toBe('WITHDRAWN');
          expect(await jobs.getJob(cancelId)).toBeUndefined();
          const cancellationNow = new Date(
            committed.publication.cancelledAt!.getTime() + 1,
          );
          await jobs.obliterate({ force: true });
          await adapter.service.recover(cancellationNow);
          expect((await jobs.getJob(cancelId))?.name).toBe(
            COMMUNICATION_ACADEMIC_CONTENT_CANCELLATION_GENERATE_JOB_NAME,
          );
          expect(await jobs.getJob(successorId)).toBeUndefined();
          await scopedNotifications(f, () =>
            adapter.service.generateCancellation(
              notificationInput(f, next),
              cancellationNow,
            ),
          );
          const cancelled = await savedNotifications(f, next);
          await jobs.obliterate({ force: true });
          await adapter.service.recover(cancellationNow);
          await scopedNotifications(f, () =>
            adapter.service.generateCancellation(
              notificationInput(f, next),
              cancellationNow,
            ),
          );
          expect(await savedNotifications(f, next)).toEqual(cancelled);
          expect(cancelled).toHaveLength(1);
          expect(await state(f, next)).toEqual(committed);
        } finally {
          jest.restoreAllMocks();
          await jobs.obliterate({ force: true });
          await queue.onModuleDestroy();
        }
      },
    );

    (redisUrl ? it : it.skip).each([
      'waiting',
      'active',
      'completed',
      'failed',
    ] as const)(
      'ACC-8D cancellation identity coexists with an original %s publication job',
      async (originalState) => {
        const queue = new BullmqService(
          new ConfigService({ NODE_ENV: 'test', QUEUE_REDIS_URL: redisUrl }),
        );
        await queue.getQueueReadiness(COMMUNICATION_NOTIFICATION_QUEUE_NAME);
        const jobs = queue.getQueue(COMMUNICATION_NOTIFICATION_QUEUE_NAME);
        const producer = new CommunicationNotificationQueueService(queue);
        const data = {
          schoolId: randomUUID(),
          organizationId,
          contentId: randomUUID(),
          publicationId: randomUUID(),
          actorUserId: null,
          actorUserType: null,
        };
        try {
          await producer.ensureAcademicContentPublishedNotifications(data);
          const id = buildAcademicContentNotificationGenerationJobId(data);
          const original = (await jobs.getJob(id))!;
          const key = jobs.toKey('wait'),
            token = randomUUID();
          if (originalState !== 'waiting') {
            const redis = await jobs.client;
            await redis.lrem(key, 0, id);
            await redis.lpush(jobs.toKey('active'), id);
            await redis.set(`${jobs.toKey(id)}:lock`, token, 'PX', 30000);
            if (originalState === 'completed')
              await original.moveToCompleted('done', token, false);
            if (originalState === 'failed') {
              original.opts.attempts = 1;
              await original.moveToFailed(
                new UnrecoverableError('expected fixture failure'),
                token,
                false,
              );
            }
          }
          expect(await original.getState()).toBe(originalState);
          const before = await jobs.getJob(id);
          await producer.ensureAcademicContentCancellationNotifications(data);
          await producer.ensureAcademicContentCancellationNotifications(data);
          const after = (await jobs.getJob(id))!;
          expect(after.name).toBe(before!.name);
          expect(after.data).toEqual(before!.data);
          expect(await after.getState()).toBe(originalState);
          expect(
            (await jobs.getJob(buildAcademicContentCancellationJobId(data)))
              ?.name,
          ).toBe(COMMUNICATION_ACADEMIC_CONTENT_CANCELLATION_GENERATE_JOB_NAME);
        } finally {
          await jobs.obliterate({ force: true });
          await queue.onModuleDestroy();
        }
      },
    );

    it.each(['cancel', 'reminder'] as const)(
      'ACC-8D real recovery discovers multiple bounded pages of %s candidates',
      async (event) => {
        const f = await sessionFixture();
        const p = await laterPublication(f, event);
        const original = (await state(f, p)).publication;
        const content = (await state(f, p)).content;
        const revision = await prisma.academicContentRevision.findUniqueOrThrow(
          { where: { id: p.revisionId } },
        );
        const identities = Array.from({ length: 205 }, () => ({
          contentId: randomUUID(),
          revisionId: randomUUID(),
          publicationId: randomUUID(),
        }));
        await prisma.academicContent.createMany({
          data: identities.map((row) => ({ ...content, id: row.contentId })),
        });
        await prisma.academicContentRevision.createMany({
          data: identities.map((row) => ({
            ...revision,
            id: row.revisionId,
            academicContentId: row.contentId,
            typeSpecificSnapshot:
              revision.typeSpecificSnapshot as Prisma.InputJsonValue,
          })),
        });
        const extra = identities.map((row) => ({
          ...original,
          id: row.publicationId,
          academicContentId: row.contentId,
          revisionId: row.revisionId,
          clientRequestId: randomUUID(),
        }));
        await prisma.academicContentPublication.createMany({ data: extra });
        const repository = new AcademicContentPublicationNotificationRepository(
          prisma,
        );
        const found: string[] = [];
        let pages = 0;
        let cancelCursor: { cancelledAt: Date; id: string } | undefined,
          reminderCursor: string | undefined;
        while (true) {
          const rows =
            event === 'cancel'
              ? await repository.listCancellationRecoveryCandidates(
                  now,
                  cancelCursor,
                )
              : await repository.listReminderRecoveryCandidates(
                  now,
                  reminderCursor,
                );
          expect(rows.length).toBeLessThanOrEqual(100);
          pages++;
          found.push(
            ...rows.filter((r) => r.schoolId === f.schoolId).map((r) => r.id),
          );
          if (rows.length < 100) break;
          const last = rows[rows.length - 1];
          cancelCursor = { cancelledAt: last.cancelledAt!, id: last.id };
          reminderCursor = last.id;
        }
        expect(pages).toBeGreaterThan(2);
        expect(found).toHaveLength(206);
        expect(new Set(found).size).toBe(206);
        // Reminder discovery depends on the future point, even for an old publication.
        if (event === 'reminder') {
          await prisma.academicContentPublication.updateMany({
            where: { schoolId: f.schoolId },
            data: { publishedAt: new Date(now.getTime() - 2 * 86400000) },
          });
          expect(
            (await repository.listReminderRecoveryCandidates(now)).some(
              (r) => r.schoolId === f.schoolId,
            ),
          ).toBe(true);
        }
      },
    );
    (redisUrl ? it : it.skip)(
      'ACC-8C recovers committed significant updates after enqueue failure and real Redis loss; minor false is a no-op',
      async () => {
        const queue = new BullmqService(
          new ConfigService({ NODE_ENV: 'test', QUEUE_REDIS_URL: redisUrl }),
        );
        await queue.getQueueReadiness(COMMUNICATION_NOTIFICATION_QUEUE_NAME);
        const jobs = queue.getQueue(COMMUNICATION_NOTIFICATION_QUEUE_NAME);
        const adapter = notificationAdapter(
          new CommunicationNotificationQueueService(queue),
        );
        const r = runtime(queue);
        const worker = new AcademicContentPublicationWorker(
          queue,
          snapshotRepo(),
          lifecycle(),
          r.producer,
          r.reconciliation,
          adapter.service,
        );
        try {
          const f = await fixture();
          await addStudent(f, true);
          const old = await schedule(f);
          await execute(f, old);
          await revise(f, old);
          await prisma.academicContent.update({
            where: { id: f.content.id },
            data: { audience: Audience.STUDENTS },
          });
          const next = await schedule(f);
          expect((await state(f, next)).publication.changeSignificance).toBe(
            'SIGNIFICANT',
          );
          const originalEnsure = queue.ensureJobFromPersistedTruth.bind(
            queue,
          ) as BullmqService['ensureJobFromPersistedTruth'];
          const outage = jest
            .spyOn(queue, 'ensureJobFromPersistedTruth')
            .mockImplementation((name, ...args) => {
              if (name === COMMUNICATION_NOTIFICATION_QUEUE_NAME)
                return Promise.reject(new Error('Synthetic Redis outage'));
              return originalEnsure(name, ...args);
            });
          const jobId = buildAcademicContentNotificationGenerationJobId({
            schoolId: f.schoolId,
            publicationId: next.publicationId,
          });
          await worker.process('publish', jobIdentity(f, next), now);
          expect((await state(f, next)).publication.status).toBe('PUBLISHED');
          expect(await jobs.getJob(jobId)).toBeUndefined();
          outage.mockRestore();
          await adapter.service.recover(now);
          expect((await jobs.getJob(jobId))?.id).toBe(jobId);
          await scopedNotifications(f, () =>
            adapter.service.generate(notificationInput(f, next), now),
          );
          const before = await savedNotifications(f, next);
          await jobs.obliterate({ force: true });
          await adapter.service.recover(now);
          expect((await jobs.getJob(jobId))?.id).toBe(jobId);
          await scopedNotifications(f, () =>
            adapter.service.generate(notificationInput(f, next), now),
          );
          expect(await savedNotifications(f, next)).toEqual(before);
          expect(before).toHaveLength(1);
          await revise(f, next);
          await editTitle(f);
          const minorTrue = await schedule(f, {
            clientRequestId: randomUUID(),
            notifyMinorUpdate: true,
          });
          await worker.process('publish', jobIdentity(f, minorTrue), now);
          const minorTrueId = buildAcademicContentNotificationGenerationJobId({
            schoolId: f.schoolId,
            publicationId: minorTrue.publicationId,
          });
          await jobs.obliterate({ force: true });
          await adapter.service.recover(now);
          expect((await jobs.getJob(minorTrueId))?.id).toBe(minorTrueId);
          await scopedNotifications(f, () =>
            adapter.service.generate(notificationInput(f, minorTrue), now),
          );
          await scopedNotifications(f, () =>
            adapter.service.generate(notificationInput(f, minorTrue), now),
          );
          expect(await savedNotifications(f, minorTrue)).toHaveLength(1);
          await revise(f, minorTrue);
          await prisma.academicContent.update({
            where: { id: f.content.id },
            data: { description: 'Another minor revision' },
          });
          const minor = await schedule(f);
          await worker.process('publish', jobIdentity(f, minor), now);
          const minorId = buildAcademicContentNotificationGenerationJobId({
            schoolId: f.schoolId,
            publicationId: minor.publicationId,
          });
          await adapter.service.recover(now);
          expect(await jobs.getJob(minorId)).toBeUndefined();
          expect(await savedNotifications(f, minor)).toHaveLength(0);
        } finally {
          await jobs.obliterate({ force: true });
          await queue
            .getQueue(ACADEMIC_CONTENT_PUBLICATION_QUEUE)
            .obliterate({ force: true });
          await queue.onModuleDestroy();
        }
      },
    );

    (redisUrl ? it : it.skip)(
      'serializes duplicate publish workers across two PostgreSQL connections with one snapshot and one expiry job',
      async () => {
        const queue = new BullmqService(
          new ConfigService({ NODE_ENV: 'test', QUEUE_REDIS_URL: redisUrl }),
        );
        const entered = deferred(),
          release = deferred();
        let paused = false;
        const locks: string[] = [];
        let publicationWrites = 0;
        let contentWrites = 0;
        const holder = prisma.$extends({
          query: {
            $queryRaw({ args, query }) {
              locks.push('strings' in args ? args.strings.join('') : '');
              return query(args);
            },
            academicContentRevision: {
              async findFirst({ args, query }) {
                const row = await query(args);
                if (!paused) {
                  paused = true;
                  entered.resolve();
                  await release.promise;
                }
                return row;
              },
            },
            academicContentPublication: {
              updateMany({ args, query }) {
                publicationWrites++;
                return query(args);
              },
            },
            academicContent: {
              updateMany({ args, query }) {
                contentWrites++;
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        const contenderClient = second.$extends({
          query: {
            academicContentPublication: {
              updateMany({ args, query }) {
                publicationWrites++;
                return query(args);
              },
            },
            academicContent: {
              updateMany({ args, query }) {
                contentWrites++;
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        try {
          const f = await fixture();
          const a = await addStudent(f),
            b = await addStudent(f);
          await addGuardian(f, [a, b], false);
          const p = await schedule(f, {
            clientRequestId: randomUUID(),
            visibleUntil: expiryTime,
          });
          const firstWorker = runtime(queue, holder),
            secondWorker = runtime(queue, contenderClient);
          const first = firstWorker.worker.process(
            'publish',
            jobIdentity(f, p),
            now,
          );
          await waitForSignal(entered.promise);
          const contender = secondWorker.worker.process(
            'publish',
            jobIdentity(f, p),
            now,
          );
          const outcomes = Promise.allSettled([first, contender]);
          try {
            await waitForParentLock();
          } finally {
            release.resolve();
          }
          expect((await outcomes).map((row) => row.status)).toEqual([
            'fulfilled',
            'fulfilled',
          ]);
          expect(publicationWrites).toBe(1);
          expect(contentWrites).toBe(1);
          expect(locks[0]).toContain('academic_contents');
          expect(locks[1]).toContain('academic_content_publications');
          const saved = await state(f, p);
          expect(saved.content.status).toBe('PUBLISHED');
          expect(saved.publication).toMatchObject({
            status: 'PUBLISHED',
            publishedAt: now,
            studentRecipientCount: 2,
            guardianRecipientContextCount: 2,
          });
          expect(saved.recipients).toHaveLength(4);
          expect(
            saved.recipients.every((row) => row.targets.length === 1),
          ).toBe(true);
          expect(
            new Set(saved.recipients.map((row) => row.identityFingerprint))
              .size,
          ).toBe(4);
          expect(
            saved.audits.filter((row) => row.action.endsWith('.publish')),
          ).toHaveLength(1);
          expect(await execute(f, p, second)).toMatchObject({
            outcome: 'ALREADY_PUBLISHED',
            publishedAt: now,
          });
          expect(await state(f, p)).toEqual(saved);
          const expiryId = academicContentPublicationJobId(
            'expire',
            jobIdentity(f, p),
          );
          const expiryJob = await queue
            .getQueue(ACADEMIC_CONTENT_PUBLICATION_QUEUE)
            .getJob(expiryId);
          expect(expiryJob).toBeDefined();
          expect(await expiryJob!.getState()).toBe('delayed');
          const jobs = await queue
            .getQueue(ACADEMIC_CONTENT_PUBLICATION_QUEUE)
            .getJobs(['delayed', 'waiting', 'active']);
          expect(jobs.filter((job) => job.id === expiryId)).toHaveLength(1);
        } finally {
          release.resolve();
          await queue.onModuleDestroy();
        }
      },
    );
    (redisUrl ? it : it.skip)(
      'runs the publication consumer with exact readiness and drains its active transaction',
      async () => {
        const queue = new BullmqService(
          new ConfigService({ NODE_ENV: 'test', QUEUE_REDIS_URL: redisUrl }),
        );
        const entered = deferred(),
          release = deferred();
        try {
          await queue.getQueueReadiness(ACADEMIC_CONTENT_PUBLICATION_QUEUE);
          await queue
            .getQueue(ACADEMIC_CONTENT_PUBLICATION_QUEUE)
            .obliterate({ force: true });
          const f = await fixture();
          await addStudent(f);
          const p = await intentRepo().schedule({
            ...mutation(f),
            now: new Date(),
            command: { clientRequestId: randomUUID() },
          });
          const client = prisma.$extends({
            query: {
              academicContentPublication: {
                async updateMany({ args, query }) {
                  entered.resolve();
                  await release.promise;
                  return query(args);
                },
              },
            },
          }) as unknown as PrismaService;
          const r = runtime(queue);
          new AcademicContentPublicationWorker(
            queue,
            snapshotRepo(client),
            lifecycle(client),
            r.producer,
            r.reconciliation,
            { ensureAfterPublicationCommit: jest.fn() } as never,
          ).onModuleInit();
          await r.producer.ensure('publish', jobIdentity(f, p));
          await waitForSignal(entered.promise);
          expect(
            queue.hasExactAvailableWorkers([
              ACADEMIC_CONTENT_PUBLICATION_QUEUE,
            ]),
          ).toBe(true);
          const drain = queue.beginWorkerDrain();
          expect(
            queue.hasAvailableWorkers([ACADEMIC_CONTENT_PUBLICATION_QUEUE]),
          ).toBe(false);
          release.resolve();
          await drain;
          expect((await state(f, p)).publication.status).toBe(
            PublicationStatus.PUBLISHED,
          );
          expect(
            (await state(f, p)).audits.filter((a) =>
              a.action.endsWith('.publish'),
            ),
          ).toHaveLength(1);
        } finally {
          release.resolve();
          await queue.beginWorkerDrain();
          try {
            await queue
              .getQueue(ACADEMIC_CONTENT_PUBLICATION_QUEUE)
              .obliterate({ force: true });
          } finally {
            await queue.onModuleDestroy();
          }
        }
      },
    );
    (redisUrl ? it : it.skip)(
      'recovers lost publish/expiry jobs, stale finished jobs, active work and committed schedule outage using real Redis',
      async () => {
        const queue = new BullmqService(
          new ConfigService({ NODE_ENV: 'test', QUEUE_REDIS_URL: redisUrl }),
        );
        await queue.getQueueReadiness(ACADEMIC_CONTENT_PUBLICATION_QUEUE);
        const q = queue.getQueue(ACADEMIC_CONTENT_PUBLICATION_QUEUE);
        const r = runtime(queue);
        try {
          const f = await fixture(),
            command = { clientRequestId: randomUUID() },
            useCase = new ScheduleAcademicContentPublicationUseCase(
              intentRepo(),
              r.producer,
            );
          const ensure = jest
            .spyOn(queue, 'ensureJobFromPersistedTruth')
            .mockRejectedValueOnce(new Error('queue unavailable'));
          const invoke = () =>
            runWithRequestContext(createRequestContext(), () => {
              setActor({ id: actorId, userType: UserType.SCHOOL_USER });
              setActiveMembership({
                membershipId: randomUUID(),
                organizationId,
                schoolId: f.schoolId,
                roleId: randomUUID(),
                permissions: ['academics.academic_content.publish'],
              });
              return useCase.execute(f.content.id, command);
            });
          // The command clock is current; fix repository timing to the fixture's governed term.
          const scheduleSpy = jest
            .spyOn(useCase['publications'], 'schedule')
            .mockImplementation((input) =>
              new AcademicContentPublicationRepository(
                prisma,
                new AcademicContentRevisionRepository(prisma),
              ).schedule({ ...input, now }),
            );
          const p = await invoke();
          const before = await state(f, p);
          expect(before.publication.status).toBe(PublicationStatus.SCHEDULED);
          expect(before.content.status).toBe(ContentStatus.SCHEDULED);
          const id = academicContentPublicationJobId(
            'publish',
            jobIdentity(f, p),
          );
          expect(await q.getJob(id)).toBeUndefined();
          expect(await invoke()).toEqual(p);
          expect(await state(f, p)).toEqual(before);
          expect(ensure).toHaveBeenCalledTimes(2);
          expect(await q.getJob(id)).toBeDefined();
          scheduleSpy.mockRestore();
          ensure.mockRestore();
          await q.remove(id);
          await r.reconciliation.reconcile(now);
          expect(await q.getJob(id)).toBeDefined();
          expect(
            await r.producer.ensure('publish', jobIdentity(f, p), now),
          ).toBe('preserved');
          // Isolate the finished-job exercise from other task-owned recovery fixtures.
          await q.obliterate({ force: true });
          await r.producer.ensure('publish', jobIdentity(f, p), now);
          for (const finish of ['completed', 'failed'] as const) {
            const entered = deferred(),
              release = deferred();
            const worker = queue.createWorker<object, void>(
              ACADEMIC_CONTENT_PUBLICATION_QUEUE,
              async () => {
                entered.resolve();
                await release.promise;
                if (finish === 'failed')
                  throw new UnrecoverableError('synthetic failure');
              },
            );
            const finished = new Promise<void>((resolve) => {
              worker.on(finish === 'completed' ? 'completed' : 'failed', () =>
                resolve(),
              );
            });
            await waitForSignal(entered.promise);
            expect(
              await r.producer.ensure('publish', jobIdentity(f, p), now),
            ).toBe('preserved');
            release.resolve();
            await finished;
            await worker.pause(true);
            await worker.close();
            expect(
              await r.producer.ensure('publish', jobIdentity(f, p), now),
            ).toBe('replaced');
          }
          await cancelScheduledForRecovery(f, p);
          const g = await fixture(),
            z = await schedule(g, {
              clientRequestId: randomUUID(),
              visibleUntil: expiryTime,
            });
          const expiryOutage = jest
            .spyOn(queue, 'ensureJobFromPersistedTruth')
            .mockRejectedValueOnce(new Error('expiry queue unavailable'));
          await r.worker.process('publish', jobIdentity(g, z), now);
          expect((await state(g, z)).publication.status).toBe(
            PublicationStatus.PUBLISHED,
          );
          expect(
            await q.getJob(
              academicContentPublicationJobId('expire', jobIdentity(g, z)),
            ),
          ).toBeUndefined();
          expiryOutage.mockRestore();
          await r.reconciliation.reconcile(expiryTime);
          const expiryId = academicContentPublicationJobId(
            'expire',
            jobIdentity(g, z),
          );
          expect(await q.getJob(expiryId)).toBeDefined();
          await q.remove(expiryId);
          await r.reconciliation.reconcile(expiryTime);
          expect(await q.getJob(expiryId)).toBeDefined();
          await expire(g, z);
          await q.remove(expiryId);
          await r.reconciliation.reconcile(expiryTime);
          expect(await q.getJob(expiryId)).toBeUndefined();
          const h = await fixture(),
            w = await schedule(h, {
              clientRequestId: randomUUID(),
              publishAt: new Date(now.getTime() + 60_000),
            });
          await r.producer.ensure('publish', jobIdentity(h, w), now);
          const delayed = await q.getJob(
            academicContentPublicationJobId('publish', jobIdentity(h, w)),
          );
          expect(await delayed?.getState()).toBe('delayed');
          expect(delayed?.opts.delay).toBe(60_000);
          expect(
            await r.producer.ensure('publish', jobIdentity(h, w), now),
          ).toBe('preserved');
          const poisonBefore = await state(h, w);
          await expect(
            r.worker.process(
              'publish',
              { publicationId: w.publicationId },
              now,
            ),
          ).rejects.toThrow('academic_content_publication_job_invalid');
          expect(await state(h, w)).toEqual(poisonBefore);
        } finally {
          await queue.beginWorkerDrain();
          await q.obliterate({ force: true });
          await queue.onModuleDestroy();
        }
        async function cancelScheduledForRecovery(f: Fixture, p: Publication) {
          await intentRepo().unschedule({
            ...mutation(f),
            publicationId: p.publicationId,
          });
          await q.remove(
            academicContentPublicationJobId('publish', jobIdentity(f, p)),
          );
          await r.reconciliation.reconcile(now);
          expect(
            await q.getJob(
              academicContentPublicationJobId('publish', jobIdentity(f, p)),
            ),
          ).toBeUndefined();
        }
      },
    );
  },
);
