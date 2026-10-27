import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import {
  planRichContentChange,
  type LegacyDisplayPatch,
} from '../../../common/rich-content/rich-content.compatibility';
import type {
  RichAssetReference,
  RichContent,
} from '../../../common/rich-content/rich-content.types';
import { RichContentError } from '../../../common/rich-content/rich-content.validation';

type Target = 'homeworkQuestion' | 'homeworkOption';
const fields = {
  homeworkQuestion: ['prompt', 'instructions'],
  homeworkOption: ['text'],
} as const;

/** Homework mapping only; the accepted shared validator owns every AST shape. */
export function homeworkRichInput(
  input: object,
  target: Target,
): {
  richContent?: RichContent | null;
  display: LegacyDisplayPatch;
} {
  const record = input as Record<string, unknown>;
  if (record.richContent === undefined) return { display: {} };
  if (record.richContent === null) return { richContent: null, display: {} };
  try {
    const plan = planRichContentChange(target, {
      mode: 'rich',
      content: record.richContent,
    });
    if (plan.action !== 'write') throw new Error('Invalid Rich plan');
    for (const field of fields[target]) {
      if (record[field] === undefined) continue;
      const supplied = record[field];
      if (supplied !== null && typeof supplied !== 'string')
        throw new ValidationDomainException('Legacy display field is invalid', {
          field,
        });
      if (
        (supplied === null ? null : supplied.trim() || null) !==
        plan.legacy[field]
      )
        throw new ValidationDomainException(
          'Rich and legacy display fields disagree',
          { field },
        );
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

/** Recompute against the final locked row using the original display command. */
export function homeworkRichChange(
  target: Target,
  input: object,
  current?: LegacyDisplayPatch,
) {
  const record = input as { richContent?: unknown } & LegacyDisplayPatch;
  try {
    if (record.richContent !== undefined) {
      const normalized = homeworkRichInput(record, target);
      return planRichContentChange(
        target,
        normalized.richContent === null
          ? { mode: 'clear' }
          : { mode: 'rich', content: normalized.richContent },
      );
    }
    const patch: LegacyDisplayPatch = {};
    for (const field of fields[target])
      if (
        record[field] !== undefined &&
        (!current || record[field] !== current[field])
      )
        Object.assign(patch, { [field]: record[field] });
    return planRichContentChange(target, { mode: 'legacy', patch });
  } catch (error) {
    if (!(error instanceof RichContentError)) throw error;
    throw new ValidationDomainException('Rich content is invalid', {
      field: 'richContent',
      reason: error.reason,
    });
  }
}

export function homeworkRichReferences(
  content: RichContent,
): RichAssetReference[] {
  const result: RichAssetReference[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.type === 'assetReference')
      result.push(record as RichAssetReference);
    else Object.values(record).forEach(visit);
  };
  // Only a normalized, bounded V1 envelope reaches this walker.
  visit(content);
  return result;
}
