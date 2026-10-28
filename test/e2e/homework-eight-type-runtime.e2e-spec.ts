import { Prisma } from '@prisma/client';
import {
  HomeworkQuestionAssetsHttp,
  st06Json,
} from '../fixtures/homework-question-assets.http';
import {
  createHomeworkEightTypes,
  st09bcPrivateSentinel,
  st09bcQuestionTypes,
} from '../fixtures/homework-eight-type.fixture';
import { HomeworkRichContentService } from '../../src/modules/homework/application/homework-rich-content.service';

type Answer = {
  answerId: string;
  questionId: string;
  type: string;
  answerJson?: unknown;
  isDraft: boolean;
  teacherComment?: string;
  awardedPoints?: number;
};
describe('ST09-B/C actual HTTP eight-type Student lifecycle, privacy and atomicity', () => {
  jest.setTimeout(180000);
  const h = new HomeworkQuestionAssetsHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(async () => {
    jest.restoreAllMocks();
    const where = {
      schoolId: { in: h.fixture.schools.map((school) => school.schoolId) },
    };
    await h.prisma.gradeItem.deleteMany({ where });
    await h.prisma.homeworkSubmissionAnswer.deleteMany({ where });
    await h.prisma.homeworkSubmission.deleteMany({ where });
    await h.disposeCase();
  });
  afterAll(() => h.close());
  const safe = (value: unknown) => {
    const json = JSON.stringify(value);
    for (const secret of [
      st09bcPrivateSentinel,
      'answerKey',
      'acceptedAnswers',
      'keyVersion',
      'isCorrect',
      'expectedAnswer',
      'objectKey',
      'bucket',
    ])
      expect(json).not.toContain(secret);
  };
  it('completes Author -> Publish -> Student -> Answers -> Submit -> manual Review -> Parent and Grade Sync for all eight types', async () => {
    const f = await createHomeworkEightTypes(h);
    await h
      .http()
      .patch(f.teacher)
      .set(h.headers())
      .send({ isGraded: true, totalMarks: 8 })
      .expect(200);
    const assessment = await h.fixture.assessment('teacher', true);
    await h.prisma.gradeAssessment.update({
      where: { id: assessment.id },
      data: { type: 'ASSIGNMENT', deliveryMode: 'SCORE_ONLY', maxScore: 8 },
    });
    await h.fixture.grantAssets(h.fixture.actors.admin.roleId, [
      'grades.assessments.manage',
      'grades.assessments.view',
      'grades.items.manage',
      'grades.items.view',
    ]);
    const core = `/api/v1/homework/assignments/${f.graph.homework.id}`;
    await h
      .http()
      .post(core + '/grade-sync/link')
      .set(h.headers('admin'))
      .send({ gradeAssessmentId: assessment.id })
      .expect(200);
    await h.publish(f.graph);
    const detail = await h
      .http()
      .get(f.student)
      .set(h.headers('student'))
      .expect(200);
    const questionView = st06Json<{
      homework: {
        questions: Array<{
          type: string;
          metadata?: unknown;
          richContent?: unknown;
        }>;
      };
    }>(detail).homework.questions;
    expect(questionView.map((question) => question.type).sort()).toEqual(
      st09bcQuestionTypes.map((type) => type.toLowerCase()).sort(),
    );
    expect(
      questionView.find((question) => question.type === 'fill_in_blank')
        ?.richContent,
    ).toBeDefined();
    expect(
      questionView.find((question) => question.type === 'media')?.metadata,
    ).toMatchObject({ source: { assetId: f.mediaAssetId } });
    safe(detail.body);
    const fillId = f.questions.get('FILL_IN_BLANK')!.questionId;
    await h
      .http()
      .patch(f.student + '/submission/answers/' + fillId)
      .set(h.headers('student'))
      .send({
        answerJson: { blanks: [{ blankId: 'b1', text: 'Draft subset' }] },
      })
      .expect(200);
    const bulk = await h
      .http()
      .put(f.student + '/submission/answers')
      .set(h.headers('student'))
      .send({ answers: f.answers })
      .expect(200);
    const saved = st06Json<{ items: Answer[] }>(bulk).items;
    expect(saved).toHaveLength(8);
    expect(saved.every((answer) => answer.isDraft)).toBe(true);
    expect(
      saved.find((answer) => answer.type === 'fill_in_blank')?.answerJson,
    ).toEqual({
      blanks: [
        { blankId: 'b1', text: 'Student response' },
        { blankId: 'b2', text: 'القاهرة' },
      ],
    });
    safe(bulk.body);
    await h
      .http()
      .patch(f.student + '/submission/answers/' + fillId)
      .set(h.headers('student'))
      .send({
        answerJson: f.answers.find((answer) => answer.questionId === fillId)!
          .answerJson,
        isDraft: false,
      })
      .expect(200);
    const submitted = await h
      .http()
      .post(f.student + '/submit')
      .set(h.headers('student'))
      .send({ answers: f.answers })
      .expect(200);
    const submission = st06Json<{
      submission: { id: string; status: string; answers: Answer[] };
    }>(submitted).submission;
    expect(submission.status).toBe('submitted');
    expect(submission.answers).toHaveLength(8);
    expect(
      submission.answers.every(
        (answer) => !answer.isDraft && answer.awardedPoints === undefined,
      ),
    ).toBe(true);
    safe(submitted.body);
    const parent = `/api/v1/parent/children/${h.fixture.children[0].studentId}/homeworks/${f.graph.homework.id}`;
    await h.prisma.rolePermission.deleteMany({
      where: {
        roleId: h.fixture.actors.teacher.roleId,
        permission: {
          code: {
            in: [
              'homework.questions.manage',
              'homework.assignments.manage',
              'homework.questions.view',
            ],
          },
        },
      },
    });
    const reviewed = await h
      .http()
      .get(f.teacher + '/submissions/' + submission.id + '/answers')
      .set(h.headers())
      .expect(200);
    const reviewAnswers = st06Json<{ items: Answer[] }>(reviewed).items;
    expect(
      reviewAnswers.find((answer) => answer.type === 'matching')?.answerJson,
    ).toEqual({
      pairs: [
        { leftId: 'l1', rightId: 'r2' },
        { leftId: 'l2', rightId: 'r1' },
      ],
    });
    expect(JSON.stringify(reviewed.body)).not.toContain(st09bcPrivateSentinel);
    expect(JSON.stringify(reviewed.body)).not.toContain('answerKey');
    await h
      .http()
      .patch(
        f.teacher +
          '/submissions/' +
          submission.id +
          '/answers/' +
          reviewAnswers[0].answerId +
          '/review',
      )
      .set(h.headers())
      .send({ awardedPoints: 1, teacherComment: 'Manual only' })
      .expect(200);
    await h
      .http()
      .put(f.teacher + '/submissions/' + submission.id + '/answers/review')
      .set(h.headers())
      .send({
        answers: reviewAnswers.slice(1).map((answer) => ({
          answerId: answer.answerId,
          awardedPoints: 1,
          teacherComment: 'Manual only',
        })),
      })
      .expect(200);
    const beforeRelease = await h
      .http()
      .get(parent)
      .set(h.headers('parent'))
      .expect(200);
    expect(JSON.stringify(beforeRelease.body)).not.toContain('Manual only');
    await h
      .http()
      .post(f.teacher + '/submissions/' + submission.id + '/review')
      .set(h.headers())
      .send({ reviewNote: 'Released manual review' })
      .expect(200);
    const child = await h
      .http()
      .get(parent)
      .set(h.headers('parent'))
      .expect(200);
    const parentView = st06Json<{
      homework: {
        questions: Array<{ type: string; metadata?: unknown }>;
        submission: { status: string; awardedMarks: number; answers: Answer[] };
      };
    }>(child).homework;
    expect(parentView.submission.status).toBe('reviewed');
    expect(parentView.submission.awardedMarks).toBe(8);
    expect(
      parentView.submission.answers.find(
        (answer) => answer.type === 'fill_in_blank',
      )?.answerJson,
    ).toBeDefined();
    expect(
      parentView.questions.find((question) => question.type === 'media'),
    ).not.toHaveProperty('metadata');
    expect(JSON.stringify(child.body)).not.toContain('richContent');
    expect(JSON.stringify(child.body)).not.toContain(f.mediaAssetId);
    safe(child.body);
    await h
      .http()
      .post(core + '/submissions/' + submission.id + '/grade-sync')
      .set(h.headers('admin'))
      .send({})
      .expect(200);
    const item = await h.prisma.gradeItem.findFirstOrThrow({
      where: {
        assessmentId: assessment.id,
        studentId: h.fixture.children[0].studentId,
      },
    });
    expect(Number(item.score)).toBe(8);
    const audits = await h.prisma.auditLog.findMany({
      where: { schoolId: f.graph.homework.schoolId, module: 'homework' },
      select: { before: true, after: true },
    });
    const serializedAudit = JSON.stringify(audits);
    expect(audits.length).toBeGreaterThan(0);
    for (const secret of [
      st09bcPrivateSentinel,
      'acceptedAnswers',
      'answerKey',
      'answerJson',
      'Student response',
    ])
      expect(serializedAudit).not.toContain(secret);
    const final = await h.prisma.homeworkSubmission.findUniqueOrThrow({
      where: { id: submission.id },
      include: { answers: { orderBy: { id: 'asc' } } },
    });
    await h
      .http()
      .post(f.student + '/submission/submit')
      .set(h.headers('student'))
      .send({})
      .expect(409);
    await h
      .http()
      .patch(f.student + '/submission/answers/' + fillId)
      .set(h.headers('student'))
      .send({ clearAnswer: true })
      .expect(409);
    expect(
      await h.prisma.homeworkSubmission.findUniqueOrThrow({
        where: { id: submission.id },
        include: { answers: { orderBy: { id: 'asc' } } },
      }),
    ).toEqual(final);
  });
  it('preserves the Core final-review manage permission and revalidates its revocation inside the transaction', async () => {
    const f = await createHomeworkEightTypes(h);
    await h.publish(f.graph);
    await h
      .http()
      .post(f.student + '/submit')
      .set(h.headers('student'))
      .send({ answers: f.answers })
      .expect(200);
    const submission = await h.prisma.homeworkSubmission.findFirstOrThrow({
      where: { homeworkAssignmentId: f.graph.homework.id },
    });
    const response = await h
      .http()
      .get(f.teacher + '/submissions/' + submission.id + '/answers')
      .set(h.headers())
      .expect(200);
    const answers = st06Json<{ items: Answer[] }>(response).items;
    await h
      .http()
      .put(f.teacher + '/submissions/' + submission.id + '/answers/review')
      .set(h.headers())
      .send({
        answers: answers.map((answer) => ({
          answerId: answer.answerId,
          awardedPoints: 1,
        })),
      })
      .expect(200);
    await h.fixture.grantAssets(h.fixture.actors.admin.roleId, [
      'homework.assignments.manage',
    ]);
    await h.prisma.rolePermission.deleteMany({
      where: {
        roleId: h.fixture.actors.admin.roleId,
        permission: { code: 'homework.submissions.review' },
      },
    });
    const rich = h.app.get<HomeworkRichContentService>(
      HomeworkRichContentService,
    );
    const original = rich.assertReviewWrite.bind(
      rich,
    ) as typeof rich.assertReviewWrite;
    jest
      .spyOn(rich, 'assertReviewWrite')
      .mockImplementationOnce(async (...args) => {
        expect(args[2]).toBe('homework.assignments.manage');
        await h.prisma.rolePermission.deleteMany({
          where: {
            roleId: h.fixture.actors.admin.roleId,
            permission: { code: 'homework.assignments.manage' },
          },
        });
        return original(...args);
      });
    const core = `/api/v1/homework/assignments/${f.graph.homework.id}/submissions/${submission.id}/review`;
    const before = await h.prisma.homeworkSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });
    await h
      .http()
      .post(core)
      .set(h.headers('admin'))
      .send({ reviewNote: 'Core release' })
      .expect(404);
    expect(
      await h.prisma.homeworkSubmission.findUniqueOrThrow({
        where: { id: submission.id },
      }),
    ).toEqual(before);
    await h.fixture.grantAssets(h.fixture.actors.admin.roleId, [
      'homework.assignments.manage',
    ]);
    const reviewed = await h
      .http()
      .patch(core)
      .set(h.headers('admin'))
      .send({ reviewNote: 'Core release' })
      .expect(200);
    safe(reviewed.body);
    expect(
      (
        await h.prisma.homeworkSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        })
      ).status,
    ).toBe('REVIEWED');
    await h.http().post(core).set(h.headers('admin')).send({}).expect(409);
  });
  it('rolls back every earlier mixed bulk/inline answer and the first draft when a late item fails', async () => {
    const f = await createHomeworkEightTypes(h);
    await h.publish(f.graph);
    const invalid = {
      questionId: f.questions.get('MATCHING')!.questionId,
      answerJson: { pairs: [{ leftId: 'l1', rightId: 'foreign' }] },
    };
    const batch = [
      ...f.answers.filter((answer) => answer.questionId !== invalid.questionId),
      invalid,
    ];
    const where = { homeworkAssignmentId: f.graph.homework.id };
    for (const suffix of [
      'submission/answers',
      'submit',
      'submission/submit',
    ]) {
      const request =
        suffix === 'submission/answers'
          ? h.http().put(f.student + '/' + suffix)
          : h.http().post(f.student + '/' + suffix);
      await request
        .set(h.headers('student'))
        .send({ answers: batch })
        .expect(422);
      expect(await h.prisma.homeworkSubmission.count({ where })).toBe(0);
      expect(await h.prisma.homeworkSubmissionAnswer.count({ where })).toBe(0);
    }
    await h
      .http()
      .put(f.student + '/submission/answers')
      .set(h.headers('student'))
      .send({ answers: [f.answers[0], f.answers[0]] })
      .expect(422);
    expect(await h.prisma.homeworkSubmission.count({ where })).toBe(0);
  });
  it('preserves an omitted structured PATCH value, maps explicit clear to SQL NULL and withholds malformed stored JSON', async () => {
    const f = await createHomeworkEightTypes(h);
    await h.publish(f.graph);
    const fill = f.answers.find(
      (answer) =>
        answer.questionId === f.questions.get('FILL_IN_BLANK')!.questionId,
    )!;
    await h
      .http()
      .patch(f.student + '/submission/answers/' + fill.questionId)
      .set(h.headers('student'))
      .send({ answerJson: fill.answerJson })
      .expect(200);
    const preserved = await h
      .http()
      .patch(f.student + '/submission/answers/' + fill.questionId)
      .set(h.headers('student'))
      .send({ selectedOptionIds: null })
      .expect(200);
    expect(
      st06Json<{ answer: Answer }>(preserved).answer.answerJson,
    ).toMatchObject({ blanks: expect.any(Array) as unknown });
    const stored = await h.prisma.homeworkSubmissionAnswer.findFirstOrThrow({
      where: { homeworkQuestionId: fill.questionId },
    });
    const contradictory = await h.prisma.homeworkSubmissionAnswer.update({
      where: { id: stored.id },
      data: { textAnswer: 'INVALID_STORED_TYPED_TEXT' },
    });
    await h
      .http()
      .patch(f.student + '/submission/answers/' + fill.questionId)
      .set(h.headers('student'))
      .send({ selectedOptionIds: null })
      .expect(422);
    expect(
      await h.prisma.homeworkSubmissionAnswer.findUniqueOrThrow({
        where: { id: stored.id },
      }),
    ).toEqual(contradictory);
    const withheld = await h
      .http()
      .get(f.student + '/submission/answers')
      .set(h.headers('student'))
      .expect(200);
    expect(JSON.stringify(withheld.body)).not.toContain(
      'INVALID_STORED_TYPED_TEXT',
    );
    await h
      .http()
      .patch(f.student + '/submission/answers/' + fill.questionId)
      .set(h.headers('student'))
      .send({ answerJson: fill.answerJson })
      .expect(200);
    expect(
      (
        await h.prisma.homeworkSubmissionAnswer.findUniqueOrThrow({
          where: { id: stored.id },
        })
      ).textAnswer,
    ).toBeNull();
    await h
      .http()
      .patch(f.student + '/submission/answers/' + fill.questionId)
      .set(h.headers('student'))
      .send({ clearAnswer: true })
      .expect(200);
    const [row] = await h.prisma.$queryRaw<
      Array<{ absent: boolean }>
    >`SELECT answer_json IS NULL AS absent FROM homework_submission_answers WHERE homework_question_id=${fill.questionId}::uuid`;
    expect(row.absent).toBe(true);
    const before = await h.prisma.homeworkSubmissionAnswer.findFirstOrThrow({
      where: { homeworkQuestionId: fill.questionId },
    });
    await h
      .http()
      .patch(f.student + '/submission/answers/' + fill.questionId)
      .set(h.headers('student'))
      .send({ answerJson: null })
      .expect(422);
    expect(
      await h.prisma.homeworkSubmissionAnswer.findUniqueOrThrow({
        where: { id: before.id },
      }),
    ).toEqual(before);
    await h.prisma.homeworkSubmissionAnswer.update({
      where: { id: before.id },
      data: { answerJson: Prisma.JsonNull },
    });
    const malformed = await h.prisma.homeworkSubmissionAnswer.findUniqueOrThrow(
      { where: { id: before.id } },
    );
    const read = await h
      .http()
      .get(f.student + '/submission/answers')
      .set(h.headers('student'))
      .expect(200);
    expect(st06Json<{ items: Answer[] }>(read).items[0].answerJson).toBeNull();
    expect(
      await h.prisma.homeworkSubmissionAnswer.findUniqueOrThrow({
        where: { id: before.id },
      }),
    ).toEqual(malformed);
    safe(read.body);
  });
  it('requires complete supplied optional final answers but accepts actual absence and explicit draft clears', async () => {
    const f = await createHomeworkEightTypes(h);
    const fillId = f.questions.get('FILL_IN_BLANK')!.questionId,
      matchingId = f.questions.get('MATCHING')!.questionId;
    for (const id of [fillId, matchingId])
      await h
        .http()
        .patch(f.teacher + '/questions/' + id)
        .set(h.headers())
        .send({ isRequired: false })
        .expect(200);
    await h.publish(f.graph);
    const required = f.answers.filter(
      (answer) =>
        answer.questionId !== fillId && answer.questionId !== matchingId,
    );
    await h
      .http()
      .post(f.student + '/submission/submit')
      .set(h.headers('student'))
      .send({
        answers: [
          ...required,
          {
            questionId: matchingId,
            answerJson: { pairs: [{ leftId: 'l1', rightId: 'r1' }] },
          },
        ],
      })
      .expect(422);
    expect(
      await h.prisma.homeworkSubmission.count({
        where: { homeworkAssignmentId: f.graph.homework.id },
      }),
    ).toBe(0);
    await h
      .http()
      .post(f.student + '/submission/draft')
      .set(h.headers('student'))
      .send({
        answers: [
          {
            questionId: fillId,
            answerJson: {
              blanks: [{ blankId: 'b1', text: 'Partial optional draft' }],
            },
          },
        ],
      })
      .expect(200);
    await h
      .http()
      .put(f.student + '/submission')
      .set(h.headers('student'))
      .send({ answers: required })
      .expect(200);
    const before = await h.prisma.homeworkSubmission.findFirstOrThrow({
      where: { homeworkAssignmentId: f.graph.homework.id },
      include: { answers: { orderBy: { id: 'asc' } } },
    });
    await h
      .http()
      .post(f.student + '/submit')
      .set(h.headers('student'))
      .send({})
      .expect(422);
    expect(
      await h.prisma.homeworkSubmission.findUniqueOrThrow({
        where: { id: before.id },
        include: { answers: { orderBy: { id: 'asc' } } },
      }),
    ).toEqual(before);
    await h
      .http()
      .patch(f.student + '/submission/answers/' + fillId)
      .set(h.headers('student'))
      .send({ clearAnswer: true })
      .expect(200);
    await h
      .http()
      .post(f.student + '/submission/submit')
      .set(h.headers('student'))
      .send({})
      .expect(200);
    expect(
      (
        await h.prisma.homeworkSubmission.findUniqueOrThrow({
          where: { id: before.id },
        })
      ).status,
    ).toBe('SUBMITTED');
  });
  it('keeps submit-only success independent of view/save and does not grant MEDIA GET or HEAD', async () => {
    const f = await createHomeworkEightTypes(h);
    await h.publish(f.graph);
    await h.prisma.rolePermission.deleteMany({
      where: {
        roleId: h.fixture.actors.student.roleId,
        permission: {
          code: {
            in: [
              'homework.assignments.view',
              'homework.submissions.view',
              'homework.answers.manage',
              'homework.submissions.save',
            ],
          },
        },
      },
    });
    const response = await h
      .http()
      .post(f.student + '/submit')
      .set(h.headers('student'))
      .send({ answers: f.answers })
      .expect(200);
    const result = st06Json<{
      submission: { id: string; status: string; answers: Answer[] };
    }>(response).submission;
    expect(result.status).toBe('submitted');
    expect(result.answers).toHaveLength(8);
    safe(response.body);
    const persisted = await h.prisma.homeworkSubmission.findUniqueOrThrow({
      where: { id: result.id },
      include: { answers: true, homeworkTarget: true },
    });
    expect(persisted.status).toBe('SUBMITTED');
    expect(persisted.homeworkTarget.status).toBe('SUBMITTED');
    expect(persisted.answers).toHaveLength(8);
    const bytes =
      f.student +
      '/questions/' +
      f.questions.get('MEDIA')!.questionId +
      '/assets/' +
      f.mediaAssetId +
      '/preview';
    await h.http().get(bytes).set(h.headers('student')).expect(403);
    await h.http().head(bytes).set(h.headers('student')).expect(403);
  });
  it('uses current deadline for LATE, denies every terminal writer and preserves both submit aliases', async () => {
    const f = await createHomeworkEightTypes(h);
    await h.publish(f.graph);
    await h.prisma.homeworkAssignment.update({
      where: { id: f.graph.homework.id },
      data: { dueAt: new Date(Date.now() - 1000) },
    });
    const response = await h
      .http()
      .post(f.student + '/submission/submit')
      .set(h.headers('student'))
      .send({ answers: f.answers })
      .expect(200);
    const result = st06Json<{ submission: { id: string; status: string } }>(
      response,
    ).submission;
    expect(result.status).toBe('late');
    const before = await h.prisma.homeworkSubmission.findUniqueOrThrow({
      where: { id: result.id },
      include: { answers: { orderBy: { id: 'asc' } } },
    });
    await h
      .http()
      .put(f.student + '/submission/answers')
      .set(h.headers('student'))
      .send({ answers: f.answers })
      .expect(409);
    await h
      .http()
      .put(f.student + '/submission')
      .set(h.headers('student'))
      .send({ bodyText: 'Forbidden' })
      .expect(409);
    await h
      .http()
      .post(f.student + '/submission/draft')
      .set(h.headers('student'))
      .send({ bodyText: 'Forbidden' })
      .expect(409);
    await h
      .http()
      .post(f.student + '/submit')
      .set(h.headers('student'))
      .send({})
      .expect(409);
    expect(
      await h.prisma.homeworkSubmission.findUniqueOrThrow({
        where: { id: result.id },
        include: { answers: { orderBy: { id: 'asc' } } },
      }),
    ).toEqual(before);
  });
  it('rejects malformed/foreign/mixed payloads and wrong Student or child without partial rows', async () => {
    const f = await createHomeworkEightTypes(h);
    await h.publish(f.graph);
    const fillId = f.questions.get('FILL_IN_BLANK')!.questionId;
    const invalid = [
      {
        answerJson: {
          blanks: [
            { blankId: 'b1', text: 'A' },
            { blankId: 'b1', text: 'B' },
          ],
        },
      },
      { answerJson: { blanks: [{ blankId: 'foreign', text: 'A' }] } },
      { answerJson: { blanks: [], futureVersion: 2 } },
      { answerJson: { blanks: [{ blankId: 'b1', text: 'A'.repeat(1001) }] } },
      { answerJson: { blanks: [] }, textAnswer: 'Mixed' },
      {
        answerJson: { blanks: [] },
        selectedOptionIds: [
          f.questions.get('SINGLE_CHOICE')!.options[0].optionId,
        ],
      },
    ];
    for (const payload of invalid)
      await h
        .http()
        .patch(f.student + '/submission/answers/' + fillId)
        .set(h.headers('student'))
        .send(payload)
        .expect(422);
    await h
      .http()
      .patch(
        f.student +
          '/submission/answers/' +
          f.questions.get('MATCHING')!.questionId,
      )
      .set(h.headers('student'))
      .send({
        answerJson: {
          pairs: [
            { leftId: 'l1', rightId: 'r1' },
            { leftId: 'l2', rightId: 'r1' },
          ],
        },
      })
      .expect(422);
    await h
      .http()
      .patch(
        f.student +
          '/submission/answers/' +
          f.questions.get('MEDIA')!.questionId,
      )
      .set(h.headers('student'))
      .send({ textAnswer: 'A'.repeat(81) })
      .expect(422);
    await h
      .http()
      .patch(
        f.student +
          '/submission/answers/' +
          f.questions.get('MEDIA')!.questionId,
      )
      .set(h.headers('student'))
      .send({ answerJson: { pairs: [] } })
      .expect(422);
    await h
      .http()
      .patch(
        f.student +
          '/submission/answers/' +
          f.questions.get('SHORT_TEXT')!.questionId,
      )
      .set(h.headers('student'))
      .send({ answerJson: { blanks: [] } })
      .expect(422);
    for (const actor of ['otherStudent', 'foreignStudent'] as const) {
      await h.fixture.grantAssets(h.fixture.actors[actor].roleId, [
        'homework.answers.manage',
      ]);
      await h
        .http()
        .put(f.student + '/submission/answers')
        .set(h.headers(actor))
        .send({ answers: f.answers })
        .expect(404);
    }
    await h
      .http()
      .get(
        `/api/v1/parent/children/${h.fixture.children[1].studentId}/homeworks/${f.graph.homework.id}`,
      )
      .set(h.headers('parent'))
      .expect(404);
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
  });
  it.each(['membership', 'permission'] as const)(
    'revalidates revoked %s after a successful Student read before the atomic write',
    async (kind) => {
      const f = await createHomeworkEightTypes(h);
      await h.publish(f.graph);
      await h.http().get(f.student).set(h.headers('student')).expect(200);
      const rich = h.app.get<HomeworkRichContentService>(
        HomeworkRichContentService,
      );
      const original = rich.assertStudentWrite.bind(
        rich,
      ) as typeof rich.assertStudentWrite;
      jest
        .spyOn(rich, 'assertStudentWrite')
        .mockImplementationOnce(async (...args) => {
          if (kind === 'membership')
            await h.prisma.membership.update({
              where: { id: h.fixture.actors.student.membershipId },
              data: { status: 'INACTIVE', endedAt: new Date() },
            });
          else
            await h.prisma.rolePermission.deleteMany({
              where: {
                roleId: h.fixture.actors.student.roleId,
                permission: { code: 'homework.answers.manage' },
              },
            });
          return original(...args);
        });
      await h
        .http()
        .put(f.student + '/submission/answers')
        .set(h.headers('student'))
        .send({ answers: f.answers })
        .expect(404);
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
    },
  );
});
