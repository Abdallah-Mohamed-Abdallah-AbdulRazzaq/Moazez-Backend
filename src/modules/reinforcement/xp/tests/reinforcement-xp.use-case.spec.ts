import {
  AuditOutcome,
  Prisma,
  ReinforcementRewardType,
  ReinforcementSubmissionStatus,
  ReinforcementTargetScope,
  UserType,
  XpSourceType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CreateXpPolicyUseCase } from '../application/create-xp-policy.use-case';
import { GetEffectiveXpPolicyUseCase } from '../application/get-effective-xp-policy.use-case';
import { GetXpSummaryUseCase } from '../application/get-xp-summary.use-case';
import { GrantManualXpUseCase } from '../application/grant-manual-xp.use-case';
import { GrantXpForReinforcementReviewUseCase } from '../application/grant-xp-for-reinforcement-review.use-case';
import { ListXpLedgerUseCase } from '../application/list-xp-ledger.use-case';
import { UpdateXpPolicyUseCase } from '../application/update-xp-policy.use-case';
import { ReinforcementXpRepository } from '../infrastructure/reinforcement-xp.repository';

const SCHOOL_ID = 'school-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const ASSIGNMENT_ID = 'assignment-1';
const SUBMISSION_ID = 'submission-1';

describe('reinforcement XP use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'actor-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: [
          'reinforcement.xp.view',
          'reinforcement.xp.manage',
        ],
      });

      return fn();
    });
  }

  it('creates an XP policy and audits the mutation', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new CreateXpPolicyUseCase(repository, auth);

    const result = await withScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'school',
        dailyCap: 100,
        weeklyCap: 500,
      }),
    );

    expect(repository.createPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        scopeType: ReinforcementTargetScope.SCHOOL,
        scopeKey: SCHOOL_ID,
        dailyCap: 100,
      }),
    );
    expect(result.scopeType).toBe('school');
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.xp.policy.create',
        resourceType: 'xp_policy',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
  });

  it('rejects invalid policy caps and date ranges before create', async () => {
    const repository = baseRepository();
    const useCase = new CreateXpPolicyUseCase(repository, authRepository());

    await expect(
      withScope(() =>
        useCase.execute({
          yearId: YEAR_ID,
          termId: TERM_ID,
          scopeType: 'school',
          dailyCap: 20,
          weeklyCap: 10,
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });

    await expect(
      withScope(() =>
        useCase.execute({
          yearId: YEAR_ID,
          termId: TERM_ID,
          scopeType: 'school',
          startsAt: '2026-05-01T00:00:00.000Z',
          endsAt: '2026-04-01T00:00:00.000Z',
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(repository.createPolicy).not.toHaveBeenCalled();
  });

  it('rejects active policy conflicts', async () => {
    const repository = baseRepository({
      checkActivePolicyConflict: jest.fn().mockResolvedValue(policyRecord()),
      createPolicy: jest.fn(),
    });
    const useCase = new CreateXpPolicyUseCase(repository, authRepository());

    await expect(
      withScope(() =>
        useCase.execute({
          yearId: YEAR_ID,
          termId: TERM_ID,
          scopeType: 'school',
        }),
      ),
    ).rejects.toMatchObject({ code: 'reinforcement.policy.conflict' });
    expect(repository.createPolicy).not.toHaveBeenCalled();
  });

  it('updates an XP policy and audits the mutation', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new UpdateXpPolicyUseCase(repository, auth);

    const result = await withScope(() =>
      useCase.execute('policy-1', { dailyCap: 150 }),
    );

    expect(repository.updatePolicy).toHaveBeenCalledWith('policy-1', {
      dailyCap: 150,
    });
    expect(result.dailyCap).toBe(150);
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reinforcement.xp.policy.update',
        resourceId: 'policy-1',
        before: expect.objectContaining({ dailyCap: null }),
        after: expect.objectContaining({ dailyCap: 150 }),
      }),
    );
  });

  it('checks conflicts when activating an inactive policy', async () => {
    const repository = baseRepository({
      findPolicyById: jest.fn().mockResolvedValue(policyRecord({ isActive: false })),
      checkActivePolicyConflict: jest.fn().mockResolvedValue(
        policyRecord({ id: 'other-policy' }),
      ),
      updatePolicy: jest.fn(),
    });
    const useCase = new UpdateXpPolicyUseCase(repository, authRepository());

    await expect(
      withScope(() => useCase.execute('policy-1', { isActive: true })),
    ).rejects.toMatchObject({ code: 'reinforcement.policy.conflict' });
    expect(repository.updatePolicy).not.toHaveBeenCalled();
  });

  it('resolves the effective policy and falls back to default when absent', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest.fn().mockResolvedValue([
        policyRecord({
          id: 'school-policy',
          scopeType: ReinforcementTargetScope.SCHOOL,
          scopeKey: SCHOOL_ID,
        }),
        policyRecord({
          id: 'student-policy',
          scopeType: ReinforcementTargetScope.STUDENT,
          scopeKey: STUDENT_ID,
        }),
      ]),
    });
    const useCase = new GetEffectiveXpPolicyUseCase(repository);

    const result = await withScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        studentId: STUDENT_ID,
      }),
    );
    expect(result.id).toBe('student-policy');
    expect(result.scopeType).toBe('student');

    (repository.findEffectivePolicyCandidates as jest.Mock).mockResolvedValueOnce([]);
    const fallback = await withScope(() =>
      useCase.execute({ yearId: YEAR_ID, termId: TERM_ID }),
    );
    expect(fallback.isDefault).toBe(true);
    expect(fallback.dailyCap).toBeNull();
  });

  it('lists ledger entries and aggregates summary data', async () => {
    const repository = baseRepository({
      findLedgerForSummary: jest.fn().mockResolvedValue([
        ledgerRecord({ studentId: STUDENT_ID, amount: 30 }),
        ledgerRecord({
          id: 'ledger-2',
          studentId: 'student-2',
          amount: 10,
          sourceType: XpSourceType.MANUAL_BONUS,
        }),
      ]),
    });

    const list = await withScope(() =>
      new ListXpLedgerUseCase(repository).execute({ yearId: YEAR_ID }),
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0].sourceType).toBe('reinforcement_task');

    const summary = await withScope(() =>
      new GetXpSummaryUseCase(repository).execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
      }),
    );
    expect(summary.totalXp).toBe(40);
    expect(summary.studentsCount).toBe(2);
    expect(summary.averageXp).toBe(20);
  });

  it('grants XP for an approved reinforcement submission', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new GrantXpForReinforcementReviewUseCase(repository, auth);

    const result = await withScope(() =>
      useCase.execute(SUBMISSION_ID, { reason: 'approved_task' }),
    );

    expect(repository.createXpLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: XpSourceType.REINFORCEMENT_TASK,
        sourceId: SUBMISSION_ID,
        amount: 25,
        assignmentId: ASSIGNMENT_ID,
      }),
    );
    expect(result.amount).toBe(25);
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reinforcement.xp.grant' }),
    );
  });

  it('rejects non-approved submissions and missing XP amount', async () => {
    const nonApproved = baseRepository({
      findSubmissionForXpGrant: jest
        .fn()
        .mockResolvedValue(submissionRecord(ReinforcementSubmissionStatus.SUBMITTED)),
    });
    await expect(
      withScope(() =>
        new GrantXpForReinforcementReviewUseCase(
          nonApproved,
          authRepository(),
        ).execute(SUBMISSION_ID, {}),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });

    const noXpReward = baseRepository({
      findSubmissionForXpGrant: jest.fn().mockResolvedValue(
        submissionRecord(ReinforcementSubmissionStatus.APPROVED, {
          rewardType: ReinforcementRewardType.MORAL,
          rewardValue: null,
        }),
      ),
    });
    await expect(
      withScope(() =>
        new GrantXpForReinforcementReviewUseCase(
          noXpReward,
          authRepository(),
        ).execute(SUBMISSION_ID, {}),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('returns existing ledger entries for duplicate review grants', async () => {
    const repository = baseRepository({
      findExistingLedgerBySource: jest.fn().mockResolvedValue(ledgerRecord()),
      createXpLedger: jest.fn(),
    });
    const result = await withScope(() =>
      new GrantXpForReinforcementReviewUseCase(
        repository,
        authRepository(),
      ).execute(SUBMISSION_ID, {}),
    );

    expect(result.id).toBe('ledger-1');
    expect(repository.createXpLedger).not.toHaveBeenCalled();
  });

  it('enforces policy caps during XP grant without mutating reviews or assignments', async () => {
    const repository = baseRepository({
      findEffectivePolicyCandidates: jest.fn().mockResolvedValue([
        policyRecord({ dailyCap: 30, weeklyCap: 100 }),
      ]),
      sumXpForPeriod: jest
        .fn()
        .mockResolvedValueOnce(25)
        .mockResolvedValueOnce(25),
      createXpLedger: jest.fn(),
    }) as unknown as ReinforcementXpRepository & Record<string, unknown>;

    await expect(
      withScope(() =>
        new GrantXpForReinforcementReviewUseCase(
          repository,
          authRepository(),
        ).execute(SUBMISSION_ID, { amount: 10 }),
      ),
    ).rejects.toMatchObject({ code: 'reinforcement.xp.daily_cap_reached' });
    expect(repository.createXpLedger).not.toHaveBeenCalled();
    expect(repository.updateSubmission).toBeUndefined();
    expect(repository.updateAssignment).toBeUndefined();
    expect(repository.createReview).toBeUndefined();
  });

  it('grants manual bonus XP and audits the mutation', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const result = await withScope(() =>
      new GrantManualXpUseCase(repository, auth).execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        studentId: STUDENT_ID,
        amount: 10,
        reason: 'Excellent participation',
        dedupeKey: 'manual-1',
      }),
    );

    expect(repository.createXpLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: XpSourceType.MANUAL_BONUS,
        sourceId: 'manual-1',
        amount: 10,
      }),
    );
    expect(result.sourceType).toBe('manual_bonus');
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reinforcement.xp.manual_bonus' }),
    );
  });

  it('returns existing ledger for manual bonuses with the same dedupe key', async () => {
    const repository = baseRepository({
      findExistingLedgerBySource: jest.fn().mockResolvedValue(
        ledgerRecord({
          sourceType: XpSourceType.MANUAL_BONUS,
          sourceId: 'manual-1',
        }),
      ),
      createXpLedger: jest.fn(),
    });

    const result = await withScope(() =>
      new GrantManualXpUseCase(repository, authRepository()).execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        studentId: STUDENT_ID,
        amount: 10,
        reason: 'Excellent participation',
        dedupeKey: 'manual-1',
      }),
    );

    expect(result.sourceId).toBe('manual-1');
    expect(repository.createXpLedger).not.toHaveBeenCalled();
  });

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    const repository = {
      findAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_ID, isActive: true }),
      findTerm: jest.fn().mockResolvedValue({
        id: TERM_ID,
        academicYearId: YEAR_ID,
        isActive: true,
      }),
      findScopeResource: jest.fn().mockImplementation((input) =>
        Promise.resolve(scopeResource(input.scopeType, input.scopeKey)),
      ),
      listPolicies: jest.fn().mockResolvedValue([policyRecord()]),
      findPolicyById: jest.fn().mockResolvedValue(policyRecord()),
      findEffectivePolicyCandidates: jest
        .fn()
        .mockResolvedValue([policyRecord()]),
      createPolicy: jest.fn().mockImplementation((input) =>
        Promise.resolve(policyRecord(input)),
      ),
      updatePolicy: jest.fn().mockImplementation((_id, input) =>
        Promise.resolve(policyRecord({ id: 'policy-1', ...input })),
      ),
      checkActivePolicyConflict: jest.fn().mockResolvedValue(null),
      listLedger: jest.fn().mockResolvedValue({
        items: [ledgerRecord()],
        total: 1,
      }),
      findLedgerForSummary: jest.fn().mockResolvedValue([ledgerRecord()]),
      findSubmissionForXpGrant: jest
        .fn()
        .mockResolvedValue(submissionRecord(ReinforcementSubmissionStatus.APPROVED)),
      findStudent: jest.fn().mockResolvedValue(studentRecord(STUDENT_ID)),
      findEnrollment: jest.fn().mockResolvedValue(enrollmentRecord()),
      resolveEnrollmentForStudent: jest.fn().mockResolvedValue(enrollmentRecord()),
      sumXpForPeriod: jest.fn().mockResolvedValue(0),
      findLatestXpForCooldown: jest.fn().mockResolvedValue(null),
      findExistingLedgerBySource: jest.fn().mockResolvedValue(null),
      createXpLedger: jest.fn().mockImplementation((input) =>
        Promise.resolve(ledgerRecord(input)),
      ),
      ...overrides,
    };

    return repository as unknown as ReinforcementXpRepository;
  }

  function authRepository() {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
  }

  function policyRecord(overrides?: Record<string, unknown>) {
    const now = new Date('2026-04-29T10:00:00.000Z');
    return {
      id: 'policy-1',
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      scopeType: ReinforcementTargetScope.SCHOOL,
      scopeKey: SCHOOL_ID,
      dailyCap: null,
      weeklyCap: null,
      cooldownMinutes: null,
      allowedReasons: null,
      startsAt: null,
      endsAt: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...(overrides ?? {}),
    } as never;
  }

  function ledgerRecord(overrides?: Record<string, unknown>) {
    const now = new Date('2026-04-29T10:00:00.000Z');
    const enrollmentId =
      (overrides?.enrollmentId as string | undefined) ?? ENROLLMENT_ID;
    return {
      id: 'ledger-1',
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      studentId: STUDENT_ID,
      enrollmentId,
      assignmentId: ASSIGNMENT_ID,
      policyId: 'policy-1',
      sourceType: XpSourceType.REINFORCEMENT_TASK,
      sourceId: SUBMISSION_ID,
      amount: 25,
      reason: 'approved_task',
      reasonAr: null,
      actorUserId: 'actor-1',
      occurredAt: now,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      student: studentRecord(
        (overrides?.studentId as string | undefined) ?? STUDENT_ID,
      ),
      enrollment: enrollmentId ? enrollmentRecord({ id: enrollmentId }) : null,
      ...(overrides ?? {}),
    } as never;
  }

  function submissionRecord(
    status: ReinforcementSubmissionStatus,
    reward?: {
      rewardType?: ReinforcementRewardType | null;
      rewardValue?: Prisma.Decimal | null;
    },
  ) {
    return {
      id: SUBMISSION_ID,
      schoolId: SCHOOL_ID,
      assignmentId: ASSIGNMENT_ID,
      taskId: 'task-1',
      stageId: 'stage-1',
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      status,
      currentReviewId: 'review-1',
      reviewedAt: new Date('2026-04-29T10:00:00.000Z'),
      task: {
        id: 'task-1',
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        rewardType: reward?.rewardType ?? ReinforcementRewardType.XP,
        rewardValue: reward?.rewardValue ?? new Prisma.Decimal(25),
        deletedAt: null,
      },
      assignment: {
        id: ASSIGNMENT_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        studentId: STUDENT_ID,
        enrollmentId: ENROLLMENT_ID,
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date('2026-04-29T10:00:00.000Z'),
      },
      student: studentRecord(STUDENT_ID),
      enrollment: enrollmentRecord(),
    } as never;
  }

  function enrollmentRecord(overrides?: Record<string, unknown>) {
    return {
      id: ENROLLMENT_ID,
      studentId: STUDENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      classroomId: 'classroom-1',
      status: 'ACTIVE',
      deletedAt: null,
      classroom: {
        id: 'classroom-1',
        nameAr: 'Classroom AR',
        nameEn: 'Classroom 1',
        sectionId: 'section-1',
        section: {
          id: 'section-1',
          nameAr: 'Section AR',
          nameEn: 'Section 1',
          gradeId: 'grade-1',
          grade: {
            id: 'grade-1',
            nameAr: 'Grade AR',
            nameEn: 'Grade 1',
            stageId: 'stage-1',
            stage: {
              id: 'stage-1',
              nameAr: 'Stage AR',
              nameEn: 'Stage 1',
            },
          },
        },
      },
      ...(overrides ?? {}),
    } as never;
  }

  function studentRecord(id: string) {
    return {
      id,
      firstName: id === STUDENT_ID ? 'Student' : 'Other',
      lastName: 'One',
      status: 'ACTIVE',
      deletedAt: null,
    };
  }

  function scopeResource(
    scopeType: ReinforcementTargetScope,
    scopeKey: string,
  ) {
    if (scopeType === ReinforcementTargetScope.STUDENT) {
      return {
        scopeType,
        scopeKey,
        stageId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
        studentId: scopeKey,
      };
    }

    return {
      scopeType,
      scopeKey,
      stageId:
        scopeType === ReinforcementTargetScope.SCHOOL ? null : 'stage-1',
      gradeId:
        [
          ReinforcementTargetScope.GRADE,
          ReinforcementTargetScope.SECTION,
          ReinforcementTargetScope.CLASSROOM,
        ].includes(scopeType)
          ? 'grade-1'
          : null,
      sectionId:
        [
          ReinforcementTargetScope.SECTION,
          ReinforcementTargetScope.CLASSROOM,
        ].includes(scopeType)
          ? 'section-1'
          : null,
      classroomId:
        scopeType === ReinforcementTargetScope.CLASSROOM ? 'classroom-1' : null,
      studentId: null,
    };
  }
});
