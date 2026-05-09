import { ParentReportsPresenter } from '../presenters/parent-reports.presenter';
import type { ParentReportsSummaryReadModel } from '../infrastructure/parent-reports-read.adapter';

describe('ParentReportsPresenter', () => {
  it('presents a basic derived report summary with unavailable deferred sections', () => {
    const result = ParentReportsPresenter.presentSummary(summaryFixture());

    expect(result.child).toMatchObject({
      studentId: 'student-1',
      displayName: 'Sara Child',
    });
    expect(result.academic).toMatchObject({
      totalEarned: 8,
      totalMax: 10,
      percentage: 80,
    });
    expect(result.attendance).toMatchObject({
      presentCount: 10,
      absenceCount: 1,
      lateCount: 2,
    });
    expect(result.unavailable).toMatchObject({
      reportEngine: { available: false },
      pdfExport: { available: false },
      templates: { available: false },
      schedule: { available: false },
      homework: { available: false },
      pickup: { available: false },
    });
  });

  it('does not expose internal, tenant, schedule, document, medical, or raw storage fields', () => {
    const serialized = JSON.stringify(
      ParentReportsPresenter.presentSummary(summaryFixture()),
    );

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'internalNote',
      'medical',
      'document',
      'bucket',
      'objectKey',
      'storageKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function summaryFixture(): ParentReportsSummaryReadModel {
  const child = {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };

  return {
    child,
    profile: {
      id: 'enrollment-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      student: { firstName: 'Sara', lastName: 'Child' },
      academicYear: { id: 'year-1', nameAr: 'Year AR', nameEn: 'Year' },
      term: { id: 'term-1', nameAr: 'Term AR', nameEn: 'Term' },
      classroom: {
        id: 'classroom-1',
        nameAr: 'Class AR',
        nameEn: 'Class',
        section: {
          id: 'section-1',
          nameAr: 'Section AR',
          nameEn: 'Section',
          grade: { id: 'grade-1', nameAr: 'Grade AR', nameEn: 'Grade' },
        },
      },
    },
    academic: {
      child,
      subjects: [
        {
          subjectId: 'subject-1',
          subjectName: 'Math',
          earnedMarks: 8,
          totalMarks: 10,
          percentage: 80,
        },
      ],
      totalEarned: 8,
      totalMax: 10,
      percentage: 80,
    },
    behavior: {
      child,
      attendanceCount: 10,
      absenceCount: 1,
      latenessCount: 2,
      positiveCount: 1,
      negativeCount: 1,
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
    },
    xp: {
      child,
      totalXp: 25,
      entriesCount: 1,
      bySource: [{ sourceType: 'system', totalXp: 25, entriesCount: 1 }],
    },
  } as unknown as ParentReportsSummaryReadModel;
}
