import type { ResultGrantAction } from '@prisma/client';
import { resultContentDigest } from './result-content-digest';
import type { ResultDefinition, ResultField } from './result-definition';

type FieldPermission = {
  readable: boolean;
  editable: boolean;
  hiddenDependencies: boolean;
};

export function resultFieldAccess(input: {
  definition: ResultDefinition;
  accepted: ResultDefinition | null;
  teacher: boolean;
  grants: ReadonlyMap<string, ReadonlySet<ResultGrantAction>>;
  canEdit: boolean;
}): Map<string, FieldPermission> {
  const { definition, accepted, teacher, grants, canEdit } = input;
  const trusted = new Map(
    accepted?.fields.map((field) => [field.id, field]) ?? [],
  );
  const fields = new Map(definition.fields.map((field) => [field.id, field]));
  const permissions = new Map<string, FieldPermission>();

  const allows = (
    fieldId: string,
    rule: ResultField['editRule'],
    action: 'VIEW' | 'EDIT',
  ) => {
    switch (rule) {
      case 'INHERIT_SHEET':
        return true;
      case 'SCHOOL_ONLY':
        return !teacher;
      case 'EXPLICIT_GRANT':
        return grants.get(fieldId)?.has(action) ?? false;
      case 'COMPUTED_ONLY':
        return false;
    }
  };

  for (const field of definition.fields) {
    const prior = trusted.get(field.id);
    const readable =
      allows(field.id, field.readRule, 'VIEW') &&
      (!prior || allows(field.id, prior.readRule, 'VIEW'));
    const editable =
      readable &&
      canEdit &&
      allows(field.id, field.editRule, 'EDIT') &&
      (!prior || allows(field.id, prior.editRule, 'EDIT'));
    permissions.set(field.id, {
      readable,
      editable,
      hiddenDependencies: false,
    });
  }

  const dependencies = new Map<string, Set<string>>();
  const closure = (field: ResultField): Set<string> => {
    const cached = dependencies.get(field.id);
    if (cached) return cached;
    const set = new Set<string>();
    dependencies.set(field.id, set);
    for (const item of field.formula?.operands ?? []) {
      set.add(item.fieldId);
      const source = fields.get(item.fieldId);
      if (source) for (const dependency of closure(source)) set.add(dependency);
    }
    return set;
  };
  for (const item of definition.fields) {
    if (!item.formula) continue;
    const authority = permissions.get(item.id)!;
    const hidden = [...closure(item)].filter(
      (id) => !permissions.get(id)?.readable,
    );
    if (hidden.length === 0) continue;
    const current = definition.releaseUnits
      .find((unit) => unit.id === item.releaseUnitId)
      ?.derivedDisclosure.find((rule) => rule.outputFieldId === item.id);
    const approved = accepted?.releaseUnits
      .find((unit) => unit.id === item.releaseUnitId)
      ?.derivedDisclosure.find((rule) => rule.outputFieldId === item.id);
    const exact = trusted.get(item.id);
    authority.hiddenDependencies = true;
    authority.readable =
      authority.readable &&
      Boolean(
        current &&
        approved &&
        exact?.formula &&
        approved.audiences.includes('STAFF') &&
        resultContentDigest(current) === resultContentDigest(approved) &&
        resultContentDigest(exact.formula) ===
          resultContentDigest(item.formula) &&
        hidden.every((id) => approved.privateOperandFieldIds.includes(id)),
      );
  }
  return permissions;
}

export type ResultFieldAccess = ReturnType<typeof resultFieldAccess>;
