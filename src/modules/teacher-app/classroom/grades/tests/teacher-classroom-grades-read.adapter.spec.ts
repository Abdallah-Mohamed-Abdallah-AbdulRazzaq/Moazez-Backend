import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeItemStatus,
  GradeQuestionType,
  GradeSubmissionStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import { TeacherClassroomGradesReadAdapter } from '../infrastructure/teacher-classroom-grades-read.adapter';

describe('TeacherClassroomGradesReadAdapter', () => {
  it('lists assessments inside the owned classroom, subject, and term using scoped Prisma', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.gradeAssessment.findMany.mockResolvedValue([
      assessmentRecordFixture(),
    ]);
    prismaMocks.gradeAssessment.count.mockResolvedValue(1);

    const result = await adapter.listAssessments({
      allocation: allocationFixture(),
      filters: {
        status: 'published',
        type: 'quiz',
        search: 'Unit',
        page: 2,
        limit: 10,
      },
    });

    const query = prismaMocks.gradeAssessment.findMany.mock.calls[0][0];
    expect(result.items).toHaveLength(1);
    expect(query.take).toBe(10);
    expect(query.skip).toBe(10);
    expect(query.where).toMatchObject({
      academicYearId: 'year-1',
      termId: 'term-1',
      subjectId: 'subject-1',
      classroomId: 'classroom-1',
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      lockedAt: null,
      type: GradeAssessmentType.QUIZ,
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('rejects assessment detail outside the owned allocation boundary', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.gradeAssessment.findFirst.mockResolvedValue(null);

    await expect(
      adapter.getAssessmentDetail({
        allocation: allocationFixture(),
        assessmentId: 'other-assessment',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });

    const query = prismaMocks.gradeAssessment.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({
      id: 'other-assessment',
      termId: 'term-1',
      subjectId: 'subject-1',
      classroomId: 'classroom-1',
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('returns detail summaries without answer keys or raw grading metadata', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.gradeAssessment.findFirst.mockResolvedValue(
      assessmentDetailRecordFixture(),
    );
    prismaMocks.gradeItem.groupBy.mockResolvedValue([
      { status: GradeItemStatus.ENTERED, _count: { _all: 2 } },
    ]);
    prismaMocks.gradeSubmission.groupBy.mockResolvedValue([
      { status: GradeSubmissionStatus.SUBMITTED, _count: { _all: 1 } },
    ]);

    const result = await adapter.getAssessmentDetail({
      allocation: allocationFixture(),
      assessmentId: 'assessment-1',
    });
    const json = JSON.stringify(result);

    expect(result.itemStatusCounts.get(GradeItemStatus.ENTERED)).toBe(2);
    expect(
      result.submissionStatusCounts.get(GradeSubmissionStatus.SUBMITTED),
    ).toBe(1);
    expect(result.assessment.questions[0]).toMatchObject({
      id: 'question-1',
      prompt: 'Explain',
    });
    expect(json).not.toContain('answerKey');
    expect(json).not.toContain('metadata');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('builds gradebook rows only from active owned classroom enrollments', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.count.mockResolvedValue(1);
    prismaMocks.gradeAssessment.findMany.mockResolvedValue([
      assessmentRecordFixture(),
    ]);
    prismaMocks.enrollment.findMany.mockResolvedValue([
      enrollmentRecordFixture(),
    ]);
    prismaMocks.gradeItem.findMany.mockResolvedValue([
      gradeItemRecordFixture(),
    ]);

    const result = await adapter.getGradebook({
      allocation: allocationFixture(),
      filters: {
        studentId: 'student-1',
        assessmentId: 'assessment-1',
      },
    });

    const enrollmentWhere =
      prismaMocks.enrollment.findMany.mock.calls[0][0].where;
    const assessmentWhere =
      prismaMocks.gradeAssessment.findMany.mock.calls[0][0].where;

    expect(enrollmentWhere).toMatchObject({
      academicYearId: 'year-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      studentId: 'student-1',
    });
    expect(enrollmentWhere).not.toHaveProperty('schoolId');
    expect(assessmentWhere).toMatchObject({
      id: 'assessment-1',
      termId: 'term-1',
      subjectId: 'subject-1',
      classroomId: 'classroom-1',
    });
    expect(result.enrollments.map((item) => item.studentId)).toEqual([
      'student-1',
    ]);
    expect(JSON.stringify(result)).not.toContain('student-outside');
  });

  it('lists assignment-like cards from GradeAssessment only', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.gradeAssessment.findMany.mockResolvedValue([
      assessmentRecordFixture({
        id: 'assignment-1',
        type: GradeAssessmentType.ASSIGNMENT,
      }),
    ]);
    prismaMocks.gradeAssessment.count.mockResolvedValue(1);
    prismaMocks.gradeItem.groupBy.mockResolvedValue([
      { assessmentId: 'assignment-1', _count: { _all: 1 } },
    ]);

    const result = await adapter.listAssignments({
      allocation: allocationFixture(),
      filters: {},
    });

    const where = prismaMocks.gradeAssessment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      termId: 'term-1',
      subjectId: 'subject-1',
      classroomId: 'classroom-1',
      type: GradeAssessmentType.ASSIGNMENT,
    });
    expect(result.gradedCounts.get('assignment-1')).toBe(1);
  });

  it('does not call mutations from any read method', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.gradeAssessment.findMany.mockResolvedValue([]);
    prismaMocks.gradeAssessment.count.mockResolvedValue(0);
    prismaMocks.enrollment.count.mockResolvedValue(0);
    prismaMocks.enrollment.findMany.mockResolvedValue([]);
    prismaMocks.gradeItem.findMany.mockResolvedValue([]);

    await adapter.listAssessments({ allocation: allocationFixture() });
    await adapter.getGradebook({ allocation: allocationFixture() });
    await adapter.listAssignments({ allocation: allocationFixture() });

    expect(prismaMocks.gradeAssessment.create).not.toHaveBeenCalled();
    expect(prismaMocks.gradeAssessment.update).not.toHaveBeenCalled();
    expect(prismaMocks.gradeAssessment.updateMany).not.toHaveBeenCalled();
    expect(prismaMocks.gradeItem.create).not.toHaveBeenCalled();
    expect(prismaMocks.gradeItem.update).not.toHaveBeenCalled();
    expect(prismaMocks.gradeSubmission.create).not.toHaveBeenCalled();
    expect(prismaMocks.gradeSubmission.update).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: TeacherClassroomGradesReadAdapter;
  prismaMocks: {
    gradeAssessment: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    gradeItem: {
      findMany: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    gradeSubmission: {
      groupBy: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    enrollment: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
} {
  const prismaMocks = {
    gradeAssessment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    gradeItem: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    gradeSubmission: {
      groupBy: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    enrollment: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
  const prisma = { scoped: prismaMocks } as unknown as PrismaService;

  return {
    adapter: new TeacherClassroomGradesReadAdapter(prisma),
    prismaMocks,
  };
}

function allocationFixture(): TeacherAppAllocationRecord {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: null,
    classroom: null,
    term: {
      id: 'term-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
  };
}

function assessmentRecordFixture(overrides?: Record<string, unknown>) {
  return {
    id: 'assessment-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    titleEn: 'Unit Quiz',
    titleAr: null,
    type: GradeAssessmentType.QUIZ,
    deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
    date: new Date('2026-09-15T00:00:00.000Z'),
    weight: 10,
    maxScore: 20,
    expectedTimeMinutes: null,
    approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
    publishedAt: new Date('2026-09-14T10:00:00.000Z'),
    approvedAt: null,
    lockedAt: null,
    createdAt: new Date('2026-09-13T10:00:00.000Z'),
    updatedAt: new Date('2026-09-14T10:00:00.000Z'),
    _count: { items: 1, submissions: 1, questions: 1 },
    ...overrides,
  };
}

function assessmentDetailRecordFixture() {
  return {
    ...assessmentRecordFixture(),
    questions: [
      {
        id: 'question-1',
        type: GradeQuestionType.SHORT_ANSWER,
        prompt: 'Explain',
        points: 5,
        sortOrder: 1,
        required: true,
        _count: { options: 0 },
      },
    ],
  };
}

function enrollmentRecordFixture() {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    classroomId: 'classroom-1',
    student: {
      id: 'student-1',
      firstName: 'Mona',
      lastName: 'Ahmed',
      status: StudentStatus.ACTIVE,
    },
  };
}

function gradeItemRecordFixture() {
  return {
    id: 'item-1',
    assessmentId: 'assessment-1',
    studentId: 'student-1',
    score: 18,
    status: GradeItemStatus.ENTERED,
  };
}
