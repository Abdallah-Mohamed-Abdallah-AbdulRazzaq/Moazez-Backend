import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
const text: SchemaObject = { type: 'string' };
const version: SchemaObject = { type: 'integer', enum: [1] };
const kind = (value: string): SchemaObject => ({
  type: 'string',
  enum: [value],
});
const object = (
  properties: Record<string, SchemaObject>,
  required = Object.keys(properties),
): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const array = (items: SchemaObject, maxItems = 50): SchemaObject => ({
  type: 'array',
  items,
  maxItems,
});
const pair = object({ leftId: text, rightId: text });
const policy: SchemaObject = {
  oneOf: [
    object({ policyVersion: version, mode: kind('EXACT') }),
    object({
      policyVersion: version,
      mode: kind('ABSOLUTE_TOLERANCE'),
      tolerance: text,
    }),
    object({
      policyVersion: version,
      mode: kind('RELATIVE_TOLERANCE'),
      relativeTolerance: text,
    }),
    object({
      policyVersion: version,
      mode: kind('EXPLICIT_ACCEPTED_RANGE'),
      lower: text,
      upper: text,
      includeLower: { type: 'boolean' },
      includeUpper: { type: 'boolean' },
    }),
  ],
};
/** Closed projections only. These schemas do not authorize any disclosure. */
export const GRADE_RELEASED_KEY_OPENAPI: SchemaObject[] = [
  object({
    kind: kind('choice'),
    correctOptionIds: array({ type: 'string', format: 'uuid' }),
  }),
  object({ kind: kind('matching'), pairs: array(pair) }),
  object({
    keyVersion: version,
    kind: kind('fill'),
    normalization: kind('NFC_TRIM'),
    blanks: array(
      object({
        blankId: text,
        acceptedTexts: array({ type: 'string', maxLength: 1000 }, 20),
      }),
    ),
  }),
  object({
    keyVersion: version,
    kind: kind('ordering'),
    expectedItemIds: array(text),
  }),
  object(
    {
      keyVersion: version,
      kind: kind('numeric'),
      reference: object({
        value: text,
        unitCode: { type: 'string', nullable: true },
      }),
      policy,
    },
    ['keyVersion', 'kind', 'reference'],
  ),
  object({
    keyVersion: version,
    kind: kind('math_expression'),
    expression: { type: 'string', maxLength: 512 },
  }),
  object(
    {
      keyVersion: version,
      kind: kind('model_text'),
      text: { type: 'string', maxLength: 10000 },
      textAr: { type: 'string', maxLength: 10000 },
    },
    ['keyVersion', 'kind', 'text'],
  ),
];
