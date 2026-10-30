import { St11AnswerMediaHttp } from '../fixtures/st11-answer-media.http';
import { st06Json } from '../fixtures/homework-question-assets.http';
import { DashboardAnalyticsSnapshotRepository } from '../../src/modules/dashboard/infrastructure/dashboard-analytics-snapshot.repository';
import { requireDashboardScope } from '../../src/modules/dashboard/dashboard-context';
import type { DashboardAnalyticsQueryContext } from '../../src/modules/dashboard/domain/dashboard-analytics-query';

describe('ST11-A existing manual review and actual pending/progress consumers', () => {
  jest.setTimeout(180000);
  const h = new St11AnswerMediaHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeAnswerCase());
  afterAll(() => h.close());

  async function pending() {
    const context: DashboardAnalyticsQueryContext = {
      generatedAt: new Date(),
      timezone: 'Africa/Cairo',
      range: '30d',
      granularity: 'day',
      startInclusive: new Date('2026-10-01T00:00:00Z'),
      endExclusive: new Date('2026-11-01T00:00:00Z'),
      startCivilDate: '2026-10-01',
      endCivilDate: '2026-10-31',
      hierarchy: {
        academicYearId: h.fixture.school.yearId,
        termId: h.fixture.school.termId,
        gradeId: null,
        sectionId: null,
        classroomId: null,
      },
      explicitlySuppliedKeys: [],
      filtersApplied: [],
      filtersNotApplicable: [],
    };
    const repository = new DashboardAnalyticsSnapshotRepository(h.prisma);
    return h.fixture.asMediaActor('admin', () =>
      repository.loadChartValue(
        requireDashboardScope(),
        'grades.pending_answer_reviews',
        context,
      ),
    );
  }
  it('Core Grades and Teacher Classroom share actual answer persistence, counters and explicit review/sync', async () => {
    const f = await h.setupResponse('Grades', 'FILE_ONLY', true, 1, true);
    expect(await pending()).toBe(0);
    const upload = await h.ready(f.media);
    expect(await pending()).toBe(0);
    const command = { uploadId: upload.ready.uploadId };
    await h
      .http()
      .post(f.media + '/answer-assets')
      .set(h.headers('admin'))
      .send(command)
      .expect(404);
    await h
      .http()
      .post(f.media + '/answer-assets')
      .set(h.headers('student'))
      .send(command)
      .expect(201);
    expect(await pending()).toBe(1);
    const state = await h
      .http()
      .get('/api/v1/grades/submissions/' + f.submissionId)
      .set(h.headers('student'))
      .expect(200);
    expect(
      st06Json<{
        progress: { answeredCount: number; pendingCorrectionCount: number };
      }>(state).progress,
    ).toMatchObject({ answeredCount: 1, pendingCorrectionCount: 1 });
    expect(await h.prisma.gradeItem.count()).toBe(0);
    await h
      .http()
      .post('/api/v1/grades/submissions/' + f.submissionId + '/submit')
      .set(h.headers('student'))
      .send({})
      .expect(201);
    const answer = await h.prisma.gradeSubmissionAnswer.findFirstOrThrow({
      where: { submissionId: f.submissionId! },
    });
    expect(answer.awardedPoints).toBeNull();
    expect(answer.correctionStatus).toBe('PENDING');
    const teacher = `/api/v1/teacher/classroom/${h.fixture.allocations.teacher}/assignments/${f.parentId}/submissions/${f.submissionId}`;
    await h
      .http()
      .patch(teacher + '/answers/' + answer.id + '/review')
      .set(h.headers())
      .send({ awardedPoints: 1 })
      .expect(200);
    expect(await pending()).toBe(0);
    await h
      .http()
      .post(teacher + '/review/finalize')
      .set(h.headers())
      .send({})
      .expect(201);
    const corrected = await h.prisma.gradeSubmission.findUniqueOrThrow({
      where: { id: f.submissionId! },
    });
    expect(corrected.status).toBe('CORRECTED');
    expect(Number(corrected.totalScore)).toBe(1);
    expect(await h.prisma.gradeItem.count()).toBe(0);
    await h
      .http()
      .post(teacher + '/sync-grade-item')
      .set(h.headers())
      .send({})
      .expect(201);
    expect(await h.prisma.gradeItem.count()).toBe(1);
  });
  it('empty opt-in Grade Answers after removal do not count toward pending reviews or progress', async () => {
    const f = await h.setupResponse('Grades'),
      upload = await h.bindReady(f.media);
    expect(await pending()).toBe(1);
    await h
      .http()
      .delete(f.media + '/answer-assets/' + upload.asset.id)
      .set(h.headers('student'))
      .expect(204);
    expect(await h.prisma.gradeSubmissionAnswer.count()).toBe(1); // immutable claim retains its actual Answer
    expect(await pending()).toBe(0);
    const state = await h
      .http()
      .get('/api/v1/grades/submissions/' + f.submissionId)
      .set(h.headers('student'))
      .expect(200);
    expect(
      st06Json<{
        progress: { answeredCount: number; pendingCorrectionCount: number };
      }>(state).progress,
    ).toMatchObject({ answeredCount: 0, pendingCorrectionCount: 0 });
  });
  it('Homework file-only answers retain existing Teacher manual review and explicit rollup', async () => {
    const f = await h.setupResponse('Homework');
    await h.bindReady(f.media);
    await h
      .http()
      .post(f.student + '/submission/submit')
      .set(h.headers('student'))
      .send({})
      .expect(200);
    const submission = await h.prisma.homeworkSubmission.findFirstOrThrow({
      where: { homeworkTargetId: f.contextId },
    });
    const answer = await h.prisma.homeworkSubmissionAnswer.findFirstOrThrow({
      where: { homeworkSubmissionId: submission.id },
    });
    expect(answer.awardedPoints).toBeNull();
    expect(submission.awardedMarks).toBeNull();
    const review = f.author + '/submissions/' + submission.id;
    await h
      .http()
      .patch(review + '/answers/' + answer.id + '/review')
      .set(h.headers())
      .send({ awardedPoints: 1, teacherComment: 'Manually reviewed File' })
      .expect(200);
    await h
      .http()
      .post(review + '/review')
      .set(h.headers())
      .send({})
      .expect(200);
    const reviewed = await h.prisma.homeworkSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });
    expect(reviewed.status).toBe('REVIEWED');
    expect(Number(reviewed.awardedMarks)).toBe(1);
    expect(await h.prisma.gradeItem.count()).toBe(0);
  });
});
