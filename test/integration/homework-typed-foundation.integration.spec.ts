import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { HomeworkQuestionAssetsFixture } from '../fixtures/homework-question-assets.fixture';
import {
  normalizeHomeworkDefinition,
  classifyStoredHomeworkTypedAnswer,
  classifyStoredHomeworkPrivateAnswerKey,
} from '../../src/modules/homework/domain/homework-typed-foundation';
import {
  homeworkAnswerJsonPersistence,
  homeworkAnswerKeyPersistence,
} from '../../src/modules/homework/infrastructure/homework-typed-persistence';

describe('ST09-A real PostgreSQL nullable typed storage and immutable legacy rows', () => {
  jest.setTimeout(120000);
  const p = new PrismaService();
  let f: HomeworkQuestionAssetsFixture;
  beforeAll(async () => {
    f = new HomeworkQuestionAssetsFixture(p);
    await p.$connect();
  });
  beforeEach(() => f.create());
  afterEach(async () => {
    const where = { schoolId: { in: f.schools.map((s) => s.schoolId) } };
    await p.homeworkSubmissionAnswer.deleteMany({ where });
    await p.homeworkSubmission.deleteMany({ where });
    await f.dispose();
  });
  afterAll(() => p.$disconnect());
  it('has exactly eight ordered enum values and only nullable JSONB additions with no defaults', async () => {
    const labels = await p.$queryRaw<
      Array<{ enumlabel: string }>
    >`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='homework_question_type' ORDER BY e.enumsortorder`;
    expect(labels.map((l) => l.enumlabel)).toEqual([
      'SHORT_TEXT',
      'LONG_TEXT',
      'SINGLE_CHOICE',
      'MULTIPLE_CHOICE',
      'TRUE_FALSE',
      'FILL_IN_BLANK',
      'MATCHING',
      'MEDIA',
    ]);
    const columns = await p.$queryRaw<
      Array<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>
    >`SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND ((table_name='homework_questions' AND column_name='answer_key') OR (table_name='homework_submission_answers' AND column_name='answer_json')) ORDER BY column_name`;
    expect(columns).toEqual([
      {
        column_name: 'answer_json',
        data_type: 'jsonb',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'answer_key',
        data_type: 'jsonb',
        is_nullable: 'YES',
        column_default: null,
      },
    ]);
    const pending = await p.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`;
    expect(pending[0].count).toBe(0n);
  });
  it('round trips typed values and distinguishes SQL NULL, JSON null, malformed and future data without rewriting', async () => {
    const g = await f.graph(),
      q = g.questions[0];
    const t = await p.homeworkTarget.findFirstOrThrow({
      where: { homeworkAssignmentId: g.homework.id },
    });
    const s = await p.homeworkSubmission.create({
      data: {
        schoolId: t.schoolId,
        homeworkAssignmentId: t.homeworkAssignmentId,
        homeworkTargetId: t.id,
        studentId: t.studentId,
        enrollmentId: t.enrollmentId,
        bodyText: 'Legacy',
      },
    });
    const a = await p.homeworkSubmissionAnswer.create({
      data: {
        schoolId: t.schoolId,
        homeworkAssignmentId: t.homeworkAssignmentId,
        homeworkTargetId: t.id,
        homeworkSubmissionId: s.id,
        homeworkQuestionId: q.id,
        textAnswer: 'Legacy text',
      },
    });
    const d = normalizeHomeworkDefinition('FILL_IN_BLANK', {
      definitionVersion: 1,
      kind: 'fill',
      blanks: [{ id: 'a', order: 1 }],
      segments: [{ blankId: 'a' }],
    });
    const validKey = {
      keyVersion: 1,
      kind: 'fill',
      blanks: [{ blankId: 'a', acceptedAnswers: ['Private'] }],
    };
    const validAnswer = { blanks: [{ blankId: 'a', text: 'Learner' }] };
    for (const entry of [
      { key: Prisma.DbNull, answer: Prisma.DbNull, state: 'absent' },
      { key: Prisma.JsonNull, answer: Prisma.JsonNull, state: 'invalid' },
      { key: { keyVersion: 99 }, answer: { pairs: [] }, state: 'invalid' },
      {
        key: homeworkAnswerKeyPersistence(d, {
          state: 'value',
          value: validKey,
        }),
        answer: homeworkAnswerJsonPersistence(
          d,
          { state: 'value', value: validAnswer },
          'final',
          true,
        ),
        state: 'valid',
      },
    ]) {
      await p.homeworkQuestion.update({
        where: { id: q.id },
        data: { answerKey: entry.key },
      });
      await p.homeworkSubmissionAnswer.update({
        where: { id: a.id },
        data: { answerJson: entry.answer },
      });
      const currentQ = await p.homeworkQuestion.findUniqueOrThrow({
          where: { id: q.id },
        }),
        currentA = await p.homeworkSubmissionAnswer.findUniqueOrThrow({
          where: { id: a.id },
        });
      const flags = await p.$queryRaw<
        Array<{ keyNull: boolean; answerNull: boolean }>
      >`SELECT q.answer_key IS NULL AS "keyNull",a.answer_json IS NULL AS "answerNull" FROM homework_questions q JOIN homework_submission_answers a ON a.homework_question_id=q.id WHERE a.id=${a.id}::uuid`;
      expect(
        classifyStoredHomeworkPrivateAnswerKey(
          d,
          currentQ.answerKey,
          flags[0].keyNull,
        ).state,
      ).toBe(entry.state);
      expect(
        classifyStoredHomeworkTypedAnswer(
          d,
          currentA.answerJson,
          flags[0].answerNull,
          'final',
        ).state,
      ).toBe(entry.state);
      expect(
        await p.homeworkQuestion.findUnique({ where: { id: q.id } }),
      ).toEqual(currentQ);
      expect(
        await p.homeworkSubmissionAnswer.findUnique({ where: { id: a.id } }),
      ).toEqual(currentA);
      expect(currentA.textAnswer).toBe(a.textAnswer);
      expect(currentQ.prompt).toBe(q.prompt);
    }
    await p.homeworkQuestion.update({
      where: { id: q.id },
      data: { answerKey: homeworkAnswerKeyPersistence(d, { state: 'clear' }) },
    });
    await p.homeworkSubmissionAnswer.update({
      where: { id: a.id },
      data: {
        answerJson: homeworkAnswerJsonPersistence(
          d,
          { state: 'clear' },
          'draft',
          false,
        ),
      },
    });
    expect(
      (
        await p.homeworkSubmissionAnswer.findUniqueOrThrow({
          where: { id: a.id },
        })
      ).answerJson,
    ).toBeNull();
    // Existing restrictive Homework question/answer foreign key still applies.
    await expect(
      p.homeworkQuestion.delete({ where: { id: q.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(
      await p.homeworkSubmission.findUnique({ where: { id: s.id } }),
    ).toEqual(s);
  });
});
