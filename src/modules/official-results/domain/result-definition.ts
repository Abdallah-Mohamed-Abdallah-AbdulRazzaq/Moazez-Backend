import { randomUUID } from 'node:crypto';
import { z } from 'zod/v4';
import { OfficialResultsError } from './official-results.error';

export const resultLabel = z.strictObject({
  ar: z.string().trim().min(1).max(200),
  en: z.string().trim().min(1).max(200),
});
export const resultAuthoringLabel = resultLabel
  .extend({ en: resultLabel.shape.en.optional() })
  .transform((value) => ({ ar: value.ar, en: value.en ?? value.ar }));
const text = z.string().trim().min(1).max(2000);
const code = z.string().regex(/^[\p{L}\p{N}][\p{L}\p{N}_.-]{0,63}$/u);
const localKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/u);
export const resultDecimalString = z
  .string()
  .max(21)
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u);
const audiences = z.array(z.enum(['STAFF', 'STUDENT', 'PARENT'])).max(3);
const accessRule = z.enum(['INHERIT_SHEET', 'SCHOOL_ONLY', 'EXPLICIT_GRANT']);
const kind = z.enum([
  'SCORE',
  'PERCENTAGE',
  'TEXT',
  'SELECT',
  'PASS_FAIL',
  'BOOLEAN',
  'CALCULATED',
]);
const outputKinds = z.enum(['SCORE', 'PERCENTAGE', 'SELECT', 'PASS_FAIL']);
const inputScale = z.number().int().min(0).max(4);
const states = z.enum([
  'RECORDED',
  'MISSING',
  'ABSENT',
  'EXCUSED',
  'NOT_APPLICABLE',
]);
const option = z.strictObject({
  code,
  label: resultAuthoringLabel,
  order: z.number().int().min(0).max(5000),
  active: z.boolean().default(true),
});
const fieldReference = z.union([
  z.strictObject({ fieldId: z.uuid() }),
  z.strictObject({ clientFieldKey: localKey }),
]);
const operand = z.union([
  z.strictObject({ fieldId: z.uuid(), weight: resultDecimalString.optional() }),
  z.strictObject({
    clientFieldKey: localKey,
    weight: resultDecimalString.optional(),
  }),
]);
const formula = z.strictObject({
  operationVersion: z.literal(1),
  op: z.enum([
    'SUM_POINTS',
    'NORMALIZED_AVERAGE',
    'WEIGHTED_PERCENTAGE',
    'SCALE_TO',
    'GRADE_BAND',
    'PASS_THRESHOLD',
  ]),
  operands: z.array(operand).min(1).max(200),
  targetMaxScore: resultDecimalString.optional(),
  thresholdPercentage: resultDecimalString.optional(),
  bands: z
    .array(
      z.strictObject({
        code,
        label: resultAuthoringLabel,
        minimum: resultDecimalString,
        maximum: resultDecimalString,
      }),
    )
    .min(1)
    .max(100)
    .optional(),
});

const fieldConstraints = z.union([
  z.strictObject({
    minScore: resultDecimalString,
    maxScore: resultDecimalString,
    inputScale,
  }),
  z.strictObject({
    minPercentage: resultDecimalString,
    maxPercentage: resultDecimalString,
    inputScale,
  }),
  z.strictObject({ maxCharacters: z.number().int().min(1).max(5000) }),
  z.strictObject({ nominalMaxScore: resultDecimalString }),
  z.strictObject({}),
]);
const field = z.strictObject({
  id: z.uuid().optional(),
  clientKey: localKey.optional(),
  code,
  label: resultAuthoringLabel,
  helpText: text.optional(),
  kind,
  outputKind: outputKinds.optional(),
  textMode: z.enum(['SHORT', 'LONG']).optional(),
  order: z.number().int().min(0).max(5000),
  requiredForFinal: z.boolean(),
  constraints: fieldConstraints,
  options: z.array(option).min(1).max(100).optional(),
  allowedStates: z.array(states).min(1).max(5).optional(),
  stateReasonRequired: z.array(states).max(3).optional(),
  audiences,
  readRule: accessRule,
  editRule: z.union([accessRule, z.literal('COMPUTED_ONLY')]),
  releaseUnitId: z.uuid().nullable().optional(),
  clientUnitKey: localKey.optional(),
  formula: formula.optional(),
});
const disclosure = z.strictObject({
  outputFieldId: z.uuid(),
  privateOperandFieldIds: z.array(z.uuid()).min(1).max(200),
  audiences: audiences.refine((values) => values.length > 0),
  reason: text,
});
const releaseUnit = z.strictObject({
  id: z.uuid().optional(),
  clientUnitKey: localKey.optional(),
  code,
  label: resultAuthoringLabel,
  classification: z.enum(['PROGRESS', 'FINAL']),
  order: z.number().int().min(0).max(5000).optional(),
  outputFieldIds: z.array(z.uuid()).max(256).optional(),
  outputFields: z.array(fieldReference).max(256).optional(),
  derivedDisclosure: z.array(disclosure).max(64).default([]),
});
export const calculationPolicySchema = z.strictObject({
  version: z.literal(1),
  missing: z.literal('INCOMPLETE'),
  absent: z.enum(['INCOMPLETE', 'ZERO']),
  excused: z.enum(['EXCLUDE', 'INCOMPLETE']),
  notApplicable: z.literal('EXCLUDE'),
  inputScale,
  evaluationPrecision: z.number().int().min(32).max(64).default(40),
  displayRounding: z.strictObject({
    mode: z.enum(['HALF_UP', 'HALF_EVEN', 'DOWN']),
    scale: z.number().int().min(0).max(6),
  }),
  decisionUses: z.literal('PRE_DISPLAY_NORMALIZED_VALUE'),
});
export const resultDefinitionAuthoringSchema = z.strictObject({
  label: resultAuthoringLabel,
  helpText: text.optional(),
  groupKind: z.enum(['SUBJECT', 'CUSTOM']),
  fields: z.array(field).min(1).max(256),
  releaseUnits: z.array(releaseUnit).min(1).max(64),
  calculationPolicy: calculationPolicySchema,
  presentationHints: z
    .strictObject({
      preferredView: z.enum(['CARDS', 'TABLE']).optional(),
    })
    .optional(),
});

export const resultDefinitionResolvedSchema =
  resultDefinitionAuthoringSchema.extend({
    label: resultLabel,
    fields: z.array(
      field.omit({ clientKey: true, clientUnitKey: true }).extend({
        id: z.uuid(),
        label: resultLabel,
        options: z.array(option.extend({ label: resultLabel })).optional(),
        releaseUnitId: z.uuid().nullable(),
        allowedStates: z.array(states),
        stateReasonRequired: z.array(states),
        formula: formula
          .extend({
            operands: z.array(
              z.strictObject({
                fieldId: z.uuid(),
                weight: resultDecimalString.optional(),
              }),
            ),
            bands: z
              .array(
                z.strictObject({
                  code,
                  label: resultLabel,
                  minimum: resultDecimalString,
                  maximum: resultDecimalString,
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    ),
    releaseUnits: z.array(
      releaseUnit.omit({ clientUnitKey: true, outputFields: true }).extend({
        id: z.uuid(),
        label: resultLabel,
        order: z.number().int(),
        outputFieldIds: z.array(z.uuid()),
      }),
    ),
  });

type FieldInput = z.infer<typeof field>;
type UnitInput = z.infer<typeof releaseUnit>;
type Formula = z.infer<typeof formula>;
export type NormalizedResultFormula = Omit<Formula, 'operands'> & {
  operands: { fieldId: string; weight?: string }[];
};
export type ResultField = Omit<
  FieldInput,
  'id' | 'clientKey' | 'clientUnitKey' | 'releaseUnitId' | 'formula'
> & {
  id: string;
  releaseUnitId: string | null;
  allowedStates: z.infer<typeof states>[];
  stateReasonRequired: z.infer<typeof states>[];
  formula?: NormalizedResultFormula;
};
export type ResultReleaseUnit = Omit<
  UnitInput,
  'id' | 'clientUnitKey' | 'outputFields' | 'outputFieldIds' | 'order'
> & {
  id: string;
  outputFieldIds: string[];
  order: number;
};
export type ResultDefinition = Omit<
  z.infer<typeof resultDefinitionAuthoringSchema>,
  'fields' | 'releaseUnits'
> & {
  fields: ResultField[];
  releaseUnits: ResultReleaseUnit[];
};
export type DefinitionIdentityMap = {
  fields: { clientKey: string; fieldId: string }[];
  units: { clientUnitKey: string; releaseUnitId: string }[];
};

export function decimalMicros(value: string): bigint {
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  return value.startsWith('-') ? -units : units;
}

function invalid(path: string): never {
  throw new OfficialResultsError('schema.invalid', { path });
}

function distinct(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) invalid(path);
}

function getReference(
  value: z.infer<typeof fieldReference> | z.infer<typeof operand>,
  map: Map<string, string>,
): string {
  if ('fieldId' in value) return value.fieldId;
  const result = map.get(value.clientFieldKey);
  if (!result) invalid('fieldReference');
  return result;
}

function validateConstraints(item: ResultField): void {
  const constraints = item.constraints;
  switch (item.kind) {
    case 'SCORE': {
      if (!('minScore' in constraints)) invalid('constraints.minScore');
      const min = decimalMicros(constraints.minScore);
      const max = decimalMicros(constraints.maxScore);
      if (min < 0n || max <= min || max > 1_000_000_000_000n)
        invalid('constraints.maxScore');
      break;
    }
    case 'PERCENTAGE': {
      if (!('minPercentage' in constraints))
        invalid('constraints.minPercentage');
      const min = decimalMicros(constraints.minPercentage);
      const max = decimalMicros(constraints.maxPercentage);
      if (min < 0n || max <= min || max > 100_000_000n)
        invalid('constraints.maxPercentage');
      break;
    }
    case 'TEXT':
      if (
        !('maxCharacters' in constraints) ||
        (item.textMode !== 'LONG' && constraints.maxCharacters > 500)
      )
        invalid('constraints.maxCharacters');
      break;
    case 'CALCULATED':
      if (item.outputKind === 'SCORE' && !('nominalMaxScore' in constraints))
        invalid('constraints.nominalMaxScore');
      if (item.outputKind !== 'SCORE' && Object.keys(constraints).length)
        invalid('constraints');
      if (
        'nominalMaxScore' in constraints &&
        decimalMicros(constraints.nominalMaxScore) <= 0n
      ) {
        invalid('constraints.nominalMaxScore');
      }
      break;
    default:
      if (Object.keys(constraints).length) invalid('constraints');
  }
  if ((item.kind === 'SELECT') !== Boolean(item.options)) invalid('options');
  if (item.options)
    distinct(
      item.options.map(({ code }) => code),
      'options.code',
    );
  if (item.kind !== 'TEXT' && item.textMode !== undefined) invalid('textMode');
  distinct(item.allowedStates, 'allowedStates');
  distinct(item.stateReasonRequired, 'stateReasonRequired');
  if (
    item.stateReasonRequired.some(
      (value) =>
        !['ABSENT', 'EXCUSED', 'NOT_APPLICABLE'].includes(value) ||
        !item.allowedStates.includes(value),
    )
  ) {
    invalid('stateReasonRequired');
  }
}

function numberKind(field: ResultField): string | undefined {
  return field.kind === 'CALCULATED' ? field.outputKind : field.kind;
}

function validateOperation(
  destination: ResultField,
  inputs: ResultField[],
): void {
  const f = destination.formula!;
  if (
    inputs.some(
      (item) => !['SCORE', 'PERCENTAGE'].includes(numberKind(item) ?? ''),
    )
  )
    invalid('formula.operands');
  if (
    (f.op !== 'SCALE_TO' && f.targetMaxScore !== undefined) ||
    (f.op !== 'PASS_THRESHOLD' && f.thresholdPercentage !== undefined) ||
    (f.op !== 'GRADE_BAND' && f.bands !== undefined) ||
    (f.op !== 'WEIGHTED_PERCENTAGE' &&
      f.operands.some((item) => item.weight !== undefined))
  )
    invalid('formula');
  const expectedKinds = {
    SUM_POINTS: 'SCORE',
    NORMALIZED_AVERAGE: 'PERCENTAGE',
    WEIGHTED_PERCENTAGE: 'PERCENTAGE',
    SCALE_TO: 'SCORE',
    GRADE_BAND: 'SELECT',
    PASS_THRESHOLD: 'PASS_FAIL',
  } as const;
  if (expectedKinds[f.op] !== destination.outputKind) invalid('outputKind');
  switch (f.op) {
    case 'SUM_POINTS':
      if (inputs.some((item) => numberKind(item) !== 'SCORE'))
        invalid('formula.operands');
      if ('nominalMaxScore' in destination.constraints) {
        const implied = inputs.reduce((sum, item) => {
          const constraints = item.constraints;
          if ('maxScore' in constraints)
            return sum + decimalMicros(constraints.maxScore);
          if ('nominalMaxScore' in constraints)
            return sum + decimalMicros(constraints.nominalMaxScore);
          return invalid('formula.nominalMaxScore');
        }, 0n);
        if (implied !== decimalMicros(destination.constraints.nominalMaxScore))
          invalid('formula.nominalMaxScore');
      }
      break;
    case 'WEIGHTED_PERCENTAGE': {
      const weights = f.operands.map(({ weight }) =>
        weight ? decimalMicros(weight) : 0n,
      );
      if (
        weights.some((weight) => weight <= 0n) ||
        weights.reduce((left, right) => left + right, 0n) !== 100_000_000n
      )
        invalid('formula.weights');
      break;
    }
    case 'SCALE_TO':
      if (
        inputs.length !== 1 ||
        numberKind(inputs[0]) !== 'PERCENTAGE' ||
        !f.targetMaxScore ||
        !('nominalMaxScore' in destination.constraints) ||
        decimalMicros(f.targetMaxScore) !==
          decimalMicros(destination.constraints.nominalMaxScore)
      )
        invalid('formula.targetMaxScore');
      break;
    case 'PASS_THRESHOLD':
      if (
        inputs.length !== 1 ||
        f.thresholdPercentage === undefined ||
        decimalMicros(f.thresholdPercentage) < 0n ||
        decimalMicros(f.thresholdPercentage) > 100_000_000n
      )
        invalid('formula.thresholdPercentage');
      break;
    case 'GRADE_BAND': {
      if (inputs.length !== 1 || !f.bands) invalid('formula.bands');
      distinct(
        f.bands.map((band) => band.code),
        'formula.bands.code',
      );
      let boundary = 0n;
      for (const band of f.bands) {
        if (
          decimalMicros(band.minimum) !== boundary ||
          decimalMicros(band.maximum) <= boundary
        )
          invalid('formula.bands');
        boundary = decimalMicros(band.maximum);
      }
      if (boundary !== 100_000_000n) invalid('formula.bands');
      break;
    }
    case 'NORMALIZED_AVERAGE':
      break;
  }
}

export function validateResultDefinition(
  definition: ResultDefinition,
  schoolDesign: boolean,
): void {
  distinct(
    definition.fields.map((item) => item.id),
    'fields.id',
  );
  distinct(
    definition.fields.map((item) => item.code),
    'fields.code',
  );
  distinct(
    definition.releaseUnits.map((unit) => unit.id),
    'releaseUnits.id',
  );
  distinct(
    definition.releaseUnits.map((unit) => unit.code),
    'releaseUnits.code',
  );
  if (
    definition.fields.filter((item) => item.kind !== 'CALCULATED').length > 200
  )
    invalid('fields');
  const fieldById = new Map(definition.fields.map((item) => [item.id, item]));
  const unitById = new Map(
    definition.releaseUnits.map((unit) => [unit.id, unit]),
  );
  const allocated = new Set<string>();
  for (const unit of definition.releaseUnits) {
    distinct(unit.outputFieldIds, 'releaseUnits.outputFieldIds');
    distinct(
      unit.derivedDisclosure.map((item) => item.outputFieldId),
      'releaseUnits.derivedDisclosure',
    );
    for (const rule of unit.derivedDisclosure) {
      distinct(
        rule.privateOperandFieldIds,
        'releaseUnits.derivedDisclosure.privateOperandFieldIds',
      );
      distinct(rule.audiences, 'releaseUnits.derivedDisclosure.audiences');
      if (
        !unit.outputFieldIds.includes(rule.outputFieldId) ||
        fieldById.get(rule.outputFieldId)?.kind !== 'CALCULATED'
      ) {
        invalid('releaseUnits.derivedDisclosure.outputFieldId');
      }
    }
    for (const id of unit.outputFieldIds) {
      if (allocated.has(id) || fieldById.get(id)?.releaseUnitId !== unit.id)
        invalid('releaseUnits.outputFieldIds');
      allocated.add(id);
    }
    if (!schoolDesign && unit.derivedDisclosure.length)
      invalid('releaseUnits.derivedDisclosure');
  }
  const graph = new Map<
    string,
    { leaves: Set<string>; dependencies: Set<string>; depth: number }
  >();
  const active = new Set<string>();
  const visit = (
    item: ResultField,
  ): { leaves: Set<string>; dependencies: Set<string>; depth: number } => {
    const cached = graph.get(item.id);
    if (cached) return cached;
    if (active.has(item.id) || active.size >= 16)
      invalid('formula.cycle_or_depth');
    if (!item.formula) {
      const terminal = {
        leaves: new Set([item.id]),
        dependencies: new Set<string>(),
        depth: 0,
      };
      graph.set(item.id, terminal);
      return terminal;
    }
    active.add(item.id);
    const leaves = new Set<string>();
    const dependencies = new Set<string>();
    let depth = 1;
    const sources = item.formula.operands.map(({ fieldId }) => {
      const source = fieldById.get(fieldId);
      if (!source) invalid('formula.operands');
      const resolved = visit(source);
      depth = Math.max(depth, resolved.depth + 1);
      if (depth > 16 || [...resolved.leaves].some((id) => leaves.has(id)))
        invalid('formula.duplicate_operand');
      resolved.leaves.forEach((id) => leaves.add(id));
      resolved.dependencies.forEach((id) => dependencies.add(id));
      dependencies.add(fieldId);
      return source;
    });
    validateOperation(item, sources);
    active.delete(item.id);
    const resolved = { leaves, dependencies, depth };
    graph.set(item.id, resolved);
    return resolved;
  };

  const owningUnits = new Map<string, string>();
  for (const item of definition.fields) {
    validateConstraints(item);
    distinct(item.audiences, 'audiences');
    if (
      (item.kind === 'CALCULATED') !== Boolean(item.formula) ||
      (item.kind === 'CALCULATED') !== Boolean(item.outputKind) ||
      (item.kind === 'CALCULATED') !== (item.editRule === 'COMPUTED_ONLY')
    )
      invalid('formula');
    if (
      item.releaseUnitId &&
      (!unitById.has(item.releaseUnitId) || !allocated.has(item.id))
    )
      invalid('releaseUnitId');
    if (
      !item.releaseUnitId &&
      item.audiences.some((value) => value !== 'STAFF')
    )
      invalid('releaseUnitId');
    const dependencies = visit(item).dependencies;
    const unit = item.releaseUnitId
      ? unitById.get(item.releaseUnitId)
      : undefined;
    const exception = unit?.derivedDisclosure.find(
      (rule) => rule.outputFieldId === item.id,
    );
    const privateOperands = [...dependencies].filter((id) => {
      const source = fieldById.get(id)!;
      if (!schoolDesign && source.readRule !== 'INHERIT_SHEET')
        invalid('formula.protected_operand');
      if (unit) {
        if (source.releaseUnitId !== null && source.releaseUnitId !== unit.id)
          invalid('formula.release_unit');
        const owner = owningUnits.get(id);
        if (owner && owner !== unit.id) invalid('formula.release_unit');
        owningUnits.set(id, unit.id);
      }
      return item.audiences.some(
        (audience) => !source.audiences.includes(audience),
      );
    });
    if (privateOperands.length) {
      if (
        !exception ||
        privateOperands.some(
          (id) => !exception.privateOperandFieldIds.includes(id),
        ) ||
        exception.privateOperandFieldIds.some(
          (id) => !privateOperands.includes(id),
        ) ||
        item.audiences.some(
          (audience) =>
            [...dependencies].some(
              (id) => !fieldById.get(id)!.audiences.includes(audience),
            ) && !exception.audiences.includes(audience),
        )
      )
        invalid('formula.derived_disclosure');
    } else if (exception) invalid('formula.derived_disclosure');
  }
}

export function normalizeResultDefinition(
  input: unknown,
  base: ResultDefinition | null,
  schoolDesign: boolean,
): { definition: ResultDefinition; identityMap: DefinitionIdentityMap } {
  const parsed = resultDefinitionAuthoringSchema.safeParse(input);
  if (!parsed.success)
    throw new OfficialResultsError('schema.invalid', {
      fields: parsed.error.issues
        .map(({ path, code }) => ({ path, code }))
        .slice(0, 20),
    });
  const { fields, releaseUnits, ...root } = parsed.data;
  const fieldKeys = new Map<string, string>();
  const unitKeys = new Map<string, string>();
  const baseFields = new Map(base?.fields.map((item) => [item.id, item]) ?? []);
  const baseUnits = new Set(base?.releaseUnits.map((item) => item.id) ?? []);
  const normalizedFields = fields.map(({ id, clientKey, ...item }) => {
    if (Number(Boolean(id)) + Number(Boolean(clientKey)) !== 1)
      invalid('fields.identity');
    if (id) {
      const prior = baseFields.get(id);
      if (
        !prior ||
        prior.code !== item.code ||
        prior.kind !== item.kind ||
        prior.outputKind !== item.outputKind
      ) {
        invalid('fields.identity');
      }
      if (
        prior.options &&
        prior.options.some(
          (option) =>
            !item.options?.some((value) => value.code === option.code),
        )
      ) {
        invalid('fields.options');
      }
      if (
        !schoolDesign &&
        ((prior.readRule !== 'INHERIT_SHEET' &&
          prior.readRule !== item.readRule) ||
          (prior.editRule !== 'INHERIT_SHEET' &&
            prior.editRule !== item.editRule) ||
          item.audiences.some((value) => !prior.audiences.includes(value)))
      )
        invalid('fields.protection');
    }
    const fieldId = id ?? randomUUID();
    if (clientKey) {
      if (fieldKeys.has(clientKey)) invalid('fields.clientKey');
      fieldKeys.set(clientKey, fieldId);
    }
    return { ...item, id: fieldId };
  });
  const units = releaseUnits.map(
    ({ id, clientUnitKey, outputFieldIds, outputFields, ...item }, index) => {
      if (
        Number(Boolean(id)) + Number(Boolean(clientUnitKey)) !== 1 ||
        (id && !baseUnits.has(id)) ||
        Boolean(outputFieldIds) === Boolean(outputFields)
      )
        invalid('releaseUnits.identity');
      const unitId = id ?? randomUUID();
      if (clientUnitKey) {
        if (unitKeys.has(clientUnitKey)) invalid('releaseUnits.clientUnitKey');
        unitKeys.set(clientUnitKey, unitId);
      }
      return {
        ...item,
        id: unitId,
        order: item.order ?? index,
        outputFieldIds:
          outputFieldIds ??
          outputFields!.map((value) => getReference(value, fieldKeys)),
      };
    },
  );
  const definition: ResultDefinition = {
    ...root,
    releaseUnits: units,
    fields: normalizedFields.map(
      ({ clientUnitKey, releaseUnitId, formula: f, ...item }) => {
        if (clientUnitKey && releaseUnitId !== undefined)
          invalid('releaseUnitId');
        const unit = clientUnitKey
          ? unitKeys.get(clientUnitKey)
          : releaseUnitId;
        if (clientUnitKey && !unit) invalid('releaseUnitId');
        return {
          ...item,
          releaseUnitId: unit ?? null,
          allowedStates: item.allowedStates ?? ['RECORDED', 'MISSING'],
          stateReasonRequired: item.stateReasonRequired ?? [],
          formula: f
            ? {
                ...f,
                operands: f.operands.map((operand) => ({
                  fieldId: getReference(operand, fieldKeys),
                  weight: operand.weight,
                })),
              }
            : undefined,
        };
      },
    ),
  };
  validateResultDefinition(definition, schoolDesign);
  return {
    definition,
    identityMap: {
      fields: [...fieldKeys].map(([clientKey, fieldId]) => ({
        clientKey,
        fieldId,
      })),
      units: [...unitKeys].map(([clientUnitKey, releaseUnitId]) => ({
        clientUnitKey,
        releaseUnitId,
      })),
    },
  };
}

export function cloneResultDefinition(
  source: ResultDefinition,
  label: ResultDefinition['label'],
) {
  const fieldLineage = new Map(
    source.fields.map(({ id }) => [id, randomUUID()]),
  );
  const unitLineage = new Map(
    source.releaseUnits.map(({ id }) => [id, randomUUID()]),
  );
  const definition: ResultDefinition = {
    ...structuredClone(source),
    label,
    fields: source.fields.map((field) => ({
      ...structuredClone(field),
      id: fieldLineage.get(field.id)!,
      releaseUnitId: field.releaseUnitId
        ? unitLineage.get(field.releaseUnitId)!
        : null,
      formula: field.formula
        ? {
            ...structuredClone(field.formula),
            operands: field.formula.operands.map((operand) => ({
              ...operand,
              fieldId: fieldLineage.get(operand.fieldId)!,
            })),
          }
        : undefined,
    })),
    releaseUnits: source.releaseUnits.map((unit) => ({
      ...structuredClone(unit),
      id: unitLineage.get(unit.id)!,
      outputFieldIds: unit.outputFieldIds.map((id) => fieldLineage.get(id)!),
      derivedDisclosure: unit.derivedDisclosure.map((rule) => ({
        ...structuredClone(rule),
        outputFieldId: fieldLineage.get(rule.outputFieldId)!,
        privateOperandFieldIds: rule.privateOperandFieldIds.map(
          (id) => fieldLineage.get(id)!,
        ),
      })),
    })),
  };
  return {
    definition,
    fieldLineage: [...fieldLineage],
    unitLineage: [...unitLineage],
  };
}
