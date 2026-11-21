import { z } from 'zod/v4';
import { OfficialResultsError } from './official-results.error';
import {
  academicSelector,
  groupSelector,
  periodSelector,
  resolveResultRuleValue,
  resultScopeMatches,
  type ConcreteResultsScope,
  type ResultScopeFacts,
} from './result-scope';

export const platformResultLimits = {
  maxUploadBytes: 20 * 1024 * 1024,
  maxRows: 25_000,
  maxManualFields: 200,
  maxTotalFields: 256,
  maxChangedCellsPerAtomicSheetUnit: 10_000,
} as const;

const reviewMode = z.enum(['SCHOOL_REVIEW', 'DIRECT_IF_AUTHORIZED']);
const teacherMode = z.enum(['MANAGED', 'AUTONOMOUS']);
const bounds = z.strictObject({
  maxUploadBytes: z
    .number()
    .int()
    .min(1)
    .max(platformResultLimits.maxUploadBytes),
  maxRows: z.number().int().min(1).max(platformResultLimits.maxRows),
  maxManualFields: z
    .number()
    .int()
    .min(1)
    .max(platformResultLimits.maxManualFields),
  maxTotalFields: z
    .number()
    .int()
    .min(1)
    .max(platformResultLimits.maxTotalFields),
  maxChangedCellsPerAtomicSheetUnit: z
    .number()
    .int()
    .min(1)
    .max(platformResultLimits.maxChangedCellsPerAtomicSheetUnit),
});
const settings = z.strictObject({
  teacherMode,
  personalDesignEnabled: z.literal(true),
  officialDesignAcceptance: reviewMode,
  firstPublication: reviewMode,
  correctionPublication: reviewMode,
  publishAfterApproval: z.enum(['EXPLICIT_ACTION', 'ON_APPROVAL']),
  requireDistinctApprover: z.boolean(),
  requireCompleteFinal: z.literal(true),
  allowPartialProgressPublication: z.boolean(),
  publicationSuspended: z.boolean(),
  defaultAudiences: z
    .array(z.enum(['STUDENT', 'PARENT', 'STAFF']))
    .max(3)
    .refine((values) => new Set(values).size === values.length),
  internalNoteAccess: z.literal('SCHOOL_ONLY'),
  derivedDisclosureDefault: z.boolean(),
  defaultInputScale: z.number().int().min(0).max(4),
  displayRounding: z.strictObject({
    mode: z.enum(['HALF_UP', 'HALF_EVEN', 'DOWN']),
    scale: z.number().int().min(0).max(6),
  }),
  missingCalculation: z.literal('INCOMPLETE'),
  absenceCalculation: z.enum(['INCOMPLETE', 'ZERO']),
  excusedCalculation: z.enum(['EXCLUDE', 'INCOMPLETE']),
  notApplicableCalculation: z.literal('EXCLUDE'),
  importBlankBehavior: z.literal('KEEP'),
  importConflictPolicy: z.literal('REVIEW'),
  importFormats: z
    .array(z.enum(['CSV', 'XLSX']))
    .min(1)
    .max(2)
    .refine((values) => new Set(values).size === values.length),
  importLimits: bounds,
  rosterChangePolicy: z.literal('RECONCILE'),
  notifications: z.strictObject({
    onPublication: z.boolean(),
    onCorrection: z.boolean(),
    onDraftSave: z.literal(false),
    onImportConfirmation: z.literal(false),
    recipientPolicy: z.literal('CURRENT_AUTHORIZED_RECIPIENTS'),
    channelPolicy: z.literal('SUPPORTED_CONFIGURED_CHANNELS'),
  }),
  temporaryFileRetentionDays: z.number().int().min(1).max(30),
  archiveBehavior: z.literal('PRESERVE_HISTORY_AND_BLOCK_ORDINARY_MUTATION'),
  familyHistoryEnabled: z.boolean(),
});

const scopeOverride = z.strictObject({
  ruleId: z.uuid().optional(),
  academicScope: academicSelector,
  groupScope: groupSelector,
  periodSelector,
  overrides: settings
    .omit({
      publicationSuspended: true,
      personalDesignEnabled: true,
      requireCompleteFinal: true,
      importBlankBehavior: true,
      importConflictPolicy: true,
      rosterChangePolicy: true,
      archiveBehavior: true,
    })
    .partial()
    .refine((value) => Object.keys(value).length > 0),
});

export const resultPolicySchema = settings.extend({
  scopedOverrides: z.array(scopeOverride).max(100),
});

export type ResultPolicySettings = z.infer<typeof settings>;
export type ResultPolicy = z.infer<typeof resultPolicySchema>;

const defaultPolicy: ResultPolicy = {
  teacherMode: 'MANAGED',
  personalDesignEnabled: true,
  officialDesignAcceptance: 'SCHOOL_REVIEW',
  firstPublication: 'SCHOOL_REVIEW',
  correctionPublication: 'SCHOOL_REVIEW',
  publishAfterApproval: 'EXPLICIT_ACTION',
  requireDistinctApprover: false,
  requireCompleteFinal: true,
  allowPartialProgressPublication: false,
  publicationSuspended: false,
  defaultAudiences: ['STUDENT', 'PARENT', 'STAFF'],
  internalNoteAccess: 'SCHOOL_ONLY',
  derivedDisclosureDefault: false,
  defaultInputScale: 2,
  displayRounding: { mode: 'HALF_UP', scale: 2 },
  missingCalculation: 'INCOMPLETE',
  absenceCalculation: 'INCOMPLETE',
  excusedCalculation: 'EXCLUDE',
  notApplicableCalculation: 'EXCLUDE',
  importBlankBehavior: 'KEEP',
  importConflictPolicy: 'REVIEW',
  importFormats: ['CSV', 'XLSX'],
  importLimits: platformResultLimits,
  rosterChangePolicy: 'RECONCILE',
  notifications: {
    onPublication: true,
    onCorrection: true,
    onDraftSave: false,
    onImportConfirmation: false,
    recipientPolicy: 'CURRENT_AUTHORIZED_RECIPIENTS',
    channelPolicy: 'SUPPORTED_CONFIGURED_CHANNELS',
  },
  temporaryFileRetentionDays: 30,
  archiveBehavior: 'PRESERVE_HISTORY_AND_BLOCK_ORDINARY_MUTATION',
  familyHistoryEnabled: false,
  scopedOverrides: [],
};

export function managedResultPolicy(): ResultPolicy {
  return structuredClone(defaultPolicy);
}

function assertPolicySemantics(config: ResultPolicySettings): void {
  if (
    config.importLimits.maxManualFields > config.importLimits.maxTotalFields
  ) {
    throw new OfficialResultsError('policy.invalid', { field: 'importLimits' });
  }
  const direct = [config.firstPublication, config.correctionPublication];
  if (
    direct.includes('DIRECT_IF_AUTHORIZED') &&
    (config.requireDistinctApprover || config.teacherMode === 'MANAGED')
  ) {
    throw new OfficialResultsError('policy.invalid', { field: 'teacherMode' });
  }
  if (
    config.teacherMode === 'MANAGED' &&
    config.officialDesignAcceptance === 'DIRECT_IF_AUTHORIZED'
  ) {
    throw new OfficialResultsError('policy.invalid', {
      field: 'officialDesignAcceptance',
    });
  }
}

export function parseResultPolicy(input: unknown): ResultPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new OfficialResultsError('policy.invalid');
  }
  const mode = (input as Record<string, unknown>).teacherMode;
  const preset =
    mode === 'AUTONOMOUS'
      ? {
          officialDesignAcceptance: 'DIRECT_IF_AUTHORIZED',
          firstPublication: 'DIRECT_IF_AUTHORIZED',
        }
      : {};
  const validation = resultPolicySchema.safeParse({
    ...defaultPolicy,
    ...preset,
    ...input,
  });
  if (!validation.success) {
    throw new OfficialResultsError('policy.invalid', {
      fields: validation.error.issues
        .map(({ path, code }) => ({ path, code }))
        .slice(0, 25),
    });
  }
  assertPolicySemantics(validation.data);
  return validation.data;
}

export function effectiveResultPolicy(
  policy: ResultPolicy,
  scope: ConcreteResultsScope,
  facts: ResultScopeFacts,
): {
  settings: ResultPolicySettings;
  origins: Record<string, (string | undefined)[]>;
} {
  const { scopedOverrides, ...resolved } = policy;
  const applicable = scopedOverrides.filter((rule) =>
    resultScopeMatches(rule, scope),
  );
  const origins: Record<string, (string | undefined)[]> = {};
  const paths = new Set(
    applicable.flatMap(({ overrides }) => Object.keys(overrides)),
  );
  for (const path of paths) {
    type Setting = keyof (typeof scopedOverrides)[number]['overrides'];
    const key = path as Setting;
    const selected = resolveResultRuleValue(
      applicable.filter(({ overrides }) => Object.hasOwn(overrides, key)),
      facts,
      ({ overrides }) => overrides[key],
    );
    if (selected) {
      Object.assign(resolved, { [key]: selected.value });
      origins[key] = selected.sources.map(({ ruleId }) => ruleId);
    }
  }
  assertPolicySemantics(resolved);
  return { settings: resolved, origins };
}
