import {
  HomeworkQuestionAssetsHttp,
  st06Json,
  type HttpHomeworkGraph,
} from './homework-question-assets.http';
import type { HomeworkAnswerInput } from '../../src/modules/homework/domain/homework-answer-inputs';

export const st09bcFill = {
  definitionVersion: 1,
  kind: 'fill',
  blanks: [
    { id: 'b2', order: 2 },
    { id: 'b1', order: 1 },
  ],
  segments: [
    { text: 'Capital ' },
    { blankId: 'b1' },
    { text: ' / عاصمة ' },
    { blankId: 'b2' },
  ],
  maxAnswerLength: 1000,
};
export const st09bcMatching = {
  definitionVersion: 1,
  kind: 'matching',
  left: [
    { id: 'l2', order: 2, label: 'Two', labelAr: 'اثنان' },
    { id: 'l1', order: 1, label: 'One' },
  ],
  right: [
    { id: 'r1', order: 1, label: '1' },
    { id: 'r2', order: 2, label: '2' },
    { id: 'r3', order: 3, label: 'Distractor' },
  ],
  reuseRight: false,
};
export const st09bcPrivateSentinel = 'ST09BC_PRIVATE_ACCEPTED_ANSWER_SENTINEL';
export const st09bcQuestionTypes = [
  'SHORT_TEXT',
  'LONG_TEXT',
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'FILL_IN_BLANK',
  'MATCHING',
  'MEDIA',
] as const;
type Question = {
  questionId: string;
  type: string;
  options: Array<{ optionId: string }>;
};
export const st09bcTeacher = (
  h: HomeworkQuestionAssetsHttp,
  g: HttpHomeworkGraph,
) =>
  `/api/v1/teacher/homeworks/classes/${h.fixture.allocations.teacher}/assignments/${g.homework.id}`;
export const st09bcStudent = (g: HttpHomeworkGraph) =>
  `/api/v1/student/homeworks/${g.homework.id}`;

/** Every question/option/asset mutation below goes through actual JWT-backed HTTP. */
export async function createHomeworkEightTypes(h: HomeworkQuestionAssetsHttp) {
  const graph = await h.fixture.graph();
  const teacher = st09bcTeacher(h, graph);
  for (const question of graph.questions)
    await h
      .http()
      .delete(teacher + '/questions/' + question.id)
      .set(h.headers())
      .expect(204);
  const questions = new Map<string, Question>();
  for (const type of st09bcQuestionTypes) {
    const prompt = `Question ${type}`;
    const payload: Record<string, unknown> = {
      type,
      prompt,
      points: 1,
      isRequired: true,
    };
    if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(type))
      payload.options = [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: false },
      ];
    if (type === 'FILL_IN_BLANK') {
      payload.metadata = st09bcFill;
      payload.answerKey = {
        state: 'value',
        value: {
          keyVersion: 1,
          kind: 'fill',
          blanks: ['b1', 'b2'].map((blankId) => ({
            blankId,
            acceptedAnswers: [st09bcPrivateSentinel],
          })),
        },
      };
      payload.richContent = {
        contentVersion: 1,
        kind: 'question',
        stem: {
          language: 'und',
          direction: 'auto',
          blocks: [
            { type: 'paragraph', children: [{ type: 'text', text: prompt }] },
          ],
        },
      };
    }
    if (type === 'MATCHING') {
      payload.metadata = st09bcMatching;
      payload.answerKey = {
        state: 'value',
        value: {
          keyVersion: 1,
          kind: 'matching',
          pairs: [
            { leftId: 'l1', rightId: 'r1' },
            { leftId: 'l2', rightId: 'r2' },
          ],
        },
      };
    }
    if (type === 'MEDIA')
      payload.metadata = {
        definitionVersion: 1,
        kind: 'media',
        answer: { kind: 'text', maxLength: 80, multiline: true },
      };
    const response = await h
      .http()
      .post(teacher + '/questions')
      .set(h.headers())
      .send(payload)
      .expect(201);
    const question = st06Json<{ question: Question }>(response).question;
    expect(question.type).toBe(type.toLowerCase());
    questions.set(type, question);
    await h
      .http()
      .patch(teacher + '/questions/' + question.questionId)
      .set(h.headers())
      .send({ points: 1 })
      .expect(200);
  }
  const media = questions.get('MEDIA')!;
  const binding = await h
    .http()
    .post(teacher + '/questions/' + media.questionId + '/assets')
    .set(h.headers())
    .send({
      sourceType: 'EXTERNAL_HTTPS',
      externalUrl: 'https://media.example.org/st09bc-stimulus.txt',
    })
    .expect(201);
  const mediaAssetId = st06Json<{ asset: { assetId: string } }>(binding).asset
    .assetId;
  await h
    .http()
    .patch(teacher + '/questions/' + media.questionId)
    .set(h.headers())
    .send({
      metadata: {
        definitionVersion: 1,
        kind: 'media',
        source: { kind: 'homeworkQuestionAsset', assetId: mediaAssetId },
        answer: { kind: 'text', maxLength: 80, multiline: true },
      },
    })
    .expect(200);
  await h.fixture.grantAssets(h.fixture.actors.student.roleId, [
    'homework.answers.manage',
    'homework.submissions.save',
    'homework.submissions.submit',
  ]);
  await h.fixture.grantAssets(h.fixture.actors.teacher.roleId, [
    'homework.submissions.review',
  ]);
  const answers: HomeworkAnswerInput[] = st09bcQuestionTypes.map((type) => {
    const question = questions.get(type)!;
    if (type === 'FILL_IN_BLANK')
      return {
        questionId: question.questionId,
        answerJson: {
          blanks: [
            { blankId: 'b2', text: 'القاهرة' },
            { blankId: 'b1', text: 'Student response' },
          ],
        },
      };
    if (type === 'MATCHING')
      return {
        questionId: question.questionId,
        answerJson: {
          pairs: [
            { leftId: 'l2', rightId: 'r1' },
            { leftId: 'l1', rightId: 'r2' },
          ],
        },
      };
    if (question.options.length)
      return {
        questionId: question.questionId,
        selectedOptionIds: [question.options[1].optionId],
      };
    return {
      questionId: question.questionId,
      textAnswer: 'Student text / إجابة الطالب',
    };
  });
  return {
    graph,
    questions,
    answers,
    mediaAssetId,
    teacher,
    student: st09bcStudent(graph),
  };
}
