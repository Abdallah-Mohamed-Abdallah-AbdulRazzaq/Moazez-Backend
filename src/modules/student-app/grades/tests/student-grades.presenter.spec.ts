import { StudentGradesPresenter } from '../presenters/student-grades.presenter';
import type {
  StudentAssessmentGradeDetailReadResult,
  StudentGradesReadResult,
} from '../infrastructure/student-grades-read.adapter';

describe('StudentGradesPresenter', () => {
  it('summarizes current student grade items into safe list views', () => {
    const result = StudentGradesPresenter.presentList(gradesReadResultFixture());

    expect(result.summary).toEqual({
      totalEarned: 8,
      totalMax: 10,
      percentage: 80,
      total_earned: 8,
      total_max: 10,
    });
    expect(result.subjects).toEqual([
      expect.objectContaining({
        subjectId: 'subject-1',
        totalMarks: 10,
        earnedMarks: 8,
      }),
    ]);
    expect(result.assessments[0]).toMatchObject({
      assessmentId: 'assessment-1',
      score: 8,
      maxScore: 10,
      percent: 80,
    });
  });

  it('presents safe assessment grade detail without answers or keys', () => {
    const result = StudentGradesPresenter.presentAssessmentGradeDetail(
      assessmentDetailFixture(),
    );
    const serialized = JSON.stringify(result);

    expect(result.submission).toMatchObject({
      submissionId: 'submission-1',
      status: 'submitted',
    });
    expect(serialized).not.toContain('answerKey');
    expect(serialized).not.toContain('correctAnswer');
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
  });
});

function gradesReadResultFixture(): StudentGradesReadResult {
  return {
    enrollment: enrollmentFixture(),
    assessments: [assessmentFixture()],
    gradeItems: [
      {
        id: 'grade-item-1',
        assessmentId: 'assessment-1',
        score: 8,
        status: 'ENTERED',
        comment: null,
        enteredAt: new Date('2026-10-04T08:00:00.000Z'),
      },
    ],
    page: 1,
    limit: 50,
    total: 1,
  } as unknown as StudentGradesReadResult;
}

function assessmentDetailFixture(): StudentAssessmentGradeDetailReadResult {
  return {
    enrollment: enrollmentFixture(),
    assessment: assessmentFixture(),
    gradeItem: {
      id: 'grade-item-1',
      assessmentId: 'assessment-1',
      score: 8,
      status: 'ENTERED',
      comment: 'Visible feedback',
      enteredAt: new Date('2026-10-04T08:00:00.000Z'),
    },
    submission: {
      id: 'submission-1',
      assessmentId: 'assessment-1',
      status: 'SUBMITTED',
      totalScore: 8,
      maxScore: 10,
      submittedAt: new Date('2026-10-04T08:30:00.000Z'),
      correctedAt: new Date('2026-10-05T08:00:00.000Z'),
    },
  } as unknown as StudentAssessmentGradeDetailReadResult;
}

function enrollmentFixture() {
  return {
    id: 'enrollment-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    academicYear: { id: 'year-1', nameAr: 'Year AR', nameEn: 'Year' },
    term: { id: 'term-1', nameAr: 'Term AR', nameEn: 'Term' },
    classroom: {
      id: 'classroom-1',
      section: {
        id: 'section-1',
        grade: {
          id: 'grade-1',
          stage: { id: 'stage-1' },
        },
      },
    },
  };
}

function assessmentFixture() {
  return {
    id: 'assessment-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    subjectId: 'subject-1',
    titleEn: 'Quiz 1',
    titleAr: null,
    type: 'QUIZ',
    deliveryMode: 'QUESTION_BASED',
    date: new Date('2026-10-01T00:00:00.000Z'),
    weight: 10,
    maxScore: 10,
    expectedTimeMinutes: 30,
    approvalStatus: 'PUBLISHED',
    lockedAt: null,
    subject: {
      id: 'subject-1',
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
  };
}
