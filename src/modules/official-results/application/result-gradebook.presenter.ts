import { evaluateResultFields } from '../domain/result-calculation';
import type {
  ResultDefinition,
  ResultField,
} from '../domain/result-definition';
import type { ResultFieldAccess } from '../domain/result-field-access';
import { ResultFraction } from '../domain/result-fraction';
import { storedCellValue, type ResultValue } from '../domain/result-value';
import type {
  GradebookRow,
  GradebookSheet,
} from '../infrastructure/repositories/result-gradebook.repository';

const label = (ar: string, en: string) => ({ ar, en });
const named = (row: { id: string; nameAr: string; nameEn: string }) => ({
  id: row.id,
  name: label(row.nameAr, row.nameEn),
});

export function presentResultSheet(sheet: GradebookSheet) {
  const { section } = sheet.classroom;
  const { academicYear, term, ...period } = sheet.reportingPeriod;
  return {
    sheetId: sheet.id,
    sheetRevision: sheet.sheetRevision,
    dataGeneration: sheet.dataGeneration,
    rosterGeneration: sheet.rosterGeneration,
    draftDefinitionVersionId: sheet.draftDefinitionVersionId!,
    lastAcceptedDefinitionVersionId: sheet.lastAcceptedDefinitionVersionId,
    reportingPeriodId: sheet.reportingPeriodId,
    groupId: sheet.groupId,
    classroomId: sheet.classroomId,
    academicContext: {
      school: {
        id: sheet.school.id,
        name: label(sheet.school.name, sheet.school.name),
      },
      academicYear: named(academicYear),
      reportingPeriod: { ...named(period), kind: period.kind },
      ...(term ? { term: named(term) } : {}),
      stage: named(section.grade.stage),
      grade: named(section.grade),
      section: named(section),
      classroom: named(sheet.classroom),
    },
    group: {
      groupId: sheet.groupId,
      kind: sheet.group.kind,
      ...(sheet.group.subjectId ? { subjectId: sheet.group.subjectId } : {}),
      label: label(sheet.group.labelAr, sheet.group.labelEn),
    },
  };
}

export function presentResultField(field: ResultField, showFormula: boolean) {
  const { id, formula, ...metadata } = field;
  return {
    fieldId: id,
    ...metadata,
    ...(showFormula && formula ? { formula } : {}),
  };
}

export function printableDraftValue(
  field: ResultField,
  value: ResultValue,
): ResultValue {
  if ('score' in value && 'maxScore' in field.constraints) {
    return {
      status: 'RECORDED',
      score: ResultFraction.decimal(value.score).format(
        field.constraints.inputScale,
        'DOWN',
      ),
    };
  }
  if ('percentage' in value && 'maxPercentage' in field.constraints) {
    return {
      status: 'RECORDED',
      percentage: ResultFraction.decimal(value.percentage).format(
        field.constraints.inputScale,
        'DOWN',
      ),
    };
  }
  return value;
}

export function visibleCalculatedOutputs(
  definition: ResultDefinition,
  values: ReadonlyMap<string, ResultValue>,
  permissions: ResultFieldAccess,
) {
  const allowed = new Set(
    [...permissions]
      .filter(([, permission]) => permission.readable)
      .map(([id]) => id),
  );
  return [...evaluateResultFields(definition, values, allowed).values()].map(
    (calculation) => {
      return permissions.get(calculation.fieldId)?.hiddenDependencies
        ? {
            fieldId: calculation.fieldId,
            value: calculation.value,
            calculationStatus: calculation.calculationStatus,
          }
        : calculation;
    },
  );
}

export function presentGradebookRow(
  row: GradebookRow,
  definition: ResultDefinition | null,
  access: ResultFieldAccess,
  selected: ReadonlySet<string>,
  editable: boolean,
) {
  const { student } = row;
  const en = [
    student.firstName,
    student.fatherNameEn,
    student.grandfatherNameEn,
    student.lastName,
  ]
    .filter(Boolean)
    .join(' ');
  const ar = [
    student.firstNameAr,
    student.fatherNameAr,
    student.grandfatherNameAr,
    student.familyNameAr,
  ]
    .filter(Boolean)
    .join(' ');
  const manual = new Map(row.cells.map((cell) => [cell.fieldId, cell]));
  const computed = definition
    ? visibleCalculatedOutputs(
        definition,
        new Map(row.cells.map((cell) => [cell.fieldId, storedCellValue(cell)])),
        access,
      )
    : [];
  const outputs = new Map(
    computed.map((calculation) => [calculation.fieldId, calculation]),
  );
  const visible = (definition?.fields ?? []).filter(
    (field) => access.get(field.id)?.readable,
  );
  const cells = visible.map((field) => {
    const output = outputs.get(field.id);
    if (output) return { ...output, editable: false };
    const existing = manual.get(field.id);
    return {
      fieldId: field.id,
      value: existing
        ? printableDraftValue(field, storedCellValue(existing))
        : { status: 'MISSING' as const },
      editable: editable && Boolean(access.get(field.id)?.editable),
      cellVersion: existing?.version ?? 0,
      ...(existing?.stateReason ? { reason: existing.stateReason } : {}),
    };
  });
  const required = new Set(
    visible.filter((field) => field.requiredForFinal).map((field) => field.id),
  );
  const complete =
    Boolean(definition) &&
    cells.every(
      (cell) =>
        !required.has(cell.fieldId) || cellIsComplete(cell.value, definition!),
    );
  return {
    slotId: row.id,
    slotRevision: row.revision,
    placementRevision: row.placementRevision,
    publicationGeneration: row.publicationGeneration,
    student: {
      studentId: student.id,
      displayName: ar || en,
      name: label(ar || en, en),
    },
    enrollmentId: row.enrollmentId,
    placementStatus: row.rosterState,
    historicalPlacement: row.historicalPlacement,
    groupExempt: row.groupExempt,
    cells: cells.filter((cell) => selected.has(cell.fieldId)),
    completeness: complete ? ('COMPLETE' as const) : ('PARTIAL' as const),
  };
}

function cellIsComplete(
  value: ResultValue,
  definition: ResultDefinition,
): boolean {
  return (
    value.status === 'RECORDED' ||
    value.status === 'NOT_APPLICABLE' ||
    (value.status === 'ABSENT' &&
      definition.calculationPolicy.absent === 'ZERO') ||
    (value.status === 'EXCUSED' &&
      definition.calculationPolicy.excused === 'EXCLUDE')
  );
}
