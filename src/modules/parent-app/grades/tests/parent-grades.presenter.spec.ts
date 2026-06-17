import { ParentGradesPresenter } from '../presenters/parent-grades.presenter';
import type {
  ParentAssessmentGradeDetailReadResult,
  ParentGradesReadResult,
} from '../infrastructure/parent-grades-read.adapter';

describe('ParentGradesPresenter', () => {
  it('summarizes owned child grade items into safe list views', () => {
    const result = ParentGradesPresenter.presentList(gradesReadResultFixture());

    expect(result.summary).toMatchObject({
      totalEarned: 8,
      totalMax: 10,
      percentage: 80,
      rating: 'very_good',
      motivationalMessage: 'Very good progress',
      completedWeight: 10,
      assessmentCount: 1,
      enteredCount: 1,
      missingCount: 0,
      absentCount: 0,
    });
    expect(result.child).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      displayName: null,
    });
    expect(result.selectedAcademicYear).toMatchObject({
      id: 'year-1',
      name: 'Year',
      nameAr: 'Year AR',
      nameEn: 'Year',
    });
    expect(result.selectedTerm).toMatchObject({
      id: 'term-1',
      academicYearId: 'year-1',
      name: 'Term',
    });
    expect(result.subjects).toEqual([
      expect.objectContaining({
        subjectId: 'subject-1',
        subjectName: 'Math',
        subjectNameAr: 'Math AR',
        subjectNameEn: 'Math',
        totalEarned: 8,
        totalMax: 10,
        totalMarks: 10,
        earnedMarks: 8,
        percentage: 80,
        completedWeight: 10,
        assessmentCount: 1,
        enteredCount: 1,
        missingCount: 0,
        absentCount: 0,
        rating: 'very_good',
        breakdown: [
          expect.objectContaining({
            assessmentId: 'assessment-1',
            score: 8,
            maxScore: 10,
            percentage: 80,
            weight: 10,
            comment: null,
          }),
        ],
      }),
    ]);
    expect(result.assessments[0]).toMatchObject({
      assessmentId: 'assessment-1',
      score: 8,
      maxScore: 10,
      weight: 10,
      percent: 80,
    });
    expect(result.emptyState).toBeNull();
    expect(result.empty_state).toBeNull();
  });

  it('returns a child grades empty state without changing rating behavior', () => {
    const result = ParentGradesPresenter.presentList({
      ...gradesReadResultFixture(),
      assessments: [],
      gradeItems: [],
      total: 0,
    });

    expect(result.summary).toMatchObject({
      totalEarned: 0,
      totalMax: 0,
      percentage: null,
      rating: null,
      motivationalMessage: null,
      completedWeight: 0,
      assessmentCount: 0,
      enteredCount: 0,
      missingCount: 0,
      absentCount: 0,
    });
    expect(result.emptyState).toEqual({
      reason: 'no_visible_grades',
      message: 'No published or approved child grades are available yet.',
    });
  });

  it('presents assessment detail without answers, keys, tenant ids, or schedule ids', () => {
    const result = ParentGradesPresenter.presentAssessmentGradeDetail(
      assessmentDetailFixture(),
    );
    const serialized = JSON.stringify(result);

    expect(result.submission).toMatchObject({
      submissionId: 'submission-1',
      status: 'submitted',
    });
    for (const forbidden of [
      'answerKey',
      'correctAnswer',
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'isCorrect',
      'objectKey',
      'bucket',
      'deletedAt',
      'scheduleId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function gradesReadResultFixture(): ParentGradesReadResult {
  return {
    child: childFixture(),
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
  } as unknown as ParentGradesReadResult;
}

function assessmentDetailFixture(): ParentAssessmentGradeDetailReadResult {
  return {
    child: childFixture(),
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
  } as unknown as ParentAssessmentGradeDetailReadResult;
}

function childFixture() {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function enrollmentFixture() {
  return {
    id: 'enrollment-1',
    schoolId: 'school-1',
    studentId: 'student-1',
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
