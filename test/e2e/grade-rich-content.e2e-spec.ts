import { writeFileSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import { GradeAssetsHttp } from '../fixtures/grade-assets.http';

const doc = (text: string) => ({
  language: 'und',
  direction: 'auto',
  blocks: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
});
const rich = (text: string) => ({
  contentVersion: 1,
  kind: 'question',
  stem: doc(text),
});
const option = (text: string) => ({
  contentVersion: 1,
  kind: 'option',
  label: doc(text),
});
describe('ST08-B actual JWT HTTP Rich author/student/review contracts', () => {
  jest.setTimeout(180000);
  const h = new GradeAssetsHttp();
  const examples: Array<{ name: string; request: unknown; response: unknown }> =
    [];
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeCase());
  afterAll(async () => {
    await h.close();
    if (process.env.ST08B_EXAMPLE_OUTPUT)
      writeFileSync(
        process.env.ST08B_EXAMPLE_OUTPUT,
        JSON.stringify(examples, null, 2),
      );
  });
  it('serves all nine verified additive API examples and keeps legacy/scoring/private media contracts', async () => {
    const graph = await h.fixture.gradeGraph();
    const create = {
      type: 'MCQ_SINGLE',
      points: 1,
      richContent: rich('Compare x < y'),
      options: [
        { richContent: option('A'), isCorrect: true, value: 'a' },
        { richContent: option('B'), value: 'b' },
      ],
    };
    const created = await h
      .http()
      .post(`/api/v1/grades/assessments/${graph.assessment.id}/questions`)
      .set(h.headers('admin'))
      .send(create)
      .expect(201);
    const q = created.body as {
      id: string;
      prompt: string;
      richContent: unknown;
      options: Array<{ id: string; richContent: unknown }>;
    };
    expect(q).toMatchObject({
      prompt: 'Compare x < y',
      richContent: create.richContent,
    });
    expect(q.options.map((row) => row.richContent)).toEqual(
      create.options.map((row) => row.richContent),
    );
    examples.push(
      { name: '1 Rich question create', request: create, response: q },
      {
        name: '2 Rich option create',
        request: create.options,
        response: q.options,
      },
    );
    const path = `/api/v1/grades/questions/${q.id}`;
    const patch = {
      richContent: {
        ...rich('Updated scientific stem'),
        stemAr: doc('قارن س < ص'),
      },
    };
    const updated = await h
      .http()
      .patch(path)
      .set(h.headers('admin'))
      .send(patch)
      .expect(200);
    expect(updated.body).toMatchObject({
      prompt: 'Updated scientific stem',
      promptAr: 'قارن س < ص',
      richContent: patch.richContent,
    });
    examples.push({
      name: '3 Rich question update',
      request: patch,
      response: updated.body,
    });
    const legacy = await h
      .http()
      .patch(path)
      .set(h.headers('admin'))
      .send({ questionTextEn: 'Legacy display edit' })
      .expect(200);
    expect(legacy.body).toMatchObject({ prompt: 'Legacy display edit' });
    expect(legacy.body).not.toHaveProperty('richContent');
    examples.push({
      name: '4 Legacy update clears stale AST',
      request: { questionTextEn: 'Legacy display edit' },
      response: legacy.body,
    });
    await h
      .http()
      .patch(path)
      .set(h.headers('admin'))
      .send({ richContent: rich('Visible scientific stem') })
      .expect(200);
    // Bind first, then reference the genuine question binding. Private bytes use ST07.
    const ready = await h.fixture.readyGrade(graph.assessment.id, 'admin');
    const binding = await h
      .http()
      .post(
        `/api/v1/grades/assessments/${graph.assessment.id}/questions/${q.id}/assets`,
      )
      .set(h.headers('admin'))
      .send({
        sourceType: 'MANAGED_FILE',
        fileId: ready.fileId,
        uploadId: ready.uploadId,
      })
      .expect(201);
    // The upload and binding share the exact authorized uploader.
    expect((binding.body as { asset: unknown }).asset).toBeDefined();
    const assetId = (binding.body as { asset: { assetId: string } }).asset
      .assetId;
    const embedded = {
      ...rich(''),
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
                altText: 'Private reference',
              },
            ],
          },
        ],
      },
    };
    const withAsset = await h
      .http()
      .patch(path)
      .set(h.headers('admin'))
      .send({ richContent: embedded })
      .expect(200);
    expect((withAsset.body as { richContent?: unknown }).richContent).toEqual(
      embedded,
    );
    examples.push({
      name: '9 Embedded authorized question asset',
      request: { richContent: embedded },
      response: withAsset.body,
    });
    await h.prisma.gradeAssessment.update({
      where: { id: graph.assessment.id },
      data: { maxScore: 4, type: 'QUIZ' },
    });
    await h.publish(graph);
    const exam = await h
      .http()
      .get(`/api/v1/student/exams/${graph.assessment.id}`)
      .set(h.headers('student'))
      .expect(200);
    const examQuestion = (
      exam.body as {
        stages: Array<{
          questions: Array<{
            id: string;
            answer: null;
            richContent?: unknown;
            options: unknown[];
          }>;
        }>;
      }
    ).stages[0].questions.find((row) => row.id === q.id)!;
    expect(examQuestion.richContent).toEqual(embedded);
    expect(examQuestion.answer).toBeNull();
    expect(JSON.stringify(examQuestion)).not.toMatch(
      /answerKey|isCorrect|objectKey|bucket|signedUrl|fileId/,
    );
    examples.push({
      name: '5 Student Exams question projection',
      request: { method: 'GET', route: '/api/v1/student/exams/:assessmentId' },
      response: examQuestion,
    });
    const preview = `/api/v1/student/exams/${graph.assessment.id}/questions/${q.id}/assets/${assetId}/preview`;
    const bytes = await h
      .http()
      .get(preview)
      .set(h.headers('student'))
      .expect(200);
    expect(Buffer.from(bytes.text)).toEqual(ready.bytes);
    await h.http().head(preview).set(h.headers('student')).expect(200);
    const partial = await h
      .http()
      .get(preview)
      .set(h.headers('student'))
      .set('Range', 'bytes=0-2')
      .expect(206);
    expect(partial.text).toBe(ready.bytes.subarray(0, 3).toString());
    await h
      .http()
      .get(preview)
      .set(h.headers('student'))
      .set('Range', 'bytes=999999-')
      .expect(416);
    await h.http().get(preview).set(h.headers('foreignStudent')).expect(404);
    await h.prisma.gradeAssessment.update({
      where: { id: graph.assessment.id },
      data: { type: 'ASSIGNMENT' },
    });
    const grade = await h
      .http()
      .get(`/api/v1/student/grades/assessments/${graph.assessment.id}`)
      .set(h.headers('student'))
      .expect(200);
    const gradeQuestion = (
      grade.body as { questions: Array<{ id: string; richContent?: unknown }> }
    ).questions.find((row) => row.id === q.id)!;
    expect(gradeQuestion.richContent).toEqual(embedded);
    examples.push({
      name: '6 Student Grades question projection',
      request: {
        method: 'GET',
        route: '/api/v1/student/grades/assessments/:assessmentId',
      },
      response: gradeQuestion,
    });
    await h
      .http()
      .get(`/api/v1/student/exams/${graph.assessment.id}`)
      .set(h.headers('student'))
      .expect(404);
    const submission = await h.prisma.gradeSubmission.create({
      data: {
        schoolId: graph.assessment.schoolId,
        assessmentId: graph.assessment.id,
        termId: graph.assessment.termId,
        studentId: h.fixture.children[0].studentId,
        enrollmentId: h.fixture.children[0].enrollmentId,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });
    const answer = await h.prisma.gradeSubmissionAnswer.create({
      data: {
        schoolId: graph.assessment.schoolId,
        assessmentId: graph.assessment.id,
        submissionId: submission.id,
        questionId: q.id,
        studentId: h.fixture.children[0].studentId,
        maxPoints: 1,
      },
    });
    await h.prisma.gradeSubmissionAnswerOption.create({
      data: {
        schoolId: graph.assessment.schoolId,
        answerId: answer.id,
        optionId: q.options[0].id,
      },
    });
    await h.fixture.grantAssets(h.fixture.actors.teacher.roleId, [
      'grades.submissions.view',
      'grades.submissions.review',
    ]);
    const review = await h
      .http()
      .get(
        `/api/v1/teacher/classroom/${h.fixture.allocations.teacher}/assignments/${graph.assessment.id}/submissions/${submission.id}`,
      )
      .set(h.headers('teacher'))
      .expect(200);
    const reviewQuestion = (
      review.body as {
        submission: {
          answers: Array<{ questionId: string; richContent?: unknown }>;
        };
      }
    ).submission.answers.find((row) => row.questionId === q.id)!;
    expect(reviewQuestion.richContent).toEqual(embedded);
    const reviewPath = `/api/v1/teacher/classroom/${h.fixture.allocations.teacher}/assignments/${graph.assessment.id}/submissions/${submission.id}`;
    const single = await h
      .http()
      .patch(`${reviewPath}/answers/${answer.id}/review`)
      .set(h.headers('teacher'))
      .send({ awardedPoints: 1, reviewerComment: 'Checked' })
      .expect(200);
    const singleValue = single.body as {
      answer: {
        score: number;
        studentAnswer: {
          selectedOptions: Array<{ optionId: string; richContent?: unknown }>;
        };
      };
    };
    expect(singleValue.answer.score).toBe(1);
    expect(singleValue.answer.studentAnswer.selectedOptions).toHaveLength(1);
    expect(singleValue.answer.studentAnswer.selectedOptions[0]).toMatchObject({
      optionId: q.options[0].id,
      richContent: option('A'),
    });
    const bulk = await h
      .http()
      .put(`${reviewPath}/answers/review`)
      .set(h.headers('teacher'))
      .send({ reviews: [{ answerId: answer.id, awardedPoints: 1 }] })
      .expect(200);
    const bulkValue = bulk.body as {
      reviewedCount: number;
      answers: Array<{
        studentAnswer: { selectedOptions: Array<{ richContent?: unknown }> };
      }>;
    };
    expect(bulkValue.reviewedCount).toBe(1);
    expect(
      bulkValue.answers[0].studentAnswer.selectedOptions[0].richContent,
    ).toEqual(option('A'));
    examples.push({
      name: '7 Authorized Teacher review projection',
      request: {
        method: 'GET',
        route:
          '/api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId',
      },
      response: reviewQuestion,
    });
    await h.prisma.gradeAssessmentQuestion.update({
      where: { id: q.id },
      data: { richContent: { contentVersion: 999 } },
    });
    const fallback = await h
      .http()
      .get(`/api/v1/student/grades/assessments/${graph.assessment.id}`)
      .set(h.headers('student'))
      .expect(200);
    const safe = (
      fallback.body as {
        questions: Array<{ id: string; title: string; richContent?: unknown }>;
      }
    ).questions.find((row) => row.id === q.id)!;
    expect(safe).not.toHaveProperty('richContent');
    expect(safe.title).toBe('[Private reference]');
    examples.push({
      name: '8 Unsupported stored AST fallback',
      request: {
        method: 'GET',
        route: '/api/v1/student/grades/assessments/:assessmentId',
      },
      response: safe,
    });
    await h.prisma.gradeAssessmentQuestion.update({
      where: { id: q.id },
      data: { richContent: Prisma.JsonNull },
    });
    const jsonNull = await h
      .http()
      .get(`/api/v1/student/grades/assessments/${graph.assessment.id}`)
      .set(h.headers('student'))
      .expect(200);
    expect(
      (jsonNull.body as { questions: Array<{ id: string }> }).questions.find(
        (row) => row.id === q.id,
      ),
    ).not.toHaveProperty('richContent');
  });
  it('denies unpublished/cross-school reads and invalid or conflicting new rich writes', async () => {
    const graph = await h.fixture.gradeGraph();
    const path = `/api/v1/grades/assessments/${graph.assessment.id}/questions`;
    for (const payload of [
      { contentVersion: 2 },
      { ...rich('Safe'), answerKey: 'Secret' },
    ])
      await h
        .http()
        .post(path)
        .set(h.headers('admin'))
        .send({ type: 'ESSAY', points: 1, richContent: payload })
        .expect(400);
    await h
      .http()
      .post(path)
      .set(h.headers('admin'))
      .send({
        type: 'ESSAY',
        points: 1,
        richContent: rich('Safe'),
        prompt: 'Conflict',
      })
      .expect(400);
    await h
      .http()
      .get(`/api/v1/student/exams/${graph.assessment.id}`)
      .set(h.headers('student'))
      .expect(404);
    await h
      .http()
      .get(`/api/v1/student/grades/assessments/${graph.assessment.id}`)
      .set(h.headers('foreignStudent'))
      .expect(404);
    await h
      .http()
      .patch(`/api/v1/grades/questions/${graph.questions[0].id}`)
      .set(h.headers('foreignTeacher'))
      .send({ richContent: rich('No') })
      .expect(404);
  });
});
