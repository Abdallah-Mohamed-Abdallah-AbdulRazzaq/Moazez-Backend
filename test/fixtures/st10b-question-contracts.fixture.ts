/** Shared test data only; each domain still owns its application and persistence. */
export const st10bCases = [
  {
    type: 'ORDERING',
    kind: 'ordering',
    definition: {
      definitionVersion: 1,
      kind: 'ordering',
      items: [
        { id: 'a', displayOrder: 1, label: 'Step A' },
        { id: 'b', displayOrder: 2, label: 'Step B' },
        { id: 'c', displayOrder: 3, label: 'Step C' },
      ],
    },
    key: { keyVersion: 1, kind: 'ordering', expectedItemIds: ['b', 'a', 'c'] },
    answer: { orderedItemIds: ['b', 'a', 'c'] },
    partial: { orderedItemIds: ['b'] },
    changed: {
      definitionVersion: 1,
      kind: 'ordering',
      items: [
        { id: 'a', displayOrder: 1, label: 'Step A' },
        { id: 'b', displayOrder: 2, label: 'Step B' },
        { id: 'd', displayOrder: 3, label: 'Step D' },
      ],
    },
  },
  {
    type: 'NUMERIC',
    kind: 'numeric',
    definition: {
      definitionVersion: 1,
      kind: 'numeric',
      units: {
        required: true,
        allowedCodes: ['m', 'cm'],
        allowUnitless: false,
      },
    },
    key: {
      keyVersion: 1,
      kind: 'numeric',
      reference: { value: '12.5', unitCode: 'm' },
      policy: { policyVersion: 1, mode: 'EXACT' },
    },
    answer: { value: '۱۲٫۵۰۰', unitCode: 'm' },
    partial: { unitCode: 'm' },
    changed: {
      definitionVersion: 1,
      kind: 'numeric',
      units: { required: true, allowedCodes: ['cm'], allowUnitless: false },
    },
  },
  {
    type: 'MATH_EXPRESSION',
    kind: 'math_expression',
    definition: {
      definitionVersion: 1,
      kind: 'math_expression',
      variables: ['x'],
    },
    key: { keyVersion: 1, kind: 'math_expression', expression: '2*x' },
    answer: { expression: '14' },
    partial: {},
    changed: {
      definitionVersion: 1,
      kind: 'math_expression',
      variables: ['y'],
    },
  },
] as const;
export const st10bPrivateFields = [
  'answerKey',
  'expectedItemIds',
  'reference',
  'policyVersion',
  'keyVersion',
  'isCorrect',
  'expectedAnswer',
];
