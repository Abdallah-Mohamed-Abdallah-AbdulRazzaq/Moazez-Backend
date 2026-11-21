import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateResultFields } from './result-calculation';
import { moazezStarterDefinition } from './moazez-starter';
import {
  type ResultDefinition,
  type ResultField,
  validateResultDefinition,
} from './result-definition';
import { normalizeManualValue, type ResultValue } from './result-value';

type Vector = {
  id: string;
  description: string;
  operation:
    | 'SUM_POINTS'
    | 'WEIGHTED_PERCENTAGE'
    | 'NORMALIZED_AVERAGE'
    | 'PASS_THRESHOLD'
    | 'SCALE_TO'
    | 'GRAPH_VALIDATION';
  inputs?: Record<string, ResultValue>;
  policyOverride?: { absent?: 'ZERO' };
  weights?: Record<string, string>;
  independentInput?: { value: ResultValue; inputScale: number };
  threshold?: string;
  targetMaximum?: string;
  expected?: Record<string, unknown>;
  expectedError?: string;
};

const vectors = (
  JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        'test/fixtures/official-results-calculation-vectors.json',
      ),
      'utf8',
    ),
  ) as { vectors: Vector[] }
).vectors;

function defineVector(vector: Vector) {
  const definition = moazezStarterDefinition();
  const total = definition.fields.find((field) => field.code === 'total')!;
  let output = total;
  let inputs = vector.inputs ?? {};
  if (vector.id === 'CALC-006') definition.calculationPolicy.absent = 'ZERO';
  if (
    vector.operation === 'WEIGHTED_PERCENTAGE' ||
    vector.operation === 'NORMALIZED_AVERAGE'
  ) {
    total.formula = {
      operationVersion: 1,
      op: vector.operation,
      operands: total.formula!.operands.map((value) => {
        const source = definition.fields.find(
          (field) => field.id === value.fieldId,
        )!;
        return { ...value, weight: vector.weights?.[source.code] };
      }),
    };
    total.outputKind = 'PERCENTAGE';
    total.constraints = {};
  }
  if (vector.operation === 'PASS_THRESHOLD') {
    const manual = definition.fields[0];
    manual.kind = 'PERCENTAGE';
    manual.constraints = {
      minPercentage: '0',
      maxPercentage: '100',
      inputScale: vector.independentInput!.inputScale,
    };
    total.outputKind = 'PASS_FAIL';
    total.constraints = {};
    total.formula = {
      operationVersion: 1,
      op: 'PASS_THRESHOLD',
      thresholdPercentage: vector.threshold,
      operands: [{ fieldId: manual.id }],
    };
    inputs = { [manual.code]: vector.independentInput!.value };
  }
  if (vector.operation === 'SCALE_TO') {
    const attach = (field: ResultField) => {
      definition.fields.push(field);
      definition.releaseUnits[0].outputFieldIds.push(field.id);
      return field;
    };
    const ratio = attach({
      ...total,
      id: randomUUID(),
      code: 'normalized',
      outputKind: 'PERCENTAGE',
      constraints: {},
      formula: {
        operationVersion: 1,
        op: 'NORMALIZED_AVERAGE',
        operands: [{ fieldId: total.id }],
      },
    });
    output = attach({
      ...total,
      id: randomUUID(),
      code: 'deliberate_scale',
      constraints: { nominalMaxScore: vector.targetMaximum! },
      formula: {
        operationVersion: 1,
        op: 'SCALE_TO',
        targetMaxScore: vector.targetMaximum,
        operands: [{ fieldId: ratio.id }],
      },
    });
    inputs = {
      coursework: { status: 'RECORDED', score: '18.00' },
      tests: { status: 'EXCUSED' },
      term_exam: { status: 'RECORDED', score: '46.00' },
    };
  }
  if (vector.id === 'CALC-017') {
    const other = { ...total, id: randomUUID(), code: 'cycle_partner' };
    total.formula = {
      operationVersion: 1,
      op: 'SUM_POINTS',
      operands: [{ fieldId: other.id }],
    };
    other.formula = {
      operationVersion: 1,
      op: 'SUM_POINTS',
      operands: [{ fieldId: total.id }],
    };
    definition.fields.push(other);
    definition.releaseUnits[0].outputFieldIds.push(other.id);
  }
  if (vector.id === 'CALC-018') {
    total.formula!.operands = [
      total.formula!.operands[0],
      total.formula!.operands[0],
    ];
  }
  return { definition, output, inputs };
}

describe('Official Results exact calculation vectors', () => {
  it.each(vectors)('$id $description', (vector) => {
    const { definition, output, inputs } = defineVector(vector);
    const calculate = () => {
      validateResultDefinition(definition, true);
      const typed = new Map(
        Object.entries(inputs).map(([code, input]) => {
          const field = definition.fields.find((value) => value.code === code)!;
          return [field.id, normalizeManualValue(field, input)];
        }),
      );
      return evaluateResultFields(definition, typed).get(output.id)!;
    };
    if (vector.expectedError) {
      const code = ['CALC-012', 'CALC-013'].includes(vector.id)
        ? 'cell.invalid_value'
        : 'schema.invalid';
      expect(calculate).toThrow(
        expect.objectContaining({ code: 'official_results.' + code }),
      );
      return;
    }
    const { displayPercentage, storedInputStatus, ...expected } =
      vector.expected!;
    const result = calculate();
    expect(result).toMatchObject(expected);
    if (displayPercentage)
      expect(result.evaluation?.displayPercentage).toBe(displayPercentage);
    if (storedInputStatus) expect(inputs.tests.status).toBe(storedInputStatus);
  });

  it('T031 and T034 enforce decimal precision and retain false, literal zero and stable option codes', () => {
    const field = moazezStarterDefinition().fields[0];
    for (const invalid of ['NaN', '1e1', '1,000', '0.001', 'Infinity']) {
      expect(() =>
        normalizeManualValue(field, { status: 'RECORDED', score: invalid }),
      ).toThrow(
        expect.objectContaining({
          code: 'official_results.cell.invalid_value',
        }),
      );
    }
    const boolean: ResultField = { ...field, kind: 'BOOLEAN', constraints: {} };
    const text: ResultField = {
      ...field,
      kind: 'TEXT',
      constraints: { maxCharacters: 500 },
    };
    const select: ResultField = {
      ...field,
      kind: 'SELECT',
      constraints: {},
      options: [
        {
          code: 'ZERO',
          label: { ar: 'صفر', en: 'Zero' },
          order: 0,
          active: true,
        },
      ],
    };
    expect(
      normalizeManualValue(boolean, { status: 'RECORDED', boolean: false }),
    ).toEqual({ status: 'RECORDED', boolean: false });
    expect(
      normalizeManualValue(text, { status: 'RECORDED', text: '0' }),
    ).toEqual({ status: 'RECORDED', text: '0' });
    expect(
      normalizeManualValue(select, { status: 'RECORDED', optionCode: 'ZERO' }),
    ).toEqual({ status: 'RECORDED', optionCode: 'ZERO' });
    expect(() =>
      normalizeManualValue(select, {
        status: 'RECORDED',
        optionCode: 'INVALID',
      }),
    ).toThrow();
    expect(() =>
      normalizeManualValue(boolean, {
        status: 'RECORDED',
        boolean: false,
        text: '0',
      }),
    ).toThrow();
  });

  it('evaluates grade bands using exact endpoints and includes 100 in the final band', () => {
    const definition: ResultDefinition = moazezStarterDefinition();
    const first = definition.fields[0];
    const total = definition.fields.find((field) => field.code === 'total')!;
    total.outputKind = 'SELECT';
    total.constraints = {};
    total.formula = {
      operationVersion: 1,
      op: 'GRADE_BAND',
      operands: [{ fieldId: first.id }],
      bands: [
        { code: 'DEVELOPING', label: first.label, minimum: '0', maximum: '50' },
        {
          code: 'COMPLETED',
          label: first.label,
          minimum: '50',
          maximum: '100',
        },
      ],
    };
    validateResultDefinition(definition, true);
    for (const score of ['10.00', '20.00']) {
      expect(
        evaluateResultFields(
          definition,
          new Map([[first.id, { status: 'RECORDED', score }]]),
        ).get(total.id)?.value,
      ).toEqual({ status: 'RECORDED', optionCode: 'COMPLETED' });
    }
  });
});
