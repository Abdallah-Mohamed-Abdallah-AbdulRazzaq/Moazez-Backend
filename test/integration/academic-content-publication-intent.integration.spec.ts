import { randomUUID } from 'node:crypto';
import {
  AcademicContentApprovalStatus as ApprovalStatus,
  AcademicContentAudienceType as Audience,
  AcademicContentPublicationStatus as PublicationStatus,
  AcademicContentStatus as ContentStatus,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as ContentType,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentPublicationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import { AcademicContentPublicationCommand } from '../../src/modules/academics/academic-content/domain/academic-content-publication.policy';

const url = process.env.DATABASE_URL;
const describeDatabase = url ? describe : describe.skip;

describeDatabase(
  'ACC-7B PostgreSQL publication intent and revision freeze',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService({
      datasources: {
        db: { url: url ?? 'postgresql://unused:unused@127.0.0.1:1/unused' },
      },
    });
    const secondUrl = new URL(
      url ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
    );
    const applicationName = `acc7b-second-${randomUUID()}`;
    secondUrl.searchParams.set('application_name', applicationName);
    const second = new PrismaService({
      datasources: { db: { url: secondUrl.toString() } },
    });
    const revisions = new AcademicContentRevisionRepository(prisma);
    const repository = new AcademicContentPublicationRepository(
      prisma,
      revisions,
    );
    const other = new AcademicContentPublicationRepository(
      second,
      new AcademicContentRevisionRepository(second),
    );
    const ids: Record<string, string> = {};
    const suffix = randomUUID().slice(0, 8);
    const now = new Date('2026-10-02T12:00:00.000Z');
    const action = (name: string) =>
      `academics.academic_content.publication.${name}`;
    const identity = (contentId: string, school: 'A' | 'B' = 'A') => ({
      contentId,
      schoolId: ids[`school${school}`],
    });
    const mutation = (contentId: string, school: 'A' | 'B' = 'A') => ({
      ...identity(contentId, school),
      organizationId: ids.organization,
      actorId: ids.user,
      now,
    });
    const schedule = (
      contentId: string,
      command: AcademicContentPublicationCommand = {
        clientRequestId: randomUUID(),
      },
      repo = repository,
    ) => repo.schedule({ ...mutation(contentId), command });
    const readiness = (contentId: string) =>
      repository.readiness({ ...identity(contentId), now });

    async function makeContent(
      options: {
        school?: 'A' | 'B';
        type?: ContentType;
        audience?: Audience;
        termId?: string;
        target?: boolean;
        detail?: boolean;
      } = {},
    ) {
      const school = options.school ?? 'A';
      const type = options.type ?? ContentType.GENERAL_RESOURCE;
      const content = await prisma.academicContent.create({
        data: {
          schoolId: ids[`school${school}`],
          academicYearId: ids[`year${school}`],
          termId: options.termId ?? ids[`term${school}`],
          type,
          audience:
            options.audience ??
            (type === ContentType.TEACHER_PREPARATION
              ? Audience.INTERNAL_STAFF
              : Audience.STUDENTS),
          title: `ACC7B ${randomUUID()}`,
          description: 'Frozen description',
          createdByUserId: ids.user,
        },
      });
      if (options.target !== false)
        await prisma.academicContentTarget.create({
          data: {
            schoolId: content.schoolId,
            academicContentId: content.id,
            scopeType: Scope.SCHOOL,
            subjectId:
              type === ContentType.GENERAL_RESOURCE
                ? null
                : ids[`subject${school}`],
            identityFingerprint: randomUUID().replace(/-/g, ''),
            createdByUserId: ids.user,
          },
        });
      if (options.detail !== false) {
        if (type === ContentType.SUBJECT_RESOURCE)
          await prisma.academicContentSubjectResourceDetail.create({
            data: {
              schoolId: content.schoolId,
              academicContentId: content.id,
              resourceCategory: AcademicSubjectResourceCategory.REFERENCE,
            },
          });
        if (type === ContentType.TEACHER_PREPARATION)
          await prisma.academicContentPreparationDetail.create({
            data: {
              schoolId: content.schoolId,
              academicContentId: content.id,
              topic: 'Internal preparation',
            },
          });
        if (type === ContentType.ONLINE_SESSION)
          await prisma.academicContentOnlineSessionDetail.create({
            data: {
              schoolId: content.schoolId,
              academicContentId: content.id,
              platform: AcademicOnlineSessionPlatform.ZOOM,
              joinUrl: 'https://example.test/meeting',
              accessCode: 'private-meeting-secret',
              startAt: new Date('2026-10-02T14:00:00Z'),
              endAt: new Date('2026-10-02T15:00:00Z'),
              timezone: 'Africa/Cairo',
            },
          });
      }
      return content;
    }

    async function addAsset(contentId: string) {
      const file = await prisma.file.create({
        data: {
          schoolId: ids.schoolA,
          organizationId: ids.organization,
          uploaderId: ids.user,
          originalName: 'valid.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12n,
          bucket: 'private-test',
          objectKey: randomUUID(),
        },
      });
      await prisma.academicContentAsset.create({
        data: {
          schoolId: ids.schoolA,
          academicContentId: contentId,
          fileId: file.id,
          sortOrder: 0,
          createdByUserId: ids.user,
        },
      });
      return file;
    }
    async function approvedContent(
      type: ContentType = ContentType.SUBJECT_RESOURCE,
      withAsset = false,
    ) {
      const content = await makeContent({ type });
      const file = withAsset ? await addAsset(content.id) : null;
      const revision = await revisions.capture(mutation(content.id));
      await prisma.academicContentApproval.create({
        data: {
          schoolId: ids.schoolA,
          academicContentId: content.id,
          revisionId: revision.id,
          roundNumber: 1,
          status: ApprovalStatus.APPROVED,
          submittedByUserId: ids.user,
          decidedByUserId: ids.user,
          decidedAt: now,
        },
      });
      await prisma.academicContent.update({
        where: { id_schoolId: { id: content.id, schoolId: ids.schoolA } },
        data: { status: ContentStatus.APPROVED },
      });
      return { content, revision, file };
    }
    async function state(contentId: string) {
      const where = { schoolId: ids.schoolA, academicContentId: contentId };
      const [content, publications, frozen, audits, recipients] =
        await Promise.all([
          prisma.academicContent.findUniqueOrThrow({
            where: { id: contentId },
          }),
          prisma.academicContentPublication.findMany({
            where,
            orderBy: { id: 'asc' },
          }),
          prisma.academicContentRevision.findMany({
            where,
            orderBy: { revisionNumber: 'asc' },
            include: { targets: true, assets: true, links: true, tags: true },
          }),
          prisma.auditLog.findMany({
            where: {
              schoolId: ids.schoolA,
              OR: [
                { resourceId: contentId },
                { after: { path: ['contentId'], equals: contentId } },
                { after: { path: ['academicContentId'], equals: contentId } },
              ],
            },
            orderBy: { id: 'asc' },
          }),
          prisma.academicContentAudienceRecipient.count({
            where: {
              schoolId: ids.schoolA,
              publication: { academicContentId: contentId },
            },
          }),
        ]);
      return { content, publications, revisions: frozen, audits, recipients };
    }
    function deferred() {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
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
      throw new Error(
        'Second PostgreSQL connection did not wait on the parent row lock',
      );
    }

    beforeAll(async () => {
      await Promise.all([prisma.$connect(), second.$connect()]);
      ids.organization = (
        await prisma.organization.create({
          data: { name: `ACC7B ${suffix}`, slug: `acc7b-${suffix}` },
        })
      ).id;
      ids.user = (
        await prisma.user.create({
          data: {
            email: `acc7b-${suffix}@example.test`,
            firstName: 'ACC',
            lastName: 'Publisher',
            userType: UserType.SCHOOL_USER,
          },
        })
      ).id;
      for (const school of ['A', 'B'] as const) {
        ids[`school${school}`] = (
          await prisma.school.create({
            data: {
              organizationId: ids.organization,
              name: `ACC7B ${school} ${suffix}`,
              slug: `acc7b-${school.toLowerCase()}-${suffix}`,
            },
          })
        ).id;
        ids[`year${school}`] = (
          await prisma.academicYear.create({
            data: {
              schoolId: ids[`school${school}`],
              nameAr: `سنة ${suffix}`,
              nameEn: `Year ${suffix}`,
              startDate: new Date('2026-01-01'),
              endDate: new Date('2027-12-31'),
            },
          })
        ).id;
        ids[`term${school}`] = (
          await prisma.term.create({
            data: {
              schoolId: ids[`school${school}`],
              academicYearId: ids[`year${school}`],
              nameAr: `فصل ${suffix}`,
              nameEn: `Term ${suffix}`,
              startDate: new Date('2026-10-01'),
              endDate: new Date('2026-10-31'),
              isActive: true,
            },
          })
        ).id;
        ids[`subject${school}`] = (
          await prisma.subject.create({
            data: {
              schoolId: ids[`school${school}`],
              nameAr: 'موضوع',
              nameEn: 'Subject',
            },
          })
        ).id;
      }
      for (const [name, start, end] of [
        ['future', '2026-11-01', '2026-11-30'],
        ['ended', '2026-09-01', '2026-09-30'],
      ]) {
        ids[name] = (
          await prisma.term.create({
            data: {
              schoolId: ids.schoolA,
              academicYearId: ids.yearA,
              nameAr: name,
              nameEn: name,
              startDate: new Date(start),
              endDate: new Date(end),
              isActive: false,
            },
          })
        ).id;
      }
    });
    afterAll(async () => {
      if (ids.schoolA) {
        const where = { schoolId: { in: [ids.schoolA, ids.schoolB] } };
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
        await prisma.academicContentPreparationDetail.deleteMany({ where });
        await prisma.academicContentSubjectResourceDetail.deleteMany({ where });
        await prisma.academicContentOnlineSessionDetail.deleteMany({ where });
        await prisma.academicContent.deleteMany({ where });
        await prisma.auditLog.deleteMany({ where });
        await prisma.file.deleteMany({ where });
        await prisma.subject.deleteMany({ where });
        await prisma.term.deleteMany({ where });
        await prisma.academicYear.deleteMany({ where });
        await prisma.school.deleteMany({
          where: { id: { in: [ids.schoolA, ids.schoolB] } },
        });
        await prisma.user.delete({ where: { id: ids.user } });
        await prisma.organization.delete({ where: { id: ids.organization } });
      }
      await Promise.all([prisma.$disconnect(), second.$disconnect()]);
    });

    it('freezes the complete DRAFT V2 snapshot and creates bounded SCHEDULED intent and audit', async () => {
      const content = await makeContent({ type: ContentType.SUBJECT_RESOURCE });
      const file = await addAsset(content.id);
      await prisma.academicContentLink.create({
        data: {
          schoolId: ids.schoolA,
          academicContentId: content.id,
          label: 'Resource',
          sortOrder: 0,
          url: 'https://example.test/resource',
          createdByUserId: ids.user,
        },
      });
      await prisma.academicContentTag.create({
        data: {
          schoolId: ids.schoolA,
          academicContentId: content.id,
          displayValue: 'Science',
          sortOrder: 0,
          normalizedValue: 'science',
          createdByUserId: ids.user,
        },
      });
      const result = await schedule(content.id);
      const saved = await state(content.id);
      expect(result).toMatchObject({
        status: PublicationStatus.SCHEDULED,
        sourceContentStatus: ContentStatus.DRAFT,
        publishAt: now,
        visibleFrom: now,
        visibleUntil: null,
        publishedAt: null,
        studentRecipientCount: 0,
        guardianRecipientContextCount: 0,
      });
      expect(saved.content.status).toBe(ContentStatus.SCHEDULED);
      expect(saved.publications).toHaveLength(1);
      expect(saved.revisions).toHaveLength(1);
      expect(saved.revisions[0]).toMatchObject({
        id: result.revisionId,
        snapshotContractVersion: 2,
        title: content.title,
        description: content.description,
        typeSpecificSnapshot: {
          type: ContentType.SUBJECT_RESOURCE,
          state: {
            resourceCategory: AcademicSubjectResourceCategory.REFERENCE,
          },
        },
      });
      expect(saved.revisions[0].targets).toHaveLength(1);
      expect(saved.revisions[0].assets[0].fileId).toBe(file.id);
      expect(saved.revisions[0].links).toHaveLength(1);
      expect(saved.revisions[0].tags).toHaveLength(1);
      expect(saved.recipients).toBe(0);
      const audit = saved.audits.find(
        (row) => row.action === action('schedule'),
      );
      expect(audit?.after).toEqual({
        contentId: content.id,
        publicationId: result.publicationId,
        revisionId: result.revisionId,
        sourceContentStatus: ContentStatus.DRAFT,
        status: PublicationStatus.SCHEDULED,
        publishAt: now.toISOString(),
        visibleFrom: now.toISOString(),
        visibleUntil: null,
        studentRecipientCount: 0,
        guardianRecipientContextCount: 0,
      });
      expect(result).not.toHaveProperty('requestFingerprint');
      expect(JSON.stringify(result)).not.toContain('private-test');
    });

    it('returns exact omitted-timing retry at T2 with the original publication/revision and no writes', async () => {
      const content = await makeContent();
      const command = { clientRequestId: randomUUID() };
      const first = await schedule(content.id, command);
      const before = await state(content.id);
      const retry = await repository.schedule({
        ...mutation(content.id),
        command,
        now: new Date('2026-11-20T12:00:00Z'),
      });
      expect(retry).toEqual(first);
      expect(await state(content.id)).toEqual(before);
      expect(
        before.audits.filter((row) => row.action === action('schedule')),
      ).toHaveLength(1);
    });
    it.each([
      PublicationStatus.CANCELLED,
      PublicationStatus.PUBLISHED,
      PublicationStatus.EXPIRED,
    ])('retains original idempotent identity after %s', async (status) => {
      const content = await makeContent();
      const command = { clientRequestId: randomUUID() };
      const first = await schedule(content.id, command);
      if (status === PublicationStatus.CANCELLED)
        await repository.unschedule({
          ...mutation(content.id),
          publicationId: first.publicationId,
        });
      else
        await prisma.academicContentPublication.updateMany({
          where: { id: first.publicationId, schoolId: ids.schoolA },
          data: {
            status,
            publishedAt: now,
            ...(status === PublicationStatus.EXPIRED
              ? { expiredAt: new Date(now.getTime() + 1000) }
              : {}),
          },
        });
      const before = await state(content.id);
      expect(
        await repository.schedule({
          ...mutation(content.id),
          command,
          now: new Date('2030-01-01'),
        }),
      ).toMatchObject({
        publicationId: first.publicationId,
        revisionId: first.revisionId,
        status,
      });
      expect(await state(content.id)).toEqual(before);
    });
    it.each([
      'content',
      'publishAt',
      'visibleFrom',
      'visibleUntilValue',
      'visibleUntilNull',
    ])(
      'fails closed for same-key changed %s without writes',
      async (changed) => {
        const content = await makeContent(),
          another = await makeContent();
        const command = { clientRequestId: randomUUID() };
        await schedule(content.id, command);
        const before = await state(content.id),
          otherBefore = await state(another.id);
        const patch =
          changed === 'publishAt'
            ? { publishAt: new Date(now.getTime() + 1000) }
            : changed === 'visibleFrom'
              ? { visibleFrom: now }
              : changed === 'visibleUntilValue'
                ? { visibleUntil: new Date('2026-10-03') }
                : changed === 'visibleUntilNull'
                  ? { visibleUntil: null }
                  : {};
        await expect(
          schedule(changed === 'content' ? another.id : content.id, {
            ...command,
            ...patch,
          }),
        ).rejects.toMatchObject({
          code: 'academic_content.publication.idempotency_conflict',
        });
        expect(await state(content.id)).toEqual(before);
        expect(await state(another.id)).toEqual(otherBefore);
      },
    );

    it.each([true, false])(
      'serializes two separate PostgreSQL connections on the parent (same key=%s)',
      async (sameKey) => {
        const content = await makeContent();
        const entered = deferred(),
          release = deferred();
        const client = prisma.$extends({
          query: {
            academicContentRevision: {
              async create({ args, query }) {
                entered.resolve();
                await release.promise;
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        const held = new AcademicContentPublicationRepository(
          client,
          new AcademicContentRevisionRepository(client),
        );
        const firstCommand = { clientRequestId: randomUUID() };
        const first = schedule(content.id, firstCommand, held);
        await entered.promise;
        const secondCommand = sameKey
          ? firstCommand
          : { clientRequestId: randomUUID() };
        const competing = schedule(content.id, secondCommand, other);
        // Attach rejection handlers before waiting for database lock evidence.
        const results = Promise.allSettled([first, competing]);
        try {
          await waitForParentLock();
        } finally {
          release.resolve();
        }
        const [winner, loser] = await results;
        expect(winner.status).toBe('fulfilled');
        if (winner.status !== 'fulfilled') throw winner.reason;
        if (sameKey) {
          expect(loser.status).toBe('fulfilled');
          if (loser.status === 'fulfilled')
            expect(loser.value).toEqual(winner.value);
        } else {
          expect(loser.status).toBe('rejected');
          if (loser.status === 'rejected')
            expect(loser.reason).toMatchObject({
              code: 'academic_content.publication.not_ready',
            });
        }
        const saved = await state(content.id);
        expect(saved.content.status).toBe(ContentStatus.SCHEDULED);
        expect(saved.publications).toHaveLength(1);
        expect(saved.revisions).toHaveLength(1);
        expect(saved.revisions[0].id).toBe(winner.value.revisionId);
        expect(
          saved.audits.filter((row) => row.action === action('schedule')),
        ).toHaveLength(1);
        expect(
          saved.audits.filter(
            (row) =>
              row.action === 'academics.academic_content.revision.capture',
          ),
        ).toHaveLength(1);
      },
    );
    it('translates a cross-content same-school key race and rolls back the losing capture', async () => {
      const a = await makeContent(),
        b = await makeContent();
      const both = deferred();
      let reached = 0;
      function racing(base: PrismaService) {
        const client = base.$extends({
          query: {
            academicContentRevision: {
              async create({ args, query }) {
                if (++reached === 2) both.resolve();
                await both.promise;
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        return new AcademicContentPublicationRepository(
          client,
          new AcademicContentRevisionRepository(client),
        );
      }
      const command = { clientRequestId: randomUUID() };
      const results = await Promise.allSettled([
        schedule(a.id, command, racing(prisma)),
        schedule(b.id, command, racing(second)),
      ]);
      expect(reached).toBe(2);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      if (rejected?.status !== 'rejected') throw new Error('Expected conflict');
      expect(rejected.reason).toMatchObject({
        code: 'academic_content.publication.idempotency_conflict',
      });
      const saved = await Promise.all([state(a.id), state(b.id)]);
      expect(saved.flatMap((row) => row.publications)).toHaveLength(1);
      expect(saved.flatMap((row) => row.revisions)).toHaveLength(1);
      expect(
        saved
          .flatMap((row) => row.audits)
          .filter((row) => row.action === action('schedule')),
      ).toHaveLength(1);
      expect(
        saved.find((row) => row.publications.length === 0)?.content.status,
      ).toBe(ContentStatus.DRAFT);
    });

    it('reuses the exact APPROVED V2 revision and ignores incomplete mutable authoring', async () => {
      const { content, revision } = await approvedContent();
      await prisma.academicContentTarget.deleteMany({
        where: { schoolId: ids.schoolA, academicContentId: content.id },
      });
      await prisma.academicContentSubjectResourceDetail.deleteMany({
        where: { schoolId: ids.schoolA, academicContentId: content.id },
      });
      await prisma.academicContent.update({
        where: { id_schoolId: { id: content.id, schoolId: ids.schoolA } },
        data: {
          title: ' ',
          type: ContentType.GENERAL_RESOURCE,
          audience: Audience.INTERNAL_STAFF,
          termId: ids.ended,
        },
      });
      expect(await readiness(content.id)).toMatchObject({
        canPublish: true,
        canSchedule: true,
      });
      const beforeApprovals = await prisma.academicContentApproval.findMany({
        where: { academicContentId: content.id },
      });
      const result = await schedule(content.id);
      expect(result).toMatchObject({
        revisionId: revision.id,
        sourceContentStatus: ContentStatus.APPROVED,
      });
      expect((await state(content.id)).revisions).toHaveLength(1);
      expect(
        await prisma.academicContentApproval.findMany({
          where: { academicContentId: content.id },
        }),
      ).toEqual(beforeApprovals);
      await repository.unschedule({
        ...mutation(content.id),
        publicationId: result.publicationId,
      });
      expect((await state(content.id)).content.status).toBe(
        ContentStatus.APPROVED,
      );
    });
    it('blocks APPROVED revision assets whose File was deleted, regardless of mutable assets', async () => {
      const { content, file } = await approvedContent(
        ContentType.SUBJECT_RESOURCE,
        true,
      );
      await prisma.academicContentAsset.updateMany({
        where: { schoolId: ids.schoolA, academicContentId: content.id },
        data: { deletedAt: now },
      });
      await prisma.file.update({
        where: { id_schoolId: { id: file!.id, schoolId: ids.schoolA } },
        data: { deletedAt: now },
      });
      expect((await readiness(content.id)).blockingReasons).toContain(
        'publication.assets_invalid',
      );
      const before = await state(content.id);
      await expect(schedule(content.id)).rejects.toMatchObject({
        code: 'academic_content.publication.not_ready',
      });
      expect(await state(content.id)).toEqual(before);
    });
    it.each(['missing', 'pending', 'v1', 'latestPending', 'invalidSnapshot'])(
      'blocks unavailable APPROVED revision strategy: %s',
      async (mode) => {
        const { content, revision } = await approvedContent();
        if (mode === 'missing')
          await prisma.academicContentApproval.deleteMany({
            where: { academicContentId: content.id, schoolId: ids.schoolA },
          });
        if (mode === 'pending')
          await prisma.academicContentApproval.updateMany({
            where: { academicContentId: content.id, schoolId: ids.schoolA },
            data: {
              status: ApprovalStatus.PENDING,
              decidedAt: null,
              decidedByUserId: null,
            },
          });
        if (mode === 'v1')
          await prisma.academicContentRevision.updateMany({
            where: { id: revision.id, schoolId: ids.schoolA },
            data: { snapshotContractVersion: 1 },
          });
        if (mode === 'invalidSnapshot')
          await prisma.academicContentRevision.updateMany({
            where: { id: revision.id, schoolId: ids.schoolA },
            data: { typeSpecificSnapshot: {} },
          });
        if (mode === 'latestPending') {
          const latest = await revisions.capture(mutation(content.id));
          await prisma.academicContentApproval.create({
            data: {
              schoolId: ids.schoolA,
              academicContentId: content.id,
              revisionId: latest.id,
              roundNumber: 2,
              status: ApprovalStatus.PENDING,
              submittedByUserId: ids.user,
            },
          });
        }
        expect(await readiness(content.id)).toMatchObject({
          canPublish: false,
          canSchedule: false,
        });
        const before = await state(content.id);
        await expect(schedule(content.id)).rejects.toMatchObject({
          code: 'academic_content.publication.not_ready',
        });
        expect(await state(content.id)).toEqual(before);
      },
    );

    it.each([
      ['current', {}, true, true],
      ['future', { term: 'future' }, false, true],
      ['ended', { term: 'ended' }, false, false],
      ['preparation', { type: ContentType.TEACHER_PREPARATION }, false, false],
      ['internal', { audience: Audience.INTERNAL_STAFF }, false, false],
      ['missingTarget', { target: false }, false, false],
      [
        'missingDetail',
        { type: ContentType.SUBJECT_RESOURCE, detail: false },
        false,
        false,
      ],
      [
        'finishedOnline',
        { type: ContentType.ONLINE_SESSION, finished: true },
        false,
        false,
      ],
    ] as const)(
      'orchestrates persisted publication readiness: %s',
      async (_name, options, canPublish, canSchedule) => {
        const opts = options as {
          term?: string;
          type?: ContentType;
          audience?: Audience;
          target?: boolean;
          detail?: boolean;
          finished?: boolean;
        };
        const content = await makeContent({
          ...opts,
          termId: opts.term ? ids[opts.term] : undefined,
        });
        if (opts.finished)
          await prisma.academicContentOnlineSessionDetail.updateMany({
            where: { academicContentId: content.id, schoolId: ids.schoolA },
            data: {
              startAt: new Date('2026-10-02T09:00:00Z'),
              endAt: new Date('2026-10-02T10:00:00Z'),
            },
          });
        expect(await readiness(content.id)).toMatchObject({
          canPublish,
          canSchedule,
        });
      },
    );
    it('allows a link-only Subject Resource with zero assets and denies active publication', async () => {
      const content = await makeContent({ type: ContentType.SUBJECT_RESOURCE });
      await prisma.academicContentLink.create({
        data: {
          schoolId: ids.schoolA,
          academicContentId: content.id,
          label: 'External resource',
          sortOrder: 0,
          url: 'https://example.test/resource',
          createdByUserId: ids.user,
        },
      });
      expect(await readiness(content.id)).toMatchObject({
        canPublish: true,
        canSchedule: true,
      });
      await schedule(content.id);
      expect((await readiness(content.id)).blockingReasons).toContain(
        'publication.active_publication_exists',
      );
    });
    it.each(['deleted', 'badMime', 'zeroSize', 'emptyStorage'])(
      'blocks internally unusable active File: %s',
      async (mode) => {
        const content = await makeContent();
        const file = await addAsset(content.id);
        await prisma.file.update({
          where: { id_schoolId: { id: file.id, schoolId: ids.schoolA } },
          data:
            mode === 'deleted'
              ? { deletedAt: now }
              : mode === 'badMime'
                ? { mimeType: 'text/html' }
                : mode === 'zeroSize'
                  ? { sizeBytes: 0n }
                  : { objectKey: '' },
        });
        expect((await readiness(content.id)).blockingReasons).toContain(
          'publication.assets_invalid',
        );
        const before = await state(content.id);
        await expect(schedule(content.id)).rejects.toMatchObject({
          code: 'academic_content.publication.not_ready',
        });
        expect(await state(content.id)).toEqual(before);
      },
    );
    it('validates year/term availability, relationship and immutable title/targets', async () => {
      const { content, revision } = await approvedContent(
        ContentType.GENERAL_RESOURCE,
      );
      await prisma.academicContentRevisionTarget.deleteMany({
        where: { revisionId: revision.id, schoolId: ids.schoolA },
      });
      await prisma.academicContentRevision.updateMany({
        where: { id: revision.id, schoolId: ids.schoolA },
        data: { title: ' ' },
      });
      expect((await readiness(content.id)).blockingReasons).toEqual(
        expect.arrayContaining([
          'publication.authoring_incomplete',
          'publication.targets_missing',
        ]),
      );
      await prisma.academicContentRevision.updateMany({
        where: { id: revision.id, schoolId: ids.schoolA },
        data: { title: 'Valid' },
      });
      const otherYear = await prisma.academicYear.create({
        data: {
          schoolId: ids.schoolA,
          nameAr: `other-${suffix}`,
          nameEn: `other-${suffix}`,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
        },
      });
      await prisma.academicContentRevision.updateMany({
        where: { id: revision.id, schoolId: ids.schoolA },
        data: { academicYearId: otherYear.id },
      });
      expect((await readiness(content.id)).blockingReasons).toContain(
        'publication.term_invalid',
      );
      await prisma.academicYear.update({
        where: { id_schoolId: { id: otherYear.id, schoolId: ids.schoolA } },
        data: { deletedAt: now },
      });
      expect((await readiness(content.id)).blockingReasons).toContain(
        'publication.term_invalid',
      );
      const future = await makeContent({ termId: ids.future });
      await prisma.term.update({
        where: { id_schoolId: { id: ids.future, schoolId: ids.schoolA } },
        data: { deletedAt: now },
      });
      expect((await readiness(future.id)).blockingReasons).toContain(
        'publication.term_invalid',
      );
      await prisma.term.update({
        where: { id_schoolId: { id: ids.future, schoolId: ids.schoolA } },
        data: { deletedAt: null },
      });
    });

    it('uses canSchedule for future inactive Term and denies immediate/past requests there', async () => {
      const content = await makeContent({ termId: ids.future });
      const before = await state(content.id);
      await expect(schedule(content.id)).rejects.toThrow();
      await expect(
        schedule(content.id, {
          clientRequestId: randomUUID(),
          publishAt: new Date('2026-10-02T11:00:00Z'),
        }),
      ).rejects.toThrow();
      expect(await state(content.id)).toEqual(before);
      const publishAt = new Date('2026-11-02T09:00:00Z');
      expect(
        await schedule(content.id, {
          clientRequestId: randomUUID(),
          publishAt,
        }),
      ).toMatchObject({
        publishAt,
        visibleFrom: publishAt,
        status: PublicationStatus.SCHEDULED,
      });
    });
    it('accepts past valid due intent and persists explicit normalized visibility', async () => {
      const content = await makeContent();
      const publishAt = new Date('2026-10-02T11:00:00Z'),
        visibleFrom = new Date('2026-10-02T13:00:00Z'),
        visibleUntil = new Date('2026-10-03T12:00:00Z');
      expect(
        await schedule(content.id, {
          clientRequestId: randomUUID(),
          publishAt,
          visibleFrom,
          visibleUntil,
        }),
      ).toMatchObject({
        publishAt,
        visibleFrom,
        visibleUntil,
        status: PublicationStatus.SCHEDULED,
      });
    });
    it.each([
      { visibleFrom: new Date('2026-10-02T11:00:00Z') },
      { visibleUntil: now },
      { publishAt: new Date('2026-11-01T10:00:00Z') },
      { publishAt: new Date(NaN) },
      { visibleFrom: new Date(NaN) },
      { visibleUntil: new Date(NaN) },
    ])('rejects invalid timing/window without writes: %j', async (patch) => {
      const content = await makeContent();
      const before = await state(content.id);
      await expect(
        schedule(content.id, { clientRequestId: randomUUID(), ...patch }),
      ).rejects.toThrow();
      expect(await state(content.id)).toEqual(before);
    });
    it('defaults Online visibility end to session end and rejects explicit null without writes', async () => {
      const content = await makeContent({ type: ContentType.ONLINE_SESSION });
      const before = await state(content.id);
      await expect(
        schedule(content.id, {
          clientRequestId: randomUUID(),
          visibleUntil: null,
        }),
      ).rejects.toThrow();
      expect(await state(content.id)).toEqual(before);
      const result = await schedule(content.id);
      expect(result.visibleUntil).toEqual(new Date('2026-10-02T15:00:00Z'));
      const audit = (await state(content.id)).audits.find(
        (row) => row.action === action('schedule'),
      );
      expect(JSON.stringify(audit?.after)).not.toContain(
        'private-meeting-secret',
      );
      expect(JSON.stringify(audit?.after)).not.toContain('meeting');
    });

    it.each(['capture', 'publication', 'content', 'audit'])(
      'rolls back every schedule write on %s failure',
      async (stage) => {
        const content = await makeContent({
          type: ContentType.SUBJECT_RESOURCE,
        });
        await addAsset(content.id);
        const before = await state(content.id);
        const client = prisma.$extends({
          query: {
            academicContentRevisionAsset: {
              async createMany({ args, query }) {
                if (stage === 'capture')
                  throw new Error('Injected capture failure');
                return query(args);
              },
            },
            academicContentPublication: {
              async create({ args, query }) {
                if (stage === 'publication')
                  throw new Error('Injected publication failure');
                return query(args);
              },
            },
            academicContent: {
              async update({ args, query }) {
                if (
                  stage === 'content' &&
                  args.data.status === ContentStatus.SCHEDULED
                )
                  throw new Error('Injected content transition failure');
                return query(args);
              },
            },
            auditLog: {
              async create({ args, query }) {
                if (
                  stage === 'audit' &&
                  args.data.action === action('schedule')
                )
                  throw new Error('Injected schedule audit failure');
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        await expect(
          schedule(
            content.id,
            { clientRequestId: randomUUID() },
            new AcademicContentPublicationRepository(
              client,
              new AcademicContentRevisionRepository(client),
            ),
          ),
        ).rejects.toThrow('Injected');
        expect(await state(content.id)).toEqual(before);
      },
    );
    it('unschedules atomically, restores DRAFT and retains the complete frozen history', async () => {
      const content = await makeContent({ type: ContentType.SUBJECT_RESOURCE });
      const scheduled = await schedule(content.id);
      const before = await state(content.id);
      const result = await repository.unschedule({
        ...mutation(content.id),
        publicationId: scheduled.publicationId,
      });
      expect(result).toMatchObject({
        status: PublicationStatus.CANCELLED,
        cancelledAt: now,
      });
      const after = await state(content.id);
      expect(after.content.status).toBe(ContentStatus.DRAFT);
      expect(after.publications[0]).toMatchObject({
        cancelledByUserId: ids.user,
        cancelledAt: now,
      });
      expect(after.revisions).toEqual(before.revisions);
      expect(after.recipients).toBe(0);
      expect(
        after.audits.find((row) => row.action === action('unschedule'))?.after,
      ).toEqual({
        contentId: content.id,
        publicationId: scheduled.publicationId,
        revisionId: scheduled.revisionId,
        fromPublicationStatus: PublicationStatus.SCHEDULED,
        toPublicationStatus: PublicationStatus.CANCELLED,
        restoredContentStatus: ContentStatus.DRAFT,
        cancelledAt: now.toISOString(),
      });
    });
    it('rolls back unschedule audit failure including cancellation actor/time and content restore', async () => {
      const content = await makeContent();
      const scheduled = await schedule(content.id);
      const before = await state(content.id);
      const client = prisma.$extends({
        query: {
          auditLog: {
            async create({ args, query }) {
              if (args.data.action === action('unschedule'))
                throw new Error('Injected unschedule audit failure');
              return query(args);
            },
          },
        },
      }) as unknown as PrismaService;
      const failing = new AcademicContentPublicationRepository(
        client,
        new AcademicContentRevisionRepository(client),
      );
      await expect(
        failing.unschedule({
          ...mutation(content.id),
          publicationId: scheduled.publicationId,
        }),
      ).rejects.toThrow('Injected');
      expect(await state(content.id)).toEqual(before);
      expect(before.publications[0]).toMatchObject({
        status: PublicationStatus.SCHEDULED,
        cancelledAt: null,
        cancelledByUserId: null,
      });
    });
    it.each([
      PublicationStatus.CANCELLED,
      PublicationStatus.PUBLISHED,
      PublicationStatus.EXPIRED,
    ])('refuses unschedule in %s without writes', async (status) => {
      const content = await makeContent();
      const scheduled = await schedule(content.id);
      if (status === PublicationStatus.CANCELLED)
        await repository.unschedule({
          ...mutation(content.id),
          publicationId: scheduled.publicationId,
        });
      else
        await prisma.academicContentPublication.updateMany({
          where: { id: scheduled.publicationId, schoolId: ids.schoolA },
          data: {
            status,
            publishedAt: now,
            ...(status === PublicationStatus.EXPIRED
              ? { expiredAt: new Date(now.getTime() + 1000) }
              : {}),
          },
        });
      const before = await state(content.id);
      await expect(
        repository.unschedule({
          ...mutation(content.id),
          publicationId: scheduled.publicationId,
        }),
      ).rejects.toMatchObject({
        code: 'academic_content.publication.cannot_unschedule',
      });
      expect(await state(content.id)).toEqual(before);
    });
    it('guards final writes by tenant and affected-row count, with canonical Content then Publication locks', async () => {
      const writes: string[] = [],
        locks: string[] = [];
      const client = prisma.$extends({
        query: {
          $queryRaw: async ({ args, query }) => {
            const sql = args.strings.join('');
            if (sql.includes('FOR UPDATE')) locks.push(sql);
            return query(args) as Promise<unknown>;
          },
          academicContent: {
            async update({ args, query }) {
              expect(args.where).toEqual({
                id_schoolId: {
                  id: expect.any(String) as unknown,
                  schoolId: ids.schoolA,
                },
              });
              writes.push('contentSchedule');
              return query(args);
            },
            async updateMany({ args, query }) {
              expect(args.where).toMatchObject({
                schoolId: ids.schoolA,
                status: ContentStatus.SCHEDULED,
                id: expect.any(String) as unknown,
              });
              writes.push('contentRestore');
              return query(args);
            },
          },
          academicContentPublication: {
            async updateMany({ args, query }) {
              expect(args.where).toMatchObject({
                schoolId: ids.schoolA,
                academicContentId: expect.any(String) as unknown,
                id: expect.any(String) as unknown,
                status: PublicationStatus.SCHEDULED,
              });
              writes.push('publicationCancel');
              return query(args);
            },
          },
        },
      }) as unknown as PrismaService;
      const scoped = new AcademicContentPublicationRepository(
        client,
        new AcademicContentRevisionRepository(client),
      );
      const content = await makeContent();
      const scheduled = await schedule(
        content.id,
        { clientRequestId: randomUUID() },
        scoped,
      );
      locks.length = 0;
      await scoped.unschedule({
        ...mutation(content.id),
        publicationId: scheduled.publicationId,
      });
      expect(writes).toEqual([
        'contentSchedule',
        'publicationCancel',
        'contentRestore',
      ]);
      expect(locks).toHaveLength(2);
      expect(locks[0]).toContain('FROM academic_contents');
      expect(locks[1]).toContain('FROM academic_content_publications');
      const another = await makeContent();
      const next = await schedule(another.id);
      const noCount = prisma.$extends({
        query: {
          academicContentPublication: {
            updateMany() {
              return Promise.resolve({ count: 0 });
            },
          },
        },
      }) as unknown as PrismaService;
      const before = await state(another.id);
      await expect(
        new AcademicContentPublicationRepository(
          noCount,
          new AcademicContentRevisionRepository(noCount),
        ).unschedule({
          ...mutation(another.id),
          publicationId: next.publicationId,
        }),
      ).rejects.toMatchObject({
        code: 'academic_content.publication.cannot_unschedule',
      });
      expect(await state(another.id)).toEqual(before);
    });

    it('keeps foreign/missing/deleted content and wrong publication pairs non-disclosing and unchanged', async () => {
      const content = await makeContent();
      const unrelated = await makeContent();
      const foreign = await makeContent({ school: 'B' });
      const scheduled = await schedule(content.id);
      const before = await state(content.id);
      for (const contentId of [foreign.id, randomUUID()]) {
        await expect(
          repository.schedule({
            ...mutation(contentId),
            command: { clientRequestId: randomUUID() },
          }),
        ).rejects.toMatchObject({
          code: 'not_found',
          message: 'Academic content not found',
        });
        await expect(
          repository.unschedule({
            ...mutation(contentId),
            publicationId: scheduled.publicationId,
          }),
        ).rejects.toMatchObject({ code: 'not_found' });
        await expect(
          repository.history({ ...identity(contentId), page: 1, limit: 20 }),
        ).rejects.toMatchObject({ code: 'not_found' });
        await expect(
          repository.detail({
            ...identity(contentId),
            publicationId: scheduled.publicationId,
          }),
        ).rejects.toMatchObject({ code: 'not_found' });
      }
      for (const publicationId of [scheduled.publicationId, randomUUID()]) {
        await expect(
          repository.unschedule({ ...mutation(unrelated.id), publicationId }),
        ).rejects.toMatchObject({
          code: 'not_found',
          message: 'Publication not found',
        });
        await expect(
          repository.detail({ ...identity(unrelated.id), publicationId }),
        ).rejects.toMatchObject({
          code: 'not_found',
          message: 'Publication not found',
        });
      }
      await expect(
        repository.unschedule({
          ...mutation(content.id, 'B'),
          publicationId: scheduled.publicationId,
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(await state(content.id)).toEqual(before);
      await prisma.academicContent.update({
        where: { id_schoolId: { id: unrelated.id, schoolId: ids.schoolA } },
        data: { deletedAt: now },
      });
      await expect(
        repository.history({ ...identity(unrelated.id), page: 1, limit: 20 }),
      ).rejects.toMatchObject({ code: 'not_found' });
      await expect(
        repository.detail({
          ...identity(unrelated.id),
          publicationId: scheduled.publicationId,
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
    });
    it('isolates identical request keys in different Schools', async () => {
      const a = await makeContent(),
        b = await makeContent({ school: 'B' });
      const command = { clientRequestId: randomUUID() };
      const first = await schedule(a.id, command);
      const otherSchool = await repository.schedule({
        ...mutation(b.id, 'B'),
        command,
      });
      expect(otherSchool.publicationId).not.toBe(first.publicationId);
    });
    it('retains cancellation history and stable newest-first bounded safe detail/pagination', async () => {
      const content = await makeContent();
      const first = await schedule(content.id);
      await repository.unschedule({
        ...mutation(content.id),
        publicationId: first.publicationId,
      });
      const next = await schedule(content.id);
      const sameCreatedAt = new Date('2026-10-02T12:00:00Z');
      await prisma.academicContentPublication.updateMany({
        where: { schoolId: ids.schoolA, academicContentId: content.id },
        data: { createdAt: sameCreatedAt },
      });
      const expectedIds = [first.publicationId, next.publicationId]
        .sort()
        .reverse();
      const before = await state(content.id);
      const p1 = await repository.history({
          ...identity(content.id),
          page: 1,
          limit: 1,
        }),
        p2 = await repository.history({
          ...identity(content.id),
          page: 2,
          limit: 1,
        });
      expect([p1.items[0].publicationId, p2.items[0].publicationId]).toEqual(
        expectedIds,
      );
      expect(p1).toMatchObject({ total: 2, page: 1, limit: 1 });
      const detail = await repository.detail({
        ...identity(content.id),
        publicationId: first.publicationId,
      });
      expect(detail.status).toBe(PublicationStatus.CANCELLED);
      expect(Object.keys(detail).sort()).toEqual(
        [
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
        ].sort(),
      );
      for (const item of [...p1.items, ...p2.items, detail]) {
        expect(item).not.toHaveProperty('requestFingerprint');
        expect(item).not.toHaveProperty('recipients');
        expect(item).not.toHaveProperty('recipientUserId');
      }
      expect(await state(content.id)).toEqual(before);
      expect(() =>
        repository.history({ ...identity(content.id), page: 1, limit: 101 }),
      ).toThrow('Publication pagination is invalid');
    });
  },
);
