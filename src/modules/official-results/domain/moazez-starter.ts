import {
  validateResultDefinition,
  type ResultDefinition,
  type ResultField,
} from './result-definition';

export const starterTemplateId = '63900000-0000-4000-8000-000000000001';
export const starterVersionId = '63900000-0000-4000-8000-000000000002';
export const starterTemplateCode = 'MOAZEZ_STANDARD_SUBJECT_RESULTS';
const fullId = '63900000-0000-4000-8000-000000000003';
const fieldId = (index: number) =>
  `63900000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`;
const publicAudience = ['STUDENT', 'PARENT', 'STAFF'] as const;

export function moazezStarterDefinition(): ResultDefinition {
  const scoreFields: ResultField[] = [
    {
      code: 'coursework',
      label: { ar: 'أعمال السنة', en: 'Coursework' },
      max: '20.00',
    },
    { code: 'tests', label: { ar: 'الاختبارات', en: 'Tests' }, max: '30.00' },
    {
      code: 'term_exam',
      label: { ar: 'امتحان نهاية الترم', en: 'End of term examination' },
      max: '50.00',
    },
  ].map(({ max, ...item }, index) => ({
    ...item,
    id: fieldId(index),
    kind: 'SCORE',
    order: index + 1,
    requiredForFinal: true,
    constraints: { minScore: '0.00', maxScore: max, inputScale: 2 },
    allowedStates: [
      'RECORDED',
      'MISSING',
      'ABSENT',
      'EXCUSED',
      'NOT_APPLICABLE',
    ],
    stateReasonRequired: ['ABSENT', 'EXCUSED', 'NOT_APPLICABLE'],
    audiences: [...publicAudience],
    readRule: 'INHERIT_SHEET',
    editRule: 'INHERIT_SHEET',
    releaseUnitId: fullId,
  }));
  const fields: ResultField[] = [
    ...scoreFields,
    {
      id: fieldId(3),
      code: 'total',
      label: { ar: 'مجموع المادة', en: 'Subject total' },
      kind: 'CALCULATED',
      outputKind: 'SCORE',
      order: 4,
      requiredForFinal: true,
      constraints: { nominalMaxScore: '100.00' },
      allowedStates: ['RECORDED', 'MISSING'],
      stateReasonRequired: [],
      formula: {
        operationVersion: 1,
        op: 'SUM_POINTS',
        operands: scoreFields.map(({ id }) => ({ fieldId: id })),
      },
      audiences: [...publicAudience],
      readRule: 'INHERIT_SHEET',
      editRule: 'COMPUTED_ONLY',
      releaseUnitId: fullId,
    },
    {
      id: fieldId(4),
      code: 'family_note',
      label: { ar: 'ملاحظة للطالب وولي الأمر', en: 'Student and parent note' },
      kind: 'TEXT',
      textMode: 'SHORT',
      order: 5,
      requiredForFinal: false,
      constraints: { maxCharacters: 500 },
      allowedStates: ['RECORDED', 'MISSING'],
      stateReasonRequired: [],
      audiences: [...publicAudience],
      readRule: 'INHERIT_SHEET',
      editRule: 'INHERIT_SHEET',
      releaseUnitId: fullId,
    },
    {
      id: fieldId(5),
      code: 'internal_note',
      label: { ar: 'ملاحظة داخلية', en: 'Internal note' },
      kind: 'TEXT',
      textMode: 'LONG',
      order: 6,
      requiredForFinal: false,
      constraints: { maxCharacters: 5000 },
      allowedStates: ['RECORDED', 'MISSING'],
      stateReasonRequired: [],
      audiences: ['STAFF'],
      readRule: 'SCHOOL_ONLY',
      editRule: 'SCHOOL_ONLY',
      releaseUnitId: null,
    },
  ];
  const definition: ResultDefinition = {
    label: {
      ar: 'قالب معزز الأساسي لدرجات المواد',
      en: 'MOAZEZ Standard Subject Results',
    },
    groupKind: 'SUBJECT',
    fields,
    releaseUnits: [
      {
        id: fullId,
        code: 'FULL',
        label: { ar: 'النتيجة النهائية للمادة', en: 'Full subject result' },
        classification: 'FINAL',
        order: 0,
        outputFieldIds: fields
          .filter((field) => field.releaseUnitId === fullId)
          .map(({ id }) => id),
        derivedDisclosure: [],
      },
    ],
    calculationPolicy: {
      version: 1,
      missing: 'INCOMPLETE',
      absent: 'INCOMPLETE',
      excused: 'EXCLUDE',
      notApplicable: 'EXCLUDE',
      inputScale: 2,
      evaluationPrecision: 40,
      displayRounding: { mode: 'HALF_UP', scale: 2 },
      decisionUses: 'PRE_DISPLAY_NORMALIZED_VALUE',
    },
  };
  validateResultDefinition(definition, true);
  return definition;
}
