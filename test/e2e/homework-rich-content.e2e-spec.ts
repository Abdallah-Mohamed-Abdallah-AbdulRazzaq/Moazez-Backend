import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import {
  HomeworkQuestionAssetsHttp,
  st06Json,
  type HttpHomeworkGraph,
} from '../fixtures/homework-question-assets.http';
import type {
  HomeworkQuestionDetailResponseDto,
  HomeworkQuestionsListResponseDto,
} from '../../src/modules/homework/dto/homework-question-response.dto';
import type {
  StudentHomeworkSubmissionResponseDto,
  StudentHomeworkResponseDto,
} from '../../src/modules/student-app/homeworks/dto/student-homeworks.dto';
import type {
  HomeworkAnswersListResponseDto,
  HomeworkAnswerDetailResponseDto,
} from '../../src/modules/homework/dto/homework-answer-response.dto';

const doc = (text: string) => ({
  language: 'und',
  direction: 'auto',
  blocks: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
});
const questionRich = (text = 'Rich question') => ({
  contentVersion: 1,
  kind: 'question',
  stem: doc(text),
});
const optionRich = (text = 'Choice A') => ({
  contentVersion: 1,
  kind: 'option',
  label: doc(text),
});
const assetRich = (assetId: string) => ({
  ...questionRich(),
  stem: {
    ...doc(''),
    blocks: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'assetReference',
            assetId,
            kind: 'document',
            altText: 'Reference',
            caption: 'Readable caption',
          },
        ],
      },
    ],
  },
});

describe('ST08-C actual Homework HTTP, Student/Teacher review and private media', () => {
  jest.setTimeout(180000);
  const h = new HomeworkQuestionAssetsHttp();
  const teacherBase = (g: HttpHomeworkGraph) =>
    `/api/v1/teacher/homeworks/classes/${h.fixture.allocations.teacher}/assignments/${g.homework.id}`;
  const coreBase = (g: HttpHomeworkGraph) =>
    `/api/v1/homework/assignments/${g.homework.id}`;
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(async () => {
    // These cases also own submitted answers, which must precede questions in FK cleanup.
    const where = {
      schoolId: { in: h.fixture.schools.map((school) => school.schoolId) },
    };
    await h.prisma.homeworkSubmissionAnswer.deleteMany({ where });
    await h.prisma.homeworkSubmission.deleteMany({ where });
    await h.disposeCase();
  });
  afterAll(() => h.close());
  async function create(g: HttpHomeworkGraph, core = false) {
    const response = await h
      .http()
      .post(`${core ? coreBase(g) : teacherBase(g)}/questions`)
      .set(h.headers(core ? 'admin' : 'teacher'))
      .send({
        type: 'single_choice',
        richContent: questionRich(),
        points: 2,
        expectedAnswer: 'PRIVATE_EXPECTED_ANSWER',
        metadata: { privateAuthor: 'PRIVATE_METADATA' },
        options: [
          { richContent: optionRich(), isCorrect: true },
          { richContent: optionRich('Choice B'), isCorrect: false },
        ],
      })
      .expect(201);
    return st06Json<HomeworkQuestionDetailResponseDto>(response).question;
  }

  async function submissionRows(homeworkId: string) {
    const where = { homeworkAssignmentId: homeworkId };
    return {
      targets: await h.prisma.homeworkTarget.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      submissions: await h.prisma.homeworkSubmission.findMany({
        where,
        orderBy: { id: 'asc' },
        include: { answers: { orderBy: { id: 'asc' } } },
      }),
    };
  }
  async function submitOnly() {
    const roleId = h.fixture.actors.student.roleId;
    await h.prisma.rolePermission.deleteMany({ where: { roleId } });
    await h.fixture.grantAssets(roleId, ['homework.submissions.submit']);
    const grants = await h.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    expect(grants.map((grant) => grant.permission.code)).toEqual([
      'homework.submissions.submit',
    ]);
  }
  async function existingAnswer(mode: 'legacy' | 'rich' | 'asset' = 'rich') {
    const graph = await h.fixture.graph();
    const q =
      mode === 'legacy'
        ? st06Json<HomeworkQuestionDetailResponseDto>(
            await h
              .http()
              .post(teacherBase(graph) + '/questions')
              .set(h.headers())
              .send({
                type: 'single_choice',
                prompt: 'Legacy question',
                expectedAnswer: 'PRIVATE_EXPECTED_ANSWER',
                metadata: { privateAuthor: 'PRIVATE_METADATA' },
                options: [
                  { text: 'Choice A', isCorrect: true },
                  { text: 'Choice B', isCorrect: false },
                ],
              })
              .expect(201),
          ).question
        : await create(graph);
    let media:
      | {
          path: string;
          bytes: Buffer;
          fileId: string;
          objectKey: string;
          bucket: string;
        }
      | undefined;
    if (mode === 'asset') {
      const bytes = Buffer.from('Private submit regression bytes\n');
      const ready = await h.fixture.ready(graph.homework.id, 'teacher', bytes);
      const bound = st06Json<{ asset: { assetId: string } }>(
        await h
          .http()
          .post(teacherBase(graph) + '/questions/' + q.questionId + '/assets')
          .set(h.headers())
          .send({
            sourceType: 'MANAGED_FILE',
            fileId: ready.fileId,
            uploadId: ready.uploadId,
          })
          .expect(201),
      );
      await h
        .http()
        .patch(
          teacherBase(graph) +
            '/questions/' +
            q.questionId +
            '/options/' +
            q.options[0].optionId,
        )
        .set(h.headers())
        .send({
          richContent: {
            contentVersion: 1,
            kind: 'option',
            label: assetRich(bound.asset.assetId).stem,
          },
        })
        .expect(200);
      media = {
        path:
          '/api/v1/student/homeworks/' +
          graph.homework.id +
          '/questions/' +
          q.questionId +
          '/assets/' +
          bound.asset.assetId,
        bytes,
        fileId: ready.fileId,
        objectKey: ready.file.objectKey,
        bucket: ready.file.bucket,
      };
    }
    await h.fixture.grantAssets(h.fixture.actors.student.roleId, [
      'homework.answers.manage',
      'homework.submissions.save',
      'homework.submissions.submit',
    ]);
    await h.publish(graph);
    const base = '/api/v1/student/homeworks/' + graph.homework.id;
    await h.http().get(base).set(h.headers('student')).expect(200);
    const saved = st06Json<HomeworkAnswerDetailResponseDto>(
      await h
        .http()
        .patch(base + '/submission/answers/' + q.questionId)
        .set(h.headers('student'))
        .send({ selectedOptionIds: [q.options[0].optionId] })
        .expect(200),
    ).answer;
    if (media) {
      const content = await h
        .http()
        .get(media.path + '/preview')
        .set(h.headers('student'))
        .expect(200);
      expect(content.text).toBe(media.bytes.toString());
      expect(saved.selectedOptions[0]).toHaveProperty('richContent');
    }
    const persisted = await h.prisma.homeworkQuestion.findUniqueOrThrow({
      where: { id: q.questionId },
    });
    expect(persisted.richContent).toEqual(
      mode === 'legacy' ? null : questionRich(),
    );
    expect(
      await h.prisma.$queryRaw<
        Array<{ sqlNull: boolean }>
      >`SELECT rich_content IS NULL AS "sqlNull" FROM homework_questions WHERE id = ${q.questionId}::uuid`,
    ).toEqual([{ sqlNull: mode === 'legacy' }]);
    await submitOnly();
    return { graph, q, base, saved, media };
  }

  describe.each(['submit', 'submission/submit'])(
    'ST08C-REV-01 POST %s',
    (suffix) => {
      it.each(['legacy', 'rich', 'asset'] as const)(
        'completes a submit-only %s response after real persistence and preserves replay/privacy boundaries',
        async (mode) => {
          const { graph, q, base, saved, media } = await existingAnswer(mode);
          if (mode === 'rich')
            await h.prisma.homeworkAssignment.update({
              where: { id: graph.homework.id },
              data: { dueAt: new Date(Date.now() - 60000) },
            });
          const before = await submissionRows(graph.homework.id);
          expect(before.submissions).toHaveLength(1);
          expect(before.submissions[0].status).toBe('DRAFT');
          const response = await h
            .http()
            .post(base + '/' + suffix)
            .set(h.headers('student'))
            .send({})
            .expect(200);
          const submission =
            st06Json<StudentHomeworkSubmissionResponseDto>(
              response,
            ).submission!;
          const after = await submissionRows(graph.homework.id);
          expect(after.submissions).toHaveLength(1);
          expect(after.submissions[0]).toMatchObject({
            id: before.submissions[0].id,
            status: mode === 'rich' ? 'LATE' : 'SUBMITTED',
          });
          expect(after.submissions[0].submittedAt).toBeInstanceOf(Date);
          expect(after.targets[0].status).toBe(after.submissions[0].status);
          expect(after.submissions[0].answers).toHaveLength(1);
          expect(after.submissions[0].answers[0]).toMatchObject({
            id: saved.answerId,
            selectedOptionIds: [q.options[0].optionId],
          });
          expect(submission.id).toBe(after.submissions[0].id);
          expect(submission.status).toBe(
            mode === 'rich' ? 'late' : 'submitted',
          );
          expect(submission.answers[0].answerId).toBe(saved.answerId);
          if (mode === 'rich')
            expect(submission.answers[0].selectedOptions[0]).toHaveProperty(
              'richContent',
              optionRich(),
            );
          else
            expect(submission.answers[0].selectedOptions[0]).not.toHaveProperty(
              'richContent',
            );
          for (const value of [
            'expectedAnswer',
            'isCorrect',
            'PRIVATE_EXPECTED_ANSWER',
            'PRIVATE_METADATA',
            'objectKey',
            'bucket',
          ])
            expect(response.text).not.toContain(value);
          await h
            .http()
            .post(base + '/' + suffix)
            .set(h.headers('student'))
            .send({})
            .expect(409);
          expect(await submissionRows(graph.homework.id)).toEqual(after);
          for (const path of [
            base,
            base + '/submission',
            base + '/submission/answers',
          ])
            await h.http().get(path).set(h.headers('student')).expect(403);
          await h
            .http()
            .patch(base + '/submission/answers/' + q.questionId)
            .set(h.headers('student'))
            .send({ selectedOptionIds: [q.options[0].optionId] })
            .expect(403);
          if (media) {
            for (const mode of ['preview', 'download']) {
              await h
                .http()
                .get(media.path + '/' + mode)
                .set(h.headers('student'))
                .expect(403);
              await h
                .http()
                .head(media.path + '/' + mode)
                .set(h.headers('student'))
                .expect(403);
            }
            for (const value of [media.fileId, media.objectKey, media.bucket])
              expect(response.text).not.toContain(value);
            const parent = await h
              .http()
              .get(
                '/api/v1/parent/children/' +
                  h.fixture.children[0].studentId +
                  '/homeworks/' +
                  graph.homework.id,
              )
              .set(h.headers('parent'))
              .expect(200);
            expect(parent.text).not.toContain('richContent');
            expect(parent.text).not.toContain(media.fileId);
          }
        },
      );
      it.each(['permission', 'target', 'enrollment', 'closed'] as const)(
        'denies a revoked %s after an earlier authorized read without changing persisted rows',
        async (revoked) => {
          const { graph, base } = await existingAnswer();
          if (revoked === 'permission')
            await h.prisma.rolePermission.deleteMany({
              where: { roleId: h.fixture.actors.student.roleId },
            });
          if (revoked === 'target')
            await h.prisma.homeworkTarget.updateMany({
              where: { homeworkAssignmentId: graph.homework.id },
              data: {
                studentId: h.fixture.children[1].studentId,
                enrollmentId: h.fixture.children[1].enrollmentId,
              },
            });
          if (revoked === 'enrollment')
            await h.prisma.enrollment.update({
              where: { id: h.fixture.children[0].enrollmentId },
              data: { status: 'COMPLETED' },
            });
          if (revoked === 'closed')
            await h.prisma.homeworkAssignment.update({
              where: { id: graph.homework.id },
              data: { status: 'CLOSED', closedAt: new Date() },
            });
          const before = await submissionRows(graph.homework.id);
          const response = await h
            .http()
            .post(base + '/' + suffix)
            .set(h.headers('student'))
            .send({});
          expect(
            revoked === 'permission'
              ? [403]
              : revoked === 'closed'
                ? [409]
                : [403, 404],
          ).toContain(response.status);
          expect(await submissionRows(graph.homework.id)).toEqual(before);
          expect(before.submissions[0].status).toBe('DRAFT');
        },
      );
    },
  );

  it.each([false, true])(
    'accepts Rich-only creation before legacy DTO requirements on Core=%s and exposes existing list/detail/assignment fields',
    async (core) => {
      const graph = await h.fixture.graph(),
        q = await create(graph, core),
        base = core ? coreBase(graph) : teacherBase(graph),
        headers = h.headers(core ? 'admin' : 'teacher');
      expect(q).toMatchObject({
        prompt: 'Rich question',
        richContent: questionRich(),
        expectedAnswer: 'PRIVATE_EXPECTED_ANSWER',
      });
      expect(q.options[0]).toMatchObject({
        text: 'Choice A',
        richContent: optionRich(),
        isCorrect: true,
      });
      const list = st06Json<HomeworkQuestionsListResponseDto>(
        await h.http().get(`${base}/questions`).set(headers).expect(200),
      );
      expect(
        list.items.find((row) => row.questionId === q.questionId)?.richContent,
      ).toEqual(questionRich());
      const detail = st06Json<HomeworkQuestionDetailResponseDto>(
        await h
          .http()
          .get(`${base}/questions/${q.questionId}`)
          .set(headers)
          .expect(200),
      );
      expect(detail.question).toEqual(q);
      const assignment = await h.http().get(base).set(headers).expect(200);
      expect(
        st06Json<{ questions: typeof list.items }>(assignment).questions.find(
          (row) => row.questionId === q.questionId,
        )?.richContent,
      ).toEqual(questionRich());
    },
  );
  it('preserves legacy-only clients and validates genuinely missing/empty legacy content', async () => {
    const graph = await h.fixture.graph(),
      base = `${teacherBase(graph)}/questions`;
    const legacy = st06Json<HomeworkQuestionDetailResponseDto>(
      await h
        .http()
        .post(base)
        .set(h.headers())
        .send({
          type: 'short_text',
          prompt: 'Legacy prompt',
          instructions: 'Legacy instructions',
        })
        .expect(201),
    ).question;
    expect(legacy.prompt).toBe('Legacy prompt');
    expect(legacy).not.toHaveProperty('richContent');
    for (const payload of [
      { type: 'short_text' },
      { type: 'short_text', prompt: '' },
      { type: 'short_text', richContent: null },
    ])
      await h.http().post(base).set(h.headers()).send(payload).expect(400);
  });
  it('preserves Rich on omitted/unchanged/metadata patches and stores genuine edits or explicit clears as SQL NULL', async () => {
    const graph = await h.fixture.graph(),
      q = await create(graph),
      path = `${teacherBase(graph)}/questions/${q.questionId}`;
    for (const patch of [
      { points: 3 },
      { prompt: q.prompt },
      { metadata: { changed: true } },
      { instructions: null },
    ]) {
      const current = st06Json<HomeworkQuestionDetailResponseDto>(
        await h.http().patch(path).set(h.headers()).send(patch).expect(200),
      ).question;
      expect(current.richContent).toEqual(questionRich());
    }
    const edited = st06Json<HomeworkQuestionDetailResponseDto>(
      await h
        .http()
        .patch(path)
        .set(h.headers())
        .send({ prompt: 'Legacy edit' })
        .expect(200),
    ).question;
    expect(edited.prompt).toBe('Legacy edit');
    expect(edited).not.toHaveProperty('richContent');
    await h
      .http()
      .patch(path)
      .set(h.headers())
      .send({ richContent: questionRich('Restored') })
      .expect(200);
    const cleared = st06Json<HomeworkQuestionDetailResponseDto>(
      await h
        .http()
        .patch(path)
        .set(h.headers())
        .send({ richContent: null })
        .expect(200),
    ).question;
    expect(cleared.prompt).toBe('Restored');
    expect(cleared).not.toHaveProperty('richContent');
    expect(
      await h.prisma.$queryRaw<
        Array<{ sqlNull: boolean }>
      >`SELECT rich_content IS NULL AS "sqlNull" FROM homework_questions WHERE id = ${q.questionId}::uuid`,
    ).toEqual([{ sqlNull: true }]);
  });
  it('keeps stable option IDs on independent Rich-only create/update/reorder/delete routes', async () => {
    const graph = await h.fixture.graph(),
      q = await create(graph),
      base = `${teacherBase(graph)}/questions/${q.questionId}/options`,
      first = q.options[0];
    const changed = st06Json<HomeworkQuestionDetailResponseDto>(
      await h
        .http()
        .patch(`${base}/${first.optionId}`)
        .set(h.headers())
        .send({ richContent: optionRich('Changed label') })
        .expect(200),
    ).question;
    expect(
      changed.options.find((o) => o.optionId === first.optionId),
    ).toMatchObject({
      text: 'Changed label',
      isCorrect: true,
      richContent: optionRich('Changed label'),
    });
    const reordered = st06Json<HomeworkQuestionDetailResponseDto>(
      await h
        .http()
        .patch(`${base}/${first.optionId}/reorder`)
        .set(h.headers())
        .send({ sortOrder: 8 })
        .expect(200),
    ).question;
    expect(
      reordered.options.find((o) => o.optionId === first.optionId)?.richContent,
    ).toEqual(optionRich('Changed label'));
    const created = st06Json<HomeworkQuestionDetailResponseDto>(
      await h
        .http()
        .post(base)
        .set(h.headers())
        .send({ richContent: optionRich('New option') })
        .expect(201),
    ).question;
    expect(created.options).toHaveLength(3);
    expect(created.options.map((o) => o.optionId)).toEqual(
      expect.arrayContaining(q.options.map((o) => o.optionId)),
    );
    await h
      .http()
      .delete(`${base}/${first.optionId}`)
      .set(h.headers())
      .expect(204);
    const retired = await h.prisma.homeworkQuestionOption.findUniqueOrThrow({
      where: { id: first.optionId },
    });
    expect(retired.deletedAt).not.toBeNull();
    expect(retired.richContent).toEqual(optionRich('Changed label'));
    await h
      .http()
      .patch(`${base}/${first.optionId}`)
      .set(h.headers())
      .send({ richContent: optionRich('Retired') })
      .expect(404);
  });
  it('round-trips bilingual scientific/accessibility fragments through creation, persistence, Student submission and Teacher review', async () => {
    const graph = await h.fixture.graph();
    const richContent = {
      ...questionRich(),
      instructions: doc('Read carefully'),
      stem: {
        language: 'und',
        direction: 'auto',
        blocks: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'مسألة ',
                language: 'ar',
                direction: 'rtl',
              },
              {
                type: 'math',
                display: 'inline',
                children: [
                  {
                    type: 'fraction',
                    numerator: [{ type: 'text', text: '١٢' }],
                    denominator: [{ type: 'text', text: '3' }],
                  },
                  { type: 'radical', radicand: [{ type: 'text', text: '9' }] },
                  {
                    type: 'superscript',
                    children: [{ type: 'text', text: '۲' }],
                  },
                  {
                    type: 'subscript',
                    children: [{ type: 'text', text: '1' }],
                  },
                ],
                altText: 'Accessible expression',
              },
              {
                type: 'text',
                text: ' 6.02e23 mol; 12 ١٢ ۱۲ ',
                language: 'en',
                direction: 'ltr',
              },
              {
                type: 'chemistry',
                reactants: [
                  {
                    coefficient: 1,
                    elements: [{ element: 'Na', count: 1 }],
                    charge: 1,
                    state: 'aq',
                  },
                ],
                altText: 'Sodium ion',
              },
              {
                type: 'chemistry',
                reactants: [
                  { coefficient: 2, elements: [{ element: 'H', count: 2 }] },
                  { coefficient: 1, elements: [{ element: 'O', count: 2 }] },
                ],
                products: [
                  {
                    coefficient: 2,
                    elements: [
                      { element: 'H', count: 2 },
                      { element: 'O', count: 1 },
                    ],
                    state: 'l',
                  },
                ],
                arrow: 'yields',
                altText: 'Water formation',
              },
            ],
          },
        ],
      },
    };
    const richOption = {
      contentVersion: 1,
      kind: 'option',
      label: richContent.stem,
    };
    const author = st06Json<HomeworkQuestionDetailResponseDto>(
      await h
        .http()
        .post(`${teacherBase(graph)}/questions`)
        .set(h.headers())
        .send({
          type: 'single_choice',
          points: 2,
          richContent,
          options: [
            { richContent: richOption, isCorrect: true },
            { text: 'Other', isCorrect: false },
          ],
        })
        .expect(201),
    ).question;
    expect(author.richContent).toEqual(richContent);
    expect(author.prompt).toContain('sqrt(9)');
    expect(author.prompt).toContain('Na^(+)(aq)');
    expect(author.prompt).toContain('2H2 + O2 → 2H2O(l)');
    const persisted = await h.prisma.homeworkQuestion.findUniqueOrThrow({
      where: { id: author.questionId },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    expect(persisted.richContent).toEqual(richContent);
    expect(persisted.prompt).toBe(author.prompt);
    expect(persisted.options[0].richContent).toEqual(richOption);
    await h.fixture.grantAssets(h.fixture.actors.student.roleId, [
      'homework.answers.manage',
      'homework.submissions.save',
      'homework.submissions.submit',
    ]);
    await h.fixture.grantAssets(h.fixture.actors.teacher.roleId, [
      'homework.submissions.review',
    ]);
    await h.publish(graph);
    const student = st06Json<StudentHomeworkResponseDto>(
      await h
        .http()
        .get(`/api/v1/student/homeworks/${graph.homework.id}`)
        .set(h.headers('student'))
        .expect(200),
    ).homework;
    expect(
      student.questions.find((q) => q.questionId === author.questionId)
        ?.richContent,
    ).toEqual(richContent);
    const studentBase = `/api/v1/student/homeworks/${graph.homework.id}`;
    const saved = st06Json<HomeworkAnswerDetailResponseDto>(
      await h
        .http()
        .patch(`${studentBase}/submission/answers/${author.questionId}`)
        .set(h.headers('student'))
        .send({ selectedOptionIds: [author.options[0].optionId] })
        .expect(200),
    ).answer;
    expect(saved.selectedOptions[0].richContent).toEqual(richOption);
    expect(saved.selectedOptions[0]).not.toHaveProperty('isCorrect');
    await h
      .http()
      .post(`${studentBase}/submit`)
      .set(h.headers('student'))
      .send({})
      .expect(200);
    const submission = await h.prisma.homeworkSubmission.findFirstOrThrow({
      where: {
        homeworkAssignmentId: graph.homework.id,
        studentId: h.fixture.children[0].studentId,
      },
    });
    const reviewPath = `${teacherBase(graph)}/submissions/${submission.id}/answers/${saved.answerId}/review`;
    const reviewed = st06Json<HomeworkAnswerDetailResponseDto>(
      await h
        .http()
        .patch(reviewPath)
        .set(h.headers())
        .send({
          awardedPoints: 1,
          teacherComment: 'Scientific display reviewed',
        })
        .expect(200),
    ).answer;
    expect(reviewed.answerId).toBe(saved.answerId);
    expect(reviewed.prompt?.richContent).toEqual(richContent);
    expect(reviewed.selectedOptions[0].richContent).toEqual(richOption);
    const parent = await h
      .http()
      .get(
        `/api/v1/parent/children/${h.fixture.children[0].studentId}/homeworks/${graph.homework.id}`,
      )
      .set(h.headers('parent'))
      .expect(200);
    expect(parent.text).not.toContain('richContent');
  });
  it.each(['PUBLISHED', 'CLOSED'] as const)(
    'keeps %s Student visibility and rejects Rich authoring after publication',
    async (state) => {
      const graph = await h.fixture.graph(),
        q = await create(graph);
      await h.publish(graph);
      if (state === 'CLOSED')
        await h.prisma.homeworkAssignment.update({
          where: { id: graph.homework.id },
          data: { status: 'CLOSED', closedAt: new Date() },
        });
      const student = st06Json<StudentHomeworkResponseDto>(
        await h
          .http()
          .get(`/api/v1/student/homeworks/${graph.homework.id}`)
          .set(h.headers('student'))
          .expect(200),
      ).homework;
      const question = student.questions.find(
        (row) => row.questionId === q.questionId,
      )!;
      expect(question.richContent).toEqual(questionRich());
      expect(question.options.map((o) => o.richContent)).toEqual([
        optionRich(),
        optionRich('Choice B'),
      ]);
      for (const key of [
        'expectedAnswer',
        'isCorrect',
        'PRIVATE_EXPECTED_ANSWER',
        'PRIVATE_METADATA',
      ])
        expect(JSON.stringify(question)).not.toContain(key);
      await h
        .http()
        .patch(`${teacherBase(graph)}/questions/${q.questionId}`)
        .set(h.headers())
        .send({ richContent: questionRich('Denied') })
        .expect(409);
    },
  );
  it('keeps selected-option Rich display through actual save/submit/Teacher review without widening Parent access', async () => {
    const graph = await h.fixture.graph(),
      q = await create(graph);
    await h.fixture.grantAssets(h.fixture.actors.student.roleId, [
      'homework.answers.manage',
      'homework.submissions.save',
      'homework.submissions.submit',
    ]);
    await h.fixture.grantAssets(h.fixture.actors.teacher.roleId, [
      'homework.submissions.review',
    ]);
    await h.publish(graph);
    const studentBase = `/api/v1/student/homeworks/${graph.homework.id}`;
    const saved = st06Json<HomeworkAnswerDetailResponseDto>(
      await h
        .http()
        .patch(`${studentBase}/submission/answers/${q.questionId}`)
        .set(h.headers('student'))
        .send({ selectedOptionIds: [q.options[0].optionId] })
        .expect(200),
    ).answer;
    expect(saved.selectedOptions[0].richContent).toEqual(optionRich());
    expect(saved.selectedOptions[0]).not.toHaveProperty('isCorrect');
    await h
      .http()
      .post(`${studentBase}/submit`)
      .set(h.headers('student'))
      .send({})
      .expect(200);
    const submission = await h.prisma.homeworkSubmission.findFirstOrThrow({
      where: {
        homeworkAssignmentId: graph.homework.id,
        studentId: h.fixture.children[0].studentId,
      },
    });
    const reviewPath = `${teacherBase(graph)}/submissions/${submission.id}/answers`;
    const listed = st06Json<HomeworkAnswersListResponseDto>(
      await h.http().get(reviewPath).set(h.headers()).expect(200),
    ).items;
    const answer = listed.find((a) => a.questionId === q.questionId)!;
    expect(answer.prompt?.richContent).toEqual(questionRich());
    expect(answer.selectedOptions[0].richContent).toEqual(optionRich());
    const reviewed = st06Json<HomeworkAnswerDetailResponseDto>(
      await h
        .http()
        .patch(`${reviewPath}/${answer.answerId}/review`)
        .set(h.headers())
        .send({ awardedPoints: 1, teacherComment: 'Reviewed' })
        .expect(200),
    ).answer;
    expect(reviewed).toMatchObject({
      answerId: saved.answerId,
      selectedOptionIds: [q.options[0].optionId],
      awardedPoints: 1,
      teacherComment: 'Reviewed',
    });
    expect(reviewed.prompt?.richContent).toEqual(questionRich());
    expect(reviewed.selectedOptions[0].richContent).toEqual(optionRich());
    const parent = await h
      .http()
      .get(
        `/api/v1/parent/children/${h.fixture.children[0].studentId}/homeworks/${graph.homework.id}`,
      )
      .set(h.headers('parent'))
      .expect(200);
    expect(parent.text).not.toContain('richContent');
  });
  it('validates managed references and streams actual private bytes with GET/HEAD/Range/If-Range/416', async () => {
    const graph = await h.fixture.graph(),
      bound = await h.bind(
        graph,
        0,
        'teacher',
        Buffer.from('Actual ST08-C private bytes\n'),
      );
    const path = `${teacherBase(graph)}/questions/${graph.questions[0].id}`;
    const q = st06Json<HomeworkQuestionDetailResponseDto>(
      await h
        .http()
        .patch(path)
        .set(h.headers())
        .send({ richContent: assetRich(bound.asset.assetId) })
        .expect(200),
    ).question;
    expect(q.richContent).toEqual(assetRich(bound.asset.assetId));
    await h.publish(graph);
    const detail = await h
      .http()
      .get(`/api/v1/student/homeworks/${graph.homework.id}`)
      .set(h.headers('student'))
      .expect(200);
    expect(
      st06Json<StudentHomeworkResponseDto>(detail).homework.questions.find(
        (question) => question.questionId === graph.questions[0].id,
      )?.richContent,
    ).toEqual(assetRich(bound.asset.assetId));
    for (const privateValue of [
      bound.ready.fileId,
      bound.ready.uploadId,
      bound.ready.file.bucket,
      bound.ready.file.objectKey,
      'assessmentSecurityEvidence',
    ])
      expect(detail.text).not.toContain(privateValue);
    const bytesPath = h.student(graph, 0, bound.asset.assetId);
    const full = await h
      .http()
      .get(bytesPath)
      .set(h.headers('student'))
      .expect(200);
    expect(Buffer.from(full.text)).toEqual(bound.ready.bytes);
    expect(full.headers['cache-control']).toContain('no-store');
    expect(full.headers['x-content-type-options']).toBe('nosniff');
    const range = await h
      .http()
      .get(bytesPath)
      .set(h.headers('student'))
      .set('Range', 'bytes=0-5')
      .expect(206);
    expect(Buffer.from(range.text)).toEqual(bound.ready.bytes.subarray(0, 6));
    await h
      .http()
      .head(bytesPath)
      .set(h.headers('student'))
      .expect(200)
      .expect('Content-Length', String(bound.ready.bytes.length));
    const ifRange = await h
      .http()
      .get(bytesPath)
      .set(h.headers('student'))
      .set('Range', 'bytes=0-5')
      .set('If-Range', '"nonmatching"')
      .expect(200);
    expect(Buffer.from(ifRange.text)).toEqual(bound.ready.bytes);
    await h
      .http()
      .get(bytesPath)
      .set(h.headers('student'))
      .set('Range', 'bytes=99999-')
      .expect(416);
    await h.http().head(bytesPath).set(h.headers('otherStudent')).expect(404);
    await h.prisma.file.update({
      where: { id: bound.ready.fileId },
      data: { deletedAt: new Date() },
    });
    await h.http().get(bytesPath).set(h.headers('student')).expect(404);
    const stale = st06Json<StudentHomeworkResponseDto>(
      await h
        .http()
        .get(`/api/v1/student/homeworks/${graph.homework.id}`)
        .set(h.headers('student'))
        .expect(200),
    ).homework.questions.find(
      (question) => question.questionId === graph.questions[0].id,
    )!;
    expect(stale).not.toHaveProperty('richContent');
  });
  it('withholds SQL-null/JSON-null/future stored envelopes without changing legacy HTTP data', async () => {
    const graph = await h.fixture.graph(),
      q = await create(graph),
      path = `${teacherBase(graph)}/questions/${q.questionId}`;
    for (const value of [
      Prisma.DbNull,
      Prisma.JsonNull,
      { ...questionRich(), contentVersion: 999 },
    ]) {
      await h.prisma.homeworkQuestion.update({
        where: { id: q.questionId },
        data: { richContent: value },
      });
      const before = await h.prisma.homeworkQuestion.findUniqueOrThrow({
        where: { id: q.questionId },
      });
      const response = st06Json<HomeworkQuestionDetailResponseDto>(
        await h.http().get(path).set(h.headers()).expect(200),
      ).question;
      expect(response.prompt).toBe(q.prompt);
      expect(response).not.toHaveProperty('richContent');
      expect(
        await h.prisma.homeworkQuestion.findUniqueOrThrow({
          where: { id: q.questionId },
        }),
      ).toEqual(before);
    }
  });
  it('documents the optional Rich field and preserves every existing Core/Teacher/Student route', () => {
    const document = SwaggerModule.createDocument(
      h.app,
      new DocumentBuilder().setTitle('ST08-C').setVersion('1').build(),
    );
    const schemas = document.components?.schemas;
    expect(schemas?.CreateHomeworkQuestionDto).toHaveProperty(
      'properties.richContent',
    );
    expect(schemas?.CreateHomeworkQuestionOptionDto).toHaveProperty(
      'properties.richContent',
    );
    expect(schemas?.HomeworkQuestionResponseDto).toHaveProperty(
      'properties.richContent',
    );
    expect(document.paths).toHaveProperty(
      '/api/v1/homework/assignments/{homeworkId}/questions',
    );
    expect(document.paths).toHaveProperty(
      '/api/v1/teacher/homeworks/classes/{classId}/assignments/{homeworkId}/questions',
    );
    expect(document.paths).toHaveProperty(
      '/api/v1/student/homeworks/{homeworkId}',
    );
  });
});
