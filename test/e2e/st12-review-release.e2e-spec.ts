import { randomUUID } from 'node:crypto';
import { St12GradesHttp } from '../fixtures/st12-grades.http';
import type { GradeReleasedReviewResponseDto } from '../../src/modules/grades/assessments/dto/grade-review.dto';

describe('ST12-B real Student and Parent audience release, privacy and revocation', () => {
  jest.setTimeout(180000);
  const h = new St12GradesHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeSt12Case());
  afterAll(() => h.close());
  it('separates submitted, manually reviewed, finalized, approved, details and approved-key release', async () => {
    const f = await h.submitDraft(await h.draft());
    for (const audience of ['student', 'parent'] as const)
      await h
        .http()
        .get(h.reviewPath(f, audience))
        .set(h.headers(audience))
        .expect(404);
    await h.manual(f);
    const coreBefore = await h
      .http()
      .get('/api/v1/grades/submissions/' + f.submissionId)
      .set(h.headers('student'))
      .expect(200);
    expect(JSON.stringify(coreBefore.body)).not.toContain(
      'Private reviewer note',
    );
    const legacy = await h
      .http()
      .get(f.student + '/submission')
      .set(h.headers('student'))
      .expect(200);
    expect(JSON.stringify(legacy.body)).not.toContain('Private reviewer note');
    await h.release(f).then((response) => expect(response.status).toBe(409));
    await h.finalize(f);
    await h.release(f).then((response) => expect(response.status).toBe(409));
    await h.approvePaper(f);
    await h
      .release(f, 'KEYS')
      .then((response) => expect(response.status).toBe(409));
    expect(
      await h.prisma.gradeReviewReleasePolicy.count({
        where: { assessmentId: f.assessmentId },
      }),
    ).toBe(0);
    const requestId = randomUUID().toUpperCase();
    await h
      .release(f, 'DETAILS', 'NONE', 0, requestId)
      .then((response) => expect(response.status).toBe(200));
    await h
      .release(f, 'DETAILS', 'NONE', 0, requestId)
      .then((response) => expect(response.status).toBe(200));
    const student = await h
      .http()
      .get(h.reviewPath(f))
      .set(h.headers('student'))
      .expect(200);
    const details = student.body as GradeReleasedReviewResponseDto;
    const coreReleased = await h
      .http()
      .get('/api/v1/grades/submissions/' + f.submissionId)
      .set(h.headers('student'))
      .expect(200);
    expect(JSON.stringify(coreReleased.body)).toContain(
      'Private reviewer note',
    );
    expect(details.level).toBe('DETAILS');
    expect(details.questions[0].answer?.reviewerComment).toBe(
      'Private reviewer note',
    );
    expect(details.questions[0].correctAnswerAvailable).toBe(false);
    expect(JSON.stringify(details)).not.toContain('"correctAnswer":');
    expect(JSON.stringify(details)).not.toContain('"metadata":');
    expect(JSON.stringify(details)).not.toContain('"isCorrect":');
    await h
      .http()
      .get(h.reviewPath(f, 'parent'))
      .set(h.headers('parent'))
      .expect(404);
    await h.approveKey(f);
    await h
      .release(f, 'KEYS', 'DETAILS', 1)
      .then((response) => expect(response.status).toBe(200));
    const keys = await h
      .http()
      .get(h.reviewPath(f))
      .set(h.headers('student'))
      .expect(200);
    expect(
      (keys.body as GradeReleasedReviewResponseDto).questions[0].correctAnswer,
    ).toMatchObject({
      kind: 'numeric',
      reference: { value: '125e-1', unitCode: 'm' },
    });
    const parent = await h
      .http()
      .get(h.reviewPath(f, 'parent'))
      .set(h.headers('parent'))
      .expect(200);
    expect(
      (parent.body as GradeReleasedReviewResponseDto).questions[0]
        .correctAnswerAvailable,
    ).toBe(false);
    expect(
      (parent.body as GradeReleasedReviewResponseDto).questions[0].answer
        ?.reviewerComment,
    ).toBe('Private reviewer note');
    await h
      .http()
      .get(f.student + '/review')
      .set(h.headers('student'))
      .expect(200);
    await h
      .release(f, 'NONE', 'NONE', 1)
      .then((response) => expect(response.status).toBe(409));
    await h
      .release(f, 'NONE', 'NONE', 2)
      .then((response) => expect(response.status).toBe(200));
    for (const audience of ['student', 'parent'] as const)
      await h
        .http()
        .get(h.reviewPath(f, audience))
        .set(h.headers(audience))
        .expect(404);
    const coreRevoked = await h
      .http()
      .get('/api/v1/grades/submissions/' + f.submissionId)
      .set(h.headers('student'))
      .expect(200);
    expect(JSON.stringify(coreRevoked.body)).not.toContain(
      'Private reviewer note',
    );
    const revokedLegacy = await h
      .http()
      .get(f.student + '/submission')
      .set(h.headers('student'))
      .expect(200);
    expect(JSON.stringify(revokedLegacy.body)).not.toContain(
      'Private reviewer note',
    );
    expect(
      await h.prisma.auditLog.count({
        where: {
          resourceId: f.assessmentId,
          action: 'grades.review.release.change',
        },
      }),
    ).toBe(3);
  });
  it('requires current child/student/enrollment ownership and current approval on every read', async () => {
    const f = await h.submitDraft(await h.draft());
    await h.manual(f);
    await h.finalize(f);
    await h.approvePaper(f);
    await h
      .release(f, 'DETAILS', 'DETAILS')
      .then((response) => expect(response.status).toBe(200));
    await h
      .http()
      .get(h.reviewPath(f))
      .set(h.headers('otherStudent'))
      .expect(404);
    await h
      .http()
      .get(h.reviewPath(f))
      .set(h.headers('foreignStudent'))
      .expect(404);
    await h
      .http()
      .get(h.reviewPath(f, 'parent', 1))
      .set(h.headers('parent'))
      .expect(404);
    await h.prisma.studentGuardian.deleteMany({
      where: { studentId: h.fixture.children[0].studentId },
    });
    await h
      .http()
      .get(h.reviewPath(f, 'parent'))
      .set(h.headers('parent'))
      .expect(404);
    await h.prisma.enrollment.update({
      where: { id: h.fixture.children[0].enrollmentId },
      data: { status: 'WITHDRAWN', endedAt: new Date() },
    });
    await h
      .http()
      .get(h.reviewPath(f))
      .set(h.headers('student'))
      .expect((response) => expect([403, 404]).toContain(response.status));
  });
  it('serializes policy versions and never records success for a stale concurrent release', async () => {
    const f = await h.submitDraft(await h.draft());
    await h.manual(f);
    await h.finalize(f);
    await h.approvePaper(f);
    const results = await h.heldLock(
      (tx) =>
        tx.$queryRawUnsafe(
          'SELECT id FROM grade_assessments WHERE id=$1::uuid FOR UPDATE',
          f.assessmentId,
        ),
      [
        () => h.release(f, 'DETAILS', 'NONE', 0),
        () => h.release(f, 'NONE', 'DETAILS', 0),
      ],
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      await h.prisma.auditLog.count({
        where: {
          resourceId: f.assessmentId,
          action: 'grades.review.release.change',
        },
      }),
    ).toBe(1);
  });
  it('gates real answer and paper metadata/bytes on Parent release plus guardian media policy', async () => {
    const draft = await h.draft('SHORT_ANSWER', {
      responseConfig: { version: 1, mode: 'FILE_ONLY', maxFiles: 1 },
    });
    const paper = await h.paperUpload(draft);
    const bound = await h
      .http()
      .post(
        draft.teacher + '/authoring/questions/' + draft.question.id + '/assets',
      )
      .set(h.headers())
      .send({
        sourceType: 'MANAGED_FILE',
        uploadId: paper.ready.uploadId,
        fileId: paper.ready.fileId,
      })
      .expect(201);
    const paperId = String(
      (bound.body as { asset: { assetId: string } }).asset.assetId,
    );
    await h
      .http()
      .post(draft.core + '/publish')
      .set(h.headers('admin'))
      .expect(201);
    await h
      .http()
      .post(draft.student + '/start')
      .set(h.headers('student'))
      .expect(201);
    const submission = await h.prisma.gradeSubmission.findFirstOrThrow({
      where: { assessmentId: draft.assessmentId },
    });
    const mediaPath =
      draft.student +
      '/submissions/' +
      submission.id +
      '/questions/' +
      draft.question.id;
    const bytes = Buffer.from('Private original student response bytes');
    const answerMedia = await h.bindReady(mediaPath, bytes);
    await h
      .http()
      .post(draft.student + '/submission/submit')
      .set(h.headers('student'))
      .expect(201);
    const f = await h.submittedIdentity(draft);
    await h.manual(f);
    await h.finalize(f);
    await h.approvePaper(f);
    await h
      .release(f, 'DETAILS', 'DETAILS')
      .then((response) => expect(response.status).toBe(200));
    const review = h.reviewPath(f, 'parent');
    const answerAssets =
      review +
      '/submissions/' +
      f.submissionId +
      '/questions/' +
      f.question.id +
      '/answer-assets';
    const paperAssets = review + '/questions/' + f.question.id + '/assets';
    await h.http().get(answerAssets).set(h.headers('parent')).expect(404);
    await h.http().get(paperAssets).set(h.headers('parent')).expect(404);
    await h.prisma.schoolAssessmentMediaPolicy.update({
      where: { schoolId: h.fixture.school.schoolId },
      data: { allowGuardianVisibility: true },
    });
    await h.http().get(answerAssets).set(h.headers('parent')).expect(200);
    await h.http().get(paperAssets).set(h.headers('parent')).expect(200);
    const download = answerAssets + '/' + answerMedia.asset.id + '/download';
    await h
      .http()
      .get(download)
      .set(h.headers('parent'))
      .expect(200)
      .expect((response) => {
        expect(response.text).toBe(bytes.toString());
        expect(response.headers['cache-control']).toContain('no-store');
      });
    await h
      .http()
      .get(paperAssets + '/' + paperId + '/download')
      .set(h.headers('parent'))
      .expect(200)
      .expect((response) => expect(response.text).toBe(paper.bytes.toString()));
    await h.http().head(download).set(h.headers('parent')).expect(200);
    await h
      .http()
      .get(download)
      .set(h.headers('parent'))
      .set('Range', 'bytes=0-6')
      .expect(206);
    await h
      .release(f, 'NONE', 'NONE', 1)
      .then((response) => expect(response.status).toBe(200));
    await h.http().get(download).set(h.headers('parent')).expect(404);
    await h.http().head(download).set(h.headers('parent')).expect(404);
    await h.http().get(paperAssets).set(h.headers('parent')).expect(404);
    await h
      .http()
      .get(mediaPath + '/answer-assets/' + answerMedia.asset.id + '/download')
      .set(h.headers('student'))
      .expect(200);
  });

  it('serializes finalization against release without premature disclosure or false success audit', async () => {
    const f = await h.submitDraft(await h.draft());
    await h.manual(f);
    await h.approvePaper(f);
    const results = await h.heldLock(
      (tx) =>
        tx.$queryRawUnsafe(
          'SELECT id FROM grade_assessments WHERE id=$1::uuid FOR UPDATE',
          f.assessmentId,
        ),
      [
        () =>
          h
            .http()
            .post(
              '/api/v1/grades/submissions/' +
                f.submissionId +
                '/review/finalize',
            )
            .set(h.headers('admin')),
        () => h.release(f, 'DETAILS', 'NONE'),
      ],
    );
    expect(results[0].status).toBe(201);
    expect([200, 409]).toContain(results[1].status);
    if (results[1].status === 409)
      await h
        .release(f, 'DETAILS', 'NONE')
        .then((response) => expect(response.status).toBe(200));
    expect(
      await h.prisma.auditLog.count({
        where: {
          resourceId: f.assessmentId,
          action: 'grades.review.release.change',
        },
      }),
    ).toBe(1);
    await h.http().get(h.reviewPath(f)).set(h.headers('student')).expect(200);
  });
});
