import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { normalizeRichContent } from '../../src/common/rich-content/rich-content.validation';
import { readStoredRichContent } from '../../src/common/rich-content/rich-content.compatibility';
import { AssessmentAssetsFixture } from '../fixtures/assessment-assets.fixture';

const families = [
  { model: 'homeworkQuestion', table: 'homework_questions', kind: 'question' },
  {
    model: 'homeworkQuestionOption',
    table: 'homework_question_options',
    kind: 'option',
  },
  {
    model: 'gradeAssessmentQuestion',
    table: 'grade_assessment_questions',
    kind: 'question',
  },
  {
    model: 'gradeAssessmentQuestionOption',
    table: 'grade_assessment_question_options',
    kind: 'option',
  },
] as const;
type Family = (typeof families)[number];

describe('ST08-A nullable Rich Content persistence on owned PostgreSQL', () => {
  jest.setTimeout(120000);
  const prisma = new PrismaService();
  let fixture: AssessmentAssetsFixture;
  const ids = new Map<Family['model'], string>();
  const document = {
    language: 'ar',
    direction: 'rtl',
    blocks: [
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'س < ص و ١٢٣ = 123' }],
      },
    ],
  };
  const content = (family: Family) =>
    normalizeRichContent(
      family.kind === 'question'
        ? { contentVersion: 1, kind: 'question', stem: document }
        : { contentVersion: 1, kind: 'option', label: document },
    );
  const id = (family: Family) => {
    const value = ids.get(family.model);
    if (!value) throw new Error('Missing owned fixture row');
    return value;
  };
  const row = async (family: Family) => {
    const [result] = await prisma.$queryRaw<
      Array<{ value: unknown; sqlNull: boolean; legacy: unknown }>
    >(Prisma.sql`
      SELECT rich_content AS value, rich_content IS NULL AS "sqlNull",
        to_jsonb(t) - 'rich_content' - 'updated_at' AS legacy
      FROM public.${Prisma.raw(family.table)} t WHERE id = ${id(family)}::uuid`);
    return result;
  };
  const write = (
    family: Family,
    value: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
  ) => {
    const where = { id: id(family) },
      data = { richContent: value };
    switch (family.model) {
      case 'homeworkQuestion':
        return prisma.homeworkQuestion.update({
          where,
          data,
          select: { id: true, richContent: true },
        });
      case 'homeworkQuestionOption':
        return prisma.homeworkQuestionOption.update({
          where,
          data,
          select: { id: true, richContent: true },
        });
      case 'gradeAssessmentQuestion':
        return prisma.gradeAssessmentQuestion.update({
          where,
          data,
          select: { id: true, richContent: true },
        });
      case 'gradeAssessmentQuestionOption':
        return prisma.gradeAssessmentQuestionOption.update({
          where,
          data,
          select: { id: true, richContent: true },
        });
    }
  };
  beforeAll(async () => {
    await prisma.$connect();
    fixture = new AssessmentAssetsFixture(prisma);
    await fixture.create();
    const parent = fixture.parents[0];
    ids.set('homeworkQuestion', parent.homeworkQuestionId);
    ids.set('gradeAssessmentQuestion', parent.questionId);
    const homeworkOption = await prisma.homeworkQuestionOption.create({
      data: {
        schoolId: parent.schoolId,
        homeworkQuestionId: parent.homeworkQuestionId,
        text: 'Legacy choice',
        isCorrect: true,
        metadata: { preserved: 'private' },
      },
    });
    const gradeOption = await prisma.gradeAssessmentQuestionOption.create({
      data: {
        schoolId: parent.schoolId,
        assessmentId: parent.assessmentId,
        questionId: parent.questionId,
        label: 'Legacy choice',
        labelAr: 'اختيار',
        value: 'legacy-value',
        isCorrect: true,
        sortOrder: 1,
        metadata: { preserved: 'private' },
      },
    });
    ids.set('homeworkQuestionOption', homeworkOption.id);
    ids.set('gradeAssessmentQuestionOption', gradeOption.id);
  });
  afterEach(async () => {
    for (const family of families)
      if (ids.has(family.model)) await write(family, Prisma.DbNull);
  });
  afterAll(async () => {
    try {
      if (fixture) await fixture.dispose();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('has exactly four nullable JSONB columns without defaults', async () => {
    const columns = await prisma.$queryRaw<
      Array<{
        table_name: string;
        data_type: string;
        is_nullable: string;
        column_default: unknown;
      }>
    >`
      SELECT table_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'rich_content' ORDER BY table_name`;
    expect(columns).toEqual(
      [...families]
        .sort((a, b) => a.table.localeCompare(b.table))
        .map((family) => ({
          table_name: family.table,
          data_type: 'jsonb',
          is_nullable: 'YES',
          column_default: null,
        })),
    );
  });
  it.each(families)(
    '$model reads legacy rows with SQL NULL Rich Content',
    async (family) => {
      expect(await row(family)).toMatchObject({ value: null, sqlNull: true });
      const legacy = await row(family);
      expect(readStoredRichContent(legacy.value, legacy.sqlNull)).toEqual({
        state: 'absent',
      });
    },
  );
  it.each(families)(
    '$model round-trips validated JSON without changing legacy identity/answer/text fields',
    async (family) => {
      const before = await row(family);
      expect(await write(family, content(family))).toEqual({
        id: id(family),
        richContent: content(family),
      });
      const after = await row(family);
      expect(after.legacy).toEqual(before.legacy);
      expect(readStoredRichContent(after.value, after.sqlNull)).toEqual({
        state: 'valid',
        content: content(family),
      });
    },
  );
  it.each(families)(
    '$model distinguishes actual Prisma JsonNull from DbNull',
    async (family) => {
      await write(family, Prisma.JsonNull);
      const jsonNull = await row(family);
      expect(jsonNull).toMatchObject({ value: null, sqlNull: false });
      expect(readStoredRichContent(jsonNull.value, jsonNull.sqlNull)).toEqual({
        state: 'invalid',
      });
      await write(family, Prisma.DbNull);
      const sqlNull = await row(family);
      expect(sqlNull).toMatchObject({ value: null, sqlNull: true });
      expect(readStoredRichContent(sqlNull.value, sqlNull.sqlNull)).toEqual({
        state: 'absent',
      });
    },
  );
  it.each(families)(
    '$model rejects malformed/future stored AST without exposing or rewriting its row',
    async (family) => {
      const before = await row(family);
      for (const value of [
        { contentVersion: 1, kind: family.kind, answerKey: 'private-solution' },
        { contentVersion: 2, kind: family.kind, stem: { future: true } },
      ]) {
        await write(family, value);
        const stored = await row(family);
        expect(readStoredRichContent(stored.value, stored.sqlNull)).toEqual({
          state: value.contentVersion === 2 ? 'unsupported' : 'invalid',
        });
        expect(await row(family)).toEqual(stored);
        expect(stored.legacy).toEqual(before.legacy);
      }
    },
  );
  it.each(families)(
    '$model omitted column updates preserve Rich Content',
    async (family) => {
      await write(family, content(family));
      const before = await row(family);
      // Schema-level DML, no ST08-B/C authoring flow or grading operation.
      await prisma.$executeRaw(
        Prisma.sql`UPDATE public.${Prisma.raw(family.table)} SET updated_at = CURRENT_TIMESTAMP WHERE id = ${id(family)}::uuid`,
      );
      expect(await row(family)).toEqual(before);
    },
  );
  it('keeps option content on stable row IDs when labels/order change', async () => {
    const homework = families[1],
      grade = families[3];
    await write(homework, content(homework));
    await write(grade, content(grade));
    await prisma.homeworkQuestionOption.update({
      where: { id: id(homework) },
      data: { text: 'Reordered legacy', sortOrder: 3 },
    });
    await prisma.gradeAssessmentQuestionOption.update({
      where: { id: id(grade) },
      data: { label: 'Reordered legacy', sortOrder: 3 },
    });
    expect((await row(homework)).value).toEqual(content(homework));
    expect((await row(grade)).value).toEqual(content(grade));
    // Future domain integration must clear stale AST on a legacy edit; the DB
    // adds storage only and does not invent a trigger or change replacement.
  });
});
