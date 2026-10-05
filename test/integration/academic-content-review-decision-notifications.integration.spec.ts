import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { CommunicationNotificationQueueService } from '../../src/modules/communication/application/communication-notification-queue.service';
import { buildAcademicContentReviewDecisionJobId } from '../../src/modules/communication/domain/communication-notification-generation-domain';
import {
  AcademicContentApprovalStatus as Status,
  AppDeviceTokenSurface as Surface,
  CommunicationNotificationType as Type,
  MembershipStatus,
  Prisma,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { AcademicContentReviewDecisionNotificationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-review-decision-notification.repository';
import { AcademicContentReviewDecisionNotificationService } from '../../src/modules/academics/academic-content/application/academic-content-review-decision-notification.service';
import { CommunicationNotificationGenerationRepository } from '../../src/modules/communication/infrastructure/communication-notification-generation.repository';
import { CommunicationNotificationGenerationService } from '../../src/modules/communication/application/communication-notification-generation.service';
import { CommunicationNotificationPreferenceRepository } from '../../src/modules/communication/infrastructure/communication-notification-preference.repository';
import { CommunicationNotificationPreferenceService } from '../../src/modules/communication/application/communication-notification-preference.service';
import { CommunicationNotificationReconciliationService } from '../../src/modules/communication/application/communication-notification-reconciliation.service';
import { CommunicationNotificationGenerationWorker } from '../../src/modules/communication/infrastructure/communication-notification-generation.worker';
import { CommunicationAppNotificationCenterService } from '../../src/modules/communication/application/communication-app-notification-center.service';
import { CommunicationNotificationRepository } from '../../src/modules/communication/infrastructure/communication-notification.repository';
import { CommunicationNotificationPushRepository } from '../../src/modules/communication/infrastructure/communication-notification-push.repository';
import { CommunicationNotificationPushDeliveryService } from '../../src/modules/communication/application/communication-notification-push-delivery.service';
import { CommunicationNotificationPushPayloadBuilder } from '../../src/modules/communication/application/communication-notification-push-payload.builder';
import { AppDeviceTokenRepository } from '../../src/modules/app-device-tokens/infrastructure/app-device-token.repository';
import {
  COMMUNICATION_ACADEMIC_CONTENT_REVIEW_DECISION_GENERATE_JOB_NAME as JOB,
  CommunicationAcademicContentReviewDecisionJobData,
  COMMUNICATION_NOTIFICATION_RECOVERY_WINDOW_MS as WINDOW,
} from '../../src/modules/communication/domain/communication-notification-generation-domain';

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;
describeDatabase(
  'ACC-9E PostgreSQL review source, delivery, recovery and isolation',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService();
    const second = new PrismaService();
    const source = new AcademicContentReviewDecisionNotificationRepository(
      prisma,
    );
    const realtime = jest.fn();
    const push = jest.fn().mockResolvedValue(undefined);
    const queued = new Map<
      string,
      CommunicationAcademicContentReviewDecisionJobData
    >();
    const ensure = jest.fn(
      (data: CommunicationAcademicContentReviewDecisionJobData) => {
        const present = queued.has(data.approvalId);
        queued.set(data.approvalId, data);
        return Promise.resolve(present ? 'existing' : 'created');
      },
    );
    const generation = new CommunicationNotificationGenerationService(
      new CommunicationNotificationGenerationRepository(prisma),
      { publishNotificationCreated: realtime } as never,
      new CommunicationNotificationPreferenceService(
        new CommunicationNotificationPreferenceRepository(prisma),
      ),
      { enqueueNotificationPushDelivery: push } as never,
    );
    const service = new AcademicContentReviewDecisionNotificationService(
      source,
      generation,
      { ensureAcademicContentReviewDecision: ensure } as never,
    );
    let organizationId: string,
      schoolId: string,
      foreignSchoolId: string,
      yearId: string,
      termId: string,
      roleId: string,
      teacherId: string,
      otherId: string,
      reviewerId: string,
      membershipId: string;
    const now = new Date();
    const scope = <T>(action: () => T, school = schoolId) => {
      const context = createRequestContext();
      context.activeMembership = {
        schoolId: school,
        organizationId,
        membershipId: 'queue:test',
        roleId: 'queue:test',
        permissions: [],
      };
      return runWithRequestContext(context, action);
    };
    const job = (
      approvalId: string,
    ): CommunicationAcademicContentReviewDecisionJobData => ({
      schoolId,
      organizationId,
      approvalId,
      actorUserId: null,
      actorUserType: null,
    });
    const rows = (approvalId: string) =>
      prisma.communicationNotification.findMany({
        where: { schoolId, sourceId: approvalId },
        include: { deliveries: true },
      });
    async function decision(
      status: Status = Status.APPROVED,
      submittedByUserId = teacherId,
      decidedAt: Date = now,
    ) {
      const content = await prisma.academicContent.create({
        data: {
          schoolId,
          academicYearId: yearId,
          termId,
          createdByUserId: otherId,
          type: 'TEACHER_PREPARATION',
          audience: 'INTERNAL_STAFF',
          title: 'Mutable content title',
        },
      });
      const revision = await prisma.academicContentRevision.create({
        data: {
          schoolId,
          academicContentId: content.id,
          academicYearId: yearId,
          termId,
          revisionNumber: 1,
          snapshotContractVersion: 2,
          type: 'TEACHER_PREPARATION',
          audience: 'INTERNAL_STAFF',
          title: 'Frozen reviewed title',
          sourceStatus: 'DRAFT',
          capturedByUserId: submittedByUserId,
        },
      });
      const approval = await prisma.academicContentApproval.create({
        data: {
          schoolId,
          academicContentId: content.id,
          revisionId: revision.id,
          roundNumber: 1,
          status,
          submittedByUserId,
          submittedAt: new Date(decidedAt.getTime() - 1000),
          decidedByUserId: status === Status.PENDING ? null : reviewerId,
          decidedAt: status === Status.PENDING ? null : decidedAt,
          decisionNote:
            status === Status.CHANGES_REQUESTED
              ? 'Private reviewer feedback'
              : null,
        },
      });
      return { content, revision, approval, data: job(approval.id) };
    }
    beforeAll(async () => {
      await prisma.$connect();
      await second.$connect();
      const suffix = randomUUID();
      organizationId = (
        await prisma.organization.create({
          data: { name: 'ACC9E', slug: 'acc9e-' + suffix },
        })
      ).id;
      schoolId = (
        await prisma.school.create({
          data: { organizationId, name: 'ACC9E', slug: 'acc9e-' + suffix },
        })
      ).id;
      foreignSchoolId = (
        await prisma.school.create({
          data: {
            organizationId,
            name: 'ACC9E foreign',
            slug: 'acc9e-foreign-' + suffix,
          },
        })
      ).id;
      yearId = (
        await prisma.academicYear.create({
          data: {
            schoolId,
            nameAr: 'Year',
            nameEn: 'Year',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2030-12-31'),
          },
        })
      ).id;
      termId = (
        await prisma.term.create({
          data: {
            schoolId,
            academicYearId: yearId,
            nameAr: 'Term',
            nameEn: 'Term',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2030-12-31'),
          },
        })
      ).id;
      const users = await Promise.all(
        [UserType.TEACHER, UserType.TEACHER, UserType.SCHOOL_USER].map(
          (userType) =>
            prisma.user.create({
              data: {
                userType,
                firstName: 'ACC9E',
                lastName: 'Fixture',
                email: randomUUID() + '@example.test',
              },
            }),
        ),
      );
      [teacherId, otherId, reviewerId] = users.map((user) => user.id);
      roleId = (
        await prisma.role.create({
          data: { schoolId, key: 'acc9e-' + suffix, name: 'Teacher fixture' },
        })
      ).id;
      membershipId = (
        await prisma.membership.create({
          data: {
            schoolId,
            organizationId,
            roleId,
            userId: teacherId,
            userType: UserType.TEACHER,
          },
        })
      ).id;
    });
    beforeEach(() => {
      realtime.mockClear();
      push.mockClear();
      ensure.mockClear();
    });
    afterEach(async () => {
      jest.restoreAllMocks();
      await prisma.user.update({
        where: { id: teacherId },
        data: { status: UserStatus.ACTIVE, deletedAt: null },
      });
      await prisma.membership.update({
        where: { id: membershipId },
        data: {
          schoolId,
          organizationId,
          userType: UserType.TEACHER,
          status: MembershipStatus.ACTIVE,
          deletedAt: null,
          endedAt: null,
        },
      });
      await prisma.communicationNotificationPreference.deleteMany({
        where: { schoolId },
      });
    });
    afterAll(async () => {
      const schools = { in: [schoolId, foreignSchoolId] };
      await prisma.communicationNotificationPushAttempt.deleteMany({
        where: { schoolId: schools },
      });
      await prisma.communicationNotificationDelivery.deleteMany({
        where: { schoolId: schools },
      });
      await prisma.communicationNotification.deleteMany({
        where: { schoolId: schools },
      });
      await prisma.appDeviceToken.deleteMany({ where: { schoolId: schools } });
      await prisma.communicationNotificationPreference.deleteMany({
        where: { schoolId: schools },
      });
      await prisma.academicContentApproval.deleteMany({
        where: { schoolId: schools },
      });
      await prisma.academicContentRevision.deleteMany({
        where: { schoolId: schools },
      });
      await prisma.academicContent.deleteMany({ where: { schoolId: schools } });
      await prisma.membership.deleteMany({ where: { schoolId: schools } });
      await prisma.role.deleteMany({ where: { schoolId: schools } });
      await prisma.term.deleteMany({ where: { schoolId: schools } });
      await prisma.academicYear.deleteMany({ where: { schoolId: schools } });
      await prisma.school.deleteMany({ where: { id: schools } });
      await prisma.organization.delete({ where: { id: organizationId } });
      await prisma.user.deleteMany({
        where: { id: { in: [teacherId, otherId, reviewerId] } },
      });
      await second.$disconnect();
      await prisma.$disconnect();
    });
    it('retains every baseline PostgreSQL notification enum and appends exactly the two review types', async () => {
      const values = await prisma.$queryRaw<
        { value: string }[]
      >`SELECT enumlabel AS value FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='communication_notification_type' ORDER BY enumsortorder`;
      expect(values.map((row) => row.value)).toEqual(Object.values(Type));
      expect(values.slice(-2).map((row) => row.value)).toEqual([
        Type.ACADEMIC_CONTENT_APPROVED,
        Type.ACADEMIC_CONTENT_CHANGES_REQUESTED,
      ]);
    });
    it.each([Status.APPROVED, Status.CHANGES_REQUESTED])(
      'serializes concurrent %s generation and emits realtime once using frozen revision copy',
      async (status) => {
        const event = await decision(status);
        await Promise.all(
          Array.from({ length: 3 }, () =>
            scope(() => service.generate(event.data)),
          ),
        );
        const notifications = await rows(event.approval.id);
        expect(notifications).toHaveLength(1);
        const row = notifications[0];
        expect(row.recipientUserId).toBe(teacherId);
        expect(row.actorUserId).toBe(reviewerId);
        expect(row.sourceType).toBe('academic_content_approval');
        expect(row.sourceModule).toBe('ACADEMICS');
        expect(row.type).toBe(
          status === Status.APPROVED
            ? Type.ACADEMIC_CONTENT_APPROVED
            : Type.ACADEMIC_CONTENT_CHANGES_REQUESTED,
        );
        expect(row.title).toBe(
          status === Status.APPROVED
            ? 'Academic content approved'
            : 'Changes requested',
        );
        expect(row.body).toBe(event.revision.title);
        expect(row.idempotencyKey).toBe(
          `acc:review:${event.approval.id}:${status === Status.APPROVED ? 'approved' : 'changes-requested'}:${teacherId}`,
        );
        expect(row.metadata).toEqual({
          academicContentId: event.content.id,
          revisionId: event.revision.id,
          approvalId: event.approval.id,
          roundNumber: 1,
          decision: status.toLowerCase(),
        });
        expect(
          row.deliveries.map((delivery) => delivery.channel).sort(),
        ).toEqual(['IN_APP', 'PUSH']);
        expect(realtime).toHaveBeenCalledTimes(1);
      },
    );
    it.each([Status.APPROVED, Status.CHANGES_REQUESTED])(
      'uses existing in-app and push preference semantics for %s',
      async (status) => {
        const event = await decision(status);
        const preference =
          await prisma.communicationNotificationPreference.create({
            data: {
              schoolId,
              userId: teacherId,
              category: 'ACADEMIC_CONTENT',
              inAppEnabled: false,
              pushEnabled: true,
            },
          });
        await scope(() => service.generate(event.data));
        expect(await rows(event.approval.id)).toHaveLength(0);
        expect(realtime).not.toHaveBeenCalled();
        await prisma.communicationNotificationPreference.update({
          where: { id: preference.id },
          data: { inAppEnabled: true, pushEnabled: false },
        });
        await scope(() => service.generate(event.data));
        expect(
          (await rows(event.approval.id))[0].deliveries.map(
            (row) => row.channel,
          ),
        ).toEqual(['IN_APP']);
        expect(push).not.toHaveBeenCalled();
      },
    );
    it.each([
      'user-disabled',
      'user-deleted',
      'membership-inactive',
      'membership-transferred',
      'membership-suspended',
      'membership-deleted',
      'membership-ended',
      'membership-wrong-school',
      'membership-wrong-type',
      'membership-wrong-org',
      'no-membership',
    ])(
      'skips %s recipients without falling back to creator or reviewer',
      async (scenario) => {
        const event = await decision();
        if (scenario === 'user-disabled')
          await prisma.user.update({
            where: { id: teacherId },
            data: { status: UserStatus.DISABLED },
          });
        else if (scenario === 'user-deleted')
          await prisma.user.update({
            where: { id: teacherId },
            data: { deletedAt: now },
          });
        else {
          const updates: Record<string, Prisma.MembershipUpdateInput> = {
            'membership-inactive': {
              status: MembershipStatus.INACTIVE,
              endedAt: new Date(),
            },
            'membership-transferred': {
              status: MembershipStatus.TRANSFERRED,
              endedAt: new Date(),
            },
            'membership-suspended': { status: MembershipStatus.SUSPENDED },
            'membership-deleted': { deletedAt: now },
            'membership-ended': { endedAt: now },
            'membership-wrong-school': {
              school: { connect: { id: foreignSchoolId } },
            },
            'membership-wrong-type': { userType: UserType.SCHOOL_USER },

            'no-membership': { school: { disconnect: true } },
          };
          if (scenario === 'membership-wrong-org') {
            expect(
              await source.eligibleRecipient({
                ...(await source.findSource(event.data, now))!,
                school: { organizationId: randomUUID() },
              }),
            ).toBe(false);
            return;
          }
          await prisma.membership.update({
            where: { id: membershipId },
            data: updates[scenario],
          });
        }
        await scope(() => service.generate(event.data));
        expect(await rows(event.approval.id)).toHaveLength(0);
      },
    );
    it('skips pending, non-Teacher, wrong School/org, non-preparation and non-V2 source identities', async () => {
      for (const status of [Status.PENDING, Status.APPROVED]) {
        const event = await decision(
          status,
          status === Status.APPROVED ? reviewerId : teacherId,
        );
        await scope(() => service.generate(event.data));
        expect(await rows(event.approval.id)).toHaveLength(0);
      }
      const event = await decision();
      for (const data of [
        { ...event.data, schoolId: foreignSchoolId },
        { ...event.data, organizationId: randomUUID() },
        { ...event.data, approvalId: randomUUID() },
      ])
        await scope(() => service.generate(data));
      await prisma.academicContentRevision.update({
        where: { id: event.revision.id },
        data: { snapshotContractVersion: 1 },
      });
      await scope(() => service.generate(event.data));
      await prisma.academicContentRevision.update({
        where: { id: event.revision.id },
        data: { snapshotContractVersion: 2, type: 'GENERAL_RESOURCE' },
      });
      await scope(() => service.generate(event.data));
      expect(await rows(event.approval.id)).toHaveLength(0);
    });
    it.each(['recipient', 'source', 'type'])(
      'fails closed on an existing %s idempotency collision',
      async (kind) => {
        const event = await decision();
        await scope(() => service.generate(event.data));
        const [row] = await rows(event.approval.id);
        const data =
          kind === 'recipient'
            ? { recipientUserId: otherId }
            : kind === 'source'
              ? { sourceId: randomUUID() }
              : { type: Type.SYSTEM_ALERT };
        await prisma.communicationNotification.update({
          where: { id: row.id },
          data,
        });
        await expect(scope(() => service.generate(event.data))).rejects.toThrow(
          'communication_notification_idempotency_collision',
        );
        expect(
          await prisma.communicationNotification.count({
            where: { schoolId, idempotencyKey: row.idempotencyKey },
          }),
        ).toBe(1);
        expect(realtime).toHaveBeenCalledTimes(1);
      },
    );
    it('revalidates a recipient deactivated after candidate discovery but before generation persistence', async () => {
      const event = await decision();
      const authorizationSource =
        new AcademicContentReviewDecisionNotificationRepository(prisma);
      jest
        .spyOn(source, 'authorize')
        .mockImplementation(async (tx, data, at) => {
          await second.membership.update({
            where: { id: membershipId },
            data: { status: MembershipStatus.INACTIVE, endedAt: new Date() },
          });
          return authorizationSource.authorize(tx, data, at);
        });
      await scope(() => service.generate(event.data));
      expect(await rows(event.approval.id)).toHaveLength(0);
    });
    it('holds recipient row locks through commit; later deactivation preserves historical notification', async () => {
      const event = await decision();
      const authorizationSource =
        new AcademicContentReviewDecisionNotificationRepository(prisma);
      let release = () => {};
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      let locked = () => {};
      const reached = new Promise<void>((resolve) => {
        locked = resolve;
      });
      jest
        .spyOn(source, 'authorize')
        .mockImplementation(async (tx, data, at) => {
          const current = await authorizationSource.authorize(tx, data, at);
          locked();
          await barrier;
          return current;
        });
      const generating = scope(() => service.generate(event.data));
      await reached;
      let pid = 0;
      let started = () => {};
      const updating = new Promise<void>((resolve) => {
        started = resolve;
      });
      const deactivate = second.$transaction(async (tx) => {
        pid = (
          await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`
        )[0].pid;
        started();
        await tx.membership.update({
          where: { id: membershipId },
          data: { status: MembershipStatus.INACTIVE, endedAt: new Date() },
        });
      });
      await updating;
      try {
        const deadline = Date.now() + 5000;
        let blocked = false;
        while (Date.now() < deadline) {
          blocked = (
            await prisma.$queryRaw<
              { blocked: boolean }[]
            >`SELECT cardinality(pg_blocking_pids(${pid}::int)) > 0 AS blocked`
          )[0].blocked;
          if (blocked) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(blocked).toBe(true);
      } finally {
        release();
      }
      await generating;
      await deactivate;
      expect(await rows(event.approval.id)).toHaveLength(1);
      await scope(() => service.generate(event.data));
      expect(await rows(event.approval.id)).toHaveLength(1);
    });
    it('restores crash-window jobs through existing reconciliation with strict 24-hour bounds and deterministic pages', async () => {
      queued.clear();
      const old = await decision(
        Status.APPROVED,
        teacherId,
        new Date(now.getTime() - WINDOW),
      );
      const future = await decision(
        Status.APPROVED,
        teacherId,
        new Date(now.getTime() + 1),
      );
      const inside = await decision(
        Status.CHANGES_REQUESTED,
        teacherId,
        new Date(now.getTime() - WINDOW + 1),
      );
      const events = await Promise.all(
        Array.from({ length: 102 }, () => decision()),
      );
      const reconcile = new CommunicationNotificationReconciliationService(
        {
          listPublishedAnnouncementRecoveryCandidates: jest
            .fn()
            .mockResolvedValue({ candidates: [], next: null }),
        } as never,
        {} as never,
        { recover: jest.fn().mockResolvedValue(0) } as never,
        service,
      );
      await reconcile.reconcile(now);
      expect(queued.has(old.approval.id)).toBe(false);
      expect(queued.has(future.approval.id)).toBe(false);
      expect(queued.has(inside.approval.id)).toBe(true);
      for (const event of events)
        expect(queued.has(event.approval.id)).toBe(true);
      const pages = await source.listRecoveryCandidates(
        now,
        new Date(now.getTime() - WINDOW),
      );
      expect(pages.candidates).toHaveLength(100);
      expect(pages.next).not.toBeNull();
      let process: (input: {
        name: string;
        id: string;
        data: unknown;
      }) => Promise<void> = () =>
        Promise.reject(new Error('worker_not_registered'));
      new CommunicationNotificationGenerationWorker(
        {
          createWorker: (_name: string, handler: typeof process) => {
            process = handler;
          },
        } as never,
        {} as never,
        reconcile,
        {} as never,
        service,
      ).onModuleInit();
      const data = queued.get(inside.approval.id)!;
      await process({ name: JOB, id: inside.approval.id, data });
      await reconcile.reconcile(now);
      await process({ name: JOB, id: inside.approval.id, data });
      expect(await rows(inside.approval.id)).toHaveLength(1);
      expect(realtime).toHaveBeenCalledTimes(1);
    });
    it('uses the existing Teacher inbox with category filtering and School/recipient read isolation', async () => {
      const event = await decision();
      await scope(() => service.generate(event.data));
      const [row] = await rows(event.approval.id);
      const inbox = new CommunicationAppNotificationCenterService(
        new CommunicationNotificationRepository(prisma),
      );
      const result = await scope(() =>
        inbox.listForActor({
          recipientUserId: teacherId,
          query: { category: 'academic_content' },
          aliasStyle: 'camel',
        }),
      );
      expect(
        result.notifications.some((item) => item.notificationId === row.id),
      ).toBe(true);
      const detail = () =>
        inbox.getForActor({
          recipientUserId: teacherId,
          notificationId: row.id,
          aliasStyle: 'camel',
        });
      expect((await scope(detail)).notification.deepLink).toMatchObject({
        type: 'teacher_academic_content',
        approvalId: event.approval.id,
      });
      await expect(
        scope(() =>
          inbox.getForActor({
            recipientUserId: otherId,
            notificationId: row.id,
            aliasStyle: 'camel',
          }),
        ),
      ).rejects.toThrow();
      await expect(scope(detail, foreignSchoolId)).rejects.toThrow();
      await scope(() =>
        inbox.markReadForActor({
          recipientUserId: teacherId,
          notificationId: row.id,
          aliasStyle: 'camel',
        }),
      );
      await scope(() =>
        inbox.archiveForActor({
          recipientUserId: teacherId,
          notificationId: row.id,
          aliasStyle: 'camel',
        }),
      );
      expect(
        await prisma.academicContentApproval.findUniqueOrThrow({
          where: { id: event.approval.id },
        }),
      ).toEqual(event.approval);
    });
    (process.env.TEST_QUEUE_REDIS_URL ? it : it.skip)(
      'restores missing and terminal review jobs in the existing Redis queue',
      async () => {
        const queue = new BullmqService(
          new ConfigService({
            NODE_ENV: 'test',
            QUEUE_REDIS_URL: process.env.TEST_QUEUE_REDIS_URL,
          }),
        );
        const reviewService =
          new AcademicContentReviewDecisionNotificationService(
            source,
            generation,
            new CommunicationNotificationQueueService(queue),
          );
        const event = await decision();
        const jobId = buildAcademicContentReviewDecisionJobId(event.data);
        await queue.getQueueReadiness('communication-notifications');
        const jobs = queue.getQueue('communication-notifications');
        try {
          await reviewService.recover(new Date());
          let persisted = await jobs.getJob(jobId);
          expect(persisted?.name).toBe(JOB);
          for (const state of ['failed', 'completed']) {
            if (!persisted) throw new Error('review_job_missing');
            await jobs.client.then((client) =>
              client.lrem(jobs.toKey('wait'), 0, jobId),
            );
            await jobs.client.then((client) =>
              client.zadd(jobs.toKey(state), Date.now(), jobId),
            );
            expect(await persisted.getState()).toBe(state);
            await reviewService.recover(new Date());
            persisted = await jobs.getJob(jobId);
            expect(await persisted?.getState()).toBe('waiting');
          }
          await persisted?.remove();
          await reviewService.recover(new Date());
          expect((await jobs.getJob(jobId))?.data).toMatchObject({
            approvalId: event.approval.id,
            schoolId,
            organizationId,
          });
          await scope(() => reviewService.generate(event.data));
          await scope(() => reviewService.generate(event.data));
          expect(await rows(event.approval.id)).toHaveLength(1);
          expect(realtime).toHaveBeenCalledTimes(1);
        } finally {
          await jobs.obliterate({ force: true });
          await queue.onModuleDestroy();
        }
      },
    );
    it('delivers only to current Teacher tokens across all registered surfaces and reuses push attempts', async () => {
      const event = await decision();
      await scope(() => service.generate(event.data));
      const [notification] = await rows(event.approval.id);
      const delivery = notification.deliveries.find(
        (row) => row.channel === 'PUSH',
      )!;
      const tokens = await Promise.all(
        Object.values(Surface).map((appSurface) =>
          prisma.appDeviceToken.create({
            data: {
              schoolId,
              userId: teacherId,
              appSurface,
              platform: 'ANDROID',
              tokenHash: randomUUID(),
              tokenCiphertext: appSurface,
            },
          }),
        ),
      );
      const sendBatch = jest.fn((input: { tokens: string[] }) => {
        expect(input.tokens).toEqual([Surface.TEACHER]);
        return Promise.resolve({
          status: 'sent',
          provider: 'firebase_fcm',
          successCount: 1,
          failureCount: 0,
          results: [
            { tokenIndex: 0, status: 'sent', providerMessageId: 'fixture' },
          ],
        });
      });
      const deliver = new CommunicationNotificationPushDeliveryService(
        new CommunicationNotificationPushRepository(prisma),
        new AppDeviceTokenRepository(prisma),
        { decrypt: (value: string) => value } as never,
        { sendBatch } as never,
        new CommunicationNotificationPushPayloadBuilder(),
      );
      await scope(() =>
        deliver.processDelivery({ schoolId, deliveryId: delivery.id }),
      );
      expect(sendBatch.mock.calls[0][0].tokens).toEqual([Surface.TEACHER]);
      expect(
        (
          await prisma.communicationNotificationPushAttempt.findMany({
            where: { deliveryId: delivery.id },
          })
        ).map((row) => row.deviceTokenId),
      ).toEqual([tokens.find((row) => row.appSurface === Surface.TEACHER)!.id]);
      await scope(() =>
        deliver.processDelivery({ schoolId, deliveryId: delivery.id }),
      );
      expect(sendBatch).toHaveBeenCalledTimes(1);
      await prisma.appDeviceToken.updateMany({
        where: { schoolId, appSurface: Surface.TEACHER },
        data: { isActive: false },
      });
      const another = await decision();
      await scope(() => service.generate(another.data));
      const [next] = await rows(another.approval.id);
      await scope(() =>
        deliver.processDelivery({
          schoolId,
          deliveryId: next.deliveries.find((row) => row.channel === 'PUSH')!.id,
        }),
      );
      expect(sendBatch).toHaveBeenCalledTimes(1);
    });
  },
);
