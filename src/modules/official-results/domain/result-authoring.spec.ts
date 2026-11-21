import { randomUUID } from 'node:crypto';
import { moazezStarterDefinition } from './moazez-starter';
import {
  normalizeResultDefinition,
  validateResultDefinition,
} from './result-definition';
import type { ConcreteResultsScope, ResultScopeFacts } from './result-scope';
import {
  resolveTemplateRule,
  type TemplateRule,
} from './result-template-rules';

describe('Official Results authoring invariants', () => {
  const stage = randomUUID();
  const grade = randomUUID();
  const section = randomUUID();
  const classroom = randomUUID();
  const subject = randomUUID();
  const group = randomUUID();
  const period = {
    id: randomUUID(),
    kind: 'TERM' as const,
    academicYearId: randomUUID(),
  };
  const academic = {
    STAGE: stage,
    GRADE: grade,
    SECTION: section,
    CLASSROOM: classroom,
  };
  const target: ConcreteResultsScope = {
    academic,
    subjectId: subject,
    groupId: group,
    period,
  };
  const facts: ResultScopeFacts = {
    paths: {
      STAGE: new Map([[stage, { STAGE: stage }]]),
      GRADE: new Map([[grade, { GRADE: grade, STAGE: stage }]]),
      SECTION: new Map([[section, academic]]),
      CLASSROOM: new Map([[classroom, academic]]),
    },
    periods: new Map([[period.id, period]]),
  };
  const rule = (
    name: string,
    selectors: Partial<TemplateRule> = {},
  ): TemplateRule => ({
    id: randomUUID(),
    versionId: randomUUID(),
    enabled: true,
    academicScope: { level: 'SCHOOL', ids: [] },
    groupScope: { kind: 'ALL_SUBJECTS' },
    periodSelector: { kind: 'ALL_PERIODS', periodKinds: ['TERM'] },
    definition: { ...moazezStarterDefinition(), label: { ar: name, en: name } },
    ...selectors,
  });

  it('T018 chooses the actual contained classroom rule independently of creation order', () => {
    const school = rule('School');
    const local = rule('Class', {
      academicScope: { level: 'CLASSROOM', ids: [classroom] },
    });
    expect(resolveTemplateRule([school, local], target, facts)?.versionId).toBe(
      local.versionId,
    );
    expect(resolveTemplateRule([local, school], target, facts)?.versionId).toBe(
      local.versionId,
    );
  });

  it('T019 requires explicit intersection when individual dimensions are incomparable', () => {
    const byGrade = rule('Grade', {
      academicScope: { level: 'GRADE', ids: [grade] },
    });
    const bySubject = rule('Subject', {
      groupScope: { kind: 'SUBJECTS', subjectIds: [subject] },
    });
    expect(() =>
      resolveTemplateRule([byGrade, bySubject], target, facts),
    ).toThrow('More than one incomparable');
    const exact = rule('Intersection', {
      academicScope: byGrade.academicScope,
      groupScope: bySubject.groupScope,
    });
    expect(
      resolveTemplateRule([byGrade, exact, bySubject], target, facts)
        ?.versionId,
    ).toBe(exact.versionId);
  });

  it('T020 rejects different equal-scope rules and retains equivalent sources', () => {
    const first = rule('One');
    const other = rule('Two');
    expect(() => resolveTemplateRule([first, other], target, facts)).toThrow(
      'More than one incomparable',
    );
    const match = resolveTemplateRule(
      [first, { ...other, definition: first.definition }],
      target,
      facts,
    );
    expect(match?.sourceRuleIds).toEqual([first.id, other.id].sort());
  });

  it('T024 retains a renamed identity and rejects incompatible type reuse', () => {
    const original = moazezStarterDefinition();
    const renamed = structuredClone(original);
    renamed.fields[0].label.en = renamed.fields[1].label.en;
    expect(
      normalizeResultDefinition(renamed, original, true).definition.fields[0]
        .id,
    ).toBe(original.fields[0].id);
    const incompatible = structuredClone(renamed);
    incompatible.fields[0].kind = 'BOOLEAN';
    incompatible.fields[0].constraints = {};
    expect(() =>
      normalizeResultDefinition(incompatible, original, true),
    ).toThrow('definition is invalid');
  });

  it('T055 requires an exact school-authorized derived disclosure for a private operand', () => {
    const definition = moazezStarterDefinition();
    const privateInput = definition.fields[0];
    const total = definition.fields.find((field) => field.code === 'total')!;
    privateInput.audiences = ['STAFF'];
    privateInput.readRule = 'SCHOOL_ONLY';
    expect(() => validateResultDefinition(definition, true)).toThrow();
    definition.releaseUnits[0].derivedDisclosure = [
      {
        outputFieldId: total.id,
        privateOperandFieldIds: [privateInput.id],
        audiences: ['PARENT', 'STUDENT'],
        reason: 'Release the total without the coursework value',
      },
    ];
    expect(() => validateResultDefinition(definition, false)).toThrow();
    expect(() => validateResultDefinition(definition, true)).not.toThrow();
    definition.releaseUnits[0].derivedDisclosure[0].privateOperandFieldIds.push(
      definition.fields[1].id,
    );
    expect(() => validateResultDefinition(definition, true)).toThrow();
  });

  it('T025 rejects formula cycles and dependencies crossing independent release units', () => {
    const cyclic = moazezStarterDefinition();
    const total = cyclic.fields.find((field) => field.code === 'total')!;
    total.formula!.operands = [{ fieldId: total.id }];
    expect(() => validateResultDefinition(cyclic, true)).toThrow(
      'definition is invalid',
    );
    const overlapping = moazezStarterDefinition();
    const unit = overlapping.releaseUnits[0];
    const otherId = randomUUID();
    const score = overlapping.fields[0];
    score.releaseUnitId = otherId;
    unit.outputFieldIds = unit.outputFieldIds.filter((id) => id !== score.id);
    overlapping.releaseUnits.push({
      ...unit,
      id: otherId,
      code: 'PROGRESS',
      outputFieldIds: [score.id],
    });
    expect(() => validateResultDefinition(overlapping, true)).toThrow(
      'definition is invalid',
    );
  });
});
