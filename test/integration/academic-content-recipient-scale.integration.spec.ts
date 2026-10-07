import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentRecipientReadRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-recipient-read.repository';
import {
  AcademicContentRecipientQuery,
  ParentAcademicContentType,
  normalizeAcademicContentRecipientQuery,
} from '../../src/modules/academics/academic-content/domain/academic-content-recipient.query';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';
import {
  AcademicContentScaleFixture,
  SCALE_AUDIENCES,
  SCALE_BASE_PUBLICATIONS,
  SCALE_SCOPES,
  SCALE_TYPES,
} from '../fixtures/academic-content-scale.fixture';

type Query = AcademicContentRecipientQuery<ParentAcademicContentType>;
type PlanNode = {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Actual Rows': number;
  'Actual Loops': number;
  'Rows Removed by Filter'?: number;
  'Rows Removed by Index Recheck'?: number;
  'Sort Method'?: string;
  'Sort Space Used'?: number;
  'Sort Space Type'?: string;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  'Temp Read Blocks'?: number;
  'Temp Written Blocks'?: number;
  Plans?: PlanNode[];
};
type PlanDocument = {
  Plan: PlanNode;
  'Planning Time': number;
  'Execution Time': number;
};

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;
describeDatabase(
  'ACC-10E production recipient SQL at large-School scale',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService();
    const fixture = new AcademicContentScaleFixture(prisma);
    const reads = new AcademicContentRecipientReadRepository(prisma);
    const evidenceDirectory = join(
      process.cwd(),
      'coverage',
      'acc10e',
      'plans',
    );
    const feed = (
      actor: 'STUDENT' | 'PARENT',
      query: Query = {},
      child = 0,
    ) => {
      const context = fixture.context(actor, child);
      const normalized = normalizeAcademicContentRecipientQuery(query, actor);
      return context.actorKind === 'STUDENT'
        ? reads.listCurrentStudentPublications(context, normalized, fixture.now)
        : reads.listCurrentParentPublications(context, normalized, fixture.now);
    };

    beforeAll(async () => {
      assertDisposablePostgresTarget({
        databaseUrl: process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV,
        universalRegressionMarker:
          process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
        localDatabasePredicate: (name) =>
          /^(?:ci_[0-9a-f]{14}|moazez_test(?:_[a-z0-9_-]+)?)$/.test(name),
        errorMessage:
          'ACC-10E scale evidence requires a disposable PostgreSQL fixture',
      });
      await prisma.$connect();
      await fixture.create();
      mkdirSync(evidenceDirectory, { recursive: true });
    });
    beforeEach(async () => {
      await fixture.resetRelationships();
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });
    afterAll(async () => {
      try {
        await fixture.dispose();
        expect(
          await prisma.academicContentPublication.count({
            where: { schoolId: { in: fixture.schools.map((s) => s.schoolId) } },
          }),
        ).toBe(0);
      } finally {
        await prisma.$disconnect();
      }
    });

    // This oracle describes the deterministic seed distribution, without querying an ACL.
    function expected(actor: 'STUDENT' | 'PARENT', query: Query = {}) {
      const result: {
        id: string;
        contentId: string;
        revisionId: string;
        visibleFrom: number;
      }[] = [];
      for (let serial = 1; serial <= SCALE_BASE_PUBLICATIONS; serial++) {
        const type = SCALE_TYPES[(serial - 1) % 6];
        const audience =
          type === 'TEACHER_PREPARATION'
            ? 'INTERNAL_STAFF'
            : type === 'GUARDIAN_WEEKLY_NOTE'
              ? 'GUARDIANS'
              : type === 'ONLINE_SESSION'
                ? SCALE_AUDIENCES[Math.floor((serial - 1) / 6) % 2]
                : type === 'GENERAL_RESOURCE'
                  ? SCALE_AUDIENCES[Math.floor((serial - 1) / 6) % 4]
                  : SCALE_AUDIENCES[Math.floor((serial - 1) / 6) % 3];
        const qualification = Math.floor((serial - 1) / 120) % 3;
        const successor = serial % 100 === 25;
        if (!successor && serial % 17 < 4) continue;
        if (
          type === 'TEACHER_PREPARATION' ||
          (actor === 'STUDENT' && type === 'GUARDIAN_WEEKLY_NOTE')
        )
          continue;
        if (
          audience !== 'STUDENTS_AND_GUARDIANS' &&
          audience !== (actor === 'STUDENT' ? 'STUDENTS' : 'GUARDIANS')
        )
          continue;
        if (
          qualification === 2 ||
          (query.subjectId &&
            (qualification !== 1 ||
              query.subjectId !== fixture.target.subjectId))
        )
          continue;
        if (query.type && query.type !== type) continue;
        const title = `${successor ? 'Successor' : 'Scale'} ${serial}`;
        if (
          query.search &&
          !`${title} Topic ${serial % 7}`
            .toLowerCase()
            .includes(query.search.toLowerCase())
        )
          continue;
        if (query.tag && query.tag.toLowerCase() !== `group ${serial % 4}`)
          continue;
        const week = Math.floor(serial / 6) % 3;
        const weekStart = new Date(Date.UTC(2026, 9, 5 + week * 7))
          .toISOString()
          .slice(0, 10);
        const weekEnd = new Date(Date.UTC(2026, 9, 11 + week * 7))
          .toISOString()
          .slice(0, 10);
        if (
          (query.weeklyDateFrom || query.weeklyDateTo) &&
          (type !== 'WEEKLY_PLAN' ||
            (query.weeklyDateFrom && weekEnd < query.weeklyDateFrom) ||
            (query.weeklyDateTo && weekStart > query.weeklyDateTo))
        )
          continue;
        const platform =
          Math.floor(serial / 6) % 2 === 0 ? 'ZOOM' : 'GOOGLE_MEET';
        const start = `2026-10-${10 + (Math.floor(serial / 6) % 3)}T10:00:00.000Z`;
        if (
          (query.sessionStartAtFrom ||
            query.sessionStartAtTo ||
            query.sessionPlatform) &&
          (type !== 'ONLINE_SESSION' ||
            (query.sessionStartAtFrom && start < query.sessionStartAtFrom) ||
            (query.sessionStartAtTo && start > query.sessionStartAtTo) ||
            (query.sessionPlatform && platform !== query.sessionPlatform))
        )
          continue;
        result.push({
          id: fixture.id(
            successor ? 'successor-publication' : 'publication',
            serial,
          ),
          contentId: fixture.id('content', serial),
          revisionId: fixture.id(
            successor ? 'successor-revision' : 'revision',
            serial,
          ),
          visibleFrom:
            fixture.now.getTime() -
            (successor ? 86400000 : 172800000 + Math.floor(serial / 10) * 1000),
        });
      }
      return result.sort(
        (a, b) =>
          b.visibleFrom - a.visibleFrom ||
          (a.id > b.id ? -1 : a.id < b.id ? 1 : 0),
      );
    }

    it('bulk-constructs 6060 publications/revisions/targets per School with every required corpus class', async () => {
      const counts: {
        school: string;
        publications: number;
        revisions: number;
        targets: number;
        contents: number;
        tags: number;
      }[] = [];
      for (const school of fixture.schools) {
        const where = { schoolId: school.schoolId };
        const [publications, revisions, targets, contents, tags] =
          await Promise.all([
            prisma.academicContentPublication.count({ where }),
            prisma.academicContentRevision.count({ where }),
            prisma.academicContentRevisionTarget.count({ where }),
            prisma.academicContent.count({ where }),
            prisma.academicContentRevisionTag.count({ where }),
          ]);
        expect({ publications, revisions, targets, contents, tags }).toEqual({
          publications: 6060,
          revisions: 6060,
          targets: 6060,
          contents: 6000,
          tags: 6060,
        });
        expect(
          await prisma.academicContentRevisionTarget.groupBy({
            by: ['scopeType'],
            where,
          }),
        ).toHaveLength(SCALE_SCOPES.length);
        expect(
          await prisma.academicContentRevision.groupBy({ by: ['type'], where }),
        ).toHaveLength(SCALE_TYPES.length);
        for (const status of [
          'PUBLISHED',
          'EXPIRED',
          'CANCELLED',
          'SCHEDULED',
        ] as const)
          expect(
            await prisma.academicContentPublication.count({
              where: { ...where, status },
            }),
          ).toBeGreaterThan(0);
        expect(
          await prisma.academicContentPublication.count({
            where: { ...where, visibleFrom: { gt: fixture.now } },
          }),
        ).toBeGreaterThan(0);
        expect(
          await prisma.academicContentPublication.count({
            where: { ...where, visibleUntil: { lte: fixture.now } },
          }),
        ).toBeGreaterThan(0);
        counts.push({
          school:
            school.schoolId === fixture.target.schoolId ? 'target' : 'foreign',
          publications,
          revisions,
          targets,
          contents,
          tags,
        });
      }
      writeFileSync(
        join(evidenceDirectory, 'dataset.json'),
        JSON.stringify(
          {
            counts,
            analyze: 'PASS',
            construction: 'SET_BASED_GENERATE_SERIES',
          },
          null,
          2,
        ),
      );
    });

    describe.each(['STUDENT', 'PARENT'] as const)('%s', (actor) => {
      const filters: Query[] = [
        { type: 'GENERAL_RESOURCE' },
        { type: 'WEEKLY_PLAN' },
        { type: 'SUBJECT_RESOURCE' },
        { type: 'ONLINE_SESSION' },
        { search: 'Topic 1' },
        { search: 'Topic %' },
        { tag: 'Group 2' },
        { weeklyDateFrom: '2026-10-20', weeklyDateTo: '2026-10-22' },
        { weeklyDateFrom: '2026-09-01', weeklyDateTo: '2026-09-02' },
        { sessionPlatform: 'ZOOM' },
        { sessionPlatform: 'GOOGLE_MEET' },
        {
          sessionStartAtFrom: '2026-10-11T10:00:00.000Z',
          sessionStartAtTo: '2026-10-12T10:00:00.000Z',
        },
      ];
      it('returns exact totals and complete stable pages, ties, boundaries and out-of-range totals with one statement per feed', async () => {
        const oracle = expected(actor);
        expect(oracle.length).toBeGreaterThan(500);
        const spy = jest.spyOn(prisma, '$queryRaw');
        const observed: string[] = [];
        for (let page = 1; page <= Math.ceil(oracle.length / 73); page++) {
          spy.mockClear();
          const output = await feed(actor, { page, limit: 73 });
          expect(spy).toHaveBeenCalledTimes(1);
          expect(output.pagination).toEqual({
            page,
            limit: 73,
            total: oracle.length,
          });
          expect(output.items.map((i) => i.publicationId)).toEqual(
            oracle.slice((page - 1) * 73, page * 73).map((i) => i.id),
          );
          observed.push(...output.items.map((i) => i.publicationId));
        }
        expect(new Set(observed).size).toBe(oracle.length);
        expect(observed).toEqual(oracle.map((i) => i.id));
        const outside = await feed(actor, { page: 1000, limit: 73 });
        expect(outside.items).toEqual([]);
        expect(outside.pagination.total).toBe(oracle.length);
        expect(
          (await feed(actor, { page: 7, limit: 73 })).items.map(
            (i) => i.publicationId,
          ),
        ).toEqual(oracle.slice(438, 511).map((i) => i.id));
        const tied = oracle.filter(
          (i) => i.visibleFrom === oracle[0].visibleFrom,
        );
        expect(tied.length).toBeGreaterThan(1);
        expect(tied.map((i) => i.id)).toEqual(
          tied
            .map((i) => i.id)
            .sort()
            .reverse(),
        );
      });
      it.each(filters)(
        'applies filter %j to page and total without foreign decoys',
        async (query) => {
          const oracle = expected(actor, query);
          const output = await feed(actor, { ...query, limit: 100 });
          expect(output.pagination.total).toBe(oracle.length);
          expect(output.items.map((i) => i.publicationId)).toEqual(
            oracle.slice(0, 100).map((i) => i.id),
          );
          expect(output.items.map((i) => i.contentId)).toEqual(
            oracle.slice(0, 100).map((i) => i.contentId),
          );
        },
      );
      it('matches only subject-qualified applicable targets, then denies them after the current allocation is withdrawn', async () => {
        const query = { subjectId: fixture.target.subjectId, limit: 100 };
        const oracle = expected(actor, query);
        expect(oracle.length).toBeGreaterThan(100);
        const output = await feed(actor, query);
        expect(output.pagination.total).toBe(oracle.length);
        expect(output.items.map((i) => i.publicationId)).toEqual(
          oracle.slice(0, 100).map((i) => i.id),
        );
        expect(
          (
            await feed(actor, {
              subjectId: fixture.target.unavailableSubjectId,
            })
          ).pagination.total,
        ).toBe(0);
        await prisma.subjectAllocation.updateMany({
          where: {
            schoolId: fixture.target.schoolId,
            subjectId: fixture.target.subjectId,
          },
          data: { weeklyHours: 0 },
        });
        expect((await feed(actor, query)).pagination.total).toBe(0);
      });
      it('resolves current successor identities throughout the large feed', async () => {
        const output = await feed(actor, { search: 'Successor', limit: 100 });
        const oracle = expected(actor, { search: 'Successor' });
        expect(oracle.length).toBeGreaterThan(0);
        expect(output.pagination.total).toBe(oracle.length);
        expect(
          output.items.map((i) => ({
            id: i.publicationId,
            revisionId: i.revisionId,
          })),
        ).toEqual(oracle.map((i) => ({ id: i.id, revisionId: i.revisionId })));
        expect(
          output.items.some(
            (i) => i.publicationId === fixture.id('publication', 25),
          ),
        ).toBe(false);
      });
      it('uses current relationships despite historical membership and allows a late child absent from the snapshot', async () => {
        const history = await prisma.academicContentAudienceRecipient.findMany({
          where: { schoolId: fixture.target.schoolId },
        });
        expect(history).toHaveLength(2);
        expect(history.some((h) => h.studentId === fixture.studentIds[1])).toBe(
          false,
        );
        expect((await feed(actor, { limit: 100 }, 1)).pagination.total).toBe(
          expected(actor).length,
        );
        if (actor === 'STUDENT')
          await prisma.enrollment.update({
            where: { id: fixture.enrollmentIds[0] },
            data: { status: 'WITHDRAWN' },
          });
        else
          await prisma.studentGuardian.deleteMany({
            where: {
              guardianId: fixture.guardianId,
              studentId: fixture.studentIds[0],
            },
          });
        expect((await feed(actor)).pagination.total).toBe(0);
        expect((await feed(actor)).items).toEqual([]);
        expect(
          await prisma.academicContentAudienceRecipient.findMany({
            where: { schoolId: fixture.target.schoolId },
          }),
        ).toEqual(history);
      });
    });

    it('retains the Parent-only Guardian Weekly Note filter at scale', async () => {
      const query: Query = { type: 'GUARDIAN_WEEKLY_NOTE', limit: 100 };
      const oracle = expected('PARENT', query);
      expect(oracle.length).toBeGreaterThan(0);
      const output = await feed('PARENT', query);
      expect(output.pagination.total).toBe(oracle.length);
      expect(output.items.map((i) => i.publicationId)).toEqual(
        oracle.slice(0, 100).map((i) => i.id),
      );
    });

    const planCases: {
      name: string;
      actor: 'STUDENT' | 'PARENT';
      query: Query;
    }[] = [
      { name: 'student-first', actor: 'STUDENT', query: {} },
      { name: 'parent-first', actor: 'PARENT', query: {} },
      {
        name: 'student-later',
        actor: 'STUDENT',
        query: { page: 7, limit: 73 },
      },
      { name: 'parent-later', actor: 'PARENT', query: { page: 7, limit: 73 } },
      { name: 'student-subject', actor: 'STUDENT', query: {} },
      { name: 'parent-subject', actor: 'PARENT', query: {} },
    ];
    it.each(planCases)(
      'captures EXPLAIN ANALYZE BUFFERS of exact production SQL: $name',
      async ({ name, actor, query }) => {
        const actualQuery = name.endsWith('subject')
          ? { ...query, subjectId: fixture.target.subjectId }
          : query;
        const spy = jest.spyOn(prisma, '$queryRaw');
        const output = await feed(actor, actualQuery);
        expect(spy).toHaveBeenCalledTimes(1);
        const statement = spy.mock.calls[0][0];
        expect(statement).toHaveProperty('sql');
        const sql = statement as Prisma.Sql;
        expect(sql.sql).toContain('WITH eligible AS');
        expect(sql.sql).not.toContain('academic_content_audience_recipients');
        const rows = await prisma.$queryRaw<{ 'QUERY PLAN': PlanDocument[] }[]>(
          Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
        );
        const document = rows[0]['QUERY PLAN'][0];
        const nodes = (node: PlanNode): PlanNode[] => [
          node,
          ...(node.Plans ?? []).flatMap(nodes),
        ];
        const all = nodes(document.Plan);
        expect(
          all.some(
            (node) =>
              node['Relation Name'] === 'academic_content_audience_recipients',
          ),
        ).toBe(false);
        expect(document.Plan['Actual Rows']).toBe(output.items.length);
        const summary = {
          name,
          total: output.pagination.total,
          pageRows: output.items.length,
          planningMs: document['Planning Time'],
          executionMs: document['Execution Time'],
          sharedHits: document.Plan['Shared Hit Blocks'] ?? 0,
          sharedReads: document.Plan['Shared Read Blocks'] ?? 0,
          tempReads: document.Plan['Temp Read Blocks'] ?? 0,
          tempWrites: document.Plan['Temp Written Blocks'] ?? 0,
          sorts: all
            .filter((node) => node['Sort Method'])
            .map((node) => ({
              method: node['Sort Method'],
              spaceKiB: node['Sort Space Used'],
              spaceType: node['Sort Space Type'],
              rows: node['Actual Rows'],
              loops: node['Actual Loops'],
            })),
          hotAccess: all
            .filter((node) => node['Relation Name'])
            .map((node) => ({
              table: node['Relation Name'],
              scan: node['Node Type'],
              index: node['Index Name'] ?? null,
              rows: node['Actual Rows'],
              loops: node['Actual Loops'],
              removed: node['Rows Removed by Filter'] ?? 0,
              removedByRecheck: node['Rows Removed by Index Recheck'] ?? 0,
              estimatedVisited:
                (node['Actual Rows'] +
                  (node['Rows Removed by Filter'] ?? 0) +
                  (node['Rows Removed by Index Recheck'] ?? 0)) *
                node['Actual Loops'],
              hits: node['Shared Hit Blocks'] ?? 0,
              reads: node['Shared Read Blocks'] ?? 0,
            })),
        };
        writeFileSync(
          join(evidenceDirectory, `${name}.json`),
          JSON.stringify(
            { sql: sql.text, values: sql.values, document, summary },
            null,
            2,
          ),
        );
        console.info('ACC10E_QUERY_PLAN=' + JSON.stringify(summary));
        // Timing and exact physical node choices are evidence, never brittle CI gates.
      },
    );
  },
);
