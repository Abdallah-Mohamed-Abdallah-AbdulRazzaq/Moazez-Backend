import { z } from 'zod/v4';
import { OfficialResultsError } from './official-results.error';
import { resultContentDigest } from './result-content-digest';
import {
  validateResultDefinition,
  type ResultDefinition,
} from './result-definition';
import {
  academicSelector,
  groupSelector,
  periodSelector,
  resolveResultRuleValue,
  resultScopeMatches,
  type ConcreteResultsScope,
  type ResultScopeFacts,
} from './result-scope';

export const templateScopeSelector = z.strictObject({
  academicScope: academicSelector,
  groupScope: groupSelector,
  periodSelector,
});

type TemplateScope = z.infer<typeof templateScopeSelector>;
export interface TemplateRule extends TemplateScope {
  id: string;
  versionId: string;
  definition: ResultDefinition;
  enabled: boolean;
}

export function extendResultDefinition(
  base: ResultDefinition,
  extension: ResultDefinition,
): ResultDefinition {
  if (
    base.groupKind !== extension.groupKind ||
    resultContentDigest(base.calculationPolicy) !==
      resultContentDigest(extension.calculationPolicy)
  ) {
    throw new OfficialResultsError('schema.invalid', {
      path: 'extension.calculationPolicy',
    });
  }
  const fields = new Map(base.fields.map((field) => [field.id, field]));
  const codes = new Set(base.fields.map((field) => field.code));
  const units = new Map(base.releaseUnits.map((unit) => [unit.id, unit]));
  for (const field of extension.fields) {
    const existing = fields.get(field.id);
    if (existing) {
      const {
        label: _label,
        helpText: _help,
        order: _order,
        ...semantics
      } = field;
      const {
        label: _oldLabel,
        helpText: _oldHelp,
        order: _oldOrder,
        ...oldSemantics
      } = existing;
      if (
        resultContentDigest(semantics) !== resultContentDigest(oldSemantics)
      ) {
        throw new OfficialResultsError('schema.invalid', {
          path: 'extension.field',
        });
      }
    } else if (codes.has(field.code)) {
      throw new OfficialResultsError('schema.invalid', {
        path: 'extension.fieldCode',
      });
    }
    fields.set(field.id, field);
    codes.add(field.code);
  }
  for (const unit of extension.releaseUnits) {
    const previous = units.get(unit.id);
    if (previous) {
      if (
        unit.classification !== previous.classification ||
        unit.code !== previous.code ||
        resultContentDigest(unit.derivedDisclosure) !==
          resultContentDigest(previous.derivedDisclosure)
      ) {
        throw new OfficialResultsError('schema.invalid', {
          path: 'extension.releaseUnit',
        });
      }
      units.set(unit.id, {
        ...previous,
        outputFieldIds: [
          ...new Set([...previous.outputFieldIds, ...unit.outputFieldIds]),
        ],
      });
    } else {
      units.set(unit.id, unit);
    }
  }
  const result = {
    ...base,
    label: extension.label,
    fields: [...fields.values()],
    releaseUnits: [...units.values()],
  };
  validateResultDefinition(result, true);
  return result;
}

export function resolveTemplateRule(
  rules: TemplateRule[],
  target: ConcreteResultsScope,
  facts: ResultScopeFacts,
) {
  const groupKind = target.subjectId ? 'SUBJECT' : 'CUSTOM';
  const matching = rules.filter(
    (rule) =>
      rule.enabled &&
      rule.definition.groupKind === groupKind &&
      resultScopeMatches(rule, target),
  );
  const winner = resolveResultRuleValue(
    matching,
    facts,
    (rule) => rule.definition,
  );
  return winner
    ? {
        definition: winner.value,
        sourceRuleIds: winner.sources.map((rule) => rule.id).sort(),
        versionId: winner.sources.map((rule) => rule.versionId).sort()[0],
      }
    : null;
}
