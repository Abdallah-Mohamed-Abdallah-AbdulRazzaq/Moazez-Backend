import { Prisma } from '@prisma/client';
import {
  st10bCases,
  st10bPrivateFields,
} from '../fixtures/st10b-question-contracts.fixture';
import {
  St10bRuntimeHttp,
  type St10bDomain,
} from '../fixtures/st10b-runtime.http';
import { st06Json } from '../fixtures/homework-question-assets.http';

describe('ST10-B real HTTP/PostgreSQL authoring and publication', () => {
  jest.setTimeout(180000);
  const h = new St10bRuntimeHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeRuntimeCase());
  afterAll(() => h.close());
  describe.each<St10bDomain>(['Homework', 'Grades'])('%s', (domain) => {
    it.each(st10bCases)(
      '$type creates/updates canonical definitions and rejects stale retained keys atomically',
      async (c) => {
        const f = await h.question(domain, c);
        const before = await h.stored(domain, f.questionId);
        const rejected = await h
          .http()
          .patch(f.questionPath)
          .set(h.headers(f.author))
          .send({ metadata: c.changed });
        expect(rejected.status).toBe(domain === 'Homework' ? 422 : 400);
        expect(await h.stored(domain, f.questionId)).toEqual(before);
        const clear = domain === 'Homework' ? { state: 'clear' } : null;
        await h
          .http()
          .patch(f.questionPath)
          .set(h.headers(f.author))
          .send({ metadata: c.changed, answerKey: clear })
          .expect(200);
        const [fact] =
          domain === 'Homework'
            ? await h.prisma.$queryRaw<
                Array<{ sqlNull: boolean }>
              >`SELECT answer_key IS NULL AS "sqlNull" FROM homework_questions WHERE id=${f.questionId}::uuid`
            : await h.prisma.$queryRaw<
                Array<{ sqlNull: boolean }>
              >`SELECT answer_key IS NULL AS "sqlNull" FROM grade_assessment_questions WHERE id=${f.questionId}::uuid`;
        expect(fact.sqlNull).toBe(true);
        await h
          .http()
          .patch(f.questionPath)
          .set(h.headers(f.author))
          .send({
            metadata: c.definition,
            answerKey:
              domain === 'Homework' ? { state: 'value', value: c.key } : c.key,
          })
          .expect(200);
        const identity = await h.stored(domain, f.questionId);
        expect(identity.id).toBe(before.id);
        const invalidKey = await h
          .http()
          .patch(f.questionPath)
          .set(h.headers(f.author))
          .send({
            answerKey:
              domain === 'Homework'
                ? { state: 'value', value: { ...c.key, keyVersion: 2 } }
                : { ...c.key, keyVersion: 2 },
          });
        expect(invalidKey.status).toBe(domain === 'Homework' ? 422 : 400);
        const transition = await h
          .http()
          .patch(f.questionPath)
          .set(h.headers(f.author))
          .send({
            type: domain === 'Homework' ? 'SHORT_TEXT' : 'SHORT_ANSWER',
          });
        expect(transition.status).toBe(domain === 'Homework' ? 422 : 400);
        const withOptions = await h
          .http()
          .post(f.collection)
          .set(h.headers(f.author))
          .send({
            type: c.type,
            prompt: 'Invalid options',
            points: 1,
            metadata: c.definition,
            options: [
              domain === 'Homework'
                ? { text: 'Not a choice' }
                : { label: 'Not a choice' },
            ],
          });
        expect(withOptions.status).toBe(422);
        const incompatible = await h
          .http()
          .patch(f.questionPath)
          .set(h.headers(f.author))
          .send({ metadata: { ...c.definition, sampleAnswerEn: 'PRIVATE' } });
        expect(incompatible.status).toBe(domain === 'Homework' ? 422 : 400);
        expect(await h.stored(domain, f.questionId)).toEqual(identity);
        const other = await h
          .http()
          .patch(f.questionPath)
          .set(h.headers('otherTeacher'))
          .send({ points: 1 });
        expect([403, 404]).toContain(other.status);
        const foreign = await h
          .http()
          .patch(f.questionPath)
          .set(h.headers('foreignTeacher'))
          .send({ points: 1 });
        expect([403, 404]).toContain(foreign.status);
        await h
          .http()
          .post(f.publish)
          .set(h.headers(f.author))
          .send({})
          .expect(domain === 'Homework' ? 200 : 201);
        const terminal = await h
          .http()
          .patch(f.questionPath)
          .set(h.headers(f.author))
          .send({ points: 2 });
        expect([409, 422]).toContain(terminal.status);
        const student = await h
          .http()
          .get(f.student)
          .set(h.headers('student'))
          .expect(200);
        const publicJson = JSON.stringify(student.body);
        expect(publicJson).toContain(c.kind);
        for (const field of st10bPrivateFields)
          expect(publicJson).not.toContain('"' + field + '"');
        if (domain === 'Grades') {
          const questions = st06Json<{
            stages: Array<{ questions: unknown[] }>;
          }>(student).stages[0].questions;
          expect(questions[0]).toMatchObject({
            type: c.kind,
            canonicalType: c.type,
            interaction: {
              kind: c.kind,
              supported: true,
              definition: { definitionVersion: 1, kind: c.kind },
            },
          });
        }
      },
    );
    it.each(st10bCases)(
      '$type refuses malformed stored definitions and keys at locked publication without state mutation',
      async (c) => {
        const f = await h.question(domain, c);
        if (domain === 'Homework')
          await h.prisma.homeworkQuestion.update({
            where: { id: f.questionId },
            data: { metadata: { ...c.definition, definitionVersion: 2 } },
          });
        else
          await h.prisma.gradeAssessmentQuestion.update({
            where: { id: f.questionId },
            data: { metadata: { ...c.definition, definitionVersion: 2 } },
          });
        const publication = await h
          .http()
          .post(f.publish)
          .set(h.headers(f.author))
          .send({});
        expect(publication.status).toBe(domain === 'Homework' ? 422 : 400);
        const state =
          domain === 'Homework'
            ? (
                await h.prisma.homeworkAssignment.findUniqueOrThrow({
                  where: { id: f.parentId },
                })
              ).status
            : (
                await h.prisma.gradeAssessment.findUniqueOrThrow({
                  where: { id: f.parentId },
                })
              ).approvalStatus;
        expect(state).toBe('DRAFT');
        // Invalid configured JSON null is never reinterpreted as a manual-only key.
        if (domain === 'Homework')
          await h.prisma.homeworkQuestion.update({
            where: { id: f.questionId },
            data: {
              metadata: c.definition as unknown as Prisma.InputJsonValue,
              answerKey: Prisma.JsonNull,
            },
          });
        else
          await h.prisma.gradeAssessmentQuestion.update({
            where: { id: f.questionId },
            data: {
              metadata: c.definition as unknown as Prisma.InputJsonValue,
              answerKey: Prisma.JsonNull,
            },
          });
        expect(
          (await h.http().post(f.publish).set(h.headers(f.author)).send({}))
            .status,
        ).toBe(domain === 'Homework' ? 422 : 400);
        await h
          .http()
          .patch(f.questionPath)
          .set(h.headers(f.author))
          .send({
            answerKey: domain === 'Homework' ? { state: 'clear' } : null,
          })
          .expect(200);
        await h
          .http()
          .post(f.publish)
          .set(h.headers(f.author))
          .send({})
          .expect(domain === 'Homework' ? 200 : 201);
      },
    );
    it('rejects ST10A-MATH-01 private keys without returning their expressions', async () => {
      const f = await h.question(domain, st10bCases[2]);
      for (const expression of ['x+1/0', 'x/0', 'x/(2-2)', 'x+0^0']) {
        const key = { keyVersion: 1, kind: 'math_expression', expression };
        const response = await h
          .http()
          .patch(f.questionPath)
          .set(h.headers(f.author))
          .send({
            answerKey:
              domain === 'Homework' ? { state: 'value', value: key } : key,
          });
        expect(response.status).toBe(domain === 'Homework' ? 422 : 400);
        expect(JSON.stringify(response.body)).not.toContain(expression);
      }
    });
    it('preserves Ordering item identity and private sequence across display reordering', async () => {
      const c = st10bCases[0],
        f = await h.question(domain, c);
      const metadata = {
        ...c.definition,
        items: c.definition.items.map((item) => ({
          ...item,
          displayOrder: 4 - item.displayOrder,
        })),
      };
      await h
        .http()
        .patch(f.questionPath)
        .set(h.headers(f.author))
        .send({ metadata })
        .expect(200);
      const stored = await h.stored(domain, f.questionId);
      expect(stored.answerKey).toEqual(c.key);
      expect(stored.metadata).toMatchObject({
        items: [{ id: 'c' }, { id: 'b' }, { id: 'a' }],
      });
    });
    it('rechecks the existing management grant after a successful author read', async () => {
      const f = await h.question(domain, st10bCases[1]);
      await h.http().get(f.collection).set(h.headers(f.author)).expect(200);
      const before = await h.stored(domain, f.questionId);
      await h.prisma.rolePermission.deleteMany({
        where: {
          roleId: h.fixture.actors[f.author].roleId,
          permission: {
            code:
              domain === 'Homework'
                ? 'homework.questions.manage'
                : 'grades.questions.manage',
          },
        },
      });
      const denied = await h
        .http()
        .patch(f.questionPath)
        .set(h.headers(f.author))
        .send({ points: 2 });
      expect([403, 404]).toContain(denied.status);
      expect(await h.stored(domain, f.questionId)).toEqual(before);
    });
  });
});
