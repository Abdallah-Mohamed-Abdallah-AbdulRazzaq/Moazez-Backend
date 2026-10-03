import { UnrecoverableError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { AcademicContentPublicationLifecycleRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-lifecycle.repository';
import { AcademicContentPublicationRuntimeRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-runtime.repository';
import { AcademicContentPublicationQueueService } from '../../src/modules/academics/academic-content/application/academic-content-publication-queue.service';
import { AcademicContentPublicationReconciliationService } from '../../src/modules/academics/academic-content/application/academic-content-publication-reconciliation.service';
import { AcademicContentPublicationWorker } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.worker';
import { ScheduleAcademicContentPublicationUseCase } from '../../src/modules/academics/academic-content/application/academic-content-publication.use-cases';
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
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentAudienceRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-audience.repository';
import { AcademicContentRevisionAudienceResolver } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision-audience.resolver';
import { AcademicContentPublicationSnapshotRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-snapshot.repository';
import { AcademicContentPublicationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import { AcademicContentPublicationCommand } from '../../src/modules/academics/academic-content/domain/academic-content-publication.policy';

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
      await execute(f, p);
      const before = await state(f, p);
      await cancel(f, p);
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
          (value) => ({ value, error: null }),
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
