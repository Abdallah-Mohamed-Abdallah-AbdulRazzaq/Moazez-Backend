import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetMode,
  HomeworkTargetStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePublicationStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { DomainException } from '../../../common/exceptions/domain-exception';
import {
  CancelHomeworkAssignmentUseCase,
  CloseHomeworkAssignmentUseCase,
  CreateHomeworkAssignmentUseCase,
  ListHomeworkTargetsUseCase,
  PublishHomeworkAssignmentUseCase,
  ResolveHomeworkTargetsUseCase,
  UpdateHomeworkAssignmentUseCase,
} from '../application/homework-assignments.use-cases';
import { presentHomeworkAssignment } from '../presenters/homework-assignment.presenter';

describe('Homework assignment use cases', () => {
  async function withScope<T>(testFn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'actor-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'homework.assignments.view',
          'homework.assignments.manage',
          'homework.targets.view',
          'homework.targets.manage',
        ],
      });

      return testFn();
    });
  }

  function createRepository(overrides?: Record<string, unknown>): any {
    const repo = {
      listAssignments: jest.fn(),
      findAssignmentById: jest.fn().mockResolvedValue(seedAssignment()),
      createAssignmentWithTargets: jest
        .fn()
        .mockImplementation(async (data) =>
          seedAssignment({ id: data.id, counters: counters(2) }),
        ),
      updateAssignmentWithTargets: jest
        .fn()
        .mockImplementation(async (id, data) =>
          seedAssignment({ id, ...data, counters: counters(2) }),
        ),
      replaceTargets: jest
        .fn()
        .mockImplementation(async (id, targets) =>
          seedAssignment({ id, counters: counters(targets.length) }),
        ),
      publishAssignmentWithTargets: jest
        .fn()
        .mockImplementation(async (id, data, targets) =>
          seedAssignment({
            id,
            ...data,
            counters: counters(targets.length),
          }),
        ),
      updateAssignmentStatus: jest
        .fn()
        .mockImplementation(async (id, data) =>
          seedAssignment({ id, ...data }),
        ),
      listTargets: jest.fn().mockResolvedValue([seedTarget()]),
      listQuestions: jest.fn().mockResolvedValue([]),
      listCurrentTargetStudentIds: jest
        .fn()
        .mockResolvedValue([
          { studentId: 'student-1' },
          { studentId: 'student-2' },
        ]),
      findTeacherAllocationById: jest.fn().mockResolvedValue(seedAllocation()),
      findTimetableEntryById: jest.fn().mockResolvedValue(seedTimetableEntry()),
      findEligibleEnrollments: jest
        .fn()
        .mockResolvedValue([
          seedEnrollment('student-1'),
          seedEnrollment('student-2'),
        ]),
      isPublishedTimetableEntry: jest.fn().mockReturnValue(true),
      ...overrides,
    };

    return repo;
  }

  function createAuthRepository(): any {
    return { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  }

  it('creates a draft assignment from a valid allocation and materializes classroom targets', async () => {
    const repository = createRepository();
    const authRepository = createAuthRepository();
    const useCase = new CreateHomeworkAssignmentUseCase(
      repository,
      authRepository,
    );

    const response = await withScope(() =>
      useCase.execute({
        academicYearId: 'year-1',
        termId: 'term-1',
        teacherSubjectAllocationId: 'allocation-1',
        title: 'Fractions practice',
        targetMode: HomeworkTargetMode.CLASSROOM,
        dueAt: futureIso(),
      }),
    );

    expect(repository.createAssignmentWithTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        classroomId: 'classroom-1',
        subjectId: 'subject-1',
        teacherUserId: 'teacher-1',
        status: HomeworkAssignmentStatus.DRAFT,
      }),
      expect.arrayContaining([
        expect.objectContaining({
          schoolId: 'school-1',
          studentId: 'student-1',
        }),
      ]),
    );
    expect(response.status).toBe('draft');
    expect(JSON.stringify(response)).not.toContain('schoolId');
    expect(JSON.stringify(response)).not.toContain('organizationId');
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'homework.assignment.create' }),
    );
  });

  it('rejects mismatched term, year, and allocation context', async () => {
    const useCase = new CreateHomeworkAssignmentUseCase(
      createRepository(),
      createAuthRepository(),
    );

    await expect(
      withScope(() =>
        useCase.execute({
          academicYearId: 'year-2',
          termId: 'term-1',
          teacherSubjectAllocationId: 'allocation-1',
          title: 'Mismatch',
          targetMode: HomeworkTargetMode.CLASSROOM,
          dueAt: futureIso(),
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.assignment.allocation_mismatch',
    });
  });

  it('rejects invalid due dates', async () => {
    const useCase = new CreateHomeworkAssignmentUseCase(
      createRepository(),
      createAuthRepository(),
    );

    await expect(
      withScope(() =>
        useCase.execute({
          academicYearId: 'year-1',
          termId: 'term-1',
          teacherSubjectAllocationId: 'allocation-1',
          title: 'Past due',
          targetMode: HomeworkTargetMode.CLASSROOM,
          dueAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.assignment.due_date_invalid',
    });
  });

  it('rejects schedule linkage mismatch', async () => {
    const repository = createRepository({
      findTimetableEntryById: jest
        .fn()
        .mockResolvedValue(seedTimetableEntry({ subjectId: 'subject-2' })),
    });
    const useCase = new CreateHomeworkAssignmentUseCase(
      repository,
      createAuthRepository(),
    );

    await expect(
      withScope(() =>
        useCase.execute({
          academicYearId: 'year-1',
          termId: 'term-1',
          teacherSubjectAllocationId: 'allocation-1',
          timetableEntryId: 'entry-1',
          scheduleDate: '2026-09-12',
          title: 'Linked homework',
          targetMode: HomeworkTargetMode.CLASSROOM,
          dueAt: futureIso(),
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.assignment.schedule_mismatch',
    });
  });

  it('publishes a classroom assignment and refreshes final targets', async () => {
    const repository = createRepository();
    const useCase = new PublishHomeworkAssignmentUseCase(
      repository,
      createAuthRepository(),
    );

    const response = await withScope(() => useCase.execute('homework-1'));

    expect(repository.publishAssignmentWithTargets).toHaveBeenCalledWith(
      'homework-1',
      expect.objectContaining({
        status: HomeworkAssignmentStatus.PUBLISHED,
        publishedByUserId: 'actor-1',
      }),
      expect.arrayContaining([
        expect.objectContaining({ studentId: 'student-1' }),
        expect.objectContaining({ studentId: 'student-2' }),
      ]),
    );
    expect(response.status).toBe('published');
    expect(response.counters.totalTargets).toBe(2);
  });

  it('publishes selected students only', async () => {
    const repository = createRepository({
      findAssignmentById: jest.fn().mockResolvedValue(
        seedAssignment({
          targetMode: HomeworkTargetMode.SELECTED_STUDENTS,
          counters: counters(2),
        }),
      ),
    });
    const useCase = new PublishHomeworkAssignmentUseCase(
      repository,
      createAuthRepository(),
    );

    await withScope(() => useCase.execute('homework-1'));

    expect(repository.findEligibleEnrollments).toHaveBeenCalledWith(
      expect.objectContaining({
        studentIds: ['student-1', 'student-2'],
      }),
    );
    expect(repository.publishAssignmentWithTargets.mock.calls[0][2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentId: 'student-1' }),
        expect.objectContaining({ studentId: 'student-2' }),
      ]),
    );
  });

  it('rejects publish with no eligible targets', async () => {
    const useCase = new PublishHomeworkAssignmentUseCase(
      createRepository({
        findEligibleEnrollments: jest.fn().mockResolvedValue([]),
      }),
      createAuthRepository(),
    );

    await expect(
      withScope(() => useCase.execute('homework-1')),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.assignment.no_eligible_targets',
    });
  });

  it('blocks update after publish', async () => {
    const useCase = new UpdateHomeworkAssignmentUseCase(
      createRepository({
        findAssignmentById: jest.fn().mockResolvedValue(
          seedAssignment({
            status: HomeworkAssignmentStatus.PUBLISHED,
          }),
        ),
      }),
      createAuthRepository(),
    );

    await expect(
      withScope(() =>
        useCase.execute('homework-1', {
          title: 'Published change',
        }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'homework.assignment.not_mutable',
    });
  });

  it('closes a published assignment without submission or grade side effects', async () => {
    const repository = createRepository({
      findAssignmentById: jest.fn().mockResolvedValue(
        seedAssignment({
          status: HomeworkAssignmentStatus.PUBLISHED,
        }),
      ),
    });
    const useCase = new CloseHomeworkAssignmentUseCase(
      repository,
      createAuthRepository(),
    );

    const response = await withScope(() => useCase.execute('homework-1'));

    expect(repository.updateAssignmentStatus).toHaveBeenCalledWith(
      'homework-1',
      expect.objectContaining({ status: HomeworkAssignmentStatus.CLOSED }),
    );
    expect(response.status).toBe('closed');
    expect((repository as any).createSubmission).toBeUndefined();
    expect((repository as any).createGradeItem).toBeUndefined();
  });

  it('cancels draft and published assignments without deleting targets', async () => {
    const draftRepository = createRepository();
    const publishedRepository = createRepository({
      findAssignmentById: jest
        .fn()
        .mockResolvedValue(
          seedAssignment({ status: HomeworkAssignmentStatus.PUBLISHED }),
        ),
    });

    await withScope(() =>
      new CancelHomeworkAssignmentUseCase(
        draftRepository,
        createAuthRepository(),
      ).execute('homework-draft'),
    );
    await withScope(() =>
      new CancelHomeworkAssignmentUseCase(
        publishedRepository,
        createAuthRepository(),
      ).execute('homework-published'),
    );

    expect(draftRepository.updateAssignmentStatus).toHaveBeenCalledWith(
      'homework-draft',
      expect.objectContaining({ status: HomeworkAssignmentStatus.CANCELLED }),
    );
    expect(publishedRepository.updateAssignmentStatus).toHaveBeenCalledWith(
      'homework-published',
      expect.objectContaining({ status: HomeworkAssignmentStatus.CANCELLED }),
    );
    expect(draftRepository.replaceTargets).not.toHaveBeenCalled();
    expect(publishedRepository.replaceTargets).not.toHaveBeenCalled();
  });

  it('resolves draft targets and records an audit log', async () => {
    const repository = createRepository();
    const authRepository = createAuthRepository();
    const useCase = new ResolveHomeworkTargetsUseCase(
      repository,
      authRepository,
    );

    await withScope(() => useCase.execute('homework-1'));

    expect(repository.replaceTargets).toHaveBeenCalledWith(
      'homework-1',
      expect.arrayContaining([
        expect.objectContaining({ studentId: 'student-1' }),
      ]),
    );
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'homework.targets.resolve' }),
    );
  });

  it('lists safe target response shape', async () => {
    const useCase = new ListHomeworkTargetsUseCase(createRepository());

    const response = await withScope(() => useCase.execute('homework-1'));

    expect(response.items[0]).toEqual(
      expect.objectContaining({
        targetId: 'target-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-student-1',
        student: { id: 'student-1', displayName: 'Sara Learner' },
        status: 'assigned',
      }),
    );
    expect(JSON.stringify(response)).not.toContain('schoolId');
    expect(JSON.stringify(response)).not.toContain('organizationId');
  });

  it('presents counters and omits tenant internals', () => {
    const response = presentHomeworkAssignment(
      seedAssignment({
        counters: {
          ...counters(7),
          [HomeworkTargetStatus.ASSIGNED]: 2,
          [HomeworkTargetStatus.VIEWED]: 1,
          [HomeworkTargetStatus.SUBMITTED]: 1,
          [HomeworkTargetStatus.LATE]: 1,
          [HomeworkTargetStatus.MISSING]: 1,
          [HomeworkTargetStatus.REVIEWED]: 1,
          [HomeworkTargetStatus.EXCUSED]: 0,
        },
      }) as any,
    );

    expect(response.counters).toEqual({
      totalTargets: 7,
      assigned: 2,
      viewed: 1,
      submitted: 1,
      late: 1,
      missing: 1,
      reviewed: 1,
      excused: 0,
    });
    expect(JSON.stringify(response)).not.toContain('schoolId');
    expect(JSON.stringify(response)).not.toContain('organizationId');
  });

  it('keeps graded homework as a placeholder without grade bridge side effects', async () => {
    const repository = createRepository();
    const useCase = new CreateHomeworkAssignmentUseCase(
      repository,
      createAuthRepository(),
    );

    await withScope(() =>
      useCase.execute({
        academicYearId: 'year-1',
        termId: 'term-1',
        teacherSubjectAllocationId: 'allocation-1',
        title: 'Graded placeholder',
        targetMode: HomeworkTargetMode.CLASSROOM,
        dueAt: futureIso(),
        isGraded: true,
        totalMarks: 20,
      }),
    );

    expect((repository as any).createGradeAssessment).toBeUndefined();
    expect((repository as any).createNotification).toBeUndefined();
    expect((repository as any).sendEmail).toBeUndefined();
    expect((repository as any).grantXp).toBeUndefined();
  });
});

function seedAssignment(overrides?: Record<string, unknown>): any {
  const now = new Date('2026-05-24T10:00:00.000Z');
  return {
    id: 'homework-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    subjectId: 'subject-1',
    teacherUserId: 'teacher-1',
    teacherSubjectAllocationId: 'allocation-1',
    timetableEntryId: null,
    scheduleDate: null,
    title: 'Fractions practice',
    description: null,
    mode: HomeworkAssignmentMode.HOMEWORK,
    status: HomeworkAssignmentStatus.DRAFT,
    targetMode: HomeworkTargetMode.CLASSROOM,
    publishAt: null,
    publishedAt: null,
    dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    closedAt: null,
    estimatedMinutes: null,
    totalMarks: null,
    isGraded: false,
    gradeAssessmentId: null,
    createdByUserId: 'actor-1',
    publishedByUserId: null,
    cancelledAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    academicYear: {
      id: 'year-1',
      nameAr: '2026/2027',
      nameEn: '2026/2027',
    },
    term: {
      id: 'term-1',
      nameAr: 'Term 1',
      nameEn: 'Term 1',
      academicYearId: 'year-1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-31'),
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Class A',
      nameEn: 'Class A',
      section: {
        id: 'section-1',
        nameAr: 'A',
        nameEn: 'A',
        grade: {
          id: 'grade-1',
          nameAr: 'Grade 1',
          nameEn: 'Grade 1',
        },
      },
    },
    subject: {
      id: 'subject-1',
      nameAr: 'Math',
      nameEn: 'Math',
      code: 'MATH',
      color: '#2563eb',
    },
    teacherUser: {
      id: 'teacher-1',
      firstName: 'Mona',
      lastName: 'Teacher',
    },
    questions: [],
    attachments: [],
    counters: counters(2),
    ...overrides,
  };
}

function seedAllocation(overrides?: Record<string, unknown>): any {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    term: {
      id: 'term-1',
      academicYearId: 'year-1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-31'),
    },
    classroom: {
      id: 'classroom-1',
      sectionId: 'section-1',
      section: {
        id: 'section-1',
        gradeId: 'grade-1',
        grade: {
          id: 'grade-1',
          stageId: 'stage-1',
        },
      },
    },
    subject: { id: 'subject-1' },
    teacherUser: { id: 'teacher-1' },
    ...overrides,
  };
}

function seedTimetableEntry(overrides?: Record<string, unknown>): any {
  return {
    id: 'entry-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    timetableConfigId: 'config-1',
    classroomId: 'classroom-1',
    subjectId: 'subject-1',
    teacherUserId: 'teacher-1',
    teacherSubjectAllocationId: 'allocation-1',
    status: TimetableEntryStatus.ACTIVE,
    timetableConfig: {
      id: 'config-1',
      status: TimetableConfigStatus.ACTIVE,
      publications: [
        {
          id: 'publication-1',
          status: TimetablePublicationStatus.PUBLISHED,
        },
      ],
    },
    ...overrides,
  };
}

function seedEnrollment(studentId: string): any {
  return {
    id: `enrollment-${studentId}`,
    studentId,
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    status: StudentEnrollmentStatus.ACTIVE,
    student: {
      id: studentId,
      firstName: studentId === 'student-1' ? 'Sara' : 'Omar',
      lastName: 'Learner',
      status: StudentStatus.ACTIVE,
    },
  };
}

function seedTarget(overrides?: Record<string, unknown>): any {
  return {
    id: 'target-1',
    schoolId: 'school-1',
    homeworkAssignmentId: 'homework-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-student-1',
    status: HomeworkTargetStatus.ASSIGNED,
    assignedAt: new Date('2026-05-24T10:00:00.000Z'),
    viewedAt: null,
    submittedAt: null,
    reviewedAt: null,
    excusedAt: null,
    createdAt: new Date('2026-05-24T10:00:00.000Z'),
    updatedAt: new Date('2026-05-24T10:00:00.000Z'),
    student: {
      id: 'student-1',
      firstName: 'Sara',
      lastName: 'Learner',
    },
    ...overrides,
  };
}

function counters(totalTargets: number): any {
  return {
    totalTargets,
    [HomeworkTargetStatus.ASSIGNED]: totalTargets,
    [HomeworkTargetStatus.VIEWED]: 0,
    [HomeworkTargetStatus.SUBMITTED]: 0,
    [HomeworkTargetStatus.LATE]: 0,
    [HomeworkTargetStatus.MISSING]: 0,
    [HomeworkTargetStatus.REVIEWED]: 0,
    [HomeworkTargetStatus.EXCUSED]: 0,
  };
}

function futureIso(): string {
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
}
