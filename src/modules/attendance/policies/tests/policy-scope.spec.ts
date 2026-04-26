import {
  AttendanceMode,
  AttendanceScopeType,
  DailyComputationStrategy,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  buildEffectiveScopeCandidates,
  buildScopeKey,
  selectEffectivePolicy,
  validateNormalizedScope,
} from '../domain/policy-scope';

describe('attendance policy scope helpers', () => {
  it('requires classroomId for CLASSROOM scope', () => {
    expect(() => buildScopeKey(AttendanceScopeType.CLASSROOM, {})).toThrow(
      ValidationDomainException,
    );
  });

  it('requires sectionId for SECTION scope', () => {
    expect(() => buildScopeKey(AttendanceScopeType.SECTION, {})).toThrow(
      ValidationDomainException,
    );
  });

  it('requires gradeId for GRADE scope', () => {
    expect(() => buildScopeKey(AttendanceScopeType.GRADE, {})).toThrow(
      ValidationDomainException,
    );
  });

  it('requires stageId for STAGE scope', () => {
    expect(() => buildScopeKey(AttendanceScopeType.STAGE, {})).toThrow(
      ValidationDomainException,
    );
  });

  it('does not allow child scope ids on SCHOOL scope', () => {
    expect(() =>
      validateNormalizedScope({
        scopeType: AttendanceScopeType.SCHOOL,
        scopeKey: 'school',
        stageId: 'stage-1',
        gradeId: null,
        sectionId: null,
        classroomId: null,
      }),
    ).toThrow(ValidationDomainException);
  });
});

describe('selectEffectivePolicy', () => {
  const updatedAt = new Date('2026-04-26T10:00:00.000Z');

  function policy(scopeType: AttendanceScopeType, scopeKey: string) {
    return {
      id: scopeKey,
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      scopeType,
      scopeKey,
      stageId: scopeType === AttendanceScopeType.SCHOOL ? null : 'stage-1',
      gradeId:
        scopeType === AttendanceScopeType.GRADE ||
        scopeType === AttendanceScopeType.SECTION ||
        scopeType === AttendanceScopeType.CLASSROOM
          ? 'grade-1'
          : null,
      sectionId:
        scopeType === AttendanceScopeType.SECTION ||
        scopeType === AttendanceScopeType.CLASSROOM
          ? 'section-1'
          : null,
      classroomId:
        scopeType === AttendanceScopeType.CLASSROOM ? 'classroom-1' : null,
      nameAr: scopeKey,
      nameEn: scopeKey,
      descriptionAr: null,
      descriptionEn: null,
      notes: null,
      mode: AttendanceMode.DAILY,
      dailyComputationStrategy: DailyComputationStrategy.MANUAL,
      requireExcuseAttachment: false,
      allowParentExcuseRequests: true,
      notifyGuardiansOnAbsence: true,
      effectiveFrom: null,
      effectiveTo: null,
      isActive: true,
      createdAt: updatedAt,
      updatedAt,
      deletedAt: null,
    };
  }

  const classroomScope = {
    scopeType: AttendanceScopeType.CLASSROOM,
    scopeKey: 'classroom:classroom-1',
    stageId: 'stage-1',
    gradeId: 'grade-1',
    sectionId: 'section-1',
    classroomId: 'classroom-1',
  };

  const candidates = buildEffectiveScopeCandidates(classroomScope);

  it('chooses classroom over section, grade, stage, and school', () => {
    const selected = selectEffectivePolicy(
      [
        policy(AttendanceScopeType.SCHOOL, 'school'),
        policy(AttendanceScopeType.STAGE, 'stage:stage-1'),
        policy(AttendanceScopeType.GRADE, 'grade:grade-1'),
        policy(AttendanceScopeType.SECTION, 'section:section-1'),
        policy(AttendanceScopeType.CLASSROOM, 'classroom:classroom-1'),
      ],
      candidates,
    );

    expect(selected?.scopeType).toBe(AttendanceScopeType.CLASSROOM);
  });

  it('chooses section over grade, stage, and school', () => {
    const selected = selectEffectivePolicy(
      [
        policy(AttendanceScopeType.SCHOOL, 'school'),
        policy(AttendanceScopeType.STAGE, 'stage:stage-1'),
        policy(AttendanceScopeType.GRADE, 'grade:grade-1'),
        policy(AttendanceScopeType.SECTION, 'section:section-1'),
      ],
      candidates,
    );

    expect(selected?.scopeType).toBe(AttendanceScopeType.SECTION);
  });

  it('chooses grade over stage and school', () => {
    const selected = selectEffectivePolicy(
      [
        policy(AttendanceScopeType.SCHOOL, 'school'),
        policy(AttendanceScopeType.STAGE, 'stage:stage-1'),
        policy(AttendanceScopeType.GRADE, 'grade:grade-1'),
      ],
      candidates,
    );

    expect(selected?.scopeType).toBe(AttendanceScopeType.GRADE);
  });

  it('chooses stage over school', () => {
    const selected = selectEffectivePolicy(
      [
        policy(AttendanceScopeType.SCHOOL, 'school'),
        policy(AttendanceScopeType.STAGE, 'stage:stage-1'),
      ],
      candidates,
    );

    expect(selected?.scopeType).toBe(AttendanceScopeType.STAGE);
  });

  it('falls back to school policy', () => {
    const selected = selectEffectivePolicy(
      [policy(AttendanceScopeType.SCHOOL, 'school')],
      candidates,
    );

    expect(selected?.scopeType).toBe(AttendanceScopeType.SCHOOL);
  });
});
