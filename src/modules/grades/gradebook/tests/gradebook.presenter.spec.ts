import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeItemStatus,
  GradeRoundingMode,
  GradeRuleScale,
  GradeScopeType,
  Prisma,
} from '@prisma/client';
import {
  presentGradebookCell,
  presentGradebookRule,
} from '../presenters/gradebook.presenter';

describe('gradebook presenters', () => {
  it('returns frontend-friendly rule and cell shapes', () => {
    expect(
      presentGradebookRule({
        source: 'GRADE',
        ruleId: 'rule-1',
        scopeType: GradeScopeType.GRADE,
        scopeKey: 'grade-1',
        gradeId: 'grade-1',
        gradingScale: GradeRuleScale.PERCENTAGE,
        passMark: 55,
        rounding: GradeRoundingMode.DECIMAL_1,
      }),
    ).toMatchObject({
      source: 'GRADE',
      ruleId: 'rule-1',
      gradingScale: 'percentage',
      rounding: 'decimal_1',
      passMark: 55,
    });

    expect(
      presentGradebookCell({
        assessment: {
          id: 'assessment-1',
          schoolId: 'school-1',
          academicYearId: 'year-1',
          termId: 'term-1',
          subjectId: 'subject-1',
          scopeType: GradeScopeType.GRADE,
          scopeKey: 'grade-1',
          stageId: 'stage-1',
          gradeId: 'grade-1',
          sectionId: null,
          classroomId: null,
          titleEn: 'Quiz',
          titleAr: 'Quiz AR',
          type: GradeAssessmentType.QUIZ,
          deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
          date: new Date('2026-09-15T00:00:00.000Z'),
          weight: new Prisma.Decimal(20),
          maxScore: new Prisma.Decimal(20),
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
          lockedAt: null,
          subject: {
            id: 'subject-1',
            nameAr: 'Math AR',
            nameEn: 'Math',
            code: 'MATH',
            color: null,
            isActive: true,
          },
        },
        item: null,
        score: null,
        status: GradeItemStatus.MISSING,
        percent: null,
        weightedContribution: null,
        comment: null,
        isVirtualMissing: true,
      }),
    ).toMatchObject({
      assessmentId: 'assessment-1',
      itemId: null,
      score: null,
      status: 'missing',
      isVirtualMissing: true,
    });
  });
});
