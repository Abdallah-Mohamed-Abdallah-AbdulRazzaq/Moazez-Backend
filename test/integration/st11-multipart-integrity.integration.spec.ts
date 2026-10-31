import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  AssessmentAssetsFixture,
  expectSqlState as expectSqlFailure,
} from '../fixtures/assessment-assets.fixture';
import { hasRetainedFileReferences } from '../../src/modules/files/shared/infrastructure/file-lifetime.repository';
const expectSqlState = (
  operation: Prisma.PrismaPromise<number>,
  code: string,
) => expectSqlFailure(() => operation, code);

/** Structural SQL evidence only. HTTP suites independently prove real READY provenance and bytes. */
describe('ST11-B real PostgreSQL multipart ancestry, immutable history and File inventory', () => {
  jest.setTimeout(120000);
  const prisma = new PrismaService();
  let f: AssessmentAssetsFixture;
  beforeAll(async () => {
    f = new AssessmentAssetsFixture(prisma);
    await prisma.$connect();
    await f.create();
  });
  afterEach(async () => {
    const where = { schoolId: { in: f.schools.map((s) => s.schoolId) } };
    await prisma.homeworkQuestionGroupAsset.deleteMany({ where });
    await prisma.gradeAssessmentQuestionGroupAsset.deleteMany({ where });
    await prisma.homeworkQuestion.updateMany({
      where,
      data: { groupId: null },
    });
    await prisma.gradeAssessmentQuestion.updateMany({
      where,
      data: { groupId: null },
    });
    await prisma.homeworkQuestionGroup.deleteMany({ where });
    await prisma.gradeAssessmentQuestionGroup.deleteMany({ where });
    await f.resetAssets();
  });
  afterAll(async () => {
    await f.dispose();
    await prisma.$disconnect();
  });
  const domains = ['Homework', 'Grades'] as const;
  async function group(domain: (typeof domains)[number], index = 0) {
    const p = f.parents[index];
    return domain === 'Homework'
      ? prisma.homeworkQuestionGroup.create({
          data: {
            schoolId: p.schoolId,
            homeworkAssignmentId: p.homeworkAssignmentId,
            title: 'Owned SQL group',
            createdByUserId: f.authorId,
          },
        })
      : prisma.gradeAssessmentQuestionGroup.create({
          data: {
            schoolId: p.schoolId,
            assessmentId: p.assessmentId,
            title: 'Owned SQL group',
            createdByUserId: f.authorId,
          },
        });
  }
  const names = (domain: (typeof domains)[number]) =>
    domain === 'Homework'
      ? {
          q: 'homework_questions',
          g: 'homework_question_groups',
          a: 'homework_question_group_assets',
          root: 'homework_assignment_id',
          questionId: f.parents[0].homeworkQuestionId,
        }
      : {
          q: 'grade_assessment_questions',
          g: 'grade_assessment_question_groups',
          a: 'grade_assessment_question_group_assets',
          root: 'assessment_id',
          questionId: f.parents[0].questionId,
        };
  it.each(domains)(
    '%s physically rejects cross-parent/school membership and preserves group identity',
    async (domain) => {
      const n = names(domain),
        own = await group(domain),
        wrongParent = await group(domain, 1),
        foreign = await group(domain, 2);
      for (const other of [wrongParent, foreign])
        await expectSqlState(
          prisma.$executeRaw(
            Prisma.sql`UPDATE public.${Prisma.raw(n.q)} SET group_id=${other.id}::uuid WHERE id=${n.questionId}::uuid`,
          ),
          '23503',
        );
      await prisma.$executeRaw(
        Prisma.sql`UPDATE public.${Prisma.raw(n.q)} SET group_id=${own.id}::uuid WHERE id=${n.questionId}::uuid`,
      );
      await expectSqlState(
        prisma.$executeRaw(
          Prisma.sql`UPDATE public.${Prisma.raw(n.g)} SET id=${randomUUID()}::uuid WHERE id=${own.id}::uuid`,
        ),
        '23514',
      );
      await expectSqlState(
        prisma.$executeRaw(
          Prisma.sql`UPDATE public.${Prisma.raw(n.g)} SET deleted_at=now() WHERE id=${own.id}::uuid`,
        ),
        '23514',
      );
      await prisma.$executeRaw(
        Prisma.sql`UPDATE public.${Prisma.raw(n.q)} SET group_id=NULL WHERE id=${n.questionId}::uuid`,
      );
      await prisma.$executeRaw(
        Prisma.sql`UPDATE public.${Prisma.raw(n.g)} SET deleted_at=now() WHERE id=${own.id}::uuid`,
      );
      await expectSqlState(
        prisma.$executeRaw(
          Prisma.sql`UPDATE public.${Prisma.raw(n.q)} SET group_id=${own.id}::uuid WHERE id=${n.questionId}::uuid`,
        ),
        '23503',
      );
      await expectSqlState(
        prisma.$executeRaw(
          Prisma.sql`UPDATE public.${Prisma.raw(n.g)} SET deleted_at=NULL WHERE id=${own.id}::uuid`,
        ),
        '23514',
      );
    },
  );
  it.each(domains)(
    '%s keeps group assets tenant-bound, live-File guarded and globally retained after soft deletion',
    async (domain) => {
      const n = names(domain),
        g = await group(domain),
        file = await f.file(),
        foreign = await f.file(1),
        retired = await f.file(0, { retired: true }),
        id = randomUUID();
      const insert = (assetId: string, fileId: string) =>
        prisma.$executeRaw(
          Prisma.sql`INSERT INTO public.${Prisma.raw(n.a)} (id,school_id,group_id,file_id,created_by_user_id,updated_at) VALUES(${assetId}::uuid,${g.schoolId}::uuid,${g.id}::uuid,${fileId}::uuid,${f.authorId}::uuid,now())`,
        );
      await expectSqlState(insert(randomUUID(), foreign.id), '23503');
      await expectSqlState(insert(randomUUID(), retired.id), '23503');
      await insert(id, file.id);
      await expectSqlState(
        prisma.$executeRaw(
          Prisma.sql`UPDATE public.${Prisma.raw(n.a)} SET file_id=${(await f.file()).id}::uuid WHERE id=${id}::uuid`,
        ),
        '23514',
      );
      await prisma.$executeRaw(
        Prisma.sql`UPDATE public.${Prisma.raw(n.a)} SET deleted_at=now() WHERE id=${id}::uuid`,
      );
      expect(
        await prisma.$transaction((tx) =>
          hasRetainedFileReferences(tx, file.id),
        ),
      ).toBe(true);
      await expectSqlState(
        prisma.$executeRaw`DELETE FROM files WHERE id=${file.id}::uuid`,
        '23503',
      );
      await expectSqlState(
        prisma.$executeRaw(
          Prisma.sql`UPDATE public.${Prisma.raw(n.a)} SET deleted_at=NULL WHERE id=${id}::uuid`,
        ),
        '23514',
      );
      await expectSqlState(
        prisma.$executeRaw(
          Prisma.sql`UPDATE public.${Prisma.raw(n.g)} SET shared_stimulus='null'::jsonb WHERE id=${g.id}::uuid`,
        ),
        '23514',
      );
    },
  );
  it('matches every File FK with live triggers, retains legacy Grade sort uniqueness and exposes no public trigger execution', async () => {
    const [counts] = await prisma.$queryRaw<
      Array<{
        files: number;
        live: number;
        identity: number;
        membership: number;
      }>
    >`SELECT
      (SELECT count(*)::int FROM pg_constraint WHERE contype='f' AND confrelid='public.files'::regclass) AS files,
      (SELECT count(*)::int FROM pg_trigger WHERE tgfoid='public.enforce_live_file_reference()'::regprocedure AND NOT tgisinternal) AS live,
      (SELECT count(*)::int FROM pg_trigger WHERE tgfoid='public.enforce_assessment_asset_identity()'::regprocedure AND NOT tgisinternal) AS identity,
      (SELECT count(*)::int FROM pg_trigger WHERE tgfoid='public.enforce_question_group_binding()'::regprocedure AND NOT tgisinternal AND tgenabled='O') AS membership`;
    expect(counts).toEqual({ files: 30, live: 30, identity: 9, membership: 6 });
    const [fn] = await prisma.$queryRaw<
      Array<{ definer: boolean; config: string[]; publicExecute: boolean }>
    >`SELECT p.prosecdef AS definer,p.proconfig AS config,EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS "publicExecute" FROM pg_proc p WHERE p.oid='public.enforce_question_group_binding()'::regprocedure`;
    expect(fn).toEqual({
      definer: false,
      config: ['search_path=pg_catalog'],
      publicExecute: false,
    });
    const constraints = await prisma.$queryRaw<
      Array<{ definition: string }>
    >`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('hw_group_question_fk','grade_group_question_fk') ORDER BY conname`;
    expect(constraints).toHaveLength(2);
    for (const c of constraints)
      expect(c.definition).toMatch(
        /FOREIGN KEY \(group_id, school_id, (assessment_id|homework_assignment_id)\)/u,
      );
    const indexes = await prisma.$queryRaw<
      Array<{ indexdef: string }>
    >`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='grade_assessment_questions' AND indexdef LIKE 'CREATE UNIQUE INDEX%'`;
    expect(
      indexes.some((i) =>
        i.indexdef.includes('(school_id, assessment_id, sort_order)'),
      ),
    ).toBe(true);
  });
});
