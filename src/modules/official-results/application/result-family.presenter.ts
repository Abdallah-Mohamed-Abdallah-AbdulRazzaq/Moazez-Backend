import type { ReleaseSnapshot } from '../domain/result-release.contract';
import type { ResultFieldAccess } from '../domain/result-field-access';

export function familyReleaseFields(
  snapshot: ReleaseSnapshot,
  definitionVersionId: string,
  audience: 'STUDENT' | 'PARENT',
  access?: ResultFieldAccess,
) {
  const unitFields = new Set(snapshot.unit.outputFieldIds);
  return snapshot.fields
    .filter(
      ({ definition }) =>
        unitFields.has(definition.id) &&
        definition.audiences.includes(audience) &&
        (!access || access.get(definition.id)?.readable),
    )
    .map(({ definition, value, calculation }) => ({
      fieldId: definition.id,
      definitionVersionId,
      code: definition.code,
      kind: definition.kind,
      ...(definition.outputKind ? { outputKind: definition.outputKind } : {}),
      label: definition.label,
      order: definition.order,
      value,
      ...(definition.kind === 'SCORE' || definition.kind === 'PERCENTAGE'
        ? { constraints: definition.constraints }
        : {}),
      ...(definition.options
        ? {
            options: definition.options.filter(
              (option) =>
                option.active ||
                ('optionCode' in value && value.optionCode === option.code),
            ),
          }
        : {}),
      ...(calculation
        ? {
            calculationStatus: calculation.calculationStatus,
            ...(calculation.evaluation
              ? { evaluation: calculation.evaluation }
              : {}),
          }
        : {}),
    }))
    .sort((a, b) => a.order - b.order || a.fieldId.localeCompare(b.fieldId));
}

export function familyReleaseContext(snapshot: ReleaseSnapshot) {
  const { stage, grade, section, classroom, ...academicContext } =
    snapshot.academicContext;
  return {
    academicContext,
    academicPlacement: {
      enrollmentId: snapshot.enrollmentId,
      stage,
      grade,
      section,
      classroom,
    },
    student: {
      id: snapshot.student.studentId,
      displayName: snapshot.student.displayName,
    },
  };
}

export function familyGroup(snapshot: ReleaseSnapshot) {
  const { subjectId, ...group } = snapshot.group;
  return {
    ...group,
    ...(subjectId ? { subject: { id: subjectId, name: group.label } } : {}),
    order: 0,
  };
}
