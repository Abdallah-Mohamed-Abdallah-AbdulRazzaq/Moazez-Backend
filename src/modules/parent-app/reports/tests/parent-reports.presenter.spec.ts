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
      disciplinePercentage: 76.92,
      discipline_percentage: 76.92,
    });
    expect(result.discipline).toMatchObject({
      totalIncidents: 5,
      attendanceIncidentCount: 3,
      absenceCount: 1,
      lateCount: 1,
      earlyLeaveCount: 1,
      excusedCount: 0,
      positiveCount: 1,
      negativeCount: 1,
      behaviorPoints: 3,
      total_incidents: 5,
      attendance_incident_count: 3,
      behavior_points: 3,
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

  it('adds discipline to report cards without changing legacy disciplinePercentage', () => {
    const result = ParentReportsPresenter.presentList({ summary: summaryFixture() });

    expect(result.reports[0].summary).toMatchObject({
      academicPercentage: 80,
      behaviorPoints: 3,
      totalXp: 25,
      disciplinePercentage: 76.92,
      discipline: expect.objectContaining({
        totalIncidents: 5,
        attendanceIncidentCount: 3,
        behaviorPoints: 3,
      }),
    });
    expect(JSON.stringify(result)).not.toContain('disciplineScore');
    expect(JSON.stringify(result)).not.toContain('combinedDiscipline');
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
      'reviewedById',
      'submittedById',
      'markedById',
      'metadata',
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
    discipline: {
      totalIncidents: 5,
      attendanceIncidentCount: 3,
      absenceCount: 1,
      lateCount: 1,
      earlyLeaveCount: 1,
      excusedCount: 0,
      positiveCount: 1,
      negativeCount: 1,
      behaviorPoints: 3,
      period: 'current_term',
      dateText: 'current_term',
    },
    xp: {
      child,
      totalXp: 25,
      entriesCount: 1,
      bySource: [{ sourceType: 'system', totalXp: 25, entriesCount: 1 }],
    },
  } as unknown as ParentReportsSummaryReadModel;
}
