import { St11AnswerMediaHttp } from '../fixtures/st11-answer-media.http';
import { st06Json } from '../fixtures/homework-question-assets.http';
import { st09bcTeacher } from '../fixtures/homework-eight-type.fixture';
import { RESPONSE_MODES } from '../../src/common/assessment-answer/response-config';

describe('ST11-A actual closed authoring, recipient projection and frozen configuration', () => {
  jest.setTimeout(180000);
  const h = new St11AnswerMediaHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeAnswerCase());
  afterAll(() => h.close());
  it('Homework authoring normalizes all six modes, omits legacy config and rejects unknown values', async () => {
    const graph = await h.fixture.graph(),
      author = st09bcTeacher(h, graph);
    const path = author + '/questions/' + graph.questions[0].id;
    const before = await h.http().get(path).set(h.headers()).expect(200);
    expect(st06Json<{ question: object }>(before).question).not.toHaveProperty(
      'responseConfig',
    );
    for (const mode of RESPONSE_MODES) {
      const response = await h
        .http()
        .patch(path)
        .set(h.headers())
        .send({ responseConfig: { version: 1, mode } })
        .expect(200);
      expect(
        st06Json<{ question: { responseConfig: unknown } }>(response).question
          .responseConfig,
      ).toEqual({
        version: 1,
        mode,
        ...(mode === 'TEXT_ONLY' ? {} : { maxFiles: 1 }),
      });
    }
    for (const responseConfig of [
      { version: 2, mode: 'FILE_ONLY' },
      { version: 1, mode: 'VIDEO' },
      { version: 1, mode: 'TEXT_ONLY', maxFiles: 1 },
      { version: 1, mode: 'FILE_ONLY', unknown: true },
    ])
      await h
        .http()
        .patch(path)
        .set(h.headers())
        .send({ responseConfig })
        .expect(400);
    await h
      .http()
      .patch(path)
      .set(h.headers())
      .send({ responseConfig: null })
      .expect(200);
    const cleared = await h.http().get(path).set(h.headers()).expect(200);
    expect(st06Json<{ question: object }>(cleared).question).not.toHaveProperty(
      'responseConfig',
    );
  });
  it('Core Grades authoring supports closed configuration without granting Teacher authoring', async () => {
    const assessment = await h.fixture.assessment(),
      collection = `/api/v1/grades/assessments/${assessment.id}/questions`;
    const teacher = await h
      .http()
      .post(collection)
      .set(h.headers())
      .send({
        type: 'ESSAY',
        prompt: 'No new Teacher grant',
        points: 1,
        responseConfig: { version: 1, mode: 'FILE_ONLY' },
      });
    expect([403, 404]).toContain(teacher.status);
    const created = await h
      .http()
      .post(collection)
      .set(h.headers('admin'))
      .send({
        type: 'ESSAY',
        prompt: 'Configured response',
        points: 1,
        responseConfig: { version: 1, mode: 'FILE_ONLY' },
      })
      .expect(201);
    const question = st06Json<{ id: string; responseConfig: unknown }>(created);
    expect(question.responseConfig).toEqual({
      version: 1,
      mode: 'FILE_ONLY',
      maxFiles: 1,
    });
    for (const mode of RESPONSE_MODES)
      await h
        .http()
        .patch('/api/v1/grades/questions/' + question.id)
        .set(h.headers('admin'))
        .send({ responseConfig: { version: 1, mode } })
        .expect(200);
    const wrong = await h
      .http()
      .post(collection)
      .set(h.headers('admin'))
      .send({
        type: 'MCQ_SINGLE',
        prompt: 'Wrong configured type',
        points: 1,
        options: [{ label: 'A', value: 'a', isCorrect: true }],
        responseConfig: { version: 1, mode: 'FILE_ONLY' },
      });
    expect([400, 422]).toContain(wrong.status);
  });
  it.each(['Homework', 'Grades'] as const)(
    '%s recipient receives configuration and author cannot change published/attempted mode',
    async (domain) => {
      const f = await h.setupResponse(domain);
      const read = await h
        .http()
        .get(f.student)
        .set(h.headers('student'))
        .expect(200);
      expect(JSON.stringify(read.body)).toContain(
        '"responseConfig":{"version":1,"mode":"FILE_ONLY","maxFiles":1}',
      );
      const path =
        domain === 'Homework'
          ? f.author + '/questions/' + f.questionId
          : '/api/v1/grades/questions/' + f.questionId;
      const response = await h
        .http()
        .patch(path)
        .set(h.headers(domain === 'Homework' ? 'teacher' : 'admin'))
        .send({ responseConfig: { version: 1, mode: 'TEXT_OR_FILE' } });
      expect([403, 409]).toContain(response.status);
      expect((await h.stored(domain, f.questionId)).responseConfig).toEqual({
        version: 1,
        mode: 'FILE_ONLY',
        maxFiles: 1,
      });
    },
  );
});
