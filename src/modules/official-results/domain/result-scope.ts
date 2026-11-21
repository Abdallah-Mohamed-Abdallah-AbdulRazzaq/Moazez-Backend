import { z } from 'zod/v4';
import { OfficialResultsError } from './official-results.error';
import { resultContentDigest } from './result-content-digest';

export const resultIdList = z
  .array(z.uuid())
  .min(1)
  .max(200)
  .refine((ids) => new Set(ids).size === ids.length)
  .transform((ids) => ids.sort());

const kind = z.enum(['TERM', 'CUSTOM', 'YEAR']);
const kinds = z
  .array(kind)
  .min(1)
  .max(3)
  .refine((values) => new Set(values).size === values.length)
  .transform((values) => values.sort());

export const academicSelector = z.discriminatedUnion('level', [
  z.strictObject({ level: z.literal('SCHOOL'), ids: z.tuple([]) }),
  z.strictObject({
    level: z.enum(['STAGE', 'GRADE', 'SECTION', 'CLASSROOM']),
    ids: resultIdList,
  }),
]);

export const groupSelector = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ALL_SUBJECTS') }),
  z.strictObject({ kind: z.literal('SUBJECTS'), subjectIds: resultIdList }),
  z.strictObject({ kind: z.literal('CUSTOM_GROUPS'), groupIds: resultIdList }),
]);

export const periodSelector = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('EXACT_PERIODS'), periodIds: resultIdList }),
  z.strictObject({
    kind: z.literal('ACADEMIC_YEAR'),
    academicYearId: z.uuid(),
    periodKinds: kinds,
  }),
  z.strictObject({ kind: z.literal('ALL_PERIODS'), periodKinds: kinds }),
]);

type AcademicSelector = z.infer<typeof academicSelector>;
type GroupSelector = z.infer<typeof groupSelector>;
type PeriodSelector = z.infer<typeof periodSelector>;

export type AcademicLevel = Exclude<AcademicSelector['level'], 'SCHOOL'>;
export type ResultAcademicPath = Partial<Record<AcademicLevel, string>>;
export interface ResultPeriodFact {
  id: string;
  academicYearId: string;
  termId?: string | null;
  kind: z.infer<typeof kind>;
}
export interface ConcreteResultsScope {
  academic: Required<ResultAcademicPath>;
  subjectId: string | null;
  groupId: string;
  period: ResultPeriodFact;
}
export interface ResultSelector {
  academicScope: AcademicSelector;
  groupScope: GroupSelector;
  periodSelector: PeriodSelector;
}
export interface ResultScopeFacts {
  paths: Record<AcademicLevel, Map<string, ResultAcademicPath>>;
  periods: Map<string, ResultPeriodFact>;
}

function subset<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.every((item) => right.includes(item));
}

function academicCovers(
  broad: AcademicSelector,
  narrow: AcademicSelector,
  facts: ResultScopeFacts,
): boolean {
  if (broad.level === 'SCHOOL') return true;
  if (narrow.level === 'SCHOOL') return false;
  if (broad.level === narrow.level) return subset(narrow.ids, broad.ids);
  return narrow.ids.every((id) => {
    const ancestor = facts.paths[narrow.level].get(id)?.[broad.level];
    return ancestor !== undefined && broad.ids.includes(ancestor);
  });
}

function groupCovers(broad: GroupSelector, narrow: GroupSelector): boolean {
  if (broad.kind === 'ALL_SUBJECTS') return narrow.kind !== 'CUSTOM_GROUPS';
  if (broad.kind === 'SUBJECTS' && narrow.kind === 'SUBJECTS') {
    return subset(narrow.subjectIds, broad.subjectIds);
  }
  if (broad.kind === 'CUSTOM_GROUPS' && narrow.kind === 'CUSTOM_GROUPS') {
    return subset(narrow.groupIds, broad.groupIds);
  }
  return false;
}

function periodMatches(
  selector: PeriodSelector,
  period: ResultPeriodFact,
): boolean {
  if (selector.kind === 'EXACT_PERIODS')
    return selector.periodIds.includes(period.id);
  return (
    selector.periodKinds.includes(period.kind) &&
    (selector.kind === 'ALL_PERIODS' ||
      selector.academicYearId === period.academicYearId)
  );
}

function periodCovers(
  broad: PeriodSelector,
  narrow: PeriodSelector,
  facts: ResultScopeFacts,
): boolean {
  if (broad.kind === 'EXACT_PERIODS') {
    return (
      narrow.kind === 'EXACT_PERIODS' &&
      subset(narrow.periodIds, broad.periodIds)
    );
  }
  if (narrow.kind === 'EXACT_PERIODS') {
    return narrow.periodIds.every((id) => {
      const value = facts.periods.get(id);
      return value !== undefined && periodMatches(broad, value);
    });
  }
  return (
    subset(narrow.periodKinds, broad.periodKinds) &&
    (broad.kind === 'ALL_PERIODS' ||
      (narrow.kind === 'ACADEMIC_YEAR' &&
        narrow.academicYearId === broad.academicYearId))
  );
}

function covers(
  broad: ResultSelector,
  narrow: ResultSelector,
  facts: ResultScopeFacts,
): boolean {
  return (
    academicCovers(broad.academicScope, narrow.academicScope, facts) &&
    groupCovers(broad.groupScope, narrow.groupScope) &&
    periodCovers(broad.periodSelector, narrow.periodSelector, facts)
  );
}

export function resultScopeMatches(
  rule: ResultSelector,
  target: ConcreteResultsScope,
): boolean {
  if (!periodMatches(rule.periodSelector, target.period)) return false;
  const academic = rule.academicScope;
  if (
    academic.level !== 'SCHOOL' &&
    !academic.ids.includes(target.academic[academic.level])
  )
    return false;
  switch (rule.groupScope.kind) {
    case 'ALL_SUBJECTS':
      return target.subjectId !== null;
    case 'SUBJECTS':
      return (
        target.subjectId !== null &&
        rule.groupScope.subjectIds.includes(target.subjectId)
      );
    case 'CUSTOM_GROUPS':
      return (
        target.subjectId === null &&
        rule.groupScope.groupIds.includes(target.groupId)
      );
  }
}

export function maximalResultRules<T extends ResultSelector>(
  rules: T[],
  facts: ResultScopeFacts,
): T[] {
  return rules.filter(
    (rule) =>
      !rules.some(
        (other) => covers(rule, other, facts) && !covers(other, rule, facts),
      ),
  );
}

export function resolveResultRuleValue<R extends ResultSelector, T>(
  rules: R[],
  facts: ResultScopeFacts,
  select: (rule: R) => T,
): { value: T; sources: R[] } | undefined {
  const sources = maximalResultRules(rules, facts);
  if (!sources.length) return undefined;
  const value = select(sources[0]);
  const hashes = new Set(
    sources.map((rule) => resultContentDigest(select(rule))),
  );
  if (hashes.size > 1) throw new OfficialResultsError('scope.conflict');
  return { value, sources };
}
