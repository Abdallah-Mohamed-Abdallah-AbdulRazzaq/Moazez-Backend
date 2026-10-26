import type {
  ChemicalSpecies,
  RichContent,
  RichDocument,
  RichInline,
  RichMath,
} from './rich-content.types';
import {
  normalizeRichContent,
  rejectRichContent,
  RichContentError,
} from './rich-content.validation';

export const LEGACY_RICH_LIMITS = Object.freeze({
  homeworkPrompt: 8000,
  homeworkInstructions: 4000,
  homeworkOption: 1000,
  gradePrompt: 5000,
  gradeOption: 1000,
});

function speciesText(value: ChemicalSpecies): string {
  return (
    (value.coefficient === 1 ? '' : String(value.coefficient)) +
    value.elements
      .map(
        (part) => part.element + (part.count === 1 ? '' : String(part.count)),
      )
      .join('') +
    (value.charge
      ? `^(${Math.abs(value.charge) === 1 ? '' : Math.abs(value.charge)}${value.charge > 0 ? '+' : '−'})`
      : '') +
    (value.state ? `(${value.state})` : '')
  );
}
function inlineText(node: RichInline | RichMath<'block'>): string {
  const children = (nodes: RichInline[]) => nodes.map(inlineText).join('');
  switch (node.type) {
    case 'text':
      return node.text;
    case 'lineBreak':
      return '\n';
    case 'strong':
    case 'emphasis':
      return children(node.children);
    case 'subscript':
      return `_(${children(node.children)})`;
    case 'superscript':
      return `^(${children(node.children)})`;
    case 'fraction':
      return `(${children(node.numerator)})/(${children(node.denominator)})`;
    case 'radical':
      return `${!node.degree || node.degree === 2 ? 'sqrt' : `root[${node.degree}]`}(${children(node.radicand)})`;
    case 'math':
      return children(node.children);
    case 'chemistry':
      return (
        node.reactants.map(speciesText).join(' + ') +
        (node.products
          ? ` ${node.arrow === 'equilibrium' ? '⇌' : '→'} ${node.products.map(speciesText).join(' + ')}`
          : '')
      );
    case 'assetReference':
      return `[${node.altText}${node.caption ? ` — ${node.caption}` : ''}]`;
  }
}
function fitsLegacyLength(value: string, max: number): boolean {
  // Bound work, then mirror installed validator.js isLength: surrogate pairs
  // and presentation-selector sequences each represent one display character.
  if (value.length > max * 3) return false;
  const pairs = value.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0;
  const presentations =
    value.match(/[^\uFE0F\uFE0E][\uFE0F\uFE0E]/g)?.length ?? 0;
  return value.length - pairs - presentations <= max;
}
function fallback(document: RichDocument, max: number): string {
  const result = document.blocks
    .map((block) =>
      block.type === 'paragraph'
        ? block.children.map(inlineText).join('')
        : inlineText(block),
    )
    .join('\n')
    .trim();
  if (!result || !fitsLegacyLength(result, max)) rejectRichContent('fallback');
  return result;
}
export type RichTarget =
  | 'homeworkQuestion'
  | 'homeworkOption'
  | 'gradeQuestion'
  | 'gradeOption';
export type LegacyDisplayPatch = {
  prompt?: string;
  instructions?: string | null;
  promptAr?: string | null;
  text?: string;
  label?: string;
  labelAr?: string | null;
};

/** Pure future transaction input; never a public presenter or authorizer. */
export function richContentFallback(
  input: unknown,
  target: RichTarget,
): LegacyDisplayPatch {
  const content = normalizeRichContent(input);
  if (target === 'homeworkQuestion' && content.kind === 'question') {
    if (content.stemAr) rejectRichContent('association');
    return {
      prompt: fallback(content.stem, LEGACY_RICH_LIMITS.homeworkPrompt),
      instructions: content.instructions
        ? fallback(
            content.instructions,
            LEGACY_RICH_LIMITS.homeworkInstructions,
          )
        : null,
    };
  }
  if (target === 'gradeQuestion' && content.kind === 'question') {
    if (content.instructions) rejectRichContent('association');
    return {
      prompt: fallback(content.stem, LEGACY_RICH_LIMITS.gradePrompt),
      promptAr: content.stemAr
        ? fallback(content.stemAr, LEGACY_RICH_LIMITS.gradePrompt)
        : null,
    };
  }
  if (content.kind === 'option') {
    if (target === 'homeworkOption') {
      if (content.labelAr) rejectRichContent('association');
      return {
        text: fallback(content.label, LEGACY_RICH_LIMITS.homeworkOption),
      };
    }
    if (target === 'gradeOption')
      return {
        label: fallback(content.label, LEGACY_RICH_LIMITS.gradeOption),
        labelAr: content.labelAr
          ? fallback(content.labelAr, LEGACY_RICH_LIMITS.gradeOption)
          : null,
      };
  }
  return rejectRichContent('association');
}

export type RichChange =
  | { mode: 'preserve' }
  | { mode: 'rich'; content: unknown }
  | { mode: 'legacy'; patch: LegacyDisplayPatch }
  | { mode: 'clear' };
export type RichChangePlan =
  | { action: 'preserve' }
  | {
      action: 'write';
      richContent: RichContent | null;
      legacy: LegacyDisplayPatch;
    };

/** Omitted fields are preserved, never synthesized. A legacy display edit
 * clears the WHOLE associated envelope, avoiding stale contradictory rich data.
 * Clearing alone preserves existing legacy text. Future repositories map null
 * to Prisma.DbNull, never Prisma.JsonNull, in their authorized transaction. */
export function planRichContentChange(
  target: RichTarget,
  change: RichChange,
): RichChangePlan {
  switch (change.mode) {
    case 'preserve':
      return { action: 'preserve' };
    case 'clear':
      return { action: 'write', richContent: null, legacy: {} };
    case 'rich': {
      const content = normalizeRichContent(change.content);
      return {
        action: 'write',
        richContent: content,
        legacy: richContentFallback(content, target),
      };
    }
    case 'legacy': {
      const limits: { [key: string]: number } =
        target === 'homeworkQuestion'
          ? { prompt: 8000, instructions: 4000 }
          : target === 'gradeQuestion'
            ? { prompt: 5000, promptAr: 5000 }
            : target === 'homeworkOption'
              ? { text: 1000 }
              : { label: 1000, labelAr: 1000 };
      const legacy: LegacyDisplayPatch = {};
      // This adapter accepts only the typed display patch, never whole records.
      // Data-descriptor checks avoid invoking a forged accessor even internally.
      const keys = Reflect.ownKeys(change.patch);
      if (
        Object.getPrototypeOf(change.patch) !== Object.prototype ||
        keys.length > 2
      )
        rejectRichContent('shape');
      for (const key of keys) {
        if (typeof key !== 'string' || !Object.hasOwn(limits, key))
          rejectRichContent('association');
        const descriptor = Object.getOwnPropertyDescriptor(change.patch, key);
        if (!descriptor || !('value' in descriptor)) rejectRichContent('shape');
        const value: unknown = descriptor.value;
        const nullable =
          key === 'instructions' || key === 'promptAr' || key === 'labelAr';
        if (
          !(value === null && nullable) &&
          (typeof value !== 'string' ||
            !value.trim() ||
            !fitsLegacyLength(value, limits[key]))
        )
          rejectRichContent('fallback');
        Object.defineProperty(legacy, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return keys.length
        ? { action: 'write', richContent: null, legacy }
        : { action: 'preserve' };
    }
  }
}

export type StoredRichContent =
  | { state: 'absent' }
  | { state: 'valid'; content: RichContent }
  | { state: 'invalid' | 'unsupported' };

/** Prisma returns JS null for BOTH SQL NULL and JSON null. Adapters must supply
 * SQL-null evidence from the DB (or a known omitted historical projection).
 * Invalid/future JSON is withheld and never repaired or echoed. */
export function readStoredRichContent(
  input: unknown,
  sqlNull: boolean,
): StoredRichContent {
  if (sqlNull)
    return input === null || input === undefined
      ? { state: 'absent' }
      : { state: 'invalid' };
  try {
    return { state: 'valid', content: normalizeRichContent(input) };
  } catch (error) {
    if (!(error instanceof RichContentError)) throw error;
    return { state: error.reason === 'version' ? 'unsupported' : 'invalid' };
  }
}
