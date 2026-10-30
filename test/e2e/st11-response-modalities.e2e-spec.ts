import { St11AnswerMediaHttp } from '../fixtures/st11-answer-media.http';
import type { St10bDomain } from '../fixtures/st10b-runtime.http';

describe('ST11-A real final modality and clear authority', () => {
  jest.setTimeout(180000);
  const h = new St11AnswerMediaHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeAnswerCase());
  afterAll(() => h.close());
  const cases = (['Homework', 'Grades'] as St10bDomain[]).flatMap((domain) =>
    [
      'TEXT_ONLY',
      'FILE_ONLY',
      'TEXT_OR_FILE',
      'TEXT_AND_FILE',
      'FILE_OR_AUDIO',
    ].map((mode) => ({ domain, mode })),
  );
  it.each(cases)(
    '$domain $mode enforces current text and verified File completeness',
    async ({ domain, mode }) => {
      const f = await h.setupResponse(domain, mode);
      const submit = () =>
        h
          .http()
          .post(f.student + '/submission/submit')
          .set(h.headers('student'))
          .send({});
      expect([400, 409, 422]).toContain((await submit()).status);
      if (mode !== 'TEXT_ONLY') await h.bindReady(f.media);
      if (mode === 'TEXT_AND_FILE')
        expect([400, 409, 422]).toContain((await submit()).status);
      if (mode === 'TEXT_ONLY' || mode === 'TEXT_AND_FILE') {
        const path = f.student + '/submission/answers/' + f.questionId;
        await h
          .http()
          .patch(path)
          .set(h.headers('student'))
          .send(
            domain === 'Homework'
              ? { textAnswer: 'Real response text', isDraft: true }
              : { answerText: 'Real response text' },
          )
          .expect(200);
      }
      await submit().expect(domain === 'Homework' ? 200 : 201);
    },
  );
  it.each(['Homework', 'Grades'] as St10bDomain[])(
    '%s allows optional absence but rejects supplied partial TEXT_AND_FILE',
    async (domain) => {
      const f = await h.setupResponse(domain, 'TEXT_AND_FILE', false);
      await h
        .http()
        .patch(f.student + '/submission/answers/' + f.questionId)
        .set(h.headers('student'))
        .send(
          domain === 'Homework'
            ? { textAnswer: 'partial' }
            : { answerText: 'partial' },
        )
        .expect(200);
      const incomplete = await h
        .http()
        .post(f.student + '/submission/submit')
        .set(h.headers('student'))
        .send({});
      expect([400, 409, 422]).toContain(incomplete.status);
      if (domain === 'Homework')
        await h
          .http()
          .patch(f.student + '/submission/answers/' + f.questionId)
          .set(h.headers('student'))
          .send({ clearAnswer: true, isDraft: true })
          .expect(200);
      else
        await h
          .http()
          .patch(f.student + '/submission/answers/' + f.questionId)
          .set(h.headers('student'))
          .send({ answerText: null, answerJson: null })
          .expect(200);
      await h
        .http()
        .post(f.student + '/submission/submit')
        .set(h.headers('student'))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
    },
  );
  it('Homework clearAnswer atomically removes active question assets while preserving claims', async () => {
    const f = await h.setupResponse('Homework'),
      upload = await h.bindReady(f.media);
    await h
      .http()
      .patch(f.student + '/submission/answers/' + f.questionId)
      .set(h.headers('student'))
      .send({ clearAnswer: true, isDraft: true })
      .expect(200);
    const old = await h.prisma.homeworkAnswerAsset.findUniqueOrThrow({
      where: { id: upload.asset.id },
    });
    expect(old.deletedAt).toBeInstanceOf(Date);
    expect(await h.prisma.assessmentAnswerMediaClaim.count()).toBe(1);
    const submit = await h
      .http()
      .post(f.student + '/submission/submit')
      .set(h.headers('student'))
      .send({});
    expect([400, 409, 422]).toContain(submit.status);
  });
});
