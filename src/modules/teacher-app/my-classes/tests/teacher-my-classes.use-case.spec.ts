import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppAllocationNotFoundException } from '../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { TeacherAppCompositionReadAdapter } from '../../shared/infrastructure/teacher-app-composition-read.adapter';
import { GetTeacherClassDetailUseCase } from '../application/get-teacher-class-detail.use-case';
import { ListTeacherClassesUseCase } from '../application/list-teacher-classes.use-case';

const TEACHER_ID = 'teacher-1';

describe('Teacher My Classes use cases', () => {
  it('lists only allocations requested for the current teacher', async () => {
    const { listUseCase, allocationReadAdapter } = createUseCases();

    await listUseCase.execute({});

    expect(allocationReadAdapter.listOwnedAllocations).toHaveBeenCalledWith({
      teacherUserId: TEACHER_ID,
      filters: {},
    });
  });

  it('passes search filters and pagination to the read adapter', async () => {
    const { listUseCase, allocationReadAdapter } = createUseCases();

    await listUseCase.execute({
      search: 'math',
      termId: 'term-1',
      subjectId: 'subject-1',
      classroomId: 'classroom-1',
      page: 2,
      limit: 10,
    });

    expect(allocationReadAdapter.listOwnedAllocations).toHaveBeenCalledWith({
      teacherUserId: TEACHER_ID,
      filters: {
        search: 'math',
        termId: 'term-1',
        subjectId: 'subject-1',
        classroomId: 'classroom-1',
        page: 2,
        limit: 10,
      },
    });
  });

  it('maps classId to TeacherSubjectAllocation.id and omits schoolId', async () => {
    const { listUseCase } = createUseCases();

    const result = await listUseCase.execute({});
    const json = JSON.stringify(result);

    expect(result.classes[0]).toMatchObject({
      id: 'allocation-1',
      classId: 'allocation-1',
      classroomId: 'classroom-1',
      subjectId: 'subject-1',
    });
    expect(result.pagination).toEqual({
      page: 1,
      limit: 50,
      total: 1,
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('returns owned class detail', async () => {
    const { detailUseCase, accessService } = createUseCases();

    const result = await detailUseCase.execute('allocation-1');

    expect(accessService.assertTeacherOwnsAllocation).toHaveBeenCalledWith(
      'allocation-1',
    );
    expect(result.class.classId).toBe('allocation-1');
    expect(result.metrics.studentsCount).toBe(24);
  });

  it('rejects another teacher or cross-school class via ownership checks', async () => {
    const { detailUseCase, accessService } = createUseCases();
    accessService.assertTeacherOwnsAllocation.mockRejectedValue(
      new TeacherAppAllocationNotFoundException({
        classId: 'other-allocation',
      }),
    );

    await expect(detailUseCase.execute('other-allocation')).rejects.toMatchObject(
      {
        code: 'teacher_app.allocation.not_found',
      },
    );
  });

  it('does not expose private roster, guardian, medical, or schedule data', async () => {
    const { detailUseCase } = createUseCases();

    const result = await detailUseCase.execute('allocation-1');
    const json = JSON.stringify(result);

    expect(result.rosterPreview).toEqual([]);
    expect(result.attendanceSummary).toBeNull();
    expect(result.gradeSummary).toBeNull();
    expect(result.behaviorSummary).toBeNull();
    expect(result.reinforcementSummary).toBeNull();
    expect(json).not.toContain('guardian');
    expect(json).not.toContain('medical');
    expect(json).not.toContain('scheduleId');
  });
});

function createUseCases(): {
  listUseCase: ListTeacherClassesUseCase;
  detailUseCase: GetTeacherClassDetailUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  allocationReadAdapter: jest.Mocked<TeacherAppAllocationReadAdapter>;
  compositionReadAdapter: jest.Mocked<TeacherAppCompositionReadAdapter>;
} {
  const allocation = allocationFixture();
  const accessService = {
    assertCurrentTeacher: jest.fn(() => ({
      teacherUserId: TEACHER_ID,
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    })),
    assertTeacherOwnsAllocation: jest.fn(() => Promise.resolve(allocation)),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const allocationReadAdapter = {
    listOwnedAllocations: jest.fn(() =>
      Promise.resolve({
        items: [allocation],
        total: 1,
        page: 1,
        limit: 50,
      }),
    ),
  } as unknown as jest.Mocked<TeacherAppAllocationReadAdapter>;
  const compositionReadAdapter = {
    buildClassMetrics: jest.fn(() =>
      Promise.resolve(
        new Map([
          [
            'allocation-1',
            {
              studentsCount: 24,
              activeAssignmentsCount: 2,
              pendingReviewCount: 3,
              followUpCount: null,
              pendingAttendanceCount: null,
              todayAttendanceStatus: null,
              lastAttendanceStatus: null,
              averageGrade: null,
              completionRate: null,
            },
          ],
        ]),
      ),
    ),
  } as unknown as jest.Mocked<TeacherAppCompositionReadAdapter>;

  return {
    listUseCase: new ListTeacherClassesUseCase(
      accessService,
      allocationReadAdapter,
      compositionReadAdapter,
    ),
    detailUseCase: new GetTeacherClassDetailUseCase(
      accessService,
      compositionReadAdapter,
    ),
    accessService,
    allocationReadAdapter,
    compositionReadAdapter,
  };
}

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  const schoolId = 'school-1';

  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: TEACHER_ID,
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId,
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId,
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId,
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId,
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId,
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId,
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
    ...overrides,
  };
}
