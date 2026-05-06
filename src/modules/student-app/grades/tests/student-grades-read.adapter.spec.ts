import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeScopeType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentGradesReadAdapter } from '../infrastructure/student-grades-read.adapter';

describe('StudentGradesReadAdapter', () => {
  it('lists only visible assessments for current allocated subjects', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
      scopedGradeItemMocks,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(enrollmentFixture());
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([
      { subjectId: 'subject-1' },
    ]);
    scopedGradeAssessmentMocks.findMany.mockResolvedValue([]);
    scopedGradeAssessmentMocks.count.mockResolvedValue(0);
    scopedGradeItemMocks.findMany.mockResolvedValue([]);

    await adapter.listGrades({
      context: contextFixture(),
      query: { type: 'quiz', status: 'published' },
    });

    const assessmentQuery = scopedGradeAssessmentMocks.findMany.mock.calls[0][0];
    expect(assessmentQuery.where).toMatchObject({
      academicYearId: 'year-1',
      termId: 'term-1',
      subjectId: { in: ['subject-1'] },
      type: GradeAssessmentType.QUIZ,
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      lockedAt: null,
      deliveryMode: {
        in: [
          GradeAssessmentDeliveryMode.SCORE_ONLY,
          GradeAssessmentDeliveryMode.QUESTION_BASED,
        ],
      },
      OR: expect.arrayContaining([
        { scopeType: GradeScopeType.CLASSROOM, scopeKey: 'classroom-1' },
      ]),
    });
    expect(assessmentQuery.where).not.toHaveProperty('schoolId');
  });

  it('reads assessment grade detail for the current student only', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
      scopedGradeItemMocks,
      scopedGradeSubmissionMocks,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(enrollmentFixture());
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([
      { subjectId: 'subject-1' },
    ]);
    scopedGradeAssessmentMocks.findFirst.mockResolvedValue({
      id: 'assessment-1',
    });
    scopedGradeItemMocks.findFirst.mockResolvedValue(null);
    scopedGradeSubmissionMocks.findFirst.mockResolvedValue(null);

    await adapter.findAssessmentGrade({
      context: contextFixture(),
      assessmentId: 'assessment-1',
    });

    expect(scopedGradeItemMocks.findFirst.mock.calls[0][0].where).toEqual({
      assessmentId: 'assessment-1',
      studentId: 'student-1',
    });
    expect(scopedGradeSubmissionMocks.findFirst.mock.calls[0][0].where).toEqual({
      assessmentId: 'assessment-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
    });
  });

  it('performs no mutations or platform bypass calls', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
      scopedGradeItemMocks,
      mutationMocks,
      platformBypass,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(enrollmentFixture());
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([]);
    scopedGradeAssessmentMocks.findMany.mockResolvedValue([]);
    scopedGradeAssessmentMocks.count.mockResolvedValue(0);
    scopedGradeItemMocks.findMany.mockResolvedValue([]);

    await adapter.listGrades({ context: contextFixture() });

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

function modelMocks(): {
  findFirst: jest.Mock;
  findFirstOrThrow: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
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
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentGradesReadAdapter;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  scopedTeacherSubjectAllocationMocks: ReturnType<typeof modelMocks>;
  scopedGradeAssessmentMocks: ReturnType<typeof modelMocks>;
  scopedGradeItemMocks: ReturnType<typeof modelMocks>;
  scopedGradeSubmissionMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedEnrollmentMocks = modelMocks();
  const scopedTeacherSubjectAllocationMocks = modelMocks();
  const scopedGradeAssessmentMocks = modelMocks();
  const scopedGradeItemMocks = modelMocks();
  const scopedGradeSubmissionMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      enrollment: scopedEnrollmentMocks,
      teacherSubjectAllocation: scopedTeacherSubjectAllocationMocks,
      gradeAssessment: scopedGradeAssessmentMocks,
      gradeItem: scopedGradeItemMocks,
      gradeSubmission: scopedGradeSubmissionMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentGradesReadAdapter(prisma),
    scopedEnrollmentMocks,
    scopedTeacherSubjectAllocationMocks,
    scopedGradeAssessmentMocks,
    scopedGradeItemMocks,
    scopedGradeSubmissionMocks,
    mutationMocks: {
      enrollmentCreate: scopedEnrollmentMocks.create,
      assessmentCreate: scopedGradeAssessmentMocks.create,
      assessmentUpdate: scopedGradeAssessmentMocks.update,
      assessmentDelete: scopedGradeAssessmentMocks.delete,
      gradeItemCreate: scopedGradeItemMocks.create,
      gradeItemUpdate: scopedGradeItemMocks.update,
      gradeItemDelete: scopedGradeItemMocks.delete,
      submissionCreate: scopedGradeSubmissionMocks.create,
      submissionUpdate: scopedGradeSubmissionMocks.update,
      submissionDelete: scopedGradeSubmissionMocks.delete,
    },
    platformBypass,
  };
}
