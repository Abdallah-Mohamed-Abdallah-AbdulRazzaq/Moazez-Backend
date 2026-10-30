import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { St11AnswerMediaHttp } from '../fixtures/st11-answer-media.http';
import { st06Json } from '../fixtures/homework-question-assets.http';
import type { St10bDomain } from '../fixtures/st10b-runtime.http';

describe('ST11-A actual question answer bytes and transactional provenance', () => {
  jest.setTimeout(180000);
  const h = new St11AnswerMediaHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeAnswerCase());
  afterAll(() => h.close());
  const domains: St10bDomain[] = ['Homework', 'Grades'];
  const safe = (body: unknown) => {
    const text = JSON.stringify(body);
    for (const field of [
      'bucket',
      'objectKey',
      'stagingObjectKey',
      'finalObjectKey',
      'assessmentSecurityEvidence',
      'uploadCapability',
      'answerKey',
      'answerMediaClaimId',
    ])
      expect(text).not.toContain('"' + field + '"');
  };
  it.each(domains)(
    '%s binds real private bytes without text, streams ranges, submits and restricts reviewers',
    async (domain) => {
      const f = await h.setupResponse(domain);
      await h.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: h.fixture.school.schoolId },
        data: { allowInlinePreview: true, allowDownload: true },
      });
      const uploaded = await h.ready(f.media);
      expect(await h.prisma.homeworkSubmissionAnswer.count()).toBe(0);
      expect(await h.prisma.gradeSubmissionAnswer.count()).toBe(0);
      const first = await h
        .http()
        .post(f.media + '/answer-assets')
        .set(h.headers('student'))
        .send({ uploadId: uploaded.ready.uploadId })
        .expect(201);
      safe(first.body);
      const asset = st06Json<{ asset: { id: string } }>(first).asset;
      const replay = await h
        .http()
        .post(f.media + '/answer-assets')
        .set(h.headers('student'))
        .send({ uploadId: uploaded.ready.uploadId })
        .expect(201);
      expect(replay.body).toEqual(first.body);
      const content = f.media + '/answer-assets/' + asset.id;
      const full = await h
        .http()
        .get(content + '/download')
        .set(h.headers('student'))
        .expect(200);
      expect(full.text).toBe(uploaded.bytes.toString());
      expect(full.headers['cache-control']).toContain('no-store');
      const partial = await h
        .http()
        .get(content + '/preview')
        .set(h.headers('student'))
        .set('Range', 'bytes=2-6')
        .expect(206);
      expect(partial.text).toBe(uploaded.bytes.subarray(2, 7).toString());
      await h
        .http()
        .head(content + '/download')
        .set(h.headers('student'))
        .expect(200)
        .expect('Content-Length', String(uploaded.bytes.length));
      await h
        .http()
        .get(content + '/download')
        .set(h.headers('student'))
        .set('Range', 'bytes=999999-')
        .expect(416);
      for (const actor of [
        'otherStudent',
        'foreignStudent',
        'parent',
        'otherTeacher',
      ] as const) {
        const denied = await h
          .http()
          .get(content + '/download')
          .set(h.headers(actor));
        expect([403, 404]).toContain(denied.status);
      }
      const submission =
        domain === 'Homework'
          ? await h.prisma.homeworkSubmission.findFirstOrThrow({
              where: { homeworkTargetId: f.contextId },
            })
          : await h.prisma.gradeSubmission.findUniqueOrThrow({
              where: { id: f.contextId },
            });
      const reviewer =
        domain === 'Homework'
          ? f.author +
            '/submissions/' +
            submission.id +
            '/questions/' +
            f.questionId
          : `/api/v1/teacher/classroom/${h.fixture.allocations.teacher}/grades/assessments/${f.parentId}/submissions/${submission.id}/questions/${f.questionId}`;
      await h
        .http()
        .get(reviewer + '/answer-assets/' + asset.id + '/download')
        .set(h.headers())
        .expect(404);
      await h
        .http()
        .post(f.student + '/submission/submit')
        .set(h.headers('student'))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      const reviewBytes = await h
        .http()
        .get(reviewer + '/answer-assets/' + asset.id + '/download')
        .set(h.headers())
        .expect(200);
      expect(reviewBytes.text).toBe(uploaded.bytes.toString());
      const remove = await h.http().delete(content).set(h.headers('student'));
      expect([404, 409]).toContain(remove.status);
      if (domain === 'Homework') {
        const enrollment = await h.prisma.enrollment.findUniqueOrThrow({
          where: { id: h.fixture.children[0].enrollmentId },
        });
        const otherClass = await h.prisma.classroom.findFirstOrThrow({
          where: {
            schoolId: h.fixture.school.schoolId,
            id: { not: enrollment.classroomId },
            deletedAt: null,
          },
        });
        try {
          await h.prisma.enrollment.update({
            where: { id: enrollment.id },
            data: { classroomId: otherClass.id },
          });
          await h
            .http()
            .get(reviewer + '/answer-assets/' + asset.id + '/download')
            .set(h.headers())
            .expect(404);
        } finally {
          await h.prisma.enrollment.update({
            where: { id: enrollment.id },
            data: { classroomId: enrollment.classroomId },
          });
        }
      }
      if (domain === 'Grades') {
        const answer = await h.prisma.gradeSubmissionAnswer.findFirstOrThrow({
          where: { submissionId: submission.id },
        });
        expect(answer.answerText).toBeNull();
        expect(answer.answerJson).toBeNull();
        expect(answer.awardedPoints).toBeNull();
        expect(answer.correctionStatus).toBe('PENDING');
        const [fact] = await h.prisma.$queryRaw<
          Array<{ sqlNull: boolean }>
        >`SELECT answer_json IS NULL AS "sqlNull" FROM grade_submission_answers WHERE id=${answer.id}::uuid`;
        expect(fact.sqlNull).toBe(true);
      }
    },
  );
  it.each(domains)(
    '%s rejects unready binding without creating any Answer and protects immutable intent identity',
    async (domain) => {
      const f = await h.setupResponse(domain);
      const uploaded = await h.prepare(f.media);
      await h
        .http()
        .post(f.media + '/answer-assets')
        .set(h.headers('student'))
        .send({ uploadId: uploaded.intent.uploadId })
        .expect(409);
      expect(await h.prisma.homeworkSubmissionAnswer.count()).toBe(0);
      expect(await h.prisma.gradeSubmissionAnswer.count()).toBe(0);
      const intent =
        await h.prisma.assessmentAnswerUploadIntent.findUniqueOrThrow({
          where: { uploadId: uploaded.intent.uploadId },
        });
      expect(intent.questionId).toBe(f.questionId);
      await expect(
        h.prisma.assessmentAnswerUploadIntent.update({
          where: { id: intent.id },
          data: { questionId: randomUUID() },
        }),
      ).rejects.toThrow();
      await h
        .http()
        .post(
          f.media + '/answer-uploads/' + uploaded.intent.uploadId + '/cancel',
        )
        .set(h.headers('student'))
        .send({})
        .expect(201);
      await h
        .http()
        .post(f.media + '/answer-assets')
        .set(h.headers('student'))
        .send({ uploadId: uploaded.intent.uploadId })
        .expect(409);
      const submit = await h
        .http()
        .post(f.student + '/submission/submit')
        .set(h.headers('student'))
        .send({});
      expect([400, 409, 422]).toContain(submit.status);
    },
  );
  it.each(domains)(
    '%s removes and replaces append-only assets without resurrection or File deletion',
    async (domain) => {
      const f = await h.setupResponse(domain);
      const old = await h.bindReady(f.media);
      await h
        .http()
        .delete(f.media + '/answer-assets/' + old.asset.id)
        .set(h.headers('student'))
        .expect(204);
      await h
        .http()
        .post(f.media + '/answer-assets')
        .set(h.headers('student'))
        .send({ uploadId: old.ready.uploadId })
        .expect(409);
      const next = await h.bindReady(
        f.media,
        Buffer.from('replacement answer bytes'),
      );
      expect(next.asset.id).not.toBe(old.asset.id);
      expect(await h.prisma.assessmentAnswerMediaClaim.count()).toBe(2);
      const file = await h.prisma.file.findUniqueOrThrow({
        where: { id: old.asset.fileId },
      });
      expect(file.deletedAt).toBeNull();
      const table =
        domain === 'Homework'
          ? 'homework_answer_assets'
          : 'grade_submission_answer_assets';
      await expect(
        h.prisma.$executeRaw(
          Prisma.sql`UPDATE ${Prisma.raw(table)} SET file_id=${old.asset.fileId}::uuid WHERE id=${next.asset.id}::uuid`,
        ),
      ).rejects.toThrow();
    },
  );
  it.each(domains)(
    '%s replaces in one transaction and retains the deleted binding',
    async (domain) => {
      const f = await h.setupResponse(domain);
      const old = await h.bindReady(f.media);
      const next = await h.ready(f.media, Buffer.from('atomic replacement'));
      await h
        .http()
        .post(f.media + '/answer-assets')
        .set(h.headers('student'))
        .send({ uploadId: next.ready.uploadId, replaceAssetId: old.asset.id })
        .expect(201);
      const table =
        domain === 'Homework'
          ? 'homework_answer_assets'
          : 'grade_submission_answer_assets';
      const [row] = await h.prisma.$queryRaw<Array<{ deletedAt: Date }>>(
        Prisma.sql`SELECT deleted_at AS "deletedAt" FROM ${Prisma.raw(table)} WHERE id=${old.asset.id}::uuid`,
      );
      expect(row.deletedAt).toBeInstanceOf(Date);
      await expect(
        h.prisma.$executeRaw(
          Prisma.sql`UPDATE ${Prisma.raw(table)} SET deleted_at=NULL WHERE id=${old.asset.id}::uuid`,
        ),
      ).rejects.toThrow();
      await expect(
        h.prisma.$executeRaw(
          Prisma.sql`DELETE FROM ${Prisma.raw(table)} WHERE id=${old.asset.id}::uuid`,
        ),
      ).rejects.toThrow();
    },
  );
});
