export class GradeRuleResponseDto {
  id!: string;
  academicYearId!: string;
  yearId!: string;
  termId!: string;
  scopeType!: string;
  scopeKey!: string;
  scopeId!: string;
  gradeId!: string | null;
  gradingScale!: string;
  passMark!: number;
  rounding!: string;
  createdAt!: string;
  updatedAt!: string;
}

export class GradeRulesListResponseDto {
  items!: GradeRuleResponseDto[];
}

export class EffectiveGradeRuleResponseDto {
  source!: 'DEFAULT' | 'SCHOOL' | 'GRADE' | 'STAGE';
  id!: string | null;
  ruleId!: string | null;
  scopeType!: string;
  scopeKey!: string;
  scopeId!: string;
  gradeId!: string | null;
  gradingScale!: string;
  passMark!: number;
  rounding!: string;
  resolvedFrom!: {
    requestedScopeType: string;
    requestedScopeKey: string;
    stageId: string | null;
    gradeId: string | null;
    sectionId: string | null;
    classroomId: string | null;
  };
}
