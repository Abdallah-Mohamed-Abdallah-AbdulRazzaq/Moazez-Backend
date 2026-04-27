import {
  AuditOutcome,
  GradeRoundingMode,
  GradeRuleScale,
  GradeScopeType,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { GetEffectiveGradeRuleUseCase } from '../application/get-effective-grade-rule.use-case';
import { UpdateGradeRuleUseCase } from '../application/update-grade-rule.use-case';
import { UpsertGradeRuleUseCase } from '../application/upsert-grade-rule.use-case';
import { GradeAssessmentInvalidScopeException } from '../../shared/domain/grade-scope';
import { GradeTermClosedException } from '../../shared/domain/grade-workflow';
import { GradesRulesRepository } from '../infrastructure/grades-rules.repository';

const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
const YEAR_ID = '22222222-2222-4222-8222-222222222222';
const TERM_ID = '33333333-3333-4333-8333-333333333333';
const GRADE_ID = '44444444-4444-4444-8444-444444444444';
const STAGE_ID = '55555555-5555-4555-8555-555555555555';
const SECTION_ID = '66666666-6666-4666-8666-666666666666';
const CLASSROOM_ID = '77777777-7777-4777-8777-777777777777';

describe('Grades rule use cases', () => {
  async function withGradesScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: SCHOOL_ID,
        roleId: 'role-1',
        permissions: ['grades.rules.view', 'grades.rules.manage'],
      });

      return fn();
    });
  }

  function activeTerm(overrides?: { isActive?: boolean }) {
    return {
      id: TERM_ID,
      academicYearId: YEAR_ID,
      isActive: overrides?.isActive ?? true,
    };
  }

  function ruleRecord(
    overrides?: Partial<{
      id: string;
      scopeType: GradeScopeType;
      scopeKey: string;
      gradeId: string | null;
      passMark: number;
      rounding: GradeRoundingMode;
    }>,
  ) {
    return {
      id: overrides?.id ?? '88888888-8888-4888-8888-888888888888',
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      scopeType: overrides?.scopeType ?? GradeScopeType.SCHOOL,
      scopeKey: overrides?.scopeKey ?? SCHOOL_ID,
      gradeId: overrides?.gradeId ?? null,
      gradingScale: GradeRuleScale.PERCENTAGE,
      passMark: new Prisma.Decimal(overrides?.passMark ?? 50),
      rounding: overrides?.rounding ?? GradeRoundingMode.DECIMAL_2,
      createdAt: new Date('2026-04-26T09:00:00.000Z'),
      updatedAt: new Date('2026-04-26T10:00:00.000Z'),
    };
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      findAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_ID }),
      findTerm: jest.fn().mockResolvedValue(activeTerm()),
      findGrade: jest.fn().mockResolvedValue({
        id: GRADE_ID,
        stageId: STAGE_ID,
      }),
      findStage: jest.fn().mockResolvedValue({ id: STAGE_ID }),
      findSectionWithGrade: jest.fn().mockResolvedValue({
        id: SECTION_ID,
        gradeId: GRADE_ID,
        grade: { stageId: STAGE_ID },
      }),
      findClassroomWithGrade: jest.fn().mockResolvedValue({
        id: CLASSROOM_ID,
        sectionId: SECTION_ID,
        section: {
          gradeId: GRADE_ID,
          grade: { stageId: STAGE_ID },
        },
      }),
      findGradeRule: jest.fn().mockResolvedValue(null),
      findSchoolRule: jest.fn().mockResolvedValue(null),
      findRuleByUniqueScope: jest.fn().mockResolvedValue(null),
      findRuleById: jest.fn().mockResolvedValue(ruleRecord()),
      upsertRule: jest.fn().mockImplementation((data) =>
        Promise.resolve({
          operation: 'create',
          previous: null,
          rule: ruleRecord({
            scopeType: data.scopeType,
            scopeKey: data.scopeKey,
            gradeId: data.gradeId ?? null,
            passMark: Number(data.passMark),
            rounding: data.rounding,
          }),
        }),
      ),
      updateRule: jest.fn().mockImplementation((id, data) =>
        Promise.resolve(
          ruleRecord({
            id,
            passMark: data.passMark === undefined ? 50 : Number(data.passMark),
            rounding: data.rounding ?? GradeRoundingMode.DECIMAL_2,
          }),
        ),
      ),
      ...overrides,
    } as unknown as GradesRulesRepository;
  }

  function authRepository() {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('creates a school rule with default scale and rounding', async () => {
    const repository = baseRepository();
    const auth = authRepository();
    const useCase = new UpsertGradeRuleUseCase(repository, auth as never);

    const result = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'school',
        passMark: 55,
      }),
    );

    expect(repository.upsertRule).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: GradeScopeType.SCHOOL,
        scopeKey: SCHOOL_ID,
        gradeId: null,
        gradingScale: GradeRuleScale.PERCENTAGE,
        rounding: GradeRoundingMode.DECIMAL_2,
      }),
    );
    expect(result).toMatchObject({
      scopeType: 'school',
      scopeKey: SCHOOL_ID,
      gradingScale: 'percentage',
      passMark: 55,
      rounding: 'decimal_2',
    });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.rule.create',
        resourceType: 'grade_rule',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
  });

  it('validates grade ownership when creating a grade rule', async () => {
    const repository = baseRepository({
      findGrade: jest.fn().mockResolvedValue(null),
    });
    const useCase = new UpsertGradeRuleUseCase(
      repository,
      authRepository() as never,
    );

    await expect(
      withGradesScope(() =>
        useCase.execute({
          yearId: YEAR_ID,
          termId: TERM_ID,
          scopeType: 'grade',
          gradeId: GRADE_ID,
          passMark: 60,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.upsertRule).not.toHaveBeenCalled();
  });

  it('rejects mutations in a closed term', async () => {
    const repository = baseRepository({
      findTerm: jest.fn().mockResolvedValue(activeTerm({ isActive: false })),
    });
    const useCase = new UpsertGradeRuleUseCase(
      repository,
      authRepository() as never,
    );

    await expect(
      withGradesScope(() =>
        useCase.execute({
          yearId: YEAR_ID,
          termId: TERM_ID,
          scopeType: 'school',
          passMark: 50,
        }),
      ),
    ).rejects.toBeInstanceOf(GradeTermClosedException);
  });

  it('rejects unsupported write scopes such as classroom', async () => {
    const repository = baseRepository();
    const useCase = new UpsertGradeRuleUseCase(
      repository,
      authRepository() as never,
    );

    await expect(
      withGradesScope(() =>
        useCase.execute({
          yearId: YEAR_ID,
          termId: TERM_ID,
          scopeType: 'classroom',
          scopeId: CLASSROOM_ID,
          passMark: 50,
        }),
      ),
    ).rejects.toBeInstanceOf(GradeAssessmentInvalidScopeException);
  });

  it('updates passMark and rounding without changing rule scope metadata', async () => {
    const repository = baseRepository({
      findRuleById: jest.fn().mockResolvedValue(ruleRecord({ id: 'rule-1' })),
    });
    const auth = authRepository();
    const useCase = new UpdateGradeRuleUseCase(repository, auth as never);

    const result = await withGradesScope(() =>
      useCase.execute('rule-1', {
        passMark: 65,
        rounding: GradeRoundingMode.DECIMAL_1,
      }),
    );

    expect(repository.updateRule).toHaveBeenCalledWith('rule-1', {
      passMark: expect.any(Prisma.Decimal),
      rounding: GradeRoundingMode.DECIMAL_1,
    });
    const updateData = (repository.updateRule as jest.Mock).mock.calls[0][1];
    expect(updateData).not.toHaveProperty('academicYearId');
    expect(updateData).not.toHaveProperty('termId');
    expect(updateData).not.toHaveProperty('scopeType');
    expect(updateData).not.toHaveProperty('scopeKey');
    expect(result).toMatchObject({ passMark: 65, rounding: 'decimal_1' });
    expect(auth.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'grades.rule.update',
        before: expect.objectContaining({ passMark: 50 }),
        after: expect.objectContaining({ passMark: 65 }),
      }),
    );
  });

  it('returns not found for missing or cross-school rules on update', async () => {
    const repository = baseRepository({
      findRuleById: jest.fn().mockResolvedValue(null),
    });
    const useCase = new UpdateGradeRuleUseCase(
      repository,
      authRepository() as never,
    );

    await expect(
      withGradesScope(() =>
        useCase.execute('missing-rule', {
          passMark: 65,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.updateRule).not.toHaveBeenCalled();
  });

  it('returns a grade rule when an exact grade rule exists', async () => {
    const gradeRule = ruleRecord({
      id: 'grade-rule',
      scopeType: GradeScopeType.GRADE,
      scopeKey: GRADE_ID,
      gradeId: GRADE_ID,
      passMark: 58,
    });
    const repository = baseRepository({
      findGradeRule: jest.fn().mockResolvedValue(gradeRule),
    });
    const useCase = new GetEffectiveGradeRuleUseCase(repository);

    const result = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'grade',
        gradeId: GRADE_ID,
      }),
    );

    expect(result).toMatchObject({
      source: 'GRADE',
      ruleId: 'grade-rule',
      scopeType: 'grade',
      gradeId: GRADE_ID,
      passMark: 58,
    });
  });

  it('falls back to a school rule when no grade rule exists', async () => {
    const schoolRule = ruleRecord({ id: 'school-rule', passMark: 52 });
    const repository = baseRepository({
      findSchoolRule: jest.fn().mockResolvedValue(schoolRule),
    });
    const useCase = new GetEffectiveGradeRuleUseCase(repository);

    const result = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'grade',
        gradeId: GRADE_ID,
      }),
    );

    expect(result).toMatchObject({
      source: 'SCHOOL',
      ruleId: 'school-rule',
      scopeType: 'school',
      passMark: 52,
    });
  });

  it('returns the default rule when no stored rule exists', async () => {
    const repository = baseRepository();
    const useCase = new GetEffectiveGradeRuleUseCase(repository);

    const result = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'school',
      }),
    );

    expect(result).toMatchObject({
      source: 'DEFAULT',
      ruleId: null,
      gradingScale: 'percentage',
      passMark: 50,
      rounding: 'decimal_2',
    });
  });

  it('resolves section and classroom lookups upward to the grade rule', async () => {
    const gradeRule = ruleRecord({
      id: 'grade-rule',
      scopeType: GradeScopeType.GRADE,
      scopeKey: GRADE_ID,
      gradeId: GRADE_ID,
    });
    const repository = baseRepository({
      findGradeRule: jest.fn().mockResolvedValue(gradeRule),
    });
    const useCase = new GetEffectiveGradeRuleUseCase(repository);

    const sectionResult = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'section',
        sectionId: SECTION_ID,
      }),
    );
    const classroomResult = await withGradesScope(() =>
      useCase.execute({
        yearId: YEAR_ID,
        termId: TERM_ID,
        scopeType: 'classroom',
        classroomId: CLASSROOM_ID,
      }),
    );

    expect(sectionResult).toMatchObject({
      source: 'GRADE',
      ruleId: 'grade-rule',
      resolvedFrom: expect.objectContaining({
        requestedScopeType: 'section',
        gradeId: GRADE_ID,
      }),
    });
    expect(classroomResult).toMatchObject({
      source: 'GRADE',
      ruleId: 'grade-rule',
      resolvedFrom: expect.objectContaining({
        requestedScopeType: 'classroom',
        gradeId: GRADE_ID,
      }),
    });
    expect(repository.findGradeRule).toHaveBeenCalledWith(
      expect.objectContaining({ gradeId: GRADE_ID }),
    );
  });
});
