import {
  GradeRoundingMode,
  GradeRuleScale,
  GradeScopeType,
  Prisma,
} from '@prisma/client';
import {
  presentEffectiveGradeRule,
  presentGradeRule,
} from '../presenters/grade-rule.presenter';

describe('grade rule presenter', () => {
  function ruleRecord() {
    return {
      id: 'rule-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      scopeType: GradeScopeType.GRADE,
      scopeKey: 'grade-1',
      gradeId: 'grade-1',
      gradingScale: GradeRuleScale.PERCENTAGE,
      passMark: new Prisma.Decimal(60),
      rounding: GradeRoundingMode.DECIMAL_1,
      createdAt: new Date('2026-04-26T09:00:00.000Z'),
      updatedAt: new Date('2026-04-26T10:00:00.000Z'),
    };
  }

  it('presents a stored grade rule using frontend-friendly fields', () => {
    expect(presentGradeRule(ruleRecord())).toEqual({
      id: 'rule-1',
      academicYearId: 'year-1',
      yearId: 'year-1',
      termId: 'term-1',
      scopeType: 'grade',
      scopeKey: 'grade-1',
      scopeId: 'grade-1',
      gradeId: 'grade-1',
      gradingScale: 'percentage',
      passMark: 60,
      rounding: 'decimal_1',
      createdAt: '2026-04-26T09:00:00.000Z',
      updatedAt: '2026-04-26T10:00:00.000Z',
    });
  });

  it('presents an effective default rule with requested scope context', () => {
    expect(
      presentEffectiveGradeRule({
        source: 'DEFAULT',
        rule: null,
        requestedScope: {
          scopeType: GradeScopeType.CLASSROOM,
          scopeKey: 'classroom-1',
          stageId: 'stage-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
          classroomId: 'classroom-1',
        },
        resolvedFrom: {
          scopeType: GradeScopeType.CLASSROOM,
          scopeKey: 'classroom-1',
          stageId: 'stage-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
          classroomId: 'classroom-1',
        },
      }),
    ).toEqual({
      source: 'DEFAULT',
      id: null,
      ruleId: null,
      scopeType: 'classroom',
      scopeKey: 'classroom-1',
      scopeId: 'classroom-1',
      gradeId: 'grade-1',
      gradingScale: 'percentage',
      passMark: 50,
      rounding: 'decimal_2',
      resolvedFrom: {
        requestedScopeType: 'classroom',
        requestedScopeKey: 'classroom-1',
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
      },
    });
  });
});
