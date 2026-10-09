import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  AcademicContentTeacherAnalyticsRepository,
  teacherAcademicContentAnalyticsQuery,
} from '../../src/modules/academics/academic-content/infrastructure/academic-content-teacher-analytics.repository';
import {
  AcademicContentTeacherAnalyticsFixture,
  type AnalyticsSource,
} from '../fixtures/academic-content-teacher-analytics.fixture';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

type PlanNode = {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Actual Rows': number;
  'Actual Loops': number;
  'Rows Removed by Filter'?: number;
  'Sort Method'?: string;
  'Sort Space Type'?: string;
  'Temp Read Blocks'?: number;
  'Temp Written Blocks'?: number;
  Plans?: PlanNode[];
};
type PlanDocument = {
  Plan: PlanNode;
  'Planning Time': number;
  'Execution Time': number;
};
describe('ACC-11D representative scale and actual production parameterized query plans', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService(),
    fixture = new AcademicContentTeacherAnalyticsFixture(prisma),
    reads = new AcademicContentTeacherAnalyticsRepository(prisma);
  const directory = join(process.cwd(), 'coverage', 'acc11d', 'plans');
  let source: AnalyticsSource,
    successor: AnalyticsSource,
    note: AnalyticsSource;
  beforeAll(async () => {
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (name) =>
        /^(?:ci_[0-9a-f]{14}|moazez_test(?:_[a-z0-9_-]+)?)$/.test(name),
      errorMessage: 'ACC-11D requires disposable PostgreSQL',
    });
    await prisma.$connect();
    await fixture.create();
    mkdirSync(directory, { recursive: true });
    source = await fixture.ownedSource();
    successor = await fixture.successor(source);
    note = await fixture.ownedSource('GUARDIAN_WEEKLY_NOTE');
    await prisma.academicContentRevisionAsset.create({
      data: {
        schoolId: fixture.school.schoolId,
        revisionId: successor.revision.id,
        fileId: source.file.id,
        sortOrder: 0,
      },
    });
    const successorLink = await prisma.academicContentRevisionLink.create({
      data: {
        schoolId: fixture.school.schoolId,
        revisionId: successor.revision.id,
        label: 'Successor',
        url: 'https://example.test/successor',
        sortOrder: 0,
      },
    });
    successor.link = successorLink;
    await prisma.studentGuardian.create({
      data: {
        schoolId: fixture.school.schoolId,
        guardianId: fixture.otherGuardianId,
        studentId: fixture.children[1].studentId,
      },
    });
    for (const publication of [source, successor]) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO academic_content_engagement_events (id, school_id, academic_content_id, publication_id, revision_id, actor_user_id, actor_kind, student_id, enrollment_id, guardian_id, event_type, file_id, revision_link_id, client_request_id, request_fingerprint, created_at)
        SELECT gen_random_uuid(), ${fixture.school.schoolId}::uuid, ${source.content.id}::uuid, ${publication.publication.id}::uuid, ${publication.revision.id}::uuid,
          CASE WHEN n % 2 = 0 THEN CASE WHEN (n / 2) % 2 = 0 THEN ${fixture.children[0].userId}::uuid ELSE ${fixture.children[1].userId}::uuid END ELSE ${fixture.parentId}::uuid END,
          CASE WHEN n % 2 = 0 THEN 'STUDENT' ELSE 'PARENT' END::academic_content_engagement_actor_kind,
          CASE WHEN (n / 2) % 2 = 0 THEN ${fixture.children[0].studentId}::uuid ELSE ${fixture.children[1].studentId}::uuid END,
          CASE WHEN (n / 2) % 2 = 0 THEN ${fixture.children[0].enrollmentId}::uuid ELSE ${fixture.children[1].enrollmentId}::uuid END,
          CASE WHEN n % 2 = 0 THEN NULL::uuid ELSE ${fixture.guardianIds[0]}::uuid END,
          (ARRAY['CONTENT_VIEWED','FILE_PREVIEWED','FILE_DOWNLOADED','LINK_CLICKED','JOIN_LINK_CLICKED'])[1 + n % 5]::academic_content_engagement_event_type,
          CASE WHEN n % 5 IN (1,2) THEN ${publication.file.id}::uuid ELSE NULL::uuid END,
          CASE WHEN n % 5 = 3 THEN ${publication.link.id}::uuid ELSE NULL::uuid END,
          gen_random_uuid(), repeat('e',64), (statement_timestamp() AT TIME ZONE 'UTC') - interval '1 hour'
        FROM generate_series(0,24999) n`);
    }
    // Persist a separate successor obligation; two Guardian rows of one Parent
    // never expand the distinct key, and a second Parent remains independent.
    const noteSuccessor = await fixture.successor(note);
    await fixture.ack(note);
    await fixture.ack(note, 0, true);
    await fixture.ack(noteSuccessor, 0, false, undefined, 1);
    const foreign = await fixture.successor(successor, [
      fixture.foreignAllocationId,
    ]);
    await fixture.event(foreign);
    await prisma.academicContentPublication.update({
      where: { id: source.publication.id },
      data: {
        status: 'CANCELLED',
        expiredAt: null,
        cancelledAt: new Date(),
        cancellationReason: 'WITHDRAWN',
      },
    });
    await prisma.academicContentPublication.update({
      where: { id: successor.publication.id },
      data: { status: 'EXPIRED', expiredAt: new Date() },
    });
    const canonicalTeacher = await prisma.role.findFirstOrThrow({
      where: { key: 'teacher', schoolId: null, isSystem: true },
    });
    for (let index = 0; index < 24; index++) {
      const school = fixture.schools[index % 2],
        teacherId = randomUUID();
      fixture.users.push(teacherId);
      await prisma.user.create({
        data: {
          id: teacherId,
          userType: 'TEACHER',
          email: `${teacherId}@acc11d.test`,
          firstName: 'Scale',
          lastName: 'Teacher',
        },
      });
      await prisma.membership.create({
        data: {
          userId: teacherId,
          userType: 'TEACHER',
          schoolId: school.schoolId,
          organizationId: school.organizationId,
          roleId: canonicalTeacher.id,
        },
      });
      const allocation = await prisma.teacherSubjectAllocation.create({
        data: {
          teacherUserId: teacherId,
          schoolId: school.schoolId,
          termId: school.termId,
          classroomId: school.classroomId,
          subjectId: school.subjectId,
        },
      });
      const content = await prisma.academicContent.create({
        data: {
          schoolId: school.schoolId,
          academicYearId: school.yearId,
          termId: school.termId,
          type: 'GENERAL_RESOURCE',
          audience: 'STUDENTS_AND_GUARDIANS',
          title: 'Scale noise',
          createdByUserId: teacherId,
          targets: {
            create: {
              scopeType: 'CLASSROOM',
              classroomId: school.classroomId,
              subjectId: school.subjectId,
              teacherSubjectAllocationId: allocation.id,
              identityFingerprint: 'f'.repeat(64),
              createdByUserId: teacherId,
            },
          },
        },
      });
      for (let revisionNumber = 1; revisionNumber <= 8; revisionNumber++) {
        const revision = await prisma.academicContentRevision.create({
          data: {
            schoolId: school.schoolId,
            academicContentId: content.id,
            academicYearId: school.yearId,
            termId: school.termId,
            type: content.type,
            audience: content.audience,
            title: 'Noise revision',
            revisionNumber,
            snapshotContractVersion: 2,
            sourceStatus: 'DRAFT',
            capturedByUserId: teacherId,
            targets: {
              create: {
                scopeType: 'CLASSROOM',
                classroomId: school.classroomId,
                subjectId: school.subjectId,
                teacherSubjectAllocationId: allocation.id,
                identityFingerprint: 'f'.repeat(64),
              },
            },
          },
        });
        const noisePublication = await prisma.academicContentPublication.create(
          {
            data: {
              schoolId: school.schoolId,
              academicContentId: content.id,
              revisionId: revision.id,
              clientRequestId: randomUUID(),
              requestFingerprint: 'f'.repeat(64),
              status: revisionNumber < 8 ? 'EXPIRED' : 'PUBLISHED',
              expiredAt: revisionNumber < 8 ? new Date() : null,
              sourceContentStatus: 'DRAFT',
              publishAt: new Date(),
              publishedAt: new Date(),
              visibleFrom: new Date(),
              createdByUserId: teacherId,
            },
          },
        );
        const child = fixture.children[index % 2 === 0 ? 0 : 2];
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO academic_content_engagement_events
            (id, school_id, academic_content_id, publication_id, revision_id, actor_user_id, actor_kind, student_id, enrollment_id, event_type, client_request_id, request_fingerprint, created_at)
          SELECT gen_random_uuid(), ${school.schoolId}::uuid, ${content.id}::uuid,
            ${noisePublication.id}::uuid, ${revision.id}::uuid, ${child.userId}::uuid,
            'STUDENT'::academic_content_engagement_actor_kind, ${child.studentId}::uuid, ${child.enrollmentId}::uuid,
            'CONTENT_VIEWED'::academic_content_engagement_event_type, gen_random_uuid(), repeat('f',64),
            (statement_timestamp() AT TIME ZONE 'UTC') - interval '1 hour'
          FROM generate_series(1,1000)`);
      }
    }
    for (const table of [
      'academic_contents',
      'academic_content_targets',
      'academic_content_revision_targets',
      'academic_content_publications',
      'teacher_subject_allocations',
      'academic_content_engagement_events',
      'academic_content_acknowledgements',
    ]) {
      // Closed, test-owned identifiers, never request input. This is statistics
      // collection on a disposable fixture, not schema/migration SQL.
      await prisma.$executeRaw(Prisma.sql`ANALYZE ${Prisma.raw(table)}`);
    }
  });
  afterAll(async () => {
    try {
      await fixture.dispose();
    } finally {
      await prisma.$disconnect();
    }
  });
  it('matches independent formula counts across both included publications and emits observed plans', async () => {
    const expected = {
      totalEventReports: '50000',
      distinctStudentActorsEngaged: '2',
      distinctParentChildPairsEngaged: '2',
      acknowledgementRecords: '0',
      distinctAcknowledgingParentChildPairs: '0',
      includedPublicationCount: '2',
    };
    expect(await reads.read(fixture.scope, source.content.id)).toMatchObject(
      expected,
    );
    const modes = [
      {
        label: 'content-30d',
        contentId: source.content.id,
        publicationId: undefined,
        range: '30d' as const,
      },
      {
        label: 'publication-7d',
        contentId: source.content.id,
        publicationId: source.publication.id,
        range: '7d' as const,
      },
      {
        label: 'acknowledgements-90d',
        contentId: note.content.id,
        publicationId: undefined,
        range: '90d' as const,
      },
    ];
    for (const mode of modes) {
      // This is the production query factory called by repository.read, with
      // exactly the same parameter bindings. No approximate hand-written query.
      const sql = teacherAcademicContentAnalyticsQuery(
        fixture.scope,
        mode.contentId,
        mode.range,
        mode.publicationId,
      );
      const result = await reads.read(
        fixture.scope,
        mode.contentId,
        mode.range,
        mode.publicationId,
      );
      const explain = await prisma.$queryRaw<
        { 'QUERY PLAN': PlanDocument[] }[]
      >(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
      const document = explain[0]['QUERY PLAN'][0];
      const nodes: Omit<PlanNode, 'Plans'>[] = [];
      const walk = (node: PlanNode) => {
        const { Plans, ...record } = node;
        nodes.push(record);
        for (const child of Plans ?? []) walk(child);
      };
      walk(document.Plan);
      expect(sql.text).not.toContain('academic_content_audience_recipients');
      expect(
        nodes.some(
          (node) =>
            node['Relation Name'] === 'academic_content_engagement_events',
        ),
      ).toBe(true);
      if (mode.label === 'content-30d') expect(result).toMatchObject(expected);
      if (mode.label === 'publication-7d')
        expect(result).toMatchObject({
          totalEventReports: '25000',
          includedPublicationCount: '1',
          revisionId: source.revision.id,
        });
      if (mode.label === 'acknowledgements-90d')
        expect(result).toMatchObject({
          totalEventReports: '0',
          acknowledgementRecords: '3',
          distinctAcknowledgingParentChildPairs: '2',
        });
      writeFileSync(
        join(directory, `${mode.label}.json`),
        JSON.stringify(
          {
            label: mode.label,
            productionSql: sql.text,
            bindings: sql.values,
            result,
            explain: document,
            nodes,
            corpus: {
              schoolsWithNoise: 2,
              noiseTeachers: 24,
              noisePublications: 192,
              eligibleEvents: 50000,
              unrelatedEvents: 192000,
              foreignPublicationEvents: 1,
              currentAndRevisionTargetsPerEligiblePublication: 2,
            },
          },
          null,
          2,
        ),
      );
      console.log(
        'ACC11D_QUERY_PLAN',
        JSON.stringify({
          label: mode.label,
          executionMs: document['Execution Time'],
          planningMs: document['Planning Time'],
          tempReadBlocks: document.Plan['Temp Read Blocks'] ?? 0,
          tempWrittenBlocks: document.Plan['Temp Written Blocks'] ?? 0,
          indexes: [
            ...new Set(
              nodes.flatMap((node) =>
                node['Index Name'] ? [node['Index Name']] : [],
              ),
            ),
          ],
        }),
      );
    }
  });
});
