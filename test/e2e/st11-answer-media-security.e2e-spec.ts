import { St11AnswerMediaHttp } from '../fixtures/st11-answer-media.http';
import type { St10bDomain } from '../fixtures/st10b-runtime.http';
import {
  deferred,
  postAssessmentUpload,
} from '../fixtures/assessment-media.fixture';

describe('ST11-A real transactional answer media denial and concurrency', () => {
  jest.setTimeout(180000);
  const h = new St11AnswerMediaHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeAnswerCase());
  afterAll(() => h.close());
  const domains: St10bDomain[] = ['Homework', 'Grades'];

  it.each(domains)(
    '%s never replays a capability or READY session for another question',
    async (domain) => {
      const f = await h.setupResponse(domain);
      const upload = await h.ready(f.media);
      const same = await h
        .http()
        .post(f.media + '/answer-uploads')
        .set(h.headers('student'))
        .send(upload.command)
        .expect(201);
      expect(same.body).toMatchObject({
        uploadId: upload.ready.uploadId,
        status: 'READY',
      });
      expect(JSON.stringify(same.body)).not.toContain('uploadCapability');
      const wrong = f.media.replace(f.questionId, f.otherQuestionId);
      const replay = await h
        .http()
        .post(wrong + '/answer-uploads')
        .set(h.headers('student'))
        .send(upload.command)
        .expect(409);
      expect(JSON.stringify(replay.body)).not.toContain(
        upload.intent.uploadCapability!.url,
      );
      for (const op of ['status', 'complete', 'cancel']) {
        const route =
          wrong +
          '/answer-uploads/' +
          upload.ready.uploadId +
          (op === 'status' ? '' : '/' + op);
        await (op === 'status' ? h.http().get(route) : h.http().post(route))
          .set(h.headers('student'))
          .expect(404);
      }
      await h
        .http()
        .post(wrong + '/answer-assets')
        .set(h.headers('student'))
        .send({ uploadId: upload.ready.uploadId })
        .expect(404);
      expect(await h.prisma.assessmentAnswerMediaClaim.count()).toBe(0);
    },
  );
  it.each(domains)(
    '%s repeats live enrollment authorization after a successful READY read',
    async (domain) => {
      const f = await h.setupResponse(domain);
      const upload = await h.ready(f.media);
      await h
        .http()
        .get(f.media + '/answer-uploads/' + upload.ready.uploadId)
        .set(h.headers('student'))
        .expect(200);
      await h.prisma.enrollment.update({
        where: { id: h.fixture.children[0].enrollmentId },
        data: { endedAt: new Date() },
      });
      const denied = await h
        .http()
        .post(f.media + '/answer-assets')
        .set(h.headers('student'))
        .send({ uploadId: upload.ready.uploadId });
      expect([403, 404]).toContain(denied.status);
      expect(await h.prisma.assessmentAnswerMediaClaim.count()).toBe(0);
      expect(await h.prisma.homeworkSubmissionAnswer.count()).toBe(0);
      expect(await h.prisma.gradeSubmissionAnswer.count()).toBe(0);
    },
  );
  it.each(domains)(
    '%s serializes first Answer creation and enforces maxFiles against concurrent binders',
    async (domain) => {
      const f = await h.setupResponse(domain);
      const one = await h.ready(f.media),
        two = await h.ready(f.media, Buffer.from('second concurrent bytes'));
      const results = await Promise.all(
        [one, two].map((upload) =>
          h
            .http()
            .post(f.media + '/answer-assets')
            .set(h.headers('student'))
            .send({ uploadId: upload.ready.uploadId }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(
        results.filter((r) => [400, 409, 422].includes(r.status)),
      ).toHaveLength(1);
      expect(await h.prisma.assessmentAnswerMediaClaim.count()).toBe(1);
      expect(
        await (domain === 'Homework'
          ? h.prisma.homeworkSubmissionAnswer.count()
          : h.prisma.gradeSubmissionAnswer.count()),
      ).toBe(1);
    },
  );
  it.each(domains)(
    '%s rejects a deleted File at final submission after a successful draft bind',
    async (domain) => {
      const f = await h.setupResponse(domain),
        upload = await h.bindReady(f.media);
      await h.prisma.file.update({
        where: { id: upload.asset.fileId },
        data: { deletedAt: new Date() },
      });
      const denied = await h
        .http()
        .post(f.student + '/submission/submit')
        .set(h.headers('student'))
        .send({});
      expect([400, 404, 409, 422]).toContain(denied.status);
      const submission =
        domain === 'Homework'
          ? await h.prisma.homeworkSubmission.findFirstOrThrow({
              where: { homeworkTargetId: f.contextId },
            })
          : await h.prisma.gradeSubmission.findUniqueOrThrow({
              where: { id: f.contextId },
            });
      expect(submission.status).toBe(
        domain === 'Homework' ? 'DRAFT' : 'IN_PROGRESS',
      );
      expect(await h.prisma.assessmentAnswerMediaClaim.count()).toBe(1);
    },
  );
  it.each(domains)(
    '%s performs provider attestation outside locks and settles upload-versus-cancel safely',
    async (domain) => {
      const f = await h.setupResponse(domain),
        upload = await h.prepare(f.media);
      expect(
        (
          await postAssessmentUpload(
            upload.intent.uploadCapability!,
            upload.bytes,
            'text/plain',
          )
        ).status,
      ).toBe(204);
      const entered = deferred(),
        release = deferred();
      const original = h.testSecurity.beforeAttest;
      h.testSecurity.beforeAttest = async (input) => {
        await original?.(input);
        entered.resolve();
        await release.promise;
      };
      const completing = h
        .http()
        .post(
          f.media + '/answer-uploads/' + upload.intent.uploadId + '/complete',
        )
        .set(h.headers('student'))
        .send({})
        .then((response) => response);
      try {
        await entered.promise;
        // A real second transaction can acquire School/parent locks while provider work is paused.
        await h
          .http()
          .get(f.media + '/answer-uploads/' + upload.intent.uploadId)
          .set(h.headers('student'))
          .timeout({ deadline: 5000 })
          .expect(200);
        await h
          .http()
          .post(
            f.media + '/answer-uploads/' + upload.intent.uploadId + '/cancel',
          )
          .set(h.headers('student'))
          .send({})
          .timeout({ deadline: 5000 })
          .expect(201);
      } finally {
        release.resolve();
        h.testSecurity.beforeAttest = original;
      }
      expect([404, 409]).toContain((await completing).status);
      const row = await h.prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.intent.uploadId },
      });
      expect(row.status).toBe('CANCELLED');
      expect(row.fileId).toBeNull();
      expect(await h.prisma.assessmentAnswerMediaClaim.count()).toBe(0);
    },
  );
  it.each(domains)(
    '%s serializes bind versus final submission without a stale required-answer decision',
    async (domain) => {
      const f = await h.setupResponse(domain),
        upload = await h.ready(f.media);
      const [binding, submitting] = await Promise.all([
        h
          .http()
          .post(f.media + '/answer-assets')
          .set(h.headers('student'))
          .send({ uploadId: upload.ready.uploadId })
          .timeout({ deadline: 10000 }),
        h
          .http()
          .post(f.student + '/submission/submit')
          .set(h.headers('student'))
          .send({})
          .timeout({ deadline: 10000 }),
      ]);
      expect(binding.status).toBe(201);
      expect([200, 201, 400, 409, 422]).toContain(submitting.status);
      expect(await h.prisma.assessmentAnswerMediaClaim.count()).toBe(1);
      const submission =
        domain === 'Homework'
          ? await h.prisma.homeworkSubmission.findFirstOrThrow({
              where: { homeworkTargetId: f.contextId },
            })
          : await h.prisma.gradeSubmission.findUniqueOrThrow({
              where: { id: f.contextId },
            });
      expect(submission.status).toBe(
        submitting.status < 300
          ? 'SUBMITTED'
          : domain === 'Homework'
            ? 'DRAFT'
            : 'IN_PROGRESS',
      );
    },
  );
  it.each(domains)(
    '%s serializes replacement versus submit and retains exactly one active binding',
    async (domain) => {
      const f = await h.setupResponse(domain),
        old = await h.bindReady(f.media),
        next = await h.ready(f.media, Buffer.from('racing replacement'));
      const [replacing, submitting] = await Promise.all([
        h
          .http()
          .post(f.media + '/answer-assets')
          .set(h.headers('student'))
          .send({ uploadId: next.ready.uploadId, replaceAssetId: old.asset.id })
          .timeout({ deadline: 10000 }),
        h
          .http()
          .post(f.student + '/submission/submit')
          .set(h.headers('student'))
          .send({})
          .timeout({ deadline: 10000 }),
      ]);
      expect(submitting.status).toBe(domain === 'Homework' ? 200 : 201);
      expect([201, 404, 409]).toContain(replacing.status);
      expect(await h.prisma.assessmentAnswerMediaClaim.count()).toBe(
        replacing.status === 201 ? 2 : 1,
      );
      const count =
        domain === 'Homework'
          ? await h.prisma.homeworkAnswerAsset.count({
              where: { deletedAt: null },
            })
          : await h.prisma.gradeSubmissionAnswerAsset.count({
              where: { deletedAt: null },
            });
      expect(count).toBe(1);
      expect(
        (
          await h.prisma.file.findUniqueOrThrow({
            where: { id: old.asset.fileId },
          })
        ).deletedAt,
      ).toBeNull();
    },
  );
});
