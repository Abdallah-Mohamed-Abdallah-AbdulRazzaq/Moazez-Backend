import { randomUUID, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  AcademicContentAudienceRecipientKind as Kind,
  AcademicContentAudienceType as Audience,
  AcademicContentPublicationStatus as PublicationStatus,
  AcademicContentType as ContentType,
  CommunicationNotificationDeliveryChannel as Channel,
  CommunicationNotificationPreferenceCategory as Category,
  CommunicationNotificationSourceModule as SourceModule,
  CommunicationNotificationType as NotificationType,
  Prisma,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
} from '../../src/common/context/request-context';
import { AcademicContentPublicationNotificationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-notification.repository';
import { AcademicContentPublicationNotificationService } from '../../src/modules/academics/academic-content/application/academic-content-publication-notification.service';
import { CommunicationNotificationGenerationRepository } from '../../src/modules/communication/infrastructure/communication-notification-generation.repository';
import { CommunicationNotificationGenerationService } from '../../src/modules/communication/application/communication-notification-generation.service';
import { CommunicationNotificationPreferenceRepository } from '../../src/modules/communication/infrastructure/communication-notification-preference.repository';
import { CommunicationNotificationPreferenceService } from '../../src/modules/communication/application/communication-notification-preference.service';
import { CommunicationNotificationQueueService } from '../../src/modules/communication/application/communication-notification-queue.service';
import { CommunicationRealtimeEventsService } from '../../src/modules/communication/application/communication-realtime-events.service';
import { CommunicationNotificationPushQueueService } from '../../src/modules/communication/application/communication-notification-push-queue.service';
import { CommunicationNotificationReconciliationService } from '../../src/modules/communication/application/communication-notification-reconciliation.service';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import {
  buildAcademicContentNotificationGenerationJobId,
  COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
} from '../../src/modules/communication/domain/communication-notification-generation-domain';
import { AcademicContentPublicationWorker } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.worker';

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
describeDatabase(
  'ACC-8B PostgreSQL publication notification generation',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService({
      datasourceUrl:
        databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
    });
    const second = new PrismaService({
      datasourceUrl:
        databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
    });
    const observer = new PrismaService({
      datasourceUrl:
        databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
    });
    const now = new Date();
    let organizationId: string,
      schoolId: string,
      foreignSchoolId: string,
      actorId: string;
    let yearId: string, termId: string, classroomId: string, guardianId: string;
    const accountIds: string[] = [];
    const studentIds: string[] = [];
    const enrollmentIds: string[] = [];
    const realtime = jest.fn();
    const enqueuePush = jest.fn().mockResolvedValue(undefined);
    const ensureJob = jest.fn().mockResolvedValue('created');
    const generator = (client = prisma) =>
      new CommunicationNotificationGenerationService(
        new CommunicationNotificationGenerationRepository(client),
        {
          publishNotificationCreated: realtime,
        } as unknown as CommunicationRealtimeEventsService,
        new CommunicationNotificationPreferenceService(
          new CommunicationNotificationPreferenceRepository(client),
        ),
        {
          enqueueNotificationPushDelivery: enqueuePush,
        } as unknown as CommunicationNotificationPushQueueService,
      );
    const adapter = (client = prisma) =>
      new AcademicContentPublicationNotificationService(
        new AcademicContentPublicationNotificationRepository(client),
        generator(client),
        {
          ensureAcademicContentPublishedNotifications: ensureJob,
        } as unknown as CommunicationNotificationQueueService,
      );
    const scoped = <T>(work: () => Promise<T>, scopeSchool = schoolId) =>
      runWithRequestContext(createRequestContext(), () => {
        setActiveMembership({
          membershipId: 'queue:test',
          schoolId: scopeSchool,
          organizationId,
          roleId: 'queue:test',
          permissions: [],
        });
        return work();
      });

    beforeAll(async () => {
      await Promise.all([
        prisma.$connect(),
        second.$connect(),
        observer.$connect(),
      ]);
      const tag = randomUUID();
      organizationId = (
        await prisma.organization.create({
          data: { name: `ACC8B ${tag}`, slug: `acc8b-${tag}` },
        })
      ).id;
      actorId = (
        await prisma.user.create({
          data: {
            email: `acc8b-actor-${tag}@example.test`,
            firstName: 'ACC',
            lastName: 'Actor',
            userType: UserType.SCHOOL_USER,
          },
        })
      ).id;
      schoolId = (
        await prisma.school.create({
          data: { organizationId, name: `ACC8B ${tag}`, slug: `acc8b-${tag}` },
        })
      ).id;
      foreignSchoolId = (
        await prisma.school.create({
          data: {
            organizationId,
            name: 'ACC8B foreign',
            slug: `acc8b-foreign-${tag}`,
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
            endDate: new Date('2027-12-31'),
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
            endDate: new Date('2027-12-31'),
          },
        })
      ).id;
      const stageId = (
        await prisma.stage.create({
          data: { schoolId, nameAr: 'Stage', nameEn: 'Stage' },
        })
      ).id;
      const gradeId = (
        await prisma.grade.create({
          data: { schoolId, stageId, nameAr: 'Grade', nameEn: 'Grade' },
        })
      ).id;
      const sectionId = (
        await prisma.section.create({
          data: { schoolId, gradeId, nameAr: 'Section', nameEn: 'Section' },
        })
      ).id;
      classroomId = (
        await prisma.classroom.create({
          data: { schoolId, sectionId, nameAr: 'Room', nameEn: 'Room' },
        })
      ).id;
      for (const userType of [
        UserType.PARENT,
        UserType.STUDENT,
        UserType.STUDENT,
        UserType.STUDENT,
        UserType.TEACHER,
        UserType.STUDENT,
        UserType.STUDENT,
      ]) {
        accountIds.push(
          (
            await prisma.user.create({
              data: {
                email: `acc8b-${randomUUID()}@example.test`,
                firstName: 'Recipient',
                lastName: 'Test',
                userType,
              },
            })
          ).id,
        );
      }
      await prisma.user.update({
        where: { id: accountIds[5] },
        data: { status: UserStatus.DISABLED },
      });
      await prisma.user.update({
        where: { id: accountIds[6] },
        data: { deletedAt: now },
      });
      guardianId = (
        await prisma.guardian.create({
          data: {
            schoolId,
            organizationId,
            userId: accountIds[0],
            firstName: 'Parent',
            lastName: 'Test',
            phone: '+201000000000',
            relation: 'parent',
          },
        })
      ).id;
      for (let i = 0; i < 9; i++) {
        const student = await prisma.student.create({
          data: {
            schoolId,
            organizationId,
            firstName: 'Child',
            lastName: `Test ${i}`,
          },
        });
        studentIds.push(student.id);
        enrollmentIds.push(
          (
            await prisma.enrollment.create({
              data: {
                schoolId,
                studentId: student.id,
                academicYearId: yearId,
                termId,
                classroomId,
                enrolledAt: now,
              },
            })
          ).id,
        );
      }
      // Frozen audience remains authoritative; current links/accounts prove eligibility at persistence.
      for (let i = 3; i < 9; i++) {
        await prisma.student.update({
          where: { id: studentIds[i] },
          data: { userId: accountIds[i - 2] },
        });
      }
      await prisma.studentGuardian.createMany({
        data: studentIds
          .slice(0, 3)
          .map((studentId) => ({ schoolId, studentId, guardianId })),
      });
    });
    beforeEach(async () => {
      realtime.mockClear();
      enqueuePush.mockClear();
      ensureJob.mockClear();
      await prisma.academicContentNotificationPolicy.deleteMany({
        where: { schoolId },
      });
      await prisma.communicationNotificationPreference.deleteMany({
        where: { schoolId },
      });
      await prisma.school.update({
        where: { id: schoolId },
        data: { status: SchoolStatus.ACTIVE },
      });
    });
    afterAll(async () => {
      if (schoolId) {
        const where = { schoolId };
        await prisma.communicationNotificationPushAttempt.deleteMany({ where });
        await prisma.communicationNotificationDelivery.deleteMany({ where });
        await prisma.communicationNotification.deleteMany({ where });
        await prisma.communicationNotificationPreference.deleteMany({ where });
        await prisma.academicContentNotificationPolicy.deleteMany({ where });
        await prisma.academicContentAudienceRecipient.deleteMany({ where });
        await prisma.academicContentPublication.deleteMany({ where });
        await prisma.academicContentRevision.deleteMany({ where });
        await prisma.academicContent.deleteMany({ where });
        await prisma.studentGuardian.deleteMany({ where });
        await prisma.enrollment.deleteMany({ where });
        await prisma.student.deleteMany({ where });
        await prisma.guardian.deleteMany({ where });
        await prisma.classroom.deleteMany({ where });
        await prisma.section.deleteMany({ where });
        await prisma.grade.deleteMany({ where });
        await prisma.stage.deleteMany({ where });
        await prisma.term.deleteMany({ where });
        await prisma.academicYear.deleteMany({ where });
      }
      await prisma.school.deleteMany({
        where: { id: { in: [schoolId, foreignSchoolId].filter(Boolean) } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [...accountIds, actorId].filter(Boolean) } },
      });
      if (organizationId)
        await prisma.organization.delete({ where: { id: organizationId } });
      await Promise.all([
        prisma.$disconnect(),
        second.$disconnect(),
        observer.$disconnect(),
      ]);
    });

    async function publication() {
      const content = await prisma.academicContent.create({
        data: {
          schoolId,
          academicYearId: yearId,
          termId,
          title: 'Mutable title must not be copied',
          type: ContentType.GENERAL_RESOURCE,
          audience: Audience.STUDENTS_AND_GUARDIANS,
          createdByUserId: actorId,
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
          type: ContentType.GENERAL_RESOURCE,
          audience: Audience.STUDENTS_AND_GUARDIANS,
          title: 'Frozen publication title',
          sourceStatus: 'DRAFT',
          capturedByUserId: actorId,
          typeSpecificSnapshot: {
            joinUrl: 'hidden',
            accessCode: 'hidden',
            bucket: 'hidden',
            objectKey: 'hidden',
          },
        },
      });
      const published = await prisma.academicContentPublication.create({
        data: {
          schoolId,
          academicContentId: content.id,
          revisionId: revision.id,
          clientRequestId: randomUUID(),
          requestFingerprint: randomBytes(32).toString('hex'),
          sourceContentStatus: 'DRAFT',
          status: PublicationStatus.PUBLISHED,
          publishAt: now,
          visibleFrom: now,
          publishedAt: now,
          createdByUserId: actorId,
        },
      });
      const rows: Prisma.AcademicContentAudienceRecipientCreateManyInput[] = [
        ...[0, 1, 2].map((i) => ({
          schoolId,
          publicationId: published.id,
          revisionId: revision.id,
          recipientKind: Kind.GUARDIAN,
          identityFingerprint: randomBytes(32).toString('hex'),
          studentId: studentIds[i],
          enrollmentId: enrollmentIds[i],
          classroomId,
          guardianId,
          recipientUserId: accountIds[0],
          guardianCanReceiveNotifications: i === 2 ? false : null,
        })),
        ...accountIds.slice(1, 7).map((recipientUserId, i) => ({
          schoolId,
          publicationId: published.id,
          revisionId: revision.id,
          recipientKind: Kind.STUDENT,
          identityFingerprint: randomBytes(32).toString('hex'),
          studentId: studentIds[i + 3],
          enrollmentId: enrollmentIds[i + 3],
          classroomId,
          recipientUserId,
        })),
        {
          schoolId,
          publicationId: published.id,
          revisionId: revision.id,
          recipientKind: Kind.STUDENT,
          identityFingerprint: randomBytes(32).toString('hex'),
          studentId: studentIds[0],
          enrollmentId: enrollmentIds[0],
          classroomId,
          recipientUserId: null,
        },
      ];
      await prisma.academicContentAudienceRecipient.createMany({ data: rows });
      return {
        schoolId,
        organizationId,
        contentId: content.id,
        publicationId: published.id,
        actorUserId: actorId,
        actorUserType: UserType.SCHOOL_USER,
        revisionId: revision.id,
      };
    }
    const notifications = (publicationId: string) =>
      prisma.communicationNotification.findMany({
        where: { schoolId, sourceId: publicationId },
        orderBy: { recipientUserId: 'asc' },
        include: { deliveries: true },
      });

    async function predecessor(input: Awaited<ReturnType<typeof publication>>) {
      const current = await prisma.academicContentPublication.findUniqueOrThrow(
        {
          where: { id: input.publicationId },
        },
      );
      return prisma.academicContentPublication.create({
        data: {
          schoolId,
          academicContentId: current.academicContentId,
          revisionId: current.revisionId,
          clientRequestId: randomUUID(),
          requestFingerprint: randomBytes(32).toString('hex'),
          sourceContentStatus: 'DRAFT',
          status: PublicationStatus.EXPIRED,
          publishAt: now,
          visibleFrom: now,
          publishedAt: now,
          expiredAt: now,
          createdByUserId: actorId,
        },
      });
    }

    it.each([
      'publication',
      'school',
      'user',
      'enrollment',
      'policy',
      'update-policy',
      'event',
    ])(
      'G12 reauthorizes %s after candidate discovery at the PostgreSQL advisory barrier',
      async (change) => {
        const input = await publication();
        if (change === 'update-policy') {
          const previous = await predecessor(input);
          await prisma.academicContentPublication.update({
            where: { id: input.publicationId },
            data: {
              supersedesPublicationId: previous.id,
              changeSignificance: 'SIGNIFICANT',
            },
          });
        }
        const lockKey = `communication:academics-notifications:${schoolId}:${input.publicationId}`;
        let acquired = () => {},
          release = () => {};
        const entered = new Promise<void>((resolve) => {
          acquired = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const blocker = second.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
            acquired();
            await gate;
          },
          { timeout: 15000 },
        );
        await entered;
        const generation = scoped(() => adapter().generate(input, now));
        try {
          let waiting = false;
          const deadline = Date.now() + 5000;
          while (!waiting && Date.now() < deadline) {
            const rows = await observer.$queryRaw<
              Array<{ waiting: boolean }>
            >`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND objid = (hashtextextended(${lockKey}, 0) & 4294967295)::oid AND classid = ((hashtextextended(${lockKey}, 0) >> 32) & 4294967295)::oid) AS waiting`;
            waiting = rows[0].waiting;
          }
          // Database lock state proves discovery completed; elapsed time is only a failure bound.
          expect(waiting).toBe(true);
          if (change === 'publication')
            await observer.academicContentPublication.update({
              where: { id: input.publicationId },
              data: {
                status: PublicationStatus.EXPIRED,
                expiredAt: new Date(),
              },
            });
          if (change === 'school')
            await observer.school.update({
              where: { id: schoolId },
              data: { status: SchoolStatus.SUSPENDED },
            });
          if (change === 'user')
            await observer.user.update({
              where: { id: accountIds[1] },
              data: { status: UserStatus.DISABLED },
            });
          if (change === 'enrollment')
            await observer.enrollment.update({
              where: { id: enrollmentIds[3] },
              data: { status: 'WITHDRAWN' },
            });
          if (change === 'policy' || change === 'update-policy')
            await observer.academicContentNotificationPolicy.create({
              data: {
                schoolId,
                ...(change === 'policy'
                  ? { generalResourceNotificationsEnabled: false }
                  : { significantUpdateNotificationsEnabled: false }),
              },
            });
          if (change === 'event') {
            const previous = await predecessor(input);
            await observer.academicContentPublication.update({
              where: { id: input.publicationId },
              data: {
                supersedesPublicationId: previous.id,
                changeSignificance: 'SIGNIFICANT',
              },
            });
          }
        } finally {
          release();
          await Promise.allSettled([blocker, generation]);
        }
        try {
          await blocker;
          const result = await generation;
          const rows = await notifications(input.publicationId);
          if (change === 'user' || change === 'enrollment') {
            expect(rows).toHaveLength(3);
            expect(
              rows.some((row) => row.recipientUserId === accountIds[1]),
            ).toBe(false);
            expect(rows.every((row) => row.deliveries.length === 2)).toBe(true);
          } else {
            expect(result.createdNotificationCount).toBe(0);
            expect(rows).toHaveLength(0);
            expect(
              await prisma.communicationNotificationDelivery.count({
                where: { notification: { sourceId: input.publicationId } },
              }),
            ).toBe(0);
            expect(realtime).not.toHaveBeenCalled();
            expect(enqueuePush).not.toHaveBeenCalled();
          }
        } finally {
          await prisma.user.update({
            where: { id: accountIds[1] },
            data: { status: UserStatus.ACTIVE },
          });
          await prisma.enrollment.update({
            where: { id: enrollmentIds[3] },
            data: { status: 'ACTIVE' },
          });
        }
      },
    );

    it('uses immutable revision and audience, skips opt-outs/null/inactive/deleted/wrong-type contexts, and preserves preferences', async () => {
      const input = await publication();
      await prisma.communicationNotificationPreference.createMany({
        data: [
          {
            schoolId,
            userId: accountIds[2],
            category: Category.ACADEMIC_CONTENT,
            inAppEnabled: false,
            pushEnabled: true,
          },
          {
            schoolId,
            userId: accountIds[3],
            category: Category.ACADEMIC_CONTENT,
            inAppEnabled: true,
            pushEnabled: false,
          },
        ],
      });
      const before = await prisma.academicContentAudienceRecipient.findMany({
        where: { schoolId, publicationId: input.publicationId },
      });
      const result = await scoped(() => adapter().generate(input, now));
      expect(result.recipientCount).toBe(3);
      const rows = await notifications(input.publicationId);
      expect(rows).toHaveLength(3);
      const parent = rows.find((row) => row.recipientUserId === accountIds[0]);
      expect(parent?.metadata).toEqual({
        academicContentId: input.contentId,
        publicationId: input.publicationId,
        revisionId: input.revisionId,
        contentType: 'general_resource',
        eventType: 'academic_content_published',
        publishedAt: now.toISOString(),
        studentIds: studentIds.slice(0, 2).sort(),
        childContextCount: 2,
      });
      expect(
        rows.every(
          (row) =>
            row.title === 'New academic content' &&
            row.body === 'Frozen publication title',
        ),
      ).toBe(true);
      expect(JSON.stringify(rows)).not.toContain('hidden');
      for (const row of rows) {
        expect(row.idempotencyKey).toBe(
          `acc:published:${input.publicationId}:${row.recipientUserId}`,
        );
        expect(
          row.deliveries.filter(
            (delivery) => delivery.channel === Channel.IN_APP,
          ),
        ).toHaveLength(1);
        const push = row.deliveries.find(
          (delivery) => delivery.channel === Channel.PUSH,
        );
        expect(push?.status).toBe(
          row.recipientUserId === accountIds[3] ? 'SKIPPED' : 'PENDING',
        );
        if (row.recipientUserId === accountIds[3])
          expect(push?.errorCode).toBe('push/preference-disabled');
      }
      expect(realtime).toHaveBeenCalledTimes(3);
      expect(enqueuePush).toHaveBeenCalledTimes(2);
      expect(
        await prisma.academicContentAudienceRecipient.findMany({
          where: { schoolId, publicationId: input.publicationId },
        }),
      ).toEqual(before);
      await scoped(() => adapter().generate(input, now));
      expect(await notifications(input.publicationId)).toHaveLength(3);
      expect(realtime).toHaveBeenCalledTimes(3);
      expect(
        new Set(
          enqueuePush.mock.calls.map(
            ([delivery]: [{ deliveryId: string }]) => delivery.deliveryId,
          ),
        ).size,
      ).toBe(2);
    });

    it('persists 506 users in bounded batches and safely resumes after the second batch fails', async () => {
      const input = await publication();
      await prisma.academicContentAudienceRecipient.deleteMany({
        where: { schoolId, publicationId: input.publicationId },
      });
      const accounts = Array.from({ length: 505 }, () => ({
        id: randomUUID(),
        studentId: randomUUID(),
        enrollmentId: randomUUID(),
      }));
      accountIds.push(...accounts.map((row) => row.id));
      await prisma.user.createMany({
        data: accounts.map((row) => ({
          id: row.id,
          email: `acc8b-scale-${row.id}@example.test`,
          firstName: 'Student',
          lastName: 'Scale',
          userType: UserType.STUDENT,
        })),
      });
      await prisma.student.createMany({
        data: accounts.map((row) => ({
          id: row.studentId,
          schoolId,
          organizationId,
          userId: row.id,
          firstName: 'Student',
          lastName: 'Scale',
        })),
      });
      await prisma.enrollment.createMany({
        data: accounts.map((row) => ({
          id: row.enrollmentId,
          schoolId,
          studentId: row.studentId,
          academicYearId: yearId,
          termId,
          classroomId,
          enrolledAt: now,
        })),
      });
      await prisma.academicContentAudienceRecipient.createMany({
        data: [
          ...accounts.map((row) => ({
            schoolId,
            publicationId: input.publicationId,
            revisionId: input.revisionId,
            recipientKind: Kind.STUDENT,
            identityFingerprint: randomBytes(32).toString('hex'),
            studentId: row.studentId,
            enrollmentId: row.enrollmentId,
            classroomId,
            recipientUserId: row.id,
          })),
          ...[0, 1].map((i) => ({
            schoolId,
            publicationId: input.publicationId,
            revisionId: input.revisionId,
            recipientKind: Kind.GUARDIAN,
            identityFingerprint: randomBytes(32).toString('hex'),
            studentId: studentIds[i],
            enrollmentId: enrollmentIds[i],
            classroomId,
            guardianId,
            recipientUserId: accountIds[0],
            guardianCanReceiveNotifications: null,
          })),
        ],
      });
      const generation = generator();
      const persist =
        generation.generateForAcademicContentPublicationBatch.bind(
          generation,
        ) as CommunicationNotificationGenerationService['generateForAcademicContentPublicationBatch'];
      const sizes: number[] = [];
      let failSecondBatch = true;
      jest
        .spyOn(generation, 'generateForAcademicContentPublicationBatch')
        .mockImplementation(async (batch, authorize) => {
          sizes.push(batch.recipients.length);
          if (sizes.length === 2 && failSecondBatch) {
            failSecondBatch = false;
            throw new Error('controlled_second_batch_failure');
          }
          return persist(batch, authorize);
        });
      const service = new AcademicContentPublicationNotificationService(
        new AcademicContentPublicationNotificationRepository(prisma),
        generation,
        {} as never,
      );
      await expect(scoped(() => service.generate(input, now))).rejects.toThrow(
        'controlled_second_batch_failure',
      );
      expect(await notifications(input.publicationId)).toHaveLength(500);
      expect(
        await prisma.academicContentAudienceRecipient.count({
          where: { schoolId, publicationId: input.publicationId },
        }),
      ).toBe(507);
      expect(await scoped(() => service.generate(input, now))).toMatchObject({
        recipientCount: 506,
        createdNotificationCount: 6,
      });
      expect(sizes).toEqual([500, 6, 500, 6]);
      const rows = await notifications(input.publicationId);
      expect(rows).toHaveLength(506);
      expect(rows.every((row) => row.deliveries.length === 2)).toBe(true);
      expect(realtime).toHaveBeenCalledTimes(506);
      expect(
        new Set(
          enqueuePush.mock.calls.map(
            ([data]: [{ deliveryId: string }]) => data.deliveryId,
          ),
        ).size,
      ).toBe(506);
      expect(
        rows.find((row) => row.recipientUserId === accountIds[0])?.metadata,
      ).toMatchObject({ childContextCount: 2 });
    });

    it('keeps committed publication and snapshot intact after enqueue failure, then recovers it', async () => {
      const input = await publication();
      const before = await prisma.academicContentAudienceRecipient.findMany({
        where: { schoolId, publicationId: input.publicationId },
      });
      ensureJob.mockRejectedValueOnce(
        new Error('controlled_queue_unavailable'),
      );
      const snapshots = {
        publishScheduledPublication: jest
          .fn()
          .mockResolvedValue({ outcome: 'PUBLISHED' }),
      };
      const worker = new AcademicContentPublicationWorker(
        {} as never,
        snapshots as never,
        {} as never,
        { ensureAfterCommit: jest.fn() } as never,
        {} as never,
        adapter(),
      );
      await expect(
        worker.process(
          'publish',
          {
            schoolId,
            publicationId: input.publicationId,
            contentId: input.contentId,
          },
          now,
        ),
      ).resolves.toBeUndefined();
      expect(
        await prisma.academicContentPublication.findUnique({
          where: { id: input.publicationId },
        }),
      ).toMatchObject({ status: 'PUBLISHED' });
      expect(
        await prisma.academicContentAudienceRecipient.findMany({
          where: { schoolId, publicationId: input.publicationId },
        }),
      ).toEqual(before);
      ensureJob.mockClear();
      await new CommunicationNotificationReconciliationService(
        new CommunicationNotificationGenerationRepository(prisma),
        {} as never,
        adapter(),
        { recover: jest.fn().mockResolvedValue(0) } as never,
      ).reconcile(now);
      expect(
        ensureJob.mock.calls.some(
          ([data]: [{ publicationId: string }]) =>
            data.publicationId === input.publicationId,
        ),
      ).toBe(true);
    });

    (process.env.TEST_QUEUE_REDIS_URL ? it : it.skip)(
      'reconstructs missing, failed, finished, and lost Redis generation jobs with one identity',
      async () => {
        const queue = new BullmqService(
          new ConfigService({
            NODE_ENV: 'test',
            QUEUE_REDIS_URL: process.env.TEST_QUEUE_REDIS_URL,
          }),
        );
        const sourceQueue = new CommunicationNotificationQueueService(queue);
        const service = new AcademicContentPublicationNotificationService(
          new AcademicContentPublicationNotificationRepository(prisma),
          generator(),
          sourceQueue,
        );
        const input = await publication();
        const jobId = buildAcademicContentNotificationGenerationJobId(input);
        await queue.getQueueReadiness(COMMUNICATION_NOTIFICATION_QUEUE_NAME);
        const jobs = queue.getQueue(COMMUNICATION_NOTIFICATION_QUEUE_NAME);
        try {
          await service.ensureAfterPublicationCommit(input, now);
          await service.ensureAfterPublicationCommit(input, now);
          let job = await jobs.getJob(jobId);
          expect(job?.name).toBe(
            COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATIONS_GENERATE_JOB_NAME,
          );
          expect(job?.id).toBe(jobId);
          for (const failed of [true, false]) {
            if (!job) throw new Error('generation_job_missing');
            // Emulate the durable BullMQ terminal states without starting an additional consumer.
            await jobs.client.then((client) =>
              client.lrem(jobs.toKey('wait'), 0, jobId),
            );
            await jobs.client.then((client) =>
              client.zadd(
                jobs.toKey(failed ? 'failed' : 'completed'),
                Date.now(),
                jobId,
              ),
            );
            expect(await job.getState()).toBe(failed ? 'failed' : 'completed');
            await new CommunicationNotificationReconciliationService(
              new CommunicationNotificationGenerationRepository(prisma),
              queue,
              service,
              { recover: jest.fn().mockResolvedValue(0) } as never,
            ).reconcile(now);
            job = await jobs.getJob(jobId);
            expect(job?.id).toBe(jobId);
            expect(await job?.getState()).toBe('waiting');
          }
          await jobs.obliterate({ force: true });
          await service.recover(now);
          expect((await jobs.getJob(jobId))?.id).toBe(jobId);
          await scoped(() => service.generate(input, now));
          await scoped(() => service.generate(input, now));
          expect(await notifications(input.publicationId)).toHaveLength(4);
        } finally {
          await jobs.obliterate({ force: true });
          await queue.onModuleDestroy();
        }
      },
    );

    it('serializes two genuinely overlapping PostgreSQL generation paths, including deliveries and metadata', async () => {
      const input = await publication();
      const lockKey = `communication:academics-notifications:${schoolId}:${input.publicationId}`;
      let acquired: () => void = () => undefined,
        release: () => void = () => undefined;
      const entered = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = observer.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
          acquired();
          await gate;
        },
        { timeout: 15000 },
      );
      await entered;
      const first = scoped(() => adapter(prisma).generate(input, now));
      const concurrent = scoped(() => adapter(second).generate(input, now));
      try {
        let waiting = 0;
        const deadline = Date.now() + 4000;
        while (waiting < 2 && Date.now() < deadline) {
          const rows = await observer.$queryRaw<
            Array<{ waiting: bigint }>
          >`SELECT count(*) AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND objid = (hashtextextended(${lockKey}, 0) & 4294967295)::oid AND classid = ((hashtextextended(${lockKey}, 0) >> 32) & 4294967295)::oid`;
          waiting = Number(rows[0].waiting);
          if (waiting < 2)
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(2);
      } finally {
        release();
      }
      await blocker;
      const results = await Promise.all([first, concurrent]);
      expect(
        results.reduce(
          (sum, result) => sum + result.createdNotificationCount,
          0,
        ),
      ).toBe(4);
      const rows = await notifications(input.publicationId);
      expect(rows).toHaveLength(4);
      expect(new Set(rows.map((row) => row.idempotencyKey)).size).toBe(4);
      expect(
        rows.every(
          (row) =>
            row.deliveries.length === 2 &&
            row.deliveries.filter(
              (delivery) => delivery.channel === Channel.IN_APP,
            ).length === 1 &&
            row.deliveries.filter(
              (delivery) => delivery.channel === Channel.PUSH,
            ).length === 1,
        ),
      ).toBe(true);
      expect(realtime).toHaveBeenCalledTimes(4);
      expect(
        await prisma.communicationNotification.count({
          where: { schoolId: foreignSchoolId, sourceId: input.publicationId },
        }),
      ).toBe(0);
      expect(
        rows.every(
          (row) =>
            row.sourceModule === SourceModule.ACADEMICS &&
            row.sourceType === 'academic_content_publication' &&
            row.type === NotificationType.ACADEMIC_CONTENT_PUBLISHED,
        ),
      ).toBe(true);
    });

    it('fails closed on contradictory deterministic key without partial writes', async () => {
      const input = await publication();
      await prisma.communicationNotification.create({
        data: {
          schoolId,
          recipientUserId: accountIds[0],
          sourceModule: SourceModule.COMMUNICATION,
          sourceType: 'communication_message',
          sourceId: input.publicationId,
          type: NotificationType.MESSAGE_RECEIVED,
          title: 'Contradictory',
          body: 'Collision',
          idempotencyKey: `acc:published:${input.publicationId}:${accountIds[0]}`,
        },
      });
      await expect(
        scoped(() => adapter().generate(input, now)),
      ).rejects.toThrow('communication_notification_idempotency_collision');
      expect(await notifications(input.publicationId)).toHaveLength(1);
      expect(realtime).not.toHaveBeenCalled();
      expect(enqueuePush).not.toHaveBeenCalled();
    });

    it('repairs a committed notification with missing deliveries and does not repeat realtime', async () => {
      const input = await publication();
      await scoped(() => adapter().generate(input, now));
      const rows = await notifications(input.publicationId);
      await prisma.communicationNotificationDelivery.deleteMany({
        where: { schoolId, notificationId: rows[0].id },
      });
      realtime.mockClear();
      enqueuePush.mockClear();
      await scoped(() => adapter().generate(input, now));
      expect(
        (await notifications(input.publicationId)).every(
          (row) => row.deliveries.length === 2,
        ),
      ).toBe(true);
      expect(realtime).not.toHaveBeenCalled();
      expect(
        await prisma.academicContentPublication.findUnique({
          where: { id: input.publicationId },
        }),
      ).toMatchObject({ status: 'PUBLISHED' });
    });

    it('does not generate or recover invalid states, closed visibility, inactive tenants, foreign source identity, or stale recovery', async () => {
      const input = await publication();
      for (const status of [
        PublicationStatus.SCHEDULED,
        PublicationStatus.CANCELLED,
        PublicationStatus.EXPIRED,
      ]) {
        await prisma.academicContentPublication.update({
          where: { id: input.publicationId },
          data: {
            status,
            publishedAt: status === PublicationStatus.SCHEDULED ? null : now,
            expiredAt: status === PublicationStatus.EXPIRED ? now : null,
            cancelledAt: status === PublicationStatus.CANCELLED ? now : null,
            cancellationReason:
              status === PublicationStatus.CANCELLED ? 'WITHDRAWN' : null,
          },
        });
        expect(
          (await scoped(() => adapter().generate(input, now))).recipientCount,
        ).toBe(0);
        expect(
          (
            await new AcademicContentPublicationNotificationRepository(
              prisma,
            ).listRecoveryCandidates(now)
          ).some((row) => row.id === input.publicationId),
        ).toBe(false);
      }
      await prisma.academicContentPublication.update({
        where: { id: input.publicationId },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          expiredAt: null,
          cancelledAt: null,
          visibleUntil: now,
          visibleFrom: new Date(now.getTime() - 1),
          publishAt: new Date(now.getTime() - 2),
        },
      });
      expect(
        (await scoped(() => adapter().generate(input, now))).recipientCount,
      ).toBe(0);
      await prisma.academicContentPublication.update({
        where: { id: input.publicationId },
        data: {
          visibleUntil: null,
          publishedAt: new Date(now.getTime() - 86400001),
        },
      });
      expect(
        (
          await new AcademicContentPublicationNotificationRepository(
            prisma,
          ).listRecoveryCandidates(now)
        ).some((row) => row.id === input.publicationId),
      ).toBe(false);
      await prisma.academicContentPublication.update({
        where: { id: input.publicationId },
        data: { publishedAt: now },
      });
      await prisma.school.update({
        where: { id: schoolId },
        data: { status: SchoolStatus.SUSPENDED },
      });
      expect(
        (await scoped(() => adapter().generate(input, now))).recipientCount,
      ).toBe(0);
      await prisma.school.update({
        where: { id: schoolId },
        data: { status: 'ACTIVE' },
      });
      expect(
        (
          await scoped(
            () =>
              adapter().generate({ ...input, schoolId: foreignSchoolId }, now),
            foreignSchoolId,
          )
        ).recipientCount,
      ).toBe(0);
      expect(
        (
          await scoped(() =>
            adapter().generate({ ...input, organizationId: randomUUID() }, now),
          )
        ).recipientCount,
      ).toBe(0);
      expect(await notifications(input.publicationId)).toHaveLength(0);
    });

    it('recovers eligible published truth through the existing Communication reconciliation pass', async () => {
      const input = await publication();
      const service = new CommunicationNotificationReconciliationService(
        new CommunicationNotificationGenerationRepository(prisma),
        {} as never,
        adapter(),
        { recover: jest.fn().mockResolvedValue(0) } as never,
      );
      await service.reconcile(now);
      expect(
        ensureJob.mock.calls.some(
          ([data]: [{ publicationId: string }]) =>
            data.publicationId === input.publicationId,
        ),
      ).toBe(true);
      const reconstructed = ensureJob.mock.calls
        .map(
          ([data]: [{ publicationId: string; organizationId: string }]) => data,
        )
        .find((data) => data.publicationId === input.publicationId);
      expect(reconstructed?.organizationId).toBe(organizationId);
    });
  },
);
