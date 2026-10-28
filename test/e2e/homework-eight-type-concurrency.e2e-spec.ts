import type { Response } from 'supertest';
import {
  HomeworkQuestionAssetsHttp,
  st06Json,
} from '../fixtures/homework-question-assets.http';
import { createHomeworkEightTypes } from '../fixtures/homework-eight-type.fixture';
import { HomeworkRichContentService } from '../../src/modules/homework/application/homework-rich-content.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function barrier<T>(promise: Promise<T>, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Barrier deadline: ' + name)),
          5000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
describe('ST09-B/C deterministic concurrent PostgreSQL runtime writers', () => {
  jest.setTimeout(180000);
  const h = new HomeworkQuestionAssetsHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(async () => {
    jest.restoreAllMocks();
    const where = {
      schoolId: { in: h.fixture.schools.map((school) => school.schoolId) },
    };
    await h.prisma.homeworkSubmissionAnswer.deleteMany({ where });
    await h.prisma.homeworkSubmission.deleteMany({ where });
    await h.disposeCase();
  });
  afterAll(() => h.close());
  async function blocked(scenario: string, waiter: number, holder: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] = await h.prisma.$queryRaw<
        Array<{ blockers: number[] }>
      >`SELECT pg_blocking_pids(${waiter}::int) AS blockers`;
      if (row.blockers.includes(holder)) {
        console.info(
          'ST09BC_LOCK_PROOF=' +
            scenario +
            ': PostgreSQL confirmed the second live transaction waits on the first',
        );
        return;
      }
      // Poll a measured database condition; elapsed time never decides correctness.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(
      'Expected PostgreSQL lock dependency was not observed: ' + scenario,
    );
  }
  async function studentRace(
    scenario: string,
    firstRequest: () => PromiseLike<Response>,
    secondRequest: () => PromiseLike<Response>,
  ) {
    const rich = h.app.get<HomeworkRichContentService>(
      HomeworkRichContentService,
    );
    const media = rich.assertStudentMediaSource.bind(
      rich,
    ) as typeof rich.assertStudentMediaSource;
    const authority = rich.assertStudentWrite.bind(
      rich,
    ) as typeof rich.assertStudentWrite;
    const locked = deferred<number>(),
      secondPid = deferred<number>(),
      release = deferred<void>();
    let held = false,
      calls = 0;
    jest
      .spyOn(rich, 'assertStudentWrite')
      .mockImplementation(async (...args) => {
        const order = ++calls;
        const actor = await authority(...args);
        if (order === 2) {
          const [row] = await args[0].$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          secondPid.resolve(row.pid);
        }
        return actor;
      });
    jest
      .spyOn(rich, 'assertStudentMediaSource')
      .mockImplementation(async (...args) => {
        await media(...args);
        if (!held) {
          held = true;
          const [row] = await args[0].$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          locked.resolve(row.pid);
          await release.promise;
        }
      });
    const first = Promise.resolve(firstRequest());
    let second: Promise<Response> | undefined;
    try {
      const holder = await barrier(locked.promise, 'first Student lock');
      second = Promise.resolve(secondRequest());
      await blocked(
        scenario,
        await barrier(secondPid.promise, 'second Student transaction'),
        holder,
      );
      release.resolve();
      return await Promise.all([first, second]);
    } finally {
      release.resolve();
      await Promise.allSettled([first, ...(second ? [second] : [])]);
    }
  }
  async function published(withAnswers = false) {
    const f = await createHomeworkEightTypes(h);
    await h.publish(f.graph);
    if (withAnswers)
      await h
        .http()
        .put(f.student + '/submission/answers')
        .set(h.headers('student'))
        .send({ answers: f.answers })
        .expect(200);
    return f;
  }
  async function authorRace(
    scenario: string,
    firstRequest: () => PromiseLike<Response>,
    secondRequest: () => PromiseLike<Response>,
  ) {
    const rich = h.app.get<HomeworkRichContentService>(
      HomeworkRichContentService,
    );
    const original = rich.assertWrite.bind(rich) as typeof rich.assertWrite;
    const locked = deferred<number>(),
      release = deferred<void>();
    let calls = 0;
    jest.spyOn(rich, 'assertWrite').mockImplementation(async (...args) => {
      const order = ++calls;
      await original(...args);
      if (order === 1) {
        const [row] = await args[0].$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        locked.resolve(row.pid);
        await release.promise;
      }
    });
    const first = Promise.resolve(firstRequest());
    let second: Promise<Response> | undefined;
    try {
      const holder = await barrier(locked.promise, 'author parent lock');
      second = Promise.resolve(secondRequest());
      // A non-Rich deletion first enters the existing discovery transaction.
      // Observe its actual assignment wait, which precedes protected escalation.
      const deadline = Date.now() + 5000;
      let waiter: number | undefined;
      while (Date.now() < deadline) {
        const rows = await h.prisma.$queryRaw<
          Array<{ pid: number; query: string }>
        >`
          SELECT pid, query FROM pg_stat_activity WHERE datname=current_database()
            AND pid<>pg_backend_pid() AND ${holder}::int=ANY(pg_blocking_pids(pid))`;
        if (rows.length === 1) {
          expect(rows[0].query).toMatch(/homework_assignments|schools/);
          waiter = rows[0].pid;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      if (!waiter)
        throw new Error('Author transaction did not queue: ' + scenario);
      await blocked(scenario, waiter, holder);
      release.resolve();
      return await Promise.all([first, second]);
    } finally {
      release.resolve();
      await Promise.allSettled([first, ...(second ? [second] : [])]);
    }
  }
  it.each([
    'delete-before-publish',
    'key-before-publish',
    'publish-before-delete',
    'publish-before-key',
    'two-publishers',
  ] as const)(
    'serializes %s with current question/key/target rows',
    async (scenario) => {
      const f = await createHomeworkEightTypes(h);
      const questionId = f.questions.get('FILL_IN_BLANK')!.questionId;
      const questionPath = f.teacher + '/questions/' + questionId;
      const before = await h.prisma.homeworkQuestion.findUniqueOrThrow({
        where: { id: questionId },
      });
      const replacement = {
        keyVersion: 1,
        kind: 'fill',
        blanks: [
          { blankId: 'b1', acceptedAnswers: ['Replacement private one'] },
          { blankId: 'b2', acceptedAnswers: ['Replacement private two'] },
        ],
      };
      const publish = () =>
        h
          .http()
          .post(f.teacher + '/publish')
          .set(h.headers())
          .send({});
      const mutate = () =>
        scenario.includes('delete')
          ? h.http().delete(questionPath).set(h.headers())
          : h
              .http()
              .patch(questionPath)
              .set(h.headers())
              .send({ answerKey: { state: 'value', value: replacement } });
      const firstAuthor = scenario.endsWith('before-publish');
      const [first, second] = await authorRace(
        scenario,
        firstAuthor ? mutate : publish,
        scenario === 'two-publishers' || firstAuthor ? publish : mutate,
      );
      expect(first.status).toBe(
        firstAuthor && scenario.includes('delete') ? 204 : 200,
      );
      expect(second.status).toBe(firstAuthor ? 200 : 409);
      const after = await h.prisma.homeworkQuestion.findUniqueOrThrow({
        where: { id: questionId },
      });
      if (!firstAuthor) expect(after).toEqual(before);
      else if (scenario.includes('delete'))
        expect(after.deletedAt).not.toBeNull();
      else expect(after.answerKey).toEqual(replacement);
      const assignment = await h.prisma.homeworkAssignment.findUniqueOrThrow({
        where: { id: f.graph.homework.id },
        include: { targets: true },
      });
      expect(assignment.status).toBe('PUBLISHED');
      expect(assignment.targets).toHaveLength(1);
      expect(assignment.targets[0].studentId).toBe(
        h.fixture.children[0].studentId,
      );
      expect(
        await h.prisma.homeworkSubmission.count({
          where: { homeworkAssignmentId: assignment.id },
        }),
      ).toBe(0);
    },
  );
  it.each(['bulk-before-patch', 'clear-before-save'] as const)(
    'serializes %s without duplicate rows or lost unrelated answers',
    async (scenario) => {
      const f = await published(true),
        questionId = f.questions.get('FILL_IN_BLANK')!.questionId;
      const before = await h.prisma.homeworkSubmissionAnswer.findMany({
        where: {
          homeworkAssignmentId: f.graph.homework.id,
          homeworkQuestionId: { not: questionId },
        },
        orderBy: { id: 'asc' },
      });
      const [first, second] = await studentRace(
        scenario,
        () =>
          scenario === 'bulk-before-patch'
            ? h
                .http()
                .put(f.student + '/submission/answers')
                .set(h.headers('student'))
                .send({
                  answers: [
                    f.answers.find((a) => a.questionId === questionId)!,
                  ],
                })
            : h
                .http()
                .patch(f.student + '/submission/answers/' + questionId)
                .set(h.headers('student'))
                .send({ clearAnswer: true }),
        () =>
          h
            .http()
            .patch(f.student + '/submission/answers/' + questionId)
            .set(h.headers('student'))
            .send({
              answerJson: {
                blanks: [{ blankId: 'b1', text: 'Current saved value' }],
              },
            }),
      );
      expect([first.status, second.status]).toEqual([200, 200]);
      const rows = await h.prisma.homeworkSubmissionAnswer.findMany({
        where: { homeworkQuestionId: questionId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].answerJson).toEqual({
        blanks: [{ blankId: 'b1', text: 'Current saved value' }],
      });
      expect(
        await h.prisma.homeworkSubmissionAnswer.findMany({
          where: {
            homeworkAssignmentId: f.graph.homework.id,
            homeworkQuestionId: { not: questionId },
          },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(before);
    },
  );
  it('rejects a concurrent definition change while a published Student save is in flight', async () => {
    const f = await published(),
      questionId = f.questions.get('FILL_IN_BLANK')!.questionId;
    const before = await h.prisma.homeworkQuestion.findUniqueOrThrow({
      where: { id: questionId },
    });
    const rich = h.app.get<HomeworkRichContentService>(
      HomeworkRichContentService,
    );
    const original = rich.assertStudentMediaSource.bind(
      rich,
    ) as typeof rich.assertStudentMediaSource;
    const locked = deferred<void>(),
      release = deferred<void>();
    jest
      .spyOn(rich, 'assertStudentMediaSource')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        locked.resolve();
        await release.promise;
      });
    const save = Promise.resolve(
      h
        .http()
        .patch(f.student + '/submission/answers/' + questionId)
        .set(h.headers('student'))
        .send({
          answerJson: {
            blanks: [{ blankId: 'b1', text: 'Unchanged definition' }],
          },
        }),
    );
    try {
      await barrier(locked.promise, 'published Student writer');
      await h
        .http()
        .patch(f.teacher + '/questions/' + questionId)
        .set(h.headers())
        .send({
          metadata: { definitionVersion: 1, kind: 'fill' },
          answerKey: { state: 'clear' },
        })
        .expect(409);
      release.resolve();
      expect((await save).status).toBe(200);
      expect(
        await h.prisma.homeworkQuestion.findUniqueOrThrow({
          where: { id: questionId },
        }),
      ).toEqual(before);
      expect(
        (
          await h.prisma.homeworkSubmissionAnswer.findFirstOrThrow({
            where: { homeworkQuestionId: questionId },
          })
        ).answerJson,
      ).toEqual({ blanks: [{ blankId: 'b1', text: 'Unchanged definition' }] });
    } finally {
      release.resolve();
      await save;
    }
  });
  it('serializes two first Student saves without duplicate submissions or answers', async () => {
    const f = await published(),
      questionId = f.questions.get('FILL_IN_BLANK')!.questionId;
    const patch = (text: string) =>
      h
        .http()
        .patch(f.student + '/submission/answers/' + questionId)
        .set(h.headers('student'))
        .send({ answerJson: { blanks: [{ blankId: 'b1', text }] } });
    const [first, second] = await studentRace(
      'two-student-saves',
      () => patch('First'),
      () => patch('Second'),
    );
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(
      await h.prisma.homeworkSubmission.count({
        where: { homeworkAssignmentId: f.graph.homework.id },
      }),
    ).toBe(1);
    const answers = await h.prisma.homeworkSubmissionAnswer.findMany({
      where: { homeworkQuestionId: questionId },
    });
    expect(answers).toHaveLength(1);
    expect(answers[0].answerJson).toEqual({
      blanks: [{ blankId: 'b1', text: 'Second' }],
    });
  });
  it('makes a final submission observe an earlier complete atomic bulk save', async () => {
    const f = await published();
    const [save, submit] = await studentRace(
      'bulk-before-submit',
      () =>
        h
          .http()
          .put(f.student + '/submission/answers')
          .set(h.headers('student'))
          .send({ answers: f.answers }),
      () =>
        h
          .http()
          .post(f.student + '/submit')
          .set(h.headers('student'))
          .send({}),
    );
    expect([save.status, submit.status]).toEqual([200, 200]);
    const result = await h.prisma.homeworkSubmission.findFirstOrThrow({
      where: { homeworkAssignmentId: f.graph.homework.id },
      include: { answers: true, homeworkTarget: true },
    });
    expect(result.status).toBe('SUBMITTED');
    expect(result.homeworkTarget.status).toBe('SUBMITTED');
    expect(result.answers).toHaveLength(8);
    expect(result.answers.every((answer) => !answer.isDraft)).toBe(true);
  });
  it('rejects a queued save after a terminal submit without changing any answers', async () => {
    const f = await published(true),
      questionId = f.questions.get('FILL_IN_BLANK')!.questionId;
    const before = await h.prisma.homeworkSubmissionAnswer.findMany({
      where: { homeworkAssignmentId: f.graph.homework.id },
      orderBy: { id: 'asc' },
    });
    const [submit, save] = await studentRace(
      'submit-before-save',
      () =>
        h
          .http()
          .post(f.student + '/submission/submit')
          .set(h.headers('student'))
          .send({}),
      () =>
        h
          .http()
          .patch(f.student + '/submission/answers/' + questionId)
          .set(h.headers('student'))
          .send({
            answerJson: {
              blanks: [{ blankId: 'b1', text: 'Forbidden late save' }],
            },
          }),
    );
    expect([submit.status, save.status]).toEqual([200, 409]);
    const after = await h.prisma.homeworkSubmissionAnswer.findMany({
      where: { homeworkAssignmentId: f.graph.homework.id },
      orderBy: { id: 'asc' },
    });
    const stableAnswer = (answer: (typeof before)[number]) => {
      const copy: Partial<typeof answer> = { ...answer };
      delete copy.isDraft;
      delete copy.updatedAt;
      return copy;
    };
    expect(after.map(stableAnswer)).toEqual(before.map(stableAnswer));
  });
  it('makes a queued final submit reject a committed required-answer clear atomically', async () => {
    const f = await published(true),
      questionId = f.questions.get('FILL_IN_BLANK')!.questionId;
    const before = await h.prisma.homeworkSubmissionAnswer.findMany({
      where: {
        homeworkAssignmentId: f.graph.homework.id,
        homeworkQuestionId: { not: questionId },
      },
      orderBy: { id: 'asc' },
    });
    const [clear, submit] = await studentRace(
      'clear-before-submit',
      () =>
        h
          .http()
          .patch(f.student + '/submission/answers/' + questionId)
          .set(h.headers('student'))
          .send({ clearAnswer: true }),
      () =>
        h
          .http()
          .post(f.student + '/submit')
          .set(h.headers('student'))
          .send({}),
    );
    expect([clear.status, submit.status]).toEqual([200, 422]);
    const submission = await h.prisma.homeworkSubmission.findFirstOrThrow({
      where: { homeworkAssignmentId: f.graph.homework.id },
      include: { homeworkTarget: true },
    });
    expect(submission.status).toBe('DRAFT');
    expect(submission.homeworkTarget.status).not.toBe('SUBMITTED');
    expect(
      await h.prisma.homeworkSubmissionAnswer.findMany({
        where: {
          homeworkAssignmentId: f.graph.homework.id,
          homeworkQuestionId: { not: questionId },
        },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(before);
    const [cleared] = await h.prisma.$queryRaw<
      Array<{ absent: boolean }>
    >`SELECT answer_json IS NULL AS absent FROM homework_submission_answers WHERE homework_question_id=${questionId}::uuid`;
    expect(cleared.absent).toBe(true);
  });
  it('commits exactly one of two concurrent final-submit aliases and one submission audit', async () => {
    const f = await published(true);
    const [first, second] = await studentRace(
      'duplicate-final-submit',
      () =>
        h
          .http()
          .post(f.student + '/submit')
          .set(h.headers('student'))
          .send({}),
      () =>
        h
          .http()
          .post(f.student + '/submission/submit')
          .set(h.headers('student'))
          .send({}),
    );
    expect([first.status, second.status]).toEqual([200, 409]);
    const submission = await h.prisma.homeworkSubmission.findFirstOrThrow({
      where: { homeworkAssignmentId: f.graph.homework.id },
    });
    expect(submission.status).toBe('SUBMITTED');
    expect(
      await h.prisma.auditLog.count({
        where: {
          resourceId: submission.id,
          action: 'homework.submission.submit',
        },
      }),
    ).toBe(1);
  });
  it.each(['enrollment', 'target'] as const)(
    'denies a Student save after concurrent %s revocation and leaves no first draft',
    async (kind) => {
      const f = await published(),
        questionId = f.questions.get('FILL_IN_BLANK')!.questionId;
      const locked = deferred<number>(),
        writerPid = deferred<number>(),
        release = deferred<void>();
      const rich = h.app.get<HomeworkRichContentService>(
        HomeworkRichContentService,
      );
      const original = rich.assertStudentWrite.bind(
        rich,
      ) as typeof rich.assertStudentWrite;
      jest
        .spyOn(rich, 'assertStudentWrite')
        .mockImplementation(async (...args) => {
          const actor = await original(...args);
          const [row] = await args[0].$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          writerPid.resolve(row.pid);
          return actor;
        });
      const revoke = h.prisma.$transaction(
        async (tx) => {
          if (kind === 'enrollment')
            await tx.enrollment.update({
              where: { id: h.fixture.children[0].enrollmentId },
              data: { endedAt: new Date() },
            });
          else
            await tx.homeworkTarget.deleteMany({
              where: { homeworkAssignmentId: f.graph.homework.id },
            });
          const [row] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          locked.resolve(row.pid);
          await release.promise;
        },
        { timeout: 15000 },
      );
      let write: Promise<Response> | undefined;
      try {
        const holder = await barrier(locked.promise, 'revocation lock');
        write = h
          .http()
          .patch(f.student + '/submission/answers/' + questionId)
          .set(h.headers('student'))
          .send({ answerJson: { blanks: [{ blankId: 'b1', text: 'Denied' }] } })
          .then((response) => response);
        await blocked(
          kind + '-revocation',
          await barrier(writerPid.promise, 'revoked Student transaction'),
          holder,
        );
        release.resolve();
        await revoke;
        expect((await write).status).toBe(404);
        expect(
          await h.prisma.homeworkSubmission.count({
            where: { homeworkAssignmentId: f.graph.homework.id },
          }),
        ).toBe(0);
        expect(
          await h.prisma.homeworkSubmissionAnswer.count({
            where: { homeworkAssignmentId: f.graph.homework.id },
          }),
        ).toBe(0);
      } finally {
        release.resolve();
        await Promise.allSettled([revoke, ...(write ? [write] : [])]);
      }
    },
  );
  it('revalidates a Teacher allocation after concurrent reassignment before author mutation', async () => {
    const f = await createHomeworkEightTypes(h),
      questionId = f.questions.get('FILL_IN_BLANK')!.questionId;
    const before = await h.prisma.homeworkQuestion.findUniqueOrThrow({
      where: { id: questionId },
    });
    const locked = deferred<number>(),
      writerPid = deferred<number>(),
      release = deferred<void>();
    const rich = h.app.get<HomeworkRichContentService>(
      HomeworkRichContentService,
    );
    const original = rich.assertWrite.bind(rich) as typeof rich.assertWrite;
    jest.spyOn(rich, 'assertWrite').mockImplementation(async (...args) => {
      const [row] = await args[0].$queryRaw<
        Array<{ pid: number }>
      >`SELECT pg_backend_pid() AS pid`;
      writerPid.resolve(row.pid);
      return original(...args);
    });
    const revoke = h.prisma.$transaction(
      async (tx) => {
        await tx.teacherSubjectAllocation.update({
          where: { id: h.fixture.allocations.teacher },
          data: { teacherUserId: h.fixture.actors.otherTeacher.userId },
        });
        const [row] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        locked.resolve(row.pid);
        await release.promise;
      },
      { timeout: 15000 },
    );
    let write: Promise<Response> | undefined;
    try {
      const holder = await barrier(
        locked.promise,
        'allocation revocation lock',
      );
      write = h
        .http()
        .patch(f.teacher + '/questions/' + questionId)
        .set(h.headers())
        .send({ prompt: 'Denied concurrent author' })
        .then((response) => response);
      await blocked(
        'teacher-allocation-revocation',
        await barrier(writerPid.promise, 'revoked Teacher transaction'),
        holder,
      );
      release.resolve();
      await revoke;
      expect((await write).status).toBe(404);
      expect(
        await h.prisma.homeworkQuestion.findUniqueOrThrow({
          where: { id: questionId },
        }),
      ).toEqual(before);
    } finally {
      release.resolve();
      await Promise.allSettled([revoke, ...(write ? [write] : [])]);
    }
  });
  it('rejects MEDIA publication after an earlier read when its binding is concurrently removed', async () => {
    const f = await createHomeworkEightTypes(h);
    const before = await h.prisma.homeworkAssignment.findUniqueOrThrow({
      where: { id: f.graph.homework.id },
      include: { targets: { orderBy: { id: 'asc' } } },
    });
    const locked = deferred<number>(),
      publisherPid = deferred<number>(),
      release = deferred<void>();
    const rich = h.app.get<HomeworkRichContentService>(
      HomeworkRichContentService,
    );
    const original = rich.assertWrite.bind(rich) as typeof rich.assertWrite;
    jest.spyOn(rich, 'assertWrite').mockImplementation(async (...args) => {
      await original(...args);
      const [row] = await args[0].$queryRaw<
        Array<{ pid: number }>
      >`SELECT pg_backend_pid() AS pid`;
      publisherPid.resolve(row.pid);
    });
    const remove = h.prisma.$transaction(
      async (tx) => {
        await tx.homeworkQuestionAsset.update({
          where: { id: f.mediaAssetId },
          data: { deletedAt: new Date() },
        });
        const [row] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        locked.resolve(row.pid);
        await release.promise;
      },
      { timeout: 15000 },
    );
    let publish: Promise<Response> | undefined;
    try {
      const holder = await barrier(locked.promise, 'MEDIA removal lock');
      publish = h
        .http()
        .post(f.teacher + '/publish')
        .set(h.headers())
        .send({})
        .then((response) => response);
      await blocked(
        'media-binding-removal',
        await barrier(publisherPid.promise, 'MEDIA publisher transaction'),
        holder,
      );
      release.resolve();
      await remove;
      expect((await publish).status).toBe(404);
      expect(
        await h.prisma.homeworkAssignment.findUniqueOrThrow({
          where: { id: f.graph.homework.id },
          include: { targets: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(before);
    } finally {
      release.resolve();
      await Promise.allSettled([remove, ...(publish ? [publish] : [])]);
    }
  });
  it.each(['distinct-answers', 'same-answer-comment'] as const)(
    'serializes two manual reviewers (%s) and recomputes the committed rollup',
    async (mode) => {
      const f = await published(true);
      await h
        .http()
        .post(f.student + '/submit')
        .set(h.headers('student'))
        .send({})
        .expect(200);
      const submission = await h.prisma.homeworkSubmission.findFirstOrThrow({
        where: { homeworkAssignmentId: f.graph.homework.id },
        include: { answers: { orderBy: { id: 'asc' } } },
      });
      const rich = h.app.get<HomeworkRichContentService>(
        HomeworkRichContentService,
      );
      const original = rich.assertReviewWrite.bind(
        rich,
      ) as typeof rich.assertReviewWrite;
      const locked = deferred<number>(),
        secondPid = deferred<number>(),
        release = deferred<void>();
      let count = 0;
      jest
        .spyOn(rich, 'assertReviewWrite')
        .mockImplementation(async (...args) => {
          const order = ++count;
          const [row] = await args[0].$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          if (order === 2) secondPid.resolve(row.pid);
          await original(...args);
          if (order === 1) {
            locked.resolve(row.pid);
            await release.promise;
          }
        });
      const review = (index: number, commentOnly = false) =>
        h
          .http()
          .patch(
            f.teacher +
              '/submissions/' +
              submission.id +
              '/answers/' +
              submission.answers[index].id +
              '/review',
          )
          .set(h.headers())
          .send({
            ...(commentOnly ? {} : { awardedPoints: 1 }),
            teacherComment: commentOnly
              ? 'Later comment preserves points'
              : 'Manual concurrent review',
          })
          .then((response) => response);
      const first = review(0);
      let second: Promise<Response> | undefined;
      try {
        const holder = await barrier(locked.promise, 'first reviewer lock');
        second = mode === 'distinct-answers' ? review(1) : review(0, true);
        await blocked(
          'two-manual-reviewers-' + mode,
          await barrier(secondPid.promise, 'second reviewer transaction'),
          holder,
        );
        release.resolve();
        expect((await first).status).toBe(200);
        expect((await second).status).toBe(200);
        const final = await h.prisma.homeworkSubmission.findUniqueOrThrow({
          where: { id: submission.id },
          include: { answers: true },
        });
        const marked = mode === 'distinct-answers' ? 2 : 1;
        expect(Number(final.awardedMarks)).toBe(marked);
        expect(
          final.answers.filter((answer) => Number(answer.awardedPoints) === 1),
        ).toHaveLength(marked);
        if (mode === 'same-answer-comment')
          expect(
            final.answers.find(
              (answer) => answer.id === submission.answers[0].id,
            )?.teacherComment,
          ).toBe('Later comment preserves points');
        expect(final.status).toBe('SUBMITTED');
        expect(
          JSON.stringify(
            st06Json<object>(
              await h
                .http()
                .get(f.teacher + '/submissions/' + submission.id + '/answers')
                .set(h.headers())
                .expect(200),
            ),
          ),
        ).not.toContain('answerKey');
      } finally {
        release.resolve();
        await Promise.allSettled([first, ...(second ? [second] : [])]);
      }
    },
  );
});
