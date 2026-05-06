import {
  GradeAssessmentApprovalStatus,
  GradeItemStatus,
  GradeScopeType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import {
  StudentSubjectsReadAdapter,
  type StudentSubjectAllocationRecord,
} from '../infrastructure/student-subjects-read.adapter';

describe('StudentSubjectsReadAdapter', () => {
  it('lists current classroom and term subjects through scoped Prisma', async () => {
    const { adapter, scopedTeacherSubjectAllocationMocks } = createAdapter();
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([]);

    await expect(adapter.listCurrentSubjects(contextFixture())).resolves.toEqual(
      [],
    );

    const query = scopedTeacherSubjectAllocationMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      classroomId: 'classroom-1',
      termId: 'term-1',
      subject: { is: { isActive: true, deletedAt: null } },
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('returns no subjects without a current term', async () => {
    const { adapter, scopedTeacherSubjectAllocationMocks } = createAdapter();

    await expect(
      adapter.listCurrentSubjects({ ...contextFixture(), termId: null }),
    ).resolves.toEqual([]);
    expect(scopedTeacherSubjectAllocationMocks.findMany).not.toHaveBeenCalled();
  });

  it('summarizes visible grade stats for current student subjects only', async () => {
    const {
      adapter,
      scopedGradeAssessmentMocks,
      scopedGradeItemMocks,
    } = createAdapter();
    scopedGradeAssessmentMocks.findMany.mockResolvedValue([
      { id: 'assessment-1', subjectId: 'subject-1', maxScore: 10 },
    ]);
    scopedGradeItemMocks.findMany.mockResolvedValue([
      {
        assessmentId: 'assessment-1',
        score: 8,
        status: GradeItemStatus.ENTERED,
      },
    ]);

    const result = await adapter.summarizeSubjectGrades({
      context: contextFixture(),
      subjectIds: ['subject-1'],
      classroom: allocationFixture().classroom,
    });

    const assessmentQuery = scopedGradeAssessmentMocks.findMany.mock.calls[0][0];
    expect(assessmentQuery.where).toMatchObject({
      academicYearId: 'year-1',
      termId: 'term-1',
      subjectId: { in: ['subject-1'] },
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

    const gradeItemQuery = scopedGradeItemMocks.findMany.mock.calls[0][0];
    expect(gradeItemQuery.where).toEqual({
      assessmentId: { in: ['assessment-1'] },
      studentId: 'student-1',
    });
    expect(result.get('subject-1')).toMatchObject({
      assessmentsCount: 1,
      gradedCount: 1,
      earnedScore: 8,
      maxScore: 10,
      averagePercent: 80,
    });
  });

  it('performs no mutations or platform bypass calls', async () => {
    const {
      adapter,
      mutationMocks,
      platformBypass,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
      scopedGradeItemMocks,
    } = createAdapter();
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([]);
    scopedTeacherSubjectAllocationMocks.findFirst.mockResolvedValue(null);
    scopedGradeAssessmentMocks.findMany.mockResolvedValue([]);
    scopedGradeItemMocks.findMany.mockResolvedValue([]);

    await adapter.listCurrentSubjects(contextFixture());
    await adapter.findCurrentSubject({
      context: contextFixture(),
      subjectId: 'subject-1',
    });
    await adapter.summarizeSubjectGrades({
      context: contextFixture(),
      subjectIds: ['subject-1'],
      classroom: allocationFixture().classroom,
    });

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

function allocationFixture(): StudentSubjectAllocationRecord {
  return {
    id: 'allocation-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    teacherUser: null,
    subject: {
      id: 'subject-1',
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
      color: null,
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Grade 4A AR',
      nameEn: 'Grade 4A',
      section: {
        id: 'section-1',
        nameAr: 'Section A AR',
        nameEn: 'Section A',
        grade: {
          id: 'grade-1',
          nameAr: 'Grade 4 AR',
          nameEn: 'Grade 4',
          stage: {
            id: 'stage-1',
            nameAr: 'Primary AR',
            nameEn: 'Primary',
          },
        },
      },
    },
  } as StudentSubjectAllocationRecord;
}

function modelMocks(): {
  findFirst: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentSubjectsReadAdapter;
  scopedTeacherSubjectAllocationMocks: ReturnType<typeof modelMocks>;
  scopedGradeAssessmentMocks: ReturnType<typeof modelMocks>;
  scopedGradeItemMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedTeacherSubjectAllocationMocks = modelMocks();
  const scopedGradeAssessmentMocks = modelMocks();
  const scopedGradeItemMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      teacherSubjectAllocation: scopedTeacherSubjectAllocationMocks,
      gradeAssessment: scopedGradeAssessmentMocks,
      gradeItem: scopedGradeItemMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentSubjectsReadAdapter(prisma),
    scopedTeacherSubjectAllocationMocks,
    scopedGradeAssessmentMocks,
    scopedGradeItemMocks,
    mutationMocks: {
      allocationCreate: scopedTeacherSubjectAllocationMocks.create,
      allocationUpdate: scopedTeacherSubjectAllocationMocks.update,
      allocationDelete: scopedTeacherSubjectAllocationMocks.delete,
      assessmentCreate: scopedGradeAssessmentMocks.create,
      assessmentUpdate: scopedGradeAssessmentMocks.update,
      assessmentDelete: scopedGradeAssessmentMocks.delete,
      gradeItemCreate: scopedGradeItemMocks.create,
      gradeItemUpdate: scopedGradeItemMocks.update,
      gradeItemDelete: scopedGradeItemMocks.delete,
    },
    platformBypass,
  };
}
