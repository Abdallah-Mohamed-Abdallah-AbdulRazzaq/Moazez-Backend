import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { hasRetainedFileReferences } from '../../src/modules/files/shared/infrastructure/file-lifetime.repository';
import {
  type AssetFamily,
  type AssetRow,
  ASSET_FAMILIES,
  AssessmentAssetsFixture,
  expectSqlState,
} from '../fixtures/assessment-assets.fixture';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('ST-05 additive asset relationships and conservative lifetime on PostgreSQL', () => {
  jest.setTimeout(120000);
  const prisma = new PrismaService();
  const scoped = prisma.scoped as unknown as Pick<
    PrismaService,
    '$transaction'
  >;
  let fixture: AssessmentAssetsFixture;
  let fileId: string;
  const retained = (id = fileId) =>
    prisma.$transaction((tx) => hasRetainedFileReferences(tx, id));
  beforeAll(async () => {
    fixture = new AssessmentAssetsFixture(prisma);
    await prisma.$connect();
    await fixture.create();
  });
  beforeEach(async () => {
    fileId = (await fixture.file()).id;
  });
  afterEach(async () => {
    await fixture.resetAssets();
  });
  afterAll(async () => {
    if (fixture) await fixture.dispose();
    await prisma.$disconnect();
  });

  it.each(ASSET_FAMILIES)(
    '$model persists its exact parent/File/provenance and leaves the parent unchanged',
    async (family) => {
      const [before] = await prisma.$queryRaw<
        Array<{ parent: unknown }>
      >(Prisma.sql`
      SELECT to_jsonb(p) AS parent FROM public.${Prisma.raw(family.parentTable)} p WHERE id = ${fixture.parents[0][family.key]}::uuid`);
      const row = await fixture.insert(family, { fileId, sortOrder: 4 });
      expect(row).toMatchObject({
        schoolId: fixture.parents[0].schoolId,
        parentId: fixture.parents[0][family.key],
        fileId,
        sourceType: 'MANAGED_FILE',
        category: 'DOCUMENT',
        sortOrder: 4,
        createdByUserId: family.dual
          ? fixture.authorId
          : (
              await prisma.student.findUniqueOrThrow({
                where: { id: fixture.parents[0].studentId },
              })
            ).userId,
        deletedAt: null,
      });
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/u);
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.updatedAt).toBeInstanceOf(Date);
      const [after] = await prisma.$queryRaw<
        Array<{ parent: unknown }>
      >(Prisma.sql`
      SELECT to_jsonb(p) AS parent FROM public.${Prisma.raw(family.parentTable)} p JOIN public.${Prisma.raw(family.table)} a
      ON a.${Prisma.raw(family.parentColumn)} = p.id AND a.school_id = p.school_id WHERE a.id = ${row.id}::uuid`);
      expect(after).toEqual(before);
      expect(await retained()).toBe(true);
    },
  );
  it.each(ASSET_FAMILIES)(
    '$model keeps soft-deleted historical references and restricts File/parent deletion',
    async (family) => {
      const row = await fixture.insert(family, { fileId });
      await prisma.$executeRaw(Prisma.sql`UPDATE public.${Prisma.raw(family.table)}
      SET deleted_at = ${new Date('2020-01-01')}, title = 'Historical retained evidence', sort_order = 8 WHERE id = ${row.id}::uuid`);
      expect(await retained()).toBe(true);
      await expectSqlState(
        () =>
          prisma.$executeRaw`DELETE FROM public.files WHERE id = ${fileId}::uuid`,
        '23503',
      );
      await expectSqlState(
        () =>
          prisma.$executeRaw(
            Prisma.sql`DELETE FROM public.${Prisma.raw(family.parentTable)} WHERE id = ${row.parentId}::uuid`,
          ),
        '23503',
      );
      expect(await retained()).toBe(true);
    },
  );
  it.each(ASSET_FAMILIES.filter((family) => family.dual))(
    '$model stores a safe external reference without inventing File retention',
    async (family) => {
      const row = await fixture.insert(family, {
        sourceType: 'EXTERNAL_HTTPS',
        externalUrl: 'https://media.example.org/lesson.pdf',
      });
      expect(row.fileId).toBeNull();
      expect(row.sourceType).toBe('EXTERNAL_HTTPS');
      expect(await retained()).toBe(false);
    },
  );
  it('accounts for all five consumers, with exclusive answer Files, globally under another School context', async () => {
    const rows: Array<{ family: AssetFamily; row: AssetRow }> = [];
    for (const family of ASSET_FAMILIES.filter((f) => f.dual))
      rows.push({ family, row: await fixture.insert(family, { fileId }) });
    const answerFile = await fixture.file(),
      gradeFile = await fixture.file();
    await fixture.insert(ASSET_FAMILIES[3], { fileId: answerFile.id });
    await expect(
      fixture.insert(ASSET_FAMILIES[4], { fileId: answerFile.id }),
    ).rejects.toThrow();
    await fixture.insert(ASSET_FAMILIES[4], { fileId: gradeFile.id });
    expect(await retained(answerFile.id)).toBe(true);
    expect(await retained(gradeFile.id)).toBe(true);
    expect(await retained()).toBe(true);
    expect(
      await fixture.asActor(
        'STUDENT',
        () =>
          scoped.$transaction((tx) => hasRetainedFileReferences(tx, fileId)),
        2,
      ),
    ).toBe(true);
    for (const { family, row } of rows)
      await prisma.$executeRaw(
        Prisma.sql`DELETE FROM public.${Prisma.raw(family.table)} WHERE id = ${row.id}::uuid`,
      );
    expect(await retained()).toBe(false);
    expect(await retained(answerFile.id)).toBe(true);
    expect(await retained(gradeFile.id)).toBe(true);
    await fixture.resetAssets();
    expect(await retained()).toBe(false);
  });
  it('preserves global accounting for an unexpected legacy cross-school Attachment reference', async () => {
    await prisma.attachment.create({
      data: {
        schoolId: fixture.parents[2].schoolId,
        fileId,
        resourceType: 'student',
        resourceId: fixture.parents[2].studentId,
        createdById: fixture.authorId,
      },
    });
    expect(await retained()).toBe(true);
    expect(
      await fixture.asActor('STUDENT', () =>
        scoped.$transaction((tx) => hasRetainedFileReferences(tx, fileId)),
      ),
    ).toBe(true);
  });
  it('derives answer ancestry solely through the exact answer and has no redundant parent scalar escape', async () => {
    for (const name of ['HomeworkAnswerAsset', 'GradeSubmissionAnswerAsset']) {
      const model = Prisma.dmmf.datamodel.models.find(
        (value) => value.name === name,
      )!;
      const scalars = model.fields
        .filter((field) => field.kind !== 'object')
        .map((field) => field.name);
      for (const unwanted of [
        'studentId',
        'submissionId',
        'assessmentId',
        'questionId',
        'homeworkAssignmentId',
        'homeworkTargetId',
        'homeworkSubmissionId',
      ])
        expect(scalars).not.toContain(unwanted);
    }
    const hw = await fixture.insert(ASSET_FAMILIES[3], { fileId });
    const grade = await fixture.insert(ASSET_FAMILIES[4], {
      fileId: (await fixture.file()).id,
    });
    const [homework] = await prisma.$queryRaw<
      Array<{ answer: string; student: string; question: string }>
    >`
      SELECT a.id AS answer, s.student_id AS student, a.homework_question_id AS question
      FROM public.homework_answer_assets x JOIN public.homework_submission_answers a ON a.id = x.homework_submission_answer_id AND a.school_id = x.school_id
      JOIN public.homework_submissions s ON s.id = a.homework_submission_id AND s.school_id = a.school_id WHERE x.id = ${hw.id}::uuid`;
    expect(homework).toEqual({
      answer: fixture.parents[0].homeworkAnswerId,
      student: fixture.parents[0].studentId,
      question: fixture.parents[0].homeworkQuestionId,
    });
    const [grades] = await prisma.$queryRaw<
      Array<{
        answer: string;
        student: string;
        question: string;
        assessment: string;
      }>
    >`
      SELECT a.id AS answer, a.student_id AS student, a.question_id AS question, a.assessment_id AS assessment
      FROM public.grade_submission_answer_assets x JOIN public.grade_submission_answers a ON a.id = x.answer_id AND a.school_id = x.school_id WHERE x.id = ${grade.id}::uuid`;
    expect(grades).toEqual({
      answer: fixture.parents[0].answerId,
      student: fixture.parents[0].studentId,
      question: fixture.parents[0].questionId,
      assessment: fixture.parents[0].assessmentId,
    });
  });

  it('checks actual composite FKs, restrictive actions, source CHECKs and supporting indexes for every table', async () => {
    const fks = await prisma.$queryRaw<
      Array<{
        table: string;
        name: string;
        parent: string;
        columns: string[];
        references: string[];
        deleted: string;
        updated: string;
        valid: boolean;
      }>
    >`
      SELECT child.relname AS "table", c.conname AS name, parent.relname AS parent,
        ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num, ord) JOIN pg_catalog.pg_attribute a ON a.attrelid = child.oid AND a.attnum = k.num ORDER BY k.ord) AS columns,
        ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num, ord) JOIN pg_catalog.pg_attribute a ON a.attrelid = parent.oid AND a.attnum = k.num ORDER BY k.ord) AS "references",
        c.confdeltype::text AS deleted, c.confupdtype::text AS updated, c.convalidated AS valid
      FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class child ON child.oid = c.conrelid
      JOIN pg_catalog.pg_class parent ON parent.oid = c.confrelid JOIN pg_catalog.pg_namespace n ON n.oid = child.relnamespace
      WHERE n.nspname = 'public' AND c.contype = 'f'`;
    const checks = await prisma.$queryRaw<
      Array<{ name: string; valid: boolean; definition: string }>
    >`
      SELECT conname AS name, convalidated AS valid, pg_catalog.pg_get_constraintdef(oid) AS definition FROM pg_catalog.pg_constraint WHERE contype = 'c'`;
    const indexes = await prisma.$queryRaw<
      Array<{ table: string; name: string; definition: string }>
    >`
      SELECT tablename AS "table", indexname AS name, indexdef AS definition FROM pg_catalog.pg_indexes WHERE schemaname = 'public'`;
    for (const family of ASSET_FAMILIES) {
      const rows = fks.filter((row) => row.table === family.table);
      expect(rows).toHaveLength(family.dual ? 4 : 5);
      if (!family.dual)
        expect(
          rows.find((row) => row.parent === 'assessment_answer_media_claims'),
        ).toMatchObject({
          columns: [
            'answer_media_claim_id',
            'school_id',
            'file_id',
            family.parentColumn,
          ],
          references: [
            'id',
            'school_id',
            'file_id',
            family.model === 'HomeworkAnswerAsset'
              ? 'homework_answer_id'
              : 'grade_answer_id',
          ],
          deleted: 'r',
          updated: 'r',
          valid: true,
        });
      expect(
        rows.find((row) => row.name === `${family.prefix}_parent_fk`),
      ).toMatchObject({
        parent: family.parentTable,
        columns: [family.parentColumn, 'school_id'],
        references: ['id', 'school_id'],
        deleted: 'r',
        updated: 'r',
        valid: true,
      });
      expect(
        rows.find((row) => row.name === `${family.prefix}_file_fk`),
      ).toMatchObject({
        parent: 'files',
        columns: ['file_id', 'school_id'],
        references: ['id', 'school_id'],
        deleted: 'r',
        updated: 'r',
        valid: true,
      });
      expect(
        rows.find((row) => row.name === `${family.prefix}_school_fk`),
      ).toMatchObject({
        parent: 'schools',
        columns: ['school_id'],
        deleted: 'r',
      });
      expect(
        rows.find((row) => row.name === `${family.prefix}_creator_fk`),
      ).toMatchObject({
        parent: 'users',
        columns: ['created_by_user_id'],
        deleted: 'r',
      });
      for (const suffix of ['sort_check', 'source_check'])
        expect(
          checks.find((row) => row.name === `${family.prefix}_${suffix}`)
            ?.valid,
        ).toBe(true);
      expect(indexes.filter((row) => row.table === family.table)).toHaveLength(
        family.dual ? 4 : 6,
      ); // Existing PK/access indexes plus exact immutable claim uniqueness for answer assets.
      if (!family.dual)
        expect(
          indexes.find(
            (row) =>
              row.table === family.table &&
              row.definition.endsWith('(answer_media_claim_id)'),
          )?.definition,
        ).toContain('CREATE UNIQUE INDEX');
      expect(
        indexes.find((row) => row.name === `${family.prefix}_parent_order_idx`)
          ?.definition,
      ).toContain(
        `(school_id, ${family.parentColumn}, deleted_at, sort_order, id)`,
      );
      expect(
        indexes.find((row) => row.name === `${family.prefix}_file_idx`)
          ?.definition,
      ).toContain('(file_id, school_id)');
      expect(
        indexes.find((row) => row.name === `${family.prefix}_creator_idx`)
          ?.definition,
      ).toContain('(created_by_user_id)');
    }
  });
  it('verifies actual immutable-binding trigger catalog and invoker/function privilege properties', async () => {
    const triggers = await prisma.$queryRaw<
      Array<{
        table: string;
        name: string;
        type: number;
        args: string;
        enabled: string;
      }>
    >`
      SELECT c.relname AS "table", t.tgname AS name, t.tgtype::int AS type,
        pg_catalog.encode(t.tgargs, 'escape') AS args, t.tgenabled::text AS enabled
      FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      WHERE t.tgfoid = 'public.enforce_assessment_asset_identity()'::regprocedure AND NOT t.tgisinternal`;
    expect(triggers).toHaveLength(ASSET_FAMILIES.length);
    for (const family of ASSET_FAMILIES)
      expect(triggers.find((row) => row.table === family.table)).toEqual({
        table: family.table,
        name: `asset_identity_${family.table}`,
        type: 1 | 2 | 16,
        args: `${family.parentColumn}\\000`,
        enabled: 'O',
      });
    const [fn] = await prisma.$queryRaw<
      Array<{
        definer: boolean;
        config: string[];
        publicExecute: boolean;
        definition: string;
      }>
    >`
      SELECT p.prosecdef AS definer, p.proconfig AS config, pg_catalog.pg_get_functiondef(p.oid) AS definition,
        EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS "publicExecute"
      FROM pg_catalog.pg_proc p WHERE p.oid = 'public.enforce_assessment_asset_identity()'::regprocedure`;
    expect(fn.definer).toBe(false);
    expect(fn.config).toContain('search_path=pg_catalog');
    expect(fn.publicExecute).toBe(false);
    expect(fn.definition).not.toMatch(
      /homework_submissions|grade_submissions|SECURITY DEFINER/u,
    );
  });

  async function atFileLock(pid: number, blocker: number) {
    const until = Date.now() + 10000;
    while (Date.now() < until) {
      const rows = await prisma.$queryRaw<Array<{ blockers: number[] }>>`
        SELECT pg_catalog.pg_blocking_pids(pid) AS blockers FROM pg_catalog.pg_stat_activity
        WHERE pid = ${pid} AND wait_event_type = 'Lock'`;
      if (rows.some((row) => row.blockers.includes(blocker))) return;
      await new Promise((done) => setTimeout(done, 10));
    }
    throw new Error(
      'Expected real PostgreSQL File lock dependency was not observed',
    );
  }
  it.each(ASSET_FAMILIES)(
    '$model: linking first makes the established retirement protocol observe retention',
    async (family) => {
      const entered = deferred<number>(),
        release = deferred<void>(),
        cleanupPid = deferred<number>();
      const linking = prisma.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          await fixture.insert(family, { fileId }, tx);
          entered.resolve(pid);
          await release.promise;
        },
        { timeout: 15000 },
      );
      const linkerPid = await entered.promise;
      const cleaning = prisma.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          cleanupPid.resolve(pid);
          await tx.$queryRaw`SELECT id FROM public.files WHERE id = ${fileId}::uuid FOR UPDATE`;
          const keep = await hasRetainedFileReferences(tx, fileId);
          if (!keep)
            await tx.$executeRaw`UPDATE public.files SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${fileId}::uuid`;
          return keep;
        },
        { timeout: 15000 },
      );
      try {
        await atFileLock(await cleanupPid.promise, linkerPid);
        release.resolve();
        await linking;
        expect(await cleaning).toBe(true);
        expect(await retained()).toBe(true);
        expect(
          (await prisma.file.findUniqueOrThrow({ where: { id: fileId } }))
            .deletedAt,
        ).toBeNull();
      } finally {
        release.resolve();
        await Promise.allSettled([linking, cleaning]);
      }
    },
  );
  it.each(ASSET_FAMILIES)(
    '$model: retirement first makes the live-File trigger reject a stale linker',
    async (family) => {
      const entered = deferred<number>(),
        release = deferred<void>(),
        linkingPid = deferred<number>();
      const cleaning = prisma.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          await tx.$queryRaw`SELECT id FROM public.files WHERE id = ${fileId}::uuid FOR UPDATE`;
          expect(await hasRetainedFileReferences(tx, fileId)).toBe(false);
          await tx.$executeRaw`UPDATE public.files SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${fileId}::uuid`;
          entered.resolve(pid);
          await release.promise;
        },
        { timeout: 15000 },
      );
      const cleanupOwner = await entered.promise;
      const linking = prisma.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          linkingPid.resolve(pid);
          return fixture.insert(family, { fileId }, tx);
        },
        { timeout: 15000 },
      );
      const outcome = linking.then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      try {
        await atFileLock(await linkingPid.promise, cleanupOwner);
        release.resolve();
        await cleaning;
        const result = await outcome;
        expect(result.ok).toBe(false);
        if (result.ok)
          throw new Error('Retired File binding unexpectedly succeeded');
        expect(result.error).toMatchObject({
          code: 'P2010',
          meta: { code: '23503' },
        });
        const [{ count }] = await prisma.$queryRaw<Array<{ count: number }>>(
          Prisma.sql`SELECT count(*)::int AS count FROM public.${Prisma.raw(family.table)} WHERE file_id = ${fileId}::uuid`,
        );
        expect(count).toBe(0);
      } finally {
        release.resolve();
        await Promise.allSettled([cleaning, outcome]);
      }
    },
  );
});
