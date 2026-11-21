import type { FrozenResultDefinitionInput } from '../application/result-foundation.types';
import type { ResultDefinition } from './result-definition';

export function sheetDefinitionSeed(
  definition: ResultDefinition,
  origin: { templateVersionId?: string; sourceRuleIds?: string[] } = {},
): FrozenResultDefinitionInput {
  return {
    label: definition.label,
    configuration: { resolvedDefinition: definition, ...origin },
    releaseUnits: definition.releaseUnits.map((unit) => ({
      unitId: unit.id,
      code: unit.code,
      labelAr: unit.label.ar,
      labelEn: unit.label.en,
      classification: unit.classification,
      sortOrder: unit.order,
      audiences: [
        ...new Set(
          definition.fields
            .filter((field) => field.releaseUnitId === unit.id)
            .flatMap((field) => field.audiences),
        ),
      ],
    })),
    fields: definition.fields.map((field) => ({
      fieldId: field.id,
      newSemanticPurpose: field.code,
      releaseUnitId: field.releaseUnitId,
      kind: field.kind,
      outputKind: field.outputKind,
      code: field.code,
      labelAr: field.label.ar,
      labelEn: field.label.en,
      sortOrder: field.order,
      required: field.requiredForFinal,
      audiences: field.audiences,
      readRule: field.readRule,
      editRule:
        field.editRule === 'COMPUTED_ONLY' ? 'INHERIT_SHEET' : field.editRule,
      constraints: {
        ...field.constraints,
        allowedStates: field.allowedStates,
        stateReasonRequired: field.stateReasonRequired,
        options: field.options,
        textMode: field.textMode,
      },
      formula: field.formula,
    })),
  };
}
