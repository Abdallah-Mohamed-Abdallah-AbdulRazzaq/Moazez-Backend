import type { Response } from 'supertest';
import type { HomeworkSubmissionAnswer } from '@prisma/client';
import {
  HomeworkQuestionAssetsHttp,
  type HttpAssetActor,
} from '../fixtures/homework-question-assets.http';
import { HomeworkRepository } from '../../src/modules/homework/infrastructure/homework.repository';
import { requireHomeworkScope } from '../../src/modules/homework/homework-context';
import { st09bcFill } from '../fixtures/homework-eight-type.fixture';

const kinds = ['legacy', 'typed', 'mixed', 'response'] as const;

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Review integrity barrier deadline')),
          5000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe('Post-closeout Homework review integrity: real PostgreSQL and authenticated HTTP', () => {
  jest.setTimeout(180000);
  const h = new HomeworkQuestionAssetsHttp();
  let repository: HomeworkRepository;
  beforeAll(async () => {
    await h.start();
    repository = h.app.get(HomeworkRepository);
  });
  beforeEach(async () => {
    await h.reset();
    for (const name of ['teacher', 'otherTeacher', 'foreignTeacher'] as const)
      await h.fixture.grantAssets(h.fixture.actors[name].roleId, [
        'homework.submissions.review',
      ]);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    // Fault injection is confined to this fixture's guarded disposable database.
    await h.prisma
      .$executeRaw`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS review_integrity_fault`;
    await h.prisma
      .$executeRaw`ALTER TABLE homework_submission_answers DROP CONSTRAINT IF EXISTS review_integrity_answer_fault`;
    await h.prisma
      .$executeRaw`DROP TRIGGER IF EXISTS review_integrity_skip_update ON homework_submission_answers`;
    await h.prisma
      .$executeRaw`DROP FUNCTION IF EXISTS public.review_integrity_skip_update()`;
    await h.prisma
      .$executeRaw`DROP TRIGGER IF EXISTS review_integrity_audit_barrier ON audit_logs`;
    await h.prisma
      .$executeRaw`DROP FUNCTION IF EXISTS public.review_integrity_audit_barrier()`;
    const where = {
      schoolId: { in: h.fixture.schools.map((s) => s.schoolId) },
    };
    await h.prisma.homeworkSubmissionAnswer.deleteMany({ where });
    await h.prisma.homeworkSubmission.deleteMany({ where });
    await h.prisma.homeworkQuestion.updateMany({
      where,
      data: { groupId: null },
    });
    await h.prisma.homeworkQuestionGroup.deleteMany({ where });
    await h.disposeCase();
  });
  afterAll(() => h.close());

  async function fixture(
    kind: 'legacy' | 'typed' | 'mixed' | 'response' = 'legacy',
    owner: 'teacher' | 'foreignTeacher' = 'teacher',
  ) {
    const graph = await h.fixture.graph(owner);
    await h.prisma.homeworkQuestion.delete({
      where: { id: graph.questions[2].id },
    });
    for (const question of graph.questions.slice(0, 2))
      await h.prisma.homeworkQuestion.update({
        where: { id: question.id },
        data: { points: 5 },
      });
    if (kind === 'typed' || kind === 'mixed') {
      for (const question of graph.questions.slice(0, kind === 'typed' ? 2 : 1))
        await h.prisma.homeworkQuestion.update({
          where: { id: question.id },
          data: {
            type: 'FILL_IN_BLANK',
            metadata: st09bcFill,
          },
        });
    }
    if (kind === 'response')
      await h.prisma.homeworkQuestion.update({
        where: { id: graph.questions[0].id },
        data: {
          responseConfig: { version: 1, mode: 'TEXT_ONLY' },
        },
      });
    await h.prisma.homeworkAssignment.update({
      where: { id: graph.homework.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        isGraded: true,
        totalMarks: 10,
      },
    });
    const target = await h.prisma.homeworkTarget.findFirstOrThrow({
      where: { homeworkAssignmentId: graph.homework.id },
    });
    await h.prisma.homeworkTarget.update({
      where: { id: target.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    const submission = await h.prisma.homeworkSubmission.create({
      data: {
        schoolId: target.schoolId,
        homeworkAssignmentId: graph.homework.id,
        homeworkTargetId: target.id,
        studentId: target.studentId,
        enrollmentId: target.enrollmentId,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        awardedMarks: 0,
      },
    });
    const answers: HomeworkSubmissionAnswer[] = [];
    for (const question of graph.questions.slice(0, 2)) {
      const typed =
        kind === 'typed' ||
        (kind === 'mixed' && question.id === graph.questions[0].id);
      answers.push(
        await h.prisma.homeworkSubmissionAnswer.create({
          data: {
            schoolId: target.schoolId,
            homeworkAssignmentId: graph.homework.id,
            homeworkSubmissionId: submission.id,
            homeworkTargetId: target.id,
            homeworkQuestionId: question.id,
            textAnswer: typed ? null : 'Private student answer',
            ...(typed
              ? {
                  answerJson: {
                    blanks: [
                      { blankId: 'b1', text: 'One' },
                      { blankId: 'b2', text: 'Two' },
                    ],
                  },
                }
              : {}),
            awardedPoints: 0,
          },
        }),
      );
    }
    const core = `/api/v1/homework/assignments/${graph.homework.id}/submissions/${submission.id}`;
    const teacher = `/api/v1/teacher/homeworks/classes/${h.fixture.allocations.teacher}/assignments/${graph.homework.id}/submissions/${submission.id}`;
    return { graph, submission, target, answers, core, teacher };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  function single(
    f: Fixture,
    index: number,
    body: object,
    actor: HttpAssetActor = 'admin',
    teacher = false,
  ) {
    return h
      .http()
      .patch(
        (teacher ? f.teacher : f.core) +
          `/answers/${f.answers[index].id}/review`,
      )
      .set(h.headers(actor))
      .send(body);
  }
  function finalize(f: Fixture, body: object = {}) {
    return h
      .http()
      .post(f.core + '/review')
      .set(h.headers('admin'))
      .send(body);
  }
  async function stored(f: Fixture) {
    const submission = await h.prisma.homeworkSubmission.findUniqueOrThrow({
      where: { id: f.submission.id },
    });
    const answers = await Promise.all(
      f.answers.map((a) =>
        h.prisma.homeworkSubmissionAnswer.findUniqueOrThrow({
          where: { id: a.id },
        }),
      ),
    );
    return {
      submission,
      points: answers.map((a) =>
        a.awardedPoints === null ? null : Number(a.awardedPoints),
      ),
      comments: answers.map((a) => a.teacherComment),
    };
  }
  async function waiters(holder: number, count: number, scenario: string) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await h.prisma.$queryRaw<
        Array<{ pid: number; blockers: number[] }>
      >`
        SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
        WHERE datname=current_database() AND cardinality(pg_blocking_pids(pid)) > 0`;
      const reached = new Set([holder]);
      for (let i = 0; i <= rows.length; i++)
        for (const row of rows)
          if (row.blockers.some((pid) => reached.has(pid)))
            reached.add(row.pid);
      if (reached.size >= count + 1) {
        console.info(
          'REVIEW_INTEGRITY_LOCK_PROOF=' +
            JSON.stringify({ scenario, holder, dependencies: rows }),
        );
        return rows;
      }
      // Wait on a measured PostgreSQL dependency, never elapsed time as proof.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('No PostgreSQL blocking proof for ' + scenario);
  }
  async function queuedReviews(
    f: Fixture,
    firstBody: object,
    secondBody: object,
    sameAnswer = false,
  ) {
    const locked = deferred<number>(),
      releaseLock = deferred();
    const read = [deferred(), deferred()],
      releaseRead = [deferred(), deferred()];
    const original = repository.findSubmissionForAnswerReview.bind(
      repository,
    ) as typeof repository.findSubmissionForAnswerReview;
    let calls = 0;
    jest
      .spyOn(repository, 'findSubmissionForAnswerReview')
      .mockImplementation(async (input) => {
        const current = await original(input);
        const index = calls++;
        if (index < 2) {
          read[index].resolve();
          await releaseRead[index].promise;
        }
        return current;
      });
    const holder = h.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM homework_assignments WHERE id=${f.graph.homework.id}::uuid FOR UPDATE`;
        const [row] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        locked.resolve(row.pid);
        await releaseLock.promise;
      },
      { timeout: 15000 },
    );
    const pid = await bounded(locked.promise);
    const first = Promise.resolve(single(f, 0, firstBody));
    let second: Promise<Response> | undefined;
    try {
      await bounded(read[0].promise);
      second = Promise.resolve(single(f, sameAnswer ? 0 : 1, secondBody));
      await bounded(read[1].promise);
      releaseRead[0].resolve();
      await waiters(pid, 1, 'first review queued');
      releaseRead[1].resolve();
      await waiters(pid, 2, 'both stale readers queued');
      releaseLock.resolve();
      await holder;
      return await Promise.all([first, second]);
    } finally {
      releaseLock.resolve();
      releaseRead.forEach((item) => item.resolve());
      await Promise.allSettled([holder, first, ...(second ? [second] : [])]);
    }
  }
  async function afterRead(
    f: Fixture,
    winningWrite: () => PromiseLike<unknown>,
    finalizing?: object,
    lock:
      | 'assignment'
      | 'membership'
      | 'permission'
      | 'allocation' = 'assignment',
    actorName: 'admin' | 'teacher' = 'admin',
  ) {
    const read = deferred(),
      release = deferred();
    const name = finalizing
      ? 'findReviewableSubmission'
      : 'findSubmissionForAnswerReview';
    const original = repository[name].bind(
      repository,
    ) as HomeworkRepository[typeof name];
    const spy = jest
      .spyOn(repository, name)
      .mockImplementation(async (input) => {
        const current = await original(input);
        read.resolve();
        await release.promise;
        return current;
      });
    const pending = Promise.resolve(
      finalizing
        ? finalize(f, finalizing)
        : single(
            f,
            0,
            { awardedPoints: 4 },
            actorName,
            actorName === 'teacher',
          ),
    );
    const releaseLock = deferred(),
      locked = deferred<number>();
    let holder: Promise<void> | undefined, winner: Promise<unknown> | undefined;
    try {
      await bounded(read.promise);
      spy.mockRestore();
      // The request already passed JWT, permissions and the real initial read.
      holder = h.prisma.$transaction(
        async (tx) => {
          if (lock === 'assignment')
            await tx.$queryRaw`SELECT id FROM homework_assignments WHERE id=${f.graph.homework.id}::uuid FOR UPDATE`;
          if (lock === 'membership')
            await tx.$queryRaw`SELECT id FROM memberships WHERE id=${h.fixture.actors[actorName].membershipId}::uuid FOR UPDATE`;
          if (lock === 'allocation')
            await tx.$queryRaw`SELECT id FROM teacher_subject_allocations WHERE id=${h.fixture.allocations.teacher}::uuid FOR UPDATE`;
          if (lock === 'permission')
            await tx.$queryRaw`SELECT rp.role_id FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
          WHERE rp.role_id=${h.fixture.actors[actorName].roleId}::uuid
            AND p.code=${actorName === 'teacher' ? 'homework.submissions.review' : 'homework.assignments.manage'} FOR UPDATE OF rp`;
          const [row] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          locked.resolve(row.pid);
          await releaseLock.promise;
        },
        { timeout: 15000 },
      );
      const pid = await bounded(locked.promise);
      winner = Promise.resolve(winningWrite());
      await waiters(
        pid,
        1,
        'state-changing writer before stale review: ' + lock,
      );
      releaseLock.resolve();
      await holder;
      await winner;
      release.resolve();
      return await pending;
    } finally {
      releaseLock.resolve();
      release.resolve();
      await Promise.allSettled([
        pending,
        ...(holder ? [holder] : []),
        ...(winner ? [winner] : []),
      ]);
    }
  }

  it.each(['legacy', 'typed', 'mixed', 'response'] as const)(
    'HA-AUD-01/04: %s distinct reviews preserve the authoritative sum with Core manage-only grants',
    async (kind) => {
      const f = await fixture(kind);
      const responses = await queuedReviews(
        f,
        { awardedPoints: 4 },
        { awardedPoints: 5 },
      );
      const current = await stored(f);
      console.info(
        'REVIEW_INTEGRITY_OBSERVED=' +
          JSON.stringify({
            scenario: kind,
            statuses: responses.map((r) => r.status),
            points: current.points,
            total: Number(current.submission.awardedMarks),
          }),
      );
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(current.points).toEqual([4, 5]);
      expect(Number(current.submission.awardedMarks)).toBe(9);
    },
  );
  it.each(kinds)(
    'HA-AUD-01: a stale comment-only review preserves the latest committed points (%s)',
    async (kind) => {
      const f = await fixture(kind);
      const responses = await queuedReviews(
        f,
        { awardedPoints: 4 },
        { teacherComment: ' Latest comment ' },
        true,
      );
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      const current = await stored(f);
      console.info(
        'REVIEW_INTEGRITY_COMMENT_OBSERVED=' +
          JSON.stringify({
            points: current.points,
            comments: current.comments,
          }),
      );
      expect(current.points[0]).toBe(4);
      expect(current.comments[0]).toBe('Latest comment');
      expect(Number(current.submission.awardedMarks)).toBe(4);
    },
  );
  it.each(kinds)(
    'HA-AUD-01: a stale points-only review preserves the latest committed comment (%s)',
    async (kind) => {
      const f = await fixture(kind);
      const responses = await queuedReviews(
        f,
        { teacherComment: 'Latest comment' },
        { awardedPoints: 4 },
        true,
      );
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      const current = await stored(f);
      expect(current.points[0]).toBe(4);
      expect(current.comments[0]).toBe('Latest comment');
    },
  );
  it.each(kinds)(
    'HA-AUD-01: concurrent totals exceeding assignment marks roll back the losing answer (%s)',
    async (kind) => {
      const f = await fixture(kind);
      await h.prisma.homeworkAssignment.update({
        where: { id: f.graph.homework.id },
        data: { totalMarks: 8 },
      });
      const responses = await queuedReviews(
        f,
        { awardedPoints: 4 },
        { awardedPoints: 5 },
      );
      expect(responses.map((r) => r.status)).toEqual([200, 422]);
      expect((await stored(f)).points).toEqual([4, 0]);
      expect(Number((await stored(f)).submission.awardedMarks)).toBe(4);
    },
  );
  it.each(
    kinds.flatMap((kind) =>
      ['finalize', 'cancel'].map((operation) => ({ kind, operation })),
    ),
  )(
    'HA-AUD-02: $kind review authorized before $operation cannot write afterward',
    async ({ kind, operation }) => {
      const f = await fixture(kind);
      const response = await afterRead(f, async () => {
        if (operation === 'finalize') await finalize(f).expect(200);
        else
          await h
            .http()
            .post(`/api/v1/homework/assignments/${f.graph.homework.id}/cancel`)
            .set(h.headers('admin'))
            .send({})
            .expect(200);
      });
      console.info(
        'REVIEW_INTEGRITY_LIFECYCLE_OBSERVED=' +
          JSON.stringify({
            operation,
            status: response.status,
            points: (await stored(f)).points,
          }),
      );
      expect(response.status).toBe(409);
      expect((await stored(f)).points).toEqual([0, 0]);
    },
  );
  it.each(
    kinds.flatMap((kind) =>
      ['single', 'bulk', 'finalize'].map((operation) => ({ kind, operation })),
    ),
  )(
    'HA-AUD-03: $kind $operation Audit insertion failure rolls back the whole mutation',
    async ({ kind, operation }) => {
      const f = await fixture(kind);
      await h.prisma
        .$executeRaw`ALTER TABLE audit_logs ADD CONSTRAINT review_integrity_fault
      CHECK (action NOT IN ('homework.answer_review.review','homework.answer_review.bulk_review','homework.submission.review')) NOT VALID`;
      const response =
        operation === 'single'
          ? await single(f, 0, { awardedPoints: 4 })
          : operation === 'bulk'
            ? await h
                .http()
                .put(f.core + '/answers/review')
                .set(h.headers('admin'))
                .send({
                  answers: f.answers.map((a) => ({
                    answerId: a.id,
                    awardedPoints: 4,
                  })),
                })
            : await finalize(f);
      const current = await stored(f);
      console.info(
        'REVIEW_INTEGRITY_AUDIT_OBSERVED=' +
          JSON.stringify({
            operation,
            http: response.status,
            points: current.points,
            status: current.submission.status,
            total: Number(current.submission.awardedMarks),
          }),
      );
      expect(response.status).toBe(500);
      expect(current.points).toEqual([0, 0]);
      expect(Number(current.submission.awardedMarks)).toBe(0);
      expect(current.submission.status).toBe('SUBMITTED');
      expect(
        (
          await h.prisma.homeworkTarget.findUniqueOrThrow({
            where: { id: f.target.id },
          })
        ).status,
      ).toBe('SUBMITTED');
    },
  );
  it.each(['membership', 'permission', 'allocation'] as const)(
    'HA-AUD-02: %s revocation after successful initial authorization fences the final write',
    async (lock) => {
      const f = await fixture();
      const response = await afterRead(
        f,
        async () => {
          if (lock === 'membership')
            await h.prisma.membership.update({
              where: { id: h.fixture.actors.admin.membershipId },
              data: { status: 'INACTIVE', endedAt: new Date() },
            });
          if (lock === 'allocation')
            await h.prisma.teacherSubjectAllocation.update({
              where: { id: h.fixture.allocations.teacher },
              data: { teacherUserId: h.fixture.actors.otherTeacher.userId },
            });
          if (lock === 'permission') {
            const permission = await h.prisma.permission.findUniqueOrThrow({
              where: { code: 'homework.assignments.manage' },
            });
            await h.prisma.rolePermission.deleteMany({
              where: {
                roleId: h.fixture.actors.admin.roleId,
                permissionId: permission.id,
              },
            });
          }
        },
        undefined,
        lock,
      );
      expect(response.status).toBe(404);
      expect((await stored(f)).points).toEqual([0, 0]);
    },
  );
  it('HA-AUD-02: finalization rejects an explicit rollup made stale by a concurrent answer review', async () => {
    const f = await fixture();
    const response = await afterRead(
      f,
      () => single(f, 0, { awardedPoints: 4 }).expect(200),
      { awardedMarks: 0 },
    );
    expect(response.status).toBe(422);
    expect((await stored(f)).submission.status).toBe('SUBMITTED');
    expect(Number((await stored(f)).submission.awardedMarks)).toBe(4);
  });
  it('finalization without explicit marks uses the latest concurrent answer rollup', async () => {
    const f = await fixture();
    const response = await afterRead(
      f,
      () => single(f, 0, { awardedPoints: 4 }).expect(200),
      {},
    );
    expect(response.status).toBe(200);
    expect((await stored(f)).submission.status).toBe('REVIEWED');
    expect(Number((await stored(f)).submission.awardedMarks)).toBe(4);
  });
  it.each(['admin', 'organization'] as const)(
    'HA-AUD-04: custom %s manage-only role reviews legacy and typed assignments',
    async (actor) => {
      const allowed = [
        'homework.assignments.manage',
        'homework.assignments.view',
        'homework.submissions.view',
      ];
      await h.prisma.rolePermission.deleteMany({
        where: {
          roleId: h.fixture.actors[actor].roleId,
          permission: { code: { notIn: allowed } },
        },
      });
      const original = repository.reviewSubmissionAnswers.bind(
        repository,
      ) as typeof repository.reviewSubmissionAnswers;
      jest
        .spyOn(repository, 'reviewSubmissionAnswers')
        .mockImplementation((input) => {
          expect(requireHomeworkScope().roleId).toBe(
            h.fixture.actors[actor].roleId,
          );
          return original(input);
        });
      for (const kind of ['legacy', 'typed'] as const) {
        const f = await fixture(kind);
        const grants = await h.prisma.rolePermission.findMany({
          where: { roleId: h.fixture.actors[actor].roleId },
          include: { permission: true },
        });
        expect(grants.map((g) => g.permission.code).sort()).toEqual(
          [...allowed].sort(),
        );
        expect(grants.map((g) => g.permission.code)).toContain(
          'homework.assignments.manage',
        );
        expect(grants.map((g) => g.permission.code)).not.toContain(
          'homework.submissions.review',
        );
        await single(f, 0, { awardedPoints: 4 }, actor).expect(200);
      }
    },
  );
  it('HA-AUD-04: allocated Teacher review-only authority works only through owned Teacher routes', async () => {
    const allowed = [
      'homework.submissions.review',
      'homework.assignments.view',
      'homework.submissions.view',
    ];
    await h.prisma.rolePermission.deleteMany({
      where: {
        roleId: h.fixture.actors.teacher.roleId,
        permission: { code: { notIn: allowed } },
      },
    });
    const original = repository.reviewSubmissionAnswers.bind(
      repository,
    ) as typeof repository.reviewSubmissionAnswers;
    jest
      .spyOn(repository, 'reviewSubmissionAnswers')
      .mockImplementation((input) => {
        expect(requireHomeworkScope().roleId).toBe(
          h.fixture.actors.teacher.roleId,
        );
        return original(input);
      });
    const grants = await h.prisma.rolePermission.findMany({
      where: { roleId: h.fixture.actors.teacher.roleId },
      include: { permission: true },
    });
    expect(grants.map((g) => g.permission.code).sort()).toEqual(
      [...allowed].sort(),
    );
    for (const kind of ['legacy', 'typed'] as const) {
      const f = await fixture(kind);
      await single(f, 0, { awardedPoints: 4 }, 'teacher', true).expect(200);
      await single(f, 0, { awardedPoints: 4 }, 'teacher').expect(403);
      await single(f, 0, { awardedPoints: 4 }, 'otherTeacher', true).expect(
        404,
      );
      await single(f, 0, { awardedPoints: 4 }, 'foreignTeacher', true).expect(
        404,
      );
    }
  });
  it.each(kinds)(
    'preserves explicit zero, explicit null, omission and whitespace comment normalization (%s)',
    async (kind) => {
      const f = await fixture(kind);
      await single(f, 0, { awardedPoints: 4, teacherComment: 'Keep' }).expect(
        200,
      );
      await single(f, 0, { teacherComment: 'Changed' }).expect(200);
      expect((await stored(f)).points[0]).toBe(4);
      await single(f, 0, { awardedPoints: 0 }).expect(200);
      expect((await stored(f)).comments[0]).toBe('Changed');
      await single(f, 0, { awardedPoints: null, teacherComment: null }).expect(
        200,
      );
      expect((await stored(f)).points[0]).toBeNull();
      expect((await stored(f)).comments[0]).toBeNull();
      await single(f, 0, { teacherComment: '  ' }).expect(200);
      expect((await stored(f)).comments[0]).toBeNull();
    },
  );
  it('preserves point ceilings, precision, duplicate identity and atomic bulk denial', async () => {
    const f = await fixture();
    await single(f, 0, { awardedPoints: 5.01 }).expect(422);
    await single(f, 0, { awardedPoints: -1 }).expect(400);
    await single(f, 0, { awardedPoints: 1.111 }).expect(400);
    await h
      .http()
      .put(f.core + '/answers/review')
      .set(h.headers('admin'))
      .send({
        answers: [
          { answerId: f.answers[0].id, awardedPoints: 4 },
          { answerId: f.answers[0].id, awardedPoints: 5 },
        ],
      })
      .expect(404);
    const foreign = await fixture();
    await h
      .http()
      .put(f.core + '/answers/review')
      .set(h.headers('admin'))
      .send({
        answers: [
          { answerId: f.answers[0].id, awardedPoints: 4 },
          { answerId: foreign.answers[0].id, awardedPoints: 5 },
        ],
      })
      .expect(404);
    expect((await stored(f)).points).toEqual([0, 0]);
  });
  it('checks required review completeness and preserves legacy zero-question manual marks', async () => {
    const f = await fixture();
    await h.prisma.homeworkQuestion.update({
      where: { id: f.graph.questions[0].id },
      data: { isRequired: true },
    });
    await finalize(f).expect(422);
    await single(f, 0, { awardedPoints: 4 }).expect(200);
    await finalize(f).expect(200);
    await finalize(f).expect(409);
    const zero = await fixture();
    await h.prisma.homeworkSubmissionAnswer.deleteMany({
      where: { homeworkSubmissionId: zero.submission.id },
    });
    await h.prisma.homeworkQuestion.deleteMany({
      where: { homeworkAssignmentId: zero.graph.homework.id },
    });
    await finalize(zero, { awardedMarks: 7 }).expect(200);
    expect(
      Number(
        (
          await h.prisma.homeworkSubmission.findUniqueOrThrow({
            where: { id: zero.submission.id },
          })
        ).awardedMarks,
      ),
    ).toBe(7);
  });
  it.each(['membership', 'permission', 'allocation'] as const)(
    'Teacher %s revocation fences an already-authorized HTTP review',
    async (lock) => {
      const f = await fixture('mixed');
      const response = await afterRead(
        f,
        async () => {
          if (lock === 'membership')
            await h.prisma.membership.update({
              where: { id: h.fixture.actors.teacher.membershipId },
              data: { status: 'INACTIVE', endedAt: new Date() },
            });
          if (lock === 'allocation')
            await h.prisma.teacherSubjectAllocation.update({
              where: { id: h.fixture.allocations.teacher },
              data: { teacherUserId: h.fixture.actors.otherTeacher.userId },
            });
          if (lock === 'permission') {
            const permission = await h.prisma.permission.findUniqueOrThrow({
              where: { code: 'homework.submissions.review' },
            });
            await h.prisma.rolePermission.deleteMany({
              where: {
                roleId: h.fixture.actors.teacher.roleId,
                permissionId: permission.id,
              },
            });
          }
        },
        undefined,
        lock,
        'teacher',
      );
      expect(response.status).toBe(404);
      expect((await stored(f)).points).toEqual([0, 0]);
    },
  );
  it.each(kinds)(
    'successful %s Single/Bulk/Finalize each emits one safe, committed-state Audit',
    async (kind) => {
      const f = await fixture(kind);
      await single(f, 0, {
        awardedPoints: 4,
        teacherComment: 'Private review comment',
      }).expect(200);
      await h
        .http()
        .put(f.core + '/answers/review')
        .set(h.headers('admin'))
        .send({
          answers: [
            { answerId: f.answers[0].id, awardedPoints: 5 },
            { answerId: f.answers[1].id, awardedPoints: 1 },
          ],
        })
        .expect(200);
      await finalize(f).expect(200);
      const audits = await h.prisma.auditLog.findMany({
        where: {
          schoolId: f.target.schoolId,
          action: {
            in: [
              'homework.answer_review.review',
              'homework.answer_review.bulk_review',
              'homework.submission.review',
            ],
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits.map((a) => a.action)).toEqual([
        'homework.answer_review.review',
        'homework.answer_review.bulk_review',
        'homework.submission.review',
      ]);
      expect(
        audits.map((a) => (a.after as Record<string, unknown>).awardedMarks),
      ).toEqual([4, 6, 6]);
      for (const audit of audits) {
        expect(audit.actorId).toBe(h.fixture.actors.admin.userId);
        expect(audit.outcome).toBe('SUCCESS');
        expect(JSON.stringify(audit.after)).not.toMatch(
          /Private student answer|Private review comment|answerKey|textAnswer|https?:|bucket|objectKey/,
        );
      }
      expect(Object.keys(audits[0].after as object).sort()).toEqual(
        [
          'answerIds',
          'awardedMarks',
          'homeworkAssignmentId',
          'homeworkSubmissionId',
          'homeworkTargetId',
        ].sort(),
      );
      expect(Number((await stored(f)).submission.awardedMarks)).toBe(6);
      expect(
        await h.prisma.gradeItem.count({
          where: { schoolId: f.target.schoolId },
        }),
      ).toBe(0);
    },
  );
  it('a real answer-update failure rolls back earlier bulk writes and leaves no success Audit', async () => {
    const f = await fixture();
    await h.prisma
      .$executeRaw`ALTER TABLE homework_submission_answers ADD CONSTRAINT review_integrity_answer_fault CHECK (awarded_points <> 5) NOT VALID`;
    await h
      .http()
      .put(f.core + '/answers/review')
      .set(h.headers('admin'))
      .send({
        answers: [
          { answerId: f.answers[0].id, awardedPoints: 4 },
          { answerId: f.answers[1].id, awardedPoints: 5 },
        ],
      })
      .expect(500);
    expect((await stored(f)).points).toEqual([0, 0]);
    expect(Number((await stored(f)).submission.awardedMarks)).toBe(0);
    expect(
      await h.prisma.auditLog.count({
        where: {
          schoolId: f.target.schoolId,
          action: 'homework.answer_review.bulk_review',
        },
      }),
    ).toBe(0);
  });
  it('exact swapped Answer/Question pairs fail atomically at the real repository boundary', async () => {
    const f = await fixture();
    const audit = jest.fn().mockResolvedValue(undefined);
    await expect(
      h.fixture.asMediaActor('admin', () =>
        repository.reviewSubmissionAnswers({
          schoolId: f.target.schoolId,
          homeworkAssignmentId: f.graph.homework.id,
          submissionId: f.submission.id,
          homeworkTargetId: f.target.id,
          studentId: f.target.studentId,
          enrollmentId: f.target.enrollmentId,
          awardedMarks: 9,
          reviews: f.answers.map((answer, index) => ({
            answerId: answer.id,
            homeworkQuestionId: f.answers[1 - index].homeworkQuestionId,
            awardedPoints: 4,
            teacherComment: null,
            reviewedAt: new Date(),
            reviewedByUserId: h.fixture.actors.admin.userId,
          })),
          audit,
        }),
      ),
    ).rejects.toMatchObject({ code: 'homework.answer_review.invalid_scope' });
    expect(audit).not.toHaveBeenCalled();
    expect((await stored(f)).points).toEqual([0, 0]);
    expect(Number((await stored(f)).submission.awardedMarks)).toBe(0);
  });
  it('multipart rollups count only canonical child answers and never group points', async () => {
    const f = await fixture('mixed');
    const group = await h.prisma.homeworkQuestionGroup.create({
      data: {
        schoolId: f.target.schoolId,
        homeworkAssignmentId: f.graph.homework.id,
        title: 'Non-answerable shared context',
        createdByUserId: h.fixture.actors.teacher.userId,
      },
    });
    await h.prisma.homeworkQuestion.updateMany({
      where: { homeworkAssignmentId: f.graph.homework.id },
      data: { groupId: group.id },
    });
    await h
      .http()
      .put(f.core + '/answers/review')
      .set(h.headers('admin'))
      .send({
        answers: [
          { answerId: f.answers[0].id, awardedPoints: 4 },
          { answerId: f.answers[1].id, awardedPoints: 5 },
        ],
      })
      .expect(200);
    await finalize(f).expect(200);
    expect(Number((await stored(f)).submission.awardedMarks)).toBe(9);
    expect(
      await h.prisma.homeworkSubmissionAnswer.count({
        where: { homeworkSubmissionId: f.submission.id },
      }),
    ).toBe(2);
  });
  it('zero affected answer rows fail closed without publishing an aggregate or success Audit', async () => {
    const f = await fixture();
    await h.prisma
      .$executeRaw`CREATE FUNCTION public.review_integrity_skip_update() RETURNS trigger
      LANGUAGE plpgsql SET search_path=pg_catalog AS $fault$ BEGIN RETURN NULL; END $fault$`;
    await h.prisma
      .$executeRaw`CREATE TRIGGER review_integrity_skip_update BEFORE UPDATE ON homework_submission_answers
      FOR EACH ROW EXECUTE FUNCTION public.review_integrity_skip_update()`;
    await single(f, 0, { awardedPoints: 4 }).expect(404);
    expect((await stored(f)).points).toEqual([0, 0]);
    expect(Number((await stored(f)).submission.awardedMarks)).toBe(0);
    expect(
      await h.prisma.auditLog.count({
        where: {
          schoolId: f.target.schoolId,
          action: 'homework.answer_review.review',
        },
      }),
    ).toBe(0);
  });
  it('denies foreign School/Organization resources without changing their answer state', async () => {
    const foreign = await fixture('legacy', 'foreignTeacher');
    await single(foreign, 0, { awardedPoints: 4 }).expect(404);
    await single(foreign, 0, { awardedPoints: 4 }, 'organization').expect(404);
    const own = await fixture();
    // A School user's scope is pinned to its membership; an arbitrary header
    // does not change it or grant access to the foreign resource.
    await h
      .http()
      .patch(foreign.core + `/answers/${foreign.answers[0].id}/review`)
      .set({
        ...h.headers('admin'),
        'X-School-Id': h.fixture.schools[1].schoolId,
      })
      .send({ awardedPoints: 4 })
      .expect(404);
    expect((await stored(foreign)).points).toEqual([0, 0]);
    expect((await stored(own)).points).toEqual([0, 0]);
  });
  it('zero-question ungraded submissions retain null manual marks and reject supplied marks', async () => {
    const f = await fixture();
    await h.prisma.homeworkSubmissionAnswer.deleteMany({
      where: { homeworkSubmissionId: f.submission.id },
    });
    await h.prisma.homeworkQuestion.deleteMany({
      where: { homeworkAssignmentId: f.graph.homework.id },
    });
    await h.prisma.homeworkAssignment.update({
      where: { id: f.graph.homework.id },
      data: { isGraded: false },
    });
    await finalize(f, { awardedMarks: 1 }).expect(422);
    await finalize(f).expect(200);
    const current = await h.prisma.homeworkSubmission.findUniqueOrThrow({
      where: { id: f.submission.id },
    });
    expect(current.status).toBe('REVIEWED');
    expect(current.awardedMarks).toBeNull();
  });
  it.each(['finalize', 'cancel'] as const)(
    'a live %s transaction waits for the complete Review/Audit transaction without deadlock',
    async (operation) => {
      const f = await fixture('mixed');
      await h.prisma
        .$executeRaw`CREATE FUNCTION public.review_integrity_audit_barrier() RETURNS trigger
        LANGUAGE plpgsql SET search_path=pg_catalog AS $fault$
        BEGIN
          IF NEW.action='homework.answer_review.review' THEN
            PERFORM pg_advisory_xact_lock(hashtextextended('review-integrity-audit-barrier',0));
          END IF;
          RETURN NEW;
        END $fault$`;
      await h.prisma
        .$executeRaw`CREATE TRIGGER review_integrity_audit_barrier BEFORE INSERT ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION public.review_integrity_audit_barrier()`;
      const locked = deferred<number>(),
        release = deferred();
      const holder = h.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('review-integrity-audit-barrier',0)) IS NULL AS locked`;
          const [row] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          locked.resolve(row.pid);
          await release.promise;
        },
        { timeout: 15000 },
      );
      const auditHolder = await bounded(locked.promise);
      const first = Promise.resolve(single(f, 0, { awardedPoints: 4 }));
      let second: Promise<Response> | undefined;
      try {
        const dependencies = await waiters(
          auditHolder,
          1,
          'real Review Audit insert barrier',
        );
        const reviewer = dependencies.find((row) =>
          row.blockers.includes(auditHolder),
        );
        if (!reviewer) throw new Error('Review Audit insertion waiter absent');
        expect(
          await h.prisma.auditLog.count({
            where: {
              schoolId: f.target.schoolId,
              action: 'homework.answer_review.review',
            },
          }),
        ).toBe(0);
        second = Promise.resolve(
          operation === 'finalize'
            ? finalize(f)
            : h
                .http()
                .post(
                  `/api/v1/homework/assignments/${f.graph.homework.id}/cancel`,
                )
                .set(h.headers('admin'))
                .send({}),
        );
        await waiters(
          reviewer.pid,
          1,
          'Review/Audit transaction before ' + operation,
        );
        release.resolve();
        await holder;
        expect(
          (await Promise.all([first, second])).map((r) => r.status),
        ).toEqual([200, 200]);
        const current = await stored(f);
        expect(current.points).toEqual([4, 0]);
        expect(Number(current.submission.awardedMarks)).toBe(4);
        if (operation === 'finalize')
          expect(current.submission.status).toBe('REVIEWED');
        else
          expect(
            (
              await h.prisma.homeworkAssignment.findUniqueOrThrow({
                where: { id: f.graph.homework.id },
              })
            ).status,
          ).toBe('CANCELLED');
      } finally {
        release.resolve();
        await Promise.allSettled([holder, first, ...(second ? [second] : [])]);
      }
    },
  );
});
