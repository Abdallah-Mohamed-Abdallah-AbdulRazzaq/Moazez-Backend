import type {
  ChemicalSpecies,
  MathExpression,
  RichAssetReference,
  RichBlock,
  RichChemistry,
  RichContent,
  RichDirection,
  RichDocument,
  RichInline,
  RichLanguage,
  RichMath,
} from './rich-content.types';

export const RICH_CONTENT_LIMITS = Object.freeze({
  MAX_UTF8_BYTES: 65536,
  MAX_TOTAL_NODES: 1024,
  MAX_NESTING_DEPTH: 16,
  MAX_TEXT_LENGTH: 8000,
  MAX_MATH_COMPLEXITY: 512,
  MAX_CHEMISTRY_COMPLEXITY: 256,
  MAX_ASSET_REFERENCES: 8,
  MAX_NODE_PROPERTIES: 5,
  MAX_ACCESSIBLE_TEXT_LENGTH: 1000,
});
export type RichContentReason =
  | 'shape'
  | 'version'
  | 'limit'
  | 'text'
  | 'math'
  | 'chemistry'
  | 'fallback'
  | 'association';
export class RichContentError extends Error {
  readonly code = 'rich_content.invalid';
  constructor(readonly reason: RichContentReason) {
    super('Rich content rejected');
    this.name = 'RichContentError';
  }
}
export function rejectRichContent(reason: RichContentReason): never {
  throw new RichContentError(reason);
}
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Shape = { [key: string]: Json };
const L = RICH_CONTENT_LIMITS;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const ELEMENTS = new Set(
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(
    ' ',
  ),
);

/** Copies data descriptors only, with bounded depth/work/compact JSON bytes.
 * No getter, toJSON, unbounded stringify or schema recursion runs first.
 * Container count includes arrays and objects, including formula support data. */
function inspectJson(input: unknown): Json {
  let containers = 0,
    bytes = 0;
  const ancestors = new Set<object>();
  const charge = (size: number) => {
    bytes += size;
    if (bytes > L.MAX_UTF8_BYTES) rejectRichContent('limit');
  };
  const stringBytes = (text: string) => {
    if (text.length > L.MAX_TEXT_LENGTH) rejectRichContent('limit');
    // Serialization is bounded to one already length-checked primitive.
    return Buffer.byteLength(JSON.stringify(text), 'utf8');
  };
  const visit = (value: unknown, depth: number): Json => {
    if (depth > L.MAX_NESTING_DEPTH) rejectRichContent('limit');
    if (value === null) {
      charge(4);
      return null;
    }
    if (typeof value === 'string') {
      charge(stringBytes(value));
      return value;
    }
    if (typeof value === 'boolean') {
      charge(value ? 4 : 5);
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) rejectRichContent('shape');
      charge(String(value).length);
      return value;
    }
    if (typeof value !== 'object') rejectRichContent('shape');
    if (++containers > L.MAX_TOTAL_NODES || ancestors.has(value))
      rejectRichContent('limit');
    const array = Array.isArray(value);
    if (
      Object.getPrototypeOf(value) !==
      (array ? Array.prototype : Object.prototype)
    )
      rejectRichContent('shape');
    if (array && value.length > L.MAX_TOTAL_NODES) rejectRichContent('limit');
    // Reject enumerable width before allocating an own-key snapshot. Wire JSON
    // contains enumerable data only; the later descriptor pass also rejects
    // symbols and hidden/accessor properties on in-process objects.
    let width = 0;
    for (const key in value) {
      if (++width > (array ? L.MAX_TOTAL_NODES : L.MAX_NODE_PROPERTIES))
        rejectRichContent('limit');
      if (!Object.hasOwn(value, key)) rejectRichContent('shape');
    }
    const keys = Reflect.ownKeys(value);
    if (
      array
        ? keys.length !== value.length + 1 || value.length > L.MAX_TOTAL_NODES
        : keys.length > L.MAX_NODE_PROPERTIES
    )
      rejectRichContent('limit');
    ancestors.add(value);
    charge(2);
    let result: Json;
    if (array) {
      const list: Json[] = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          rejectRichContent('shape');
        if (index) charge(1);
        const item: unknown = descriptor.value;
        list.push(visit(item, depth + 1));
      }
      // Reject symbols, extra properties and non-canonical array keys.
      if (
        keys.some(
          (key) =>
            typeof key !== 'string' ||
            (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)),
        )
      )
        rejectRichContent('shape');
      result = list;
    } else {
      const object: Shape = {};
      for (const [index, key] of keys.entries()) {
        if (typeof key !== 'string' || forbiddenKeys.has(key))
          rejectRichContent('shape');
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          rejectRichContent('shape');
        if (index) charge(1);
        charge(stringBytes(key) + 1);
        const item: unknown = descriptor.value;
        object[key] = visit(item, depth + 1);
      }
      result = object;
    }
    ancestors.delete(value);
    return result;
  };
  return visit(input, 0);
}

function shape(
  value: Json,
  keys: readonly string[],
  required: readonly string[],
): Shape {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    rejectRichContent('shape');
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    rejectRichContent('shape');
  return value;
}
function list(value: Json): Json[] {
  if (!Array.isArray(value) || value.length === 0) rejectRichContent('shape');
  return value;
}
function enumeration<const T extends string>(
  value: Json,
  allowed: readonly T[],
): T {
  for (const item of allowed) if (item === value) return item;
  return rejectRichContent('shape');
}
function integer(value: Json, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    rejectRichContent('shape');
  return value === 0 ? 0 : value;
}

/** No URL feature exists in V1: all schemes and network/path capabilities are
 * forbidden in display strings. Angle comparisons remain ordinary escaped data.
 * Bidi formatting controls are rejected entirely; language/direction fields
 * replace them. Arabic letters, joiners, numerals and math signs are preserved. */
function unsafeCodepoints(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined) return true;
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      (code >= 127 && code <= 159) ||
      code === 0x061c ||
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x206f) ||
      code === 0xfeff ||
      (code >= 0xd800 && code <= 0xdfff)
    )
      return true;
  }
  return false;
}
function text(value: Json, max: number = L.MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    rejectRichContent('text');
  if (
    unsafeCodepoints(value) ||
    /<\/?[A-Za-z][A-Za-z0-9:_-]*(?:\s[^<>]*|\/?)>|<\s*\/?\s*(?:script|iframe|svg|style|object|embed)\b|<!--|<!DOCTYPE|<\?|&(?:lt|gt|#0*60|#x0*3c);/i.test(
      value,
    ) ||
    /(?:[a-z][a-z0-9+.-]*:\/\/|\b(?:https?|javascript|vbscript|data|file|blob|gs|s3)\s*:|\/\/|\\[A-Za-z]|\bon[a-z]+\s*=|\bstyle\s*=)/i.test(
      value,
    )
  )
    rejectRichContent('text');
  return value;
}
function language(value: Json): RichLanguage {
  return enumeration(value, ['ar', 'en', 'und']);
}
function direction(value: Json): RichDirection {
  return enumeration(value, ['rtl', 'ltr', 'auto']);
}

/** The only normalization boundary for writes, stored reads and serialization. */
export function normalizeRichContent(input: unknown): RichContent {
  const inspected = inspectJson(input);
  const envelope = shape(
    inspected,
    [
      'contentVersion',
      'kind',
      'stem',
      'instructions',
      'stemAr',
      'label',
      'labelAr',
    ],
    ['contentVersion', 'kind'],
  );
  if (envelope.contentVersion !== 1) rejectRichContent('version');
  let mathComplexity = 0,
    chemistryComplexity = 0,
    assets = 0;
  function expression(value: Json): MathExpression {
    if (++mathComplexity > L.MAX_MATH_COMPLEXITY) rejectRichContent('limit');
    const node = shape(
      value,
      [
        'type',
        'text',
        'language',
        'direction',
        'children',
        'numerator',
        'denominator',
        'radicand',
        'degree',
      ],
      ['type'],
    );
    switch (node.type) {
      case 'text': {
        const parsed = inlineText(value);
        if (
          !/^(?:\p{L}[\p{L}\p{N}]*|[0-9٠-٩۰-۹]+(?:[.٫][0-9٠-٩۰-۹]+)?(?:[eE][+−-]?[0-9٠-٩۰-۹]+)?|[+\-−*/=<>≤≥≠≈±×÷·|∞∑∏∫∂√°%])$/u.test(
            parsed.text,
          )
        )
          rejectRichContent('math');
        return parsed;
      }
      case 'subscript':
      case 'superscript':
        shape(value, ['type', 'children'], ['type', 'children']);
        return {
          type: node.type,
          children: list(node.children).map(expression),
        };
      case 'fraction':
        shape(
          value,
          ['type', 'numerator', 'denominator'],
          ['type', 'numerator', 'denominator'],
        );
        return {
          type: 'fraction',
          numerator: list(node.numerator).map(expression),
          denominator: list(node.denominator).map(expression),
        };
      case 'radical':
        shape(value, ['type', 'radicand', 'degree'], ['type', 'radicand']);
        return {
          type: 'radical',
          radicand: list(node.radicand).map(expression),
          ...(Object.hasOwn(node, 'degree')
            ? { degree: integer(node.degree, 2, 16) }
            : {}),
        };
      default:
        return rejectRichContent('math');
    }
  }
  function inlineText(value: Json) {
    const node = shape(
      value,
      ['type', 'text', 'language', 'direction'],
      ['type', 'text'],
    );
    return {
      type: 'text' as const,
      text: text(node.text),
      ...(Object.hasOwn(node, 'language')
        ? { language: language(node.language) }
        : {}),
      ...(Object.hasOwn(node, 'direction')
        ? { direction: direction(node.direction) }
        : {}),
    };
  }
  function math<const TDisplay extends 'inline' | 'block'>(
    value: Json,
    display: TDisplay,
  ): RichMath<TDisplay> {
    const node = shape(
      value,
      ['type', 'display', 'children', 'altText'],
      ['type', 'display', 'children', 'altText'],
    );
    if (node.type !== 'math' || node.display !== display)
      rejectRichContent('math');
    return {
      type: 'math',
      display,
      children: list(node.children).map(expression),
      altText: text(node.altText, L.MAX_ACCESSIBLE_TEXT_LENGTH),
    };
  }
  function species(value: Json): ChemicalSpecies {
    if (++chemistryComplexity > L.MAX_CHEMISTRY_COMPLEXITY)
      rejectRichContent('limit');
    const item = shape(
      value,
      ['coefficient', 'elements', 'charge', 'state'],
      ['coefficient', 'elements'],
    );
    return {
      coefficient: integer(item.coefficient, 1, 999),
      elements: list(item.elements).map((value) => {
        if (++chemistryComplexity > L.MAX_CHEMISTRY_COMPLEXITY)
          rejectRichContent('limit');
        const part = shape(value, ['element', 'count'], ['element', 'count']);
        if (typeof part.element !== 'string' || !ELEMENTS.has(part.element))
          rejectRichContent('chemistry');
        return { element: part.element, count: integer(part.count, 1, 999) };
      }),
      ...(Object.hasOwn(item, 'charge')
        ? { charge: integer(item.charge, -8, 8) }
        : {}),
      ...(Object.hasOwn(item, 'state')
        ? { state: enumeration(item.state, ['s', 'l', 'g', 'aq']) }
        : {}),
    };
  }
  function chemistry(value: Json): RichChemistry {
    const node = shape(
      value,
      ['type', 'reactants', 'products', 'arrow', 'altText'],
      ['type', 'reactants', 'altText'],
    );
    if (Object.hasOwn(node, 'products') !== Object.hasOwn(node, 'arrow'))
      rejectRichContent('chemistry');
    const base = {
      type: 'chemistry' as const,
      reactants: list(node.reactants).map(species),
      altText: text(node.altText, L.MAX_ACCESSIBLE_TEXT_LENGTH),
    };
    return Object.hasOwn(node, 'products')
      ? {
          ...base,
          products: list(node.products).map(species),
          arrow: enumeration(node.arrow, ['yields', 'equilibrium']),
        }
      : base;
  }
  function asset(value: Json): RichAssetReference {
    if (++assets > L.MAX_ASSET_REFERENCES) rejectRichContent('limit');
    const node = shape(
      value,
      ['type', 'assetId', 'kind', 'altText', 'caption'],
      ['type', 'assetId', 'kind', 'altText'],
    );
    if (
      typeof node.assetId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        node.assetId,
      )
    )
      rejectRichContent('association');
    return {
      type: 'assetReference',
      assetId: node.assetId.toLowerCase(),
      kind: enumeration(node.kind, [
        'image',
        'audio',
        'video',
        'document',
        'other',
      ]),
      altText: text(node.altText, L.MAX_ACCESSIBLE_TEXT_LENGTH),
      ...(Object.hasOwn(node, 'caption')
        ? { caption: text(node.caption, L.MAX_ACCESSIBLE_TEXT_LENGTH) }
        : {}),
    };
  }
  function inline(value: Json): RichInline {
    const node = shape(
      value,
      [
        'type',
        'text',
        'language',
        'direction',
        'children',
        'numerator',
        'denominator',
        'radicand',
        'degree',
        'display',
        'altText',
        'reactants',
        'products',
        'arrow',
        'assetId',
        'kind',
        'caption',
      ],
      ['type'],
    );
    switch (node.type) {
      case 'text':
        return inlineText(value);
      case 'lineBreak':
        shape(value, ['type'], ['type']);
        return { type: 'lineBreak' };
      case 'strong':
      case 'emphasis':
        shape(value, ['type', 'children'], ['type', 'children']);
        return { type: node.type, children: list(node.children).map(inline) };
      case 'subscript':
      case 'superscript':
      case 'fraction':
      case 'radical':
        return expression(value);
      case 'math':
        return math(value, 'inline');
      case 'chemistry':
        return chemistry(value);
      case 'assetReference':
        return asset(value);
      default:
        return rejectRichContent('shape');
    }
  }
  function document(value: Json): RichDocument {
    const doc = shape(
      value,
      ['language', 'direction', 'blocks'],
      ['language', 'direction', 'blocks'],
    );
    return {
      language: language(doc.language),
      direction: direction(doc.direction),
      blocks: list(doc.blocks).map((value): RichBlock => {
        const block = shape(
          value,
          ['type', 'children', 'display', 'altText'],
          ['type'],
        );
        if (block.type === 'math') return math(value, 'block');
        shape(value, ['type', 'children'], ['type', 'children']);
        if (block.type !== 'paragraph') rejectRichContent('shape');
        return {
          type: 'paragraph',
          children: list(block.children).map(inline),
        };
      }),
    };
  }
  if (envelope.kind === 'question') {
    shape(
      inspected,
      ['contentVersion', 'kind', 'stem', 'instructions', 'stemAr'],
      ['contentVersion', 'kind', 'stem'],
    );
    return {
      contentVersion: 1,
      kind: 'question',
      stem: document(envelope.stem),
      ...(Object.hasOwn(envelope, 'instructions')
        ? { instructions: document(envelope.instructions) }
        : {}),
      ...(Object.hasOwn(envelope, 'stemAr')
        ? { stemAr: document(envelope.stemAr) }
        : {}),
    };
  }
  if (envelope.kind === 'option') {
    shape(
      inspected,
      ['contentVersion', 'kind', 'label', 'labelAr'],
      ['contentVersion', 'kind', 'label'],
    );
    return {
      contentVersion: 1,
      kind: 'option',
      label: document(envelope.label),
      ...(Object.hasOwn(envelope, 'labelAr')
        ? { labelAr: document(envelope.labelAr) }
        : {}),
    };
  }
  return rejectRichContent('shape');
}

export function serializeRichContent(input: unknown): string {
  return JSON.stringify(normalizeRichContent(input));
}

/** Native parse only receives bounded JSON text. Lexical depth is checked before
 * allocation of nested structures; quoted/escaped delimiters are not structure. */
export function parseRichContentJson(input: string): RichContent {
  if (
    typeof input !== 'string' ||
    input.length > L.MAX_UTF8_BYTES ||
    Buffer.byteLength(input, 'utf8') > L.MAX_UTF8_BYTES
  )
    rejectRichContent('limit');
  let quoted = false,
    escaped = false,
    depth = -1;
  for (const char of input) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') {
      if (++depth > L.MAX_NESTING_DEPTH) rejectRichContent('limit');
    } else if (char === '}' || char === ']') depth--;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return rejectRichContent('shape');
  }
  return normalizeRichContent(parsed);
}
