import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeScopeType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentExamsReadAdapter } from '../infrastructure/student-exams-read.adapter';

describe('StudentExamsReadAdapter', () => {
  it('lists only visible exam-like assessments for allocated subjects', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
      scopedGradeSubmissionMocks,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(enrollmentFixture());
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([
      { subjectId: 'subject-1' },
    ]);
    scopedGradeAssessmentMocks.findMany.mockResolvedValue([]);
    scopedGradeSubmissionMocks.findMany.mockResolvedValue([]);

    await adapter.listExams({ context: contextFixture() });

    const assessmentQuery = scopedGradeAssessmentMocks.findMany.mock.calls[0][0];
    expect(assessmentQuery.where).toMatchObject({
      academicYearId: 'year-1',
      termId: 'term-1',
      subjectId: { in: ['subject-1'] },
      type: {
        in: [
          GradeAssessmentType.QUIZ,
          GradeAssessmentType.MONTH_EXAM,
          GradeAssessmentType.MIDTERM,
          GradeAssessmentType.TERM_EXAM,
          GradeAssessmentType.FINAL,
        ],
      },
      deliveryMode: {
        in: [
          GradeAssessmentDeliveryMode.SCORE_ONLY,
          GradeAssessmentDeliveryMode.QUESTION_BASED,
        ],
      },
      approvalStatus: {
        in: [
          GradeAssessmentApprovalStatus.PUBLISHED,
          GradeAssessmentApprovalStatus.APPROVED,
        ],
      },
      OR: expect.arrayContaining([
        { scopeType: GradeScopeType.CLASSROOM, scopeKey: 'classroom-1' },
      ]),
    });
    expect(assessmentQuery.where).not.toHaveProperty('schoolId');
    expect(JSON.stringify(assessmentQuery.where)).not.toContain(
      GradeAssessmentType.ASSIGNMENT,
    );
  });

  it('does not select answer keys or correct option flags for exam detail', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
      scopedGradeSubmissionMocks,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(enrollmentFixture());
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([
      { subjectId: 'subject-1' },
    ]);
    scopedGradeAssessmentMocks.findFirst.mockResolvedValue({
      id: 'assessment-1',
    });
    scopedGradeSubmissionMocks.findFirst.mockResolvedValue(null);

    await adapter.findExam({
      context: contextFixture(),
      assessmentId: 'assessment-1',
    });

    const assessmentQuery = scopedGradeAssessmentMocks.findFirst.mock.calls[0][0];
    const serializedSelect = JSON.stringify(assessmentQuery.select);
    expect(assessmentQuery.where.id).toBe('assessment-1');
    expect(serializedSelect).not.toContain('answerKey');
    expect(serializedSelect).not.toContain('isCorrect');
    expect(serializedSelect).not.toContain('schoolId');
  });

  it('reads current student submission state without mutations', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
      scopedGradeSubmissionMocks,
      mutationMocks,
      platformBypass,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(enrollmentFixture());
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([
      { subjectId: 'subject-1' },
    ]);
    scopedGradeAssessmentMocks.findFirst.mockResolvedValue({
      id: 'assessment-1',
    });
    scopedGradeSubmissionMocks.findFirst.mockResolvedValue(null);

    await adapter.findExamSubmission({
      context: contextFixture(),
      assessmentId: 'assessment-1',
    });

    expect(scopedGradeSubmissionMocks.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          assessmentId: 'assessment-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
        },
      }),
    );
    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function enrollmentFixture() {
  return {
    id: 'enrollment-1',
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

function modelMocks(): {
  findFirst: jest.Mock;
  findFirstOrThrow: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
  return {
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentExamsReadAdapter;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  scopedTeacherSubjectAllocationMocks: ReturnType<typeof modelMocks>;
  scopedGradeAssessmentMocks: ReturnType<typeof modelMocks>;
  scopedGradeSubmissionMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedEnrollmentMocks = modelMocks();
  const scopedTeacherSubjectAllocationMocks = modelMocks();
  const scopedGradeAssessmentMocks = modelMocks();
  const scopedGradeSubmissionMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      enrollment: scopedEnrollmentMocks,
      teacherSubjectAllocation: scopedTeacherSubjectAllocationMocks,
      gradeAssessment: scopedGradeAssessmentMocks,
      gradeSubmission: scopedGradeSubmissionMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentExamsReadAdapter(prisma),
    scopedEnrollmentMocks,
    scopedTeacherSubjectAllocationMocks,
    scopedGradeAssessmentMocks,
    scopedGradeSubmissionMocks,
    mutationMocks: {
      assessmentCreate: scopedGradeAssessmentMocks.create,
      assessmentUpdate: scopedGradeAssessmentMocks.update,
      assessmentDelete: scopedGradeAssessmentMocks.delete,
      submissionCreate: scopedGradeSubmissionMocks.create,
      submissionUpdate: scopedGradeSubmissionMocks.update,
      submissionDelete: scopedGradeSubmissionMocks.delete,
    },
    platformBypass,
  };
}
