import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  planRichContentChange,
  type LegacyDisplayPatch,
} from '../../../../common/rich-content/rich-content.compatibility';
import type { RichContent } from '../../../../common/rich-content/rich-content.types';
import { RichContentError } from '../../../../common/rich-content/rich-content.validation';

type Target = 'gradeQuestion' | 'gradeOption';
/** Legacy content policy owns legacy fields; AST has its own stricter budget. */
export function gradeLegacyContent<
  T extends {
    richContent?: unknown;
    options?: Array<{ richContent?: unknown; displayPatch?: unknown }>;
  },
>(input: T) {
  const legacy = { ...input };
  delete legacy.richContent;
  if (legacy.options)
    legacy.options = legacy.options.map((option) => {
      const output = { ...option };
      delete output.richContent;
      delete output.displayPatch;
      return output;
    });
  return legacy;
}
const aliases = {
  gradeQuestion: {
    prompt: ['prompt', 'questionTextEn'],
    promptAr: ['promptAr', 'questionTextAr'],
  },
  gradeOption: { label: ['label', 'textEn'], labelAr: ['labelAr', 'textAr'] },
} as const;

/** Presence survives DTO transformation; the shared validator owns the envelope. */
export function gradeRichInput(
  input: object,
  target: Target,
): {
  richContent?: RichContent | null;
  display: LegacyDisplayPatch;
} {
  const record = input as Record<string, unknown>;
  if (!Object.hasOwn(record, 'richContent') || record.richContent === undefined)
    return { display: {} };
  if (record.richContent === null) return { richContent: null, display: {} };
  try {
    const plan = planRichContentChange(target, {
      mode: 'rich',
      content: record.richContent,
    });
    if (plan.action !== 'write') throw new Error('Invalid rich change plan');
    const mapping: Record<string, readonly string[]> = aliases[target];
    for (const [field, names] of Object.entries(mapping)) {
      for (const name of names) {
        if (Object.hasOwn(record, name) && record[name] !== undefined) {
          const value = record[name];
          if (value !== null && typeof value !== 'string')
            throw new ValidationDomainException(
              'Legacy display field is invalid',
              { field: name },
            );
          const supplied = value === null ? null : value.trim() || null;
          if (supplied !== plan.legacy[field as keyof LegacyDisplayPatch])
            throw new ValidationDomainException(
              'Rich and legacy display fields disagree',
              { field: name },
            );
        }
      }
    }
    return { richContent: plan.richContent, display: plan.legacy };
  } catch (error) {
    if (!(error instanceof RichContentError)) throw error;
    throw new ValidationDomainException('Rich content is invalid', {
      field: 'richContent',
      reason: error.reason,
    });
  }
}

/** Compute against the final locked row, never against a preliminary read. */
export function gradeRichChange(
  target: Target,
  input: { richContent?: unknown } & LegacyDisplayPatch,
  current?: LegacyDisplayPatch,
) {
  try {
    if (input.richContent !== undefined) {
      const normalized = gradeRichInput(input, target);
      return planRichContentChange(
        target,
        normalized.richContent === null
          ? { mode: 'clear' }
          : { mode: 'rich', content: normalized.richContent },
      );
    }
    const keys =
      target === 'gradeQuestion'
        ? (['prompt', 'promptAr'] as const)
        : (['label', 'labelAr'] as const);
    const patch: LegacyDisplayPatch = {};
    for (const key of keys) {
      const value = input[key];
      if (value !== undefined && (!current || value !== current[key]))
        Object.assign(patch, { [key]: value });
    }
    return planRichContentChange(target, { mode: 'legacy', patch });
  } catch (error) {
    if (!(error instanceof RichContentError)) throw error;
    throw new ValidationDomainException('Rich content is invalid', {
      field: 'richContent',
      reason: error.reason,
    });
  }
}
