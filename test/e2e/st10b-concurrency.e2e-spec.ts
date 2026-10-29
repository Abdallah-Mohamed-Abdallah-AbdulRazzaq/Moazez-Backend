import type { Prisma } from '@prisma/client';
import type { Response } from 'supertest';
import { st10bCases } from '../fixtures/st10b-question-contracts.fixture';
import {
  St10bRuntimeHttp,
  type St10bDomain,
} from '../fixtures/st10b-runtime.http';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ST10-B real PostgreSQL lock dependencies and rollback', () => {
  jest.setTimeout(180000);
  const h = new St10bRuntimeHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeRuntimeCase());
  afterAll(() => h.close());
  async function heldLock(
    label: string,
    acquire: (tx: Prisma.TransactionClient) => Promise<unknown>,
    requests: Array<() => PromiseLike<Response>>,
  ) {
    const ready = deferred<number>(),
      release = deferred<void>();
    const holder = h.prisma.$transaction(
      async (tx) => {
        await acquire(tx);
        const [row] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        ready.resolve(row.pid);
        await release.promise;
      },
      { timeout: 20000 },
    );
    const holderPid = await ready.promise;
    const pending = requests.map((request) => Promise.resolve(request()));
    try {
      const deadline = Date.now() + 3000;
      let proved = false;
      while (Date.now() < deadline) {
        const rows = await h.prisma.$queryRaw<
          Array<{ pid: number; blockers: number[] }>
        >`
          SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'`;
        const chain = new Set([holderPid]);
        for (let i = 0; i <= rows.length; i++)
          for (const row of rows)
            if (row.blockers.some((pid) => chain.has(pid))) chain.add(row.pid);
        if (chain.size - 1 >= requests.length) {
          proved = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(proved).toBe(true);
      console.info(
        'ST10B_LOCK_PROOF=' +
          label +
          ': observed PostgreSQL dependency before release',
      );
      release.resolve();
      await holder;
      return await Promise.all(pending);
    } finally {
      release.resolve();
      await Promise.allSettled([holder, ...pending]);
    }
  }
  const parentLock =
    (domain: St10bDomain, id: string) => (tx: Prisma.TransactionClient) =>
      domain === 'Homework'
        ? tx.$queryRaw`SELECT id FROM homework_assignments WHERE id=${id}::uuid FOR UPDATE`
        : tx.$queryRaw`SELECT id FROM grade_assessments WHERE id=${id}::uuid FOR UPDATE`;
  describe.each<St10bDomain>(['Homework', 'Grades'])('%s', (domain) => {
    it.each(st10bCases)(
      '$type serializes atomic definition/key-clear updates versus publication',
      async (c) => {
        const f = await h.question(domain, c);
        const before = await h.stored(domain, f.questionId);
        const results = await heldLock(
          domain + '-' + c.type + '-author-publish',
          parentLock(domain, f.parentId),
          [
            () =>
              h
                .http()
                .patch(f.questionPath)
                .set(h.headers(f.author))
                .send({
                  metadata: c.changed,
                  answerKey: domain === 'Homework' ? { state: 'clear' } : null,
                }),
            () => h.http().post(f.publish).set(h.headers(f.author)).send({}),
          ],
        );
        expect([200, 409]).toContain(results[0].status);
        expect(results[1].status).toBe(domain === 'Homework' ? 200 : 201);
        const after = await h.stored(domain, f.questionId);
        expect(after.metadata).toEqual(
          results[0].status === 200 ? c.changed : before.metadata,
        );
        expect(after.answerKey).toEqual(
          results[0].status === 200 ? null : before.answerKey,
        );
      },
    );
    it.each(
      st10bCases.flatMap((c) =>
        (['single', 'bulk'] as const).map((mode) => ({ ...c, mode })),
      ),
    )(
      '$type serializes $mode saves versus final submit without partial/terminal mutation',
      async (c) => {
        const f = await h.question(domain, c);
        await h
          .http()
          .post(f.publish)
          .set(h.headers(f.author))
          .send({})
          .expect(domain === 'Homework' ? 200 : 201);
        if (domain === 'Grades')
          await h
            .http()
            .post(f.student + '/start')
            .set(h.headers('student'))
            .expect(201);
        const bulk = f.student + '/submission/answers',
          submit =
            f.student +
            (domain === 'Homework' ? '/submit' : '/submission/submit');
        await h
          .http()
          .put(bulk)
          .set(h.headers('student'))
          .send({
            answers: [{ questionId: f.questionId, answerJson: c.answer }],
          })
          .expect(200);
        const results = await heldLock(
          domain + '-' + c.type + '-' + c.mode + '-submit',
          parentLock(domain, f.parentId),
          [
            () =>
              c.mode === 'single'
                ? h
                    .http()
                    .patch(bulk + '/' + f.questionId)
                    .set(h.headers('student'))
                    .send({ answerJson: c.partial })
                : h
                    .http()
                    .put(bulk)
                    .set(h.headers('student'))
                    .send({
                      answers: [
                        { questionId: f.questionId, answerJson: c.partial },
                      ],
                    }),
            () => h.http().post(submit).set(h.headers('student')).send({}),
          ],
        );
        const submission =
          domain === 'Homework'
            ? await h.prisma.homeworkSubmission.findFirstOrThrow({
                where: { homeworkAssignmentId: f.parentId },
              })
            : await h.prisma.gradeSubmission.findFirstOrThrow({
                where: { assessmentId: f.parentId },
              });
        if (results[1].status === (domain === 'Homework' ? 200 : 201)) {
          expect(results[0].status).toBe(409);
          expect(submission.status).toBe('SUBMITTED');
        } else {
          expect(results[0].status).toBe(200);
          expect(results[1].status).toBe(domain === 'Homework' ? 422 : 400);
          expect(submission.status).toBe(
            domain === 'Homework' ? 'DRAFT' : 'IN_PROGRESS',
          );
        }
        const answer =
          domain === 'Homework'
            ? await h.prisma.homeworkSubmissionAnswer.findFirstOrThrow({
                where: { homeworkQuestionId: f.questionId },
              })
            : await h.prisma.gradeSubmissionAnswer.findFirstOrThrow({
                where: { questionId: f.questionId },
              });
        expect(answer.awardedPoints).toBeNull();
      },
    );
    it('revalidates enrollment after a successful read and a pending real revocation', async () => {
      const f = await h.question(domain, st10bCases[0]);
      await h
        .http()
        .post(f.publish)
        .set(h.headers(f.author))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      if (domain === 'Grades')
        await h
          .http()
          .post(f.student + '/start')
          .set(h.headers('student'))
          .expect(201);
      await h.http().get(f.student).set(h.headers('student')).expect(200);
      const results = await heldLock(
        domain + '-enrollment-revocation',
        (tx) =>
          tx.enrollment.update({
            where: { id: h.fixture.children[0].enrollmentId },
            data: { status: 'WITHDRAWN', endedAt: new Date() },
          }),
        [
          () =>
            h
              .http()
              .patch(f.student + '/submission/answers/' + f.questionId)
              .set(h.headers('student'))
              .send({ answerJson: st10bCases[0].answer }),
        ],
      );
      expect(results[0].status).toBe(404);
      const count =
        domain === 'Homework'
          ? await h.prisma.homeworkSubmissionAnswer.count({
              where: { homeworkQuestionId: f.questionId },
            })
          : await h.prisma.gradeSubmissionAnswer.count({
              where: { questionId: f.questionId },
            });
      expect(count).toBe(0);
    });
    it('serializes private key replacement versus publication', async () => {
      const f = await h.question(domain, st10bCases[0]);
      const key = {
        keyVersion: 1,
        kind: 'ordering',
        expectedItemIds: ['c', 'b', 'a'],
      };
      const results = await heldLock(
        domain + '-key-publish',
        parentLock(domain, f.parentId),
        [
          () =>
            h
              .http()
              .patch(f.questionPath)
              .set(h.headers(f.author))
              .send({
                answerKey:
                  domain === 'Homework' ? { state: 'value', value: key } : key,
              }),
          () => h.http().post(f.publish).set(h.headers(f.author)).send({}),
        ],
      );
      expect([200, 409]).toContain(results[0].status);
      expect(results[1].status).toBe(domain === 'Homework' ? 200 : 201);
      expect((await h.stored(domain, f.questionId)).answerKey).toEqual(
        results[0].status === 200 ? key : st10bCases[0].key,
      );
    });
    it('keeps two concurrent eleven-type bulk saves as coherent complete batches', async () => {
      const f = await h.mixed(domain);
      await h
        .http()
        .post(f.publish)
        .set(h.headers(f.author))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      if (domain === 'Grades')
        await h
          .http()
          .post(f.student + '/start')
          .set(h.headers('student'))
          .expect(201);
      const typeById = new Map<string, string>();
      if (domain === 'Homework')
        for (const q of await h.prisma.homeworkQuestion.findMany({
          where: { homeworkAssignmentId: f.parentId, deletedAt: null },
        }))
          typeById.set(q.id, q.type);
      else
        for (const q of await h.prisma.gradeAssessmentQuestion.findMany({
          where: { assessmentId: f.parentId, deletedAt: null },
        }))
          typeById.set(q.id, q.type);
      const other = f.answers.map((answer) => ({
        ...answer,
        ...(typeById.get(answer.questionId) === 'ORDERING'
          ? { answerJson: { orderedItemIds: ['c', 'a', 'b'] } }
          : {}),
        ...(typeById.get(answer.questionId) === 'NUMERIC'
          ? { answerJson: { value: '25', unitCode: 'm' } }
          : {}),
        ...(typeById.get(answer.questionId) === 'MATH_EXPRESSION'
          ? { answerJson: { expression: '17' } }
          : {}),
      }));
      const bulk = f.student + '/submission/answers';
      const results = await heldLock(
        domain + '-two-eleven-type-bulks',
        parentLock(domain, f.parentId),
        [
          () =>
            h
              .http()
              .put(bulk)
              .set(h.headers('student'))
              .send({ answers: f.answers }),
          () =>
            h
              .http()
              .put(bulk)
              .set(h.headers('student'))
              .send({ answers: other }),
        ],
      );
      expect(results.map((response) => response.status)).toEqual([200, 200]);
      const rows: Array<{
        questionId: string;
        answerJson: unknown;
        awardedPoints: unknown;
      }> =
        domain === 'Homework'
          ? (
              await h.prisma.homeworkSubmissionAnswer.findMany({
                where: { homeworkAssignmentId: f.parentId },
              })
            ).map((answer) => ({
              questionId: answer.homeworkQuestionId,
              answerJson: answer.answerJson,
              awardedPoints: answer.awardedPoints,
            }))
          : await h.prisma.gradeSubmissionAnswer.findMany({
              where: { assessmentId: f.parentId },
            });
      expect(rows).toHaveLength(11);
      const values = new Map(
        rows.map(
          (answer) =>
            [typeById.get(answer.questionId), answer.answerJson] as const,
        ),
      );
      const triplet = {
        ORDERING: values.get('ORDERING'),
        NUMERIC: values.get('NUMERIC'),
        MATH_EXPRESSION: values.get('MATH_EXPRESSION'),
      };
      expect([
        {
          ORDERING: { orderedItemIds: ['b', 'a', 'c'] },
          NUMERIC: { value: '125e-1', unitCode: 'm' },
          MATH_EXPRESSION: { expression: '14' },
        },
        {
          ORDERING: { orderedItemIds: ['c', 'a', 'b'] },
          NUMERIC: { value: '25', unitCode: 'm' },
          MATH_EXPRESSION: { expression: '17' },
        },
      ]).toContainEqual(triplet);
      expect(rows.every((answer) => answer.awardedPoints === null)).toBe(true);
    });
    it('serializes manual review versus finalization and rolls up only committed manual marks', async () => {
      const c = st10bCases[2],
        f = await h.question(domain, c);
      await h
        .http()
        .post(f.publish)
        .set(h.headers(f.author))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      if (domain === 'Grades')
        await h
          .http()
          .post(f.student + '/start')
          .set(h.headers('student'))
          .expect(201);
      await h
        .http()
        .patch(f.student + '/submission/answers/' + f.questionId)
        .set(h.headers('student'))
        .send({ answerJson: c.answer })
        .expect(200);
      await h
        .http()
        .post(f.student + '/submission/submit')
        .set(h.headers('student'))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      const answer =
        domain === 'Homework'
          ? await h.prisma.homeworkSubmissionAnswer.findFirstOrThrow({
              where: { homeworkQuestionId: f.questionId },
            })
          : await h.prisma.gradeSubmissionAnswer.findFirstOrThrow({
              where: { questionId: f.questionId },
            });
      const submissionId =
        'homeworkSubmissionId' in answer
          ? answer.homeworkSubmissionId
          : answer.submissionId;
      const base =
        domain === 'Homework'
          ? f.collection.replace(/\/questions$/u, '') +
            `/submissions/${submissionId}`
          : `/api/v1/grades/submissions/${submissionId}`;
      const review = base + `/answers/${answer.id}/review`;
      await h
        .http()
        .patch(review)
        .set(h.headers(f.author))
        .send({ awardedPoints: 1 })
        .expect(200);
      const results = await heldLock(
        domain + '-review-finalize',
        parentLock(domain, f.parentId),
        [
          () =>
            h
              .http()
              .patch(review)
              .set(h.headers(f.author))
              .send({ awardedPoints: 0 }),
          () =>
            h
              .http()
              .post(
                base + (domain === 'Homework' ? '/review' : '/review/finalize'),
              )
              .set(h.headers(f.author))
              .send({}),
        ],
      );
      expect([200, 409]).toContain(results[0].status);
      expect(results[1].status).toBe(domain === 'Homework' ? 200 : 201);
      const final =
        domain === 'Homework'
          ? await h.prisma.homeworkSubmission.findUniqueOrThrow({
              where: { id: submissionId },
            })
          : await h.prisma.gradeSubmission.findUniqueOrThrow({
              where: { id: submissionId },
            });
      expect(
        Number('awardedMarks' in final ? final.awardedMarks : final.totalScore),
      ).toBe(results[0].status === 200 ? 0 : 1);
      expect(
        await h.prisma.gradeItem.count({
          where: { schoolId: h.fixture.school.schoolId },
        }),
      ).toBe(0);
    });
  });
});
