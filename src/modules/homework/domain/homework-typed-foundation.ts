import {
  HOMEWORK_TYPED_LIMITS as LIMIT,
  HomeworkTypedContentError,
  type HomeworkAnswerMode,
  type HomeworkDefinitionMode,
  type HomeworkFoundationType,
  type HomeworkMatchingItem,
  type HomeworkNormalizedTypedAnswer,
  type HomeworkOrderedItem,
  type HomeworkPrivateAnswerKey,
  type HomeworkPublicDefinition,
  type HomeworkStoredTypedValue,
} from './homework-typed-contract';

function invalid(reason: HomeworkTypedContentError['reason']): never {
  throw new HomeworkTypedContentError(reason);
}

/** Bound plain JSON before cloning/normalization. Never execute getters/toJSON. */
function boundedJson(input: unknown): void {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set<object>();
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > LIMIT.nodes || depth > LIMIT.depth) invalid('limit');
    if (typeof value === 'string') {
      if (value.length > LIMIT.jsonBytes) invalid('limit');
      // Serialize only a primitive: count escaped quotes/control characters
      // without invoking an object's getters or toJSON hook.
      bytes += Buffer.byteLength(JSON.stringify(value), 'utf8');
    } else if (value === null || typeof value === 'boolean') {
      bytes += 5;
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) invalid('shape');
      bytes += 24;
    } else if (value && typeof value === 'object') {
      const proto: unknown = Object.getPrototypeOf(value);
      if (ancestors.has(value)) invalid('shape');
      if (Array.isArray(value) && proto !== Array.prototype) invalid('shape');
      if (!Array.isArray(value) && proto !== Object.prototype && proto !== null)
        invalid('shape');
      if (Array.isArray(value) && value.length > LIMIT.nodes) invalid('limit');
      ancestors.add(value);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== 'string') invalid('shape');
        if (Array.isArray(value) && key === 'length') continue;
        if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/u.test(key))
          invalid('shape');
        if (['__proto__', 'constructor', 'prototype'].includes(key))
          invalid('shape');
        const property = descriptors[key];
        if (!property.enumerable || !('value' in property)) invalid('shape');
        bytes += key.length * 3 + 4;
        if (bytes > LIMIT.jsonBytes) invalid('limit');
        visit(property.value, depth + 1);
      }
      if (Array.isArray(value) && Object.keys(value).length !== value.length)
        invalid('shape');
      ancestors.delete(value);
    } else invalid('shape');
    if (bytes > LIMIT.jsonBytes) invalid('limit');
  };
  visit(input, 0);
}

function record(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('shape');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) invalid('shape');
  return result;
}
function list(value: unknown, minimum = 0): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > LIMIT.items
  )
    invalid('limit');
  return value;
}
function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(value)
  )
    invalid('shape');
  return value;
}
function positive(value: unknown, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > maximum
  )
    invalid('limit');
  return value;
}
function text(value: unknown, maximum: number, trim = true): string {
  if (typeof value !== 'string' || value.length > maximum * 2) invalid('text');
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (
      (code < 32 && ![9, 10, 13].includes(code)) ||
      code === 127 ||
      (code >= 0xd800 && code <= 0xdfff) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    )
      invalid('text');
  }
  if (
    /<\/?[a-z][^>]*>|<!--|(?:javascript|vbscript|data)\s*:|&(?:lt|#0*60|#x0*3c);/iu.test(
      value,
    )
  )
    invalid('text');
  const normalized = value.replace(/\r\n?/gu, '\n').normalize('NFC');
  const result = trim ? normalized.trim() : normalized;
  if ((trim && !result) || Array.from(result).length > maximum) invalid('text');
  return result;
}
function unique(values: readonly (string | number)[]): void {
  if (new Set(values).size !== values.length) invalid('association');
}
function items(value: unknown, labels: true): HomeworkMatchingItem[];
function items(value: unknown, labels: false): HomeworkOrderedItem[];
function items(
  value: unknown,
  labels: boolean,
): HomeworkMatchingItem[] | HomeworkOrderedItem[] {
  const result = list(value).map((entry) => {
    const item = record(
      entry,
      labels ? ['id', 'order', 'label', 'labelAr'] : ['id', 'order'],
    );
    const identity = {
      id: identifier(item.id),
      order: positive(item.order, LIMIT.items),
    };
    return labels
      ? {
          id: identity.id,
          order: identity.order,
          label: text(item.label, LIMIT.label),
          labelAr:
            item.labelAr == null ? null : text(item.labelAr, LIMIT.label),
        }
      : identity;
  });
  unique(result.map((item) => item.id));
  unique(result.map((item) => item.order));
  return result.sort((a, b) => a.order - b.order);
}

/** Complete means structurally complete, never authorized/publishable at runtime. */
export function normalizeHomeworkDefinition(
  type: HomeworkFoundationType,
  input: unknown,
  mode: HomeworkDefinitionMode = 'complete',
): HomeworkPublicDefinition {
  if (mode !== 'draft' && mode !== 'complete') invalid('shape');
  boundedJson(input);
  const raw = record(input, [
    'definitionVersion',
    'kind',
    'blanks',
    'segments',
    'maxAnswerLength',
    'left',
    'right',
    'reuseRight',
    'source',
    'answer',
  ]);
  if (raw.definitionVersion !== 1) invalid('version');
  if (type === 'FILL_IN_BLANK') {
    const value = record(input, [
      'definitionVersion',
      'kind',
      'blanks',
      'segments',
      'maxAnswerLength',
    ]);
    if (value.kind !== 'fill') invalid('association');
    const blanks = items(value.blanks === undefined ? [] : value.blanks, false);
    const segments = list(
      value.segments === undefined ? [] : value.segments,
    ).map((entry) => {
      const segment = record(entry, ['text', 'blankId']);
      if ('text' in segment && !('blankId' in segment))
        return { text: text(segment.text, LIMIT.segment, false) };
      if ('blankId' in segment && !('text' in segment))
        return { blankId: identifier(segment.blankId) };
      return invalid('shape');
    });
    const references = segments.flatMap((segment) =>
      'blankId' in segment ? [segment.blankId] : [],
    );
    if (
      references.length !== blanks.length ||
      references.some((id, index) => id !== blanks[index].id)
    )
      invalid('association');
    if (mode === 'complete' && blanks.length === 0) invalid('completeness');
    return {
      definitionVersion: 1,
      kind: 'fill',
      blanks,
      segments,
      maxAnswerLength: positive(
        value.maxAnswerLength === undefined
          ? LIMIT.blank
          : value.maxAnswerLength,
        LIMIT.blank,
      ),
    };
  }
  if (type === 'MATCHING') {
    const value = record(input, [
      'definitionVersion',
      'kind',
      'left',
      'right',
      'reuseRight',
    ]);
    if (value.kind !== 'matching') invalid('association');
    if (value.reuseRight !== undefined && value.reuseRight !== false)
      invalid('shape');
    const left = items(value.left === undefined ? [] : value.left, true);
    const right = items(value.right === undefined ? [] : value.right, true);
    if (left.length || right.length) {
      if (left.length < 2 || right.length < left.length) invalid('association');
    } else if (mode === 'complete') invalid('completeness');
    return {
      definitionVersion: 1,
      kind: 'matching',
      left,
      right,
      reuseRight: false,
    };
  }
  if (type === 'MEDIA') {
    const value = record(input, [
      'definitionVersion',
      'kind',
      'source',
      'answer',
    ]);
    if (value.kind !== 'media') invalid('association');
    let source: { kind: 'homeworkQuestionAsset'; assetId: string } | null =
      null;
    if (value.source !== undefined && value.source !== null) {
      const reference = record(value.source, ['kind', 'assetId']);
      if (
        reference.kind !== 'homeworkQuestionAsset' ||
        typeof reference.assetId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          reference.assetId,
        )
      )
        invalid('association');
      source = {
        kind: 'homeworkQuestionAsset',
        assetId: reference.assetId.toLowerCase(),
      };
    }
    if (mode === 'complete' && !source) invalid('completeness');
    const answer = record(value.answer, ['kind', 'maxLength', 'multiline']);
    if (answer.kind !== 'text' || answer.multiline !== true) invalid('shape');
    return {
      definitionVersion: 1,
      kind: 'media',
      source,
      answer: {
        kind: 'text',
        maxLength: positive(
          answer.maxLength === undefined ? LIMIT.mediaText : answer.maxLength,
          LIMIT.mediaText,
        ),
        multiline: true,
      },
    };
  }
  return invalid('shape');
}

function typeOf(definition: HomeworkPublicDefinition): HomeworkFoundationType {
  boundedJson(definition);
  switch (definition.kind) {
    case 'fill':
      return 'FILL_IN_BLANK';
    case 'matching':
      return 'MATCHING';
    case 'media':
      return 'MEDIA';
    default:
      return invalid('shape');
  }
}
/** Reconstructs a closed public value; never spreads author metadata/key records. */
export function projectHomeworkPublicDefinition(
  definition: HomeworkPublicDefinition,
): HomeworkPublicDefinition {
  return normalizeHomeworkDefinition(typeOf(definition), definition, 'draft');
}

export function normalizeHomeworkTypedAnswer(
  definition: HomeworkPublicDefinition,
  input: unknown,
  mode: HomeworkAnswerMode,
  required: boolean,
): HomeworkNormalizedTypedAnswer | null {
  if ((mode !== 'draft' && mode !== 'final') || typeof required !== 'boolean')
    invalid('shape');
  const current = normalizeHomeworkDefinition(typeOf(definition), definition);
  if (input === undefined) {
    if (mode === 'final' && required) invalid('completeness');
    return null;
  }
  boundedJson(input);
  if (current.kind === 'fill') {
    const value = record(input, ['blanks']);
    const answers = list(value.blanks).map((entry) => {
      const answer = record(entry, ['blankId', 'text']);
      return {
        blankId: identifier(answer.blankId),
        text: text(answer.text, current.maxAnswerLength),
      };
    });
    unique(answers.map((a) => a.blankId));
    const byId = new Map(answers.map((a) => [a.blankId, a]));
    if (answers.some((a) => !current.blanks.some((b) => b.id === a.blankId)))
      invalid('association');
    if (mode === 'final' && answers.length !== current.blanks.length)
      invalid('completeness');
    return {
      type: 'FILL_IN_BLANK',
      textAnswer: null,
      answerJson: {
        blanks: current.blanks.flatMap((b) => {
          const answer = byId.get(b.id);
          return answer ? [answer] : [];
        }),
      },
    };
  }
  if (current.kind === 'matching') {
    const value = record(input, ['pairs']);
    const pairs = list(value.pairs).map((entry) => {
      const pair = record(entry, ['leftId', 'rightId']);
      return {
        leftId: identifier(pair.leftId),
        rightId: identifier(pair.rightId),
      };
    });
    unique(pairs.map((p) => p.leftId));
    unique(pairs.map((p) => p.rightId));
    if (
      pairs.some(
        (p) =>
          !current.left.some((i) => i.id === p.leftId) ||
          !current.right.some((i) => i.id === p.rightId),
      )
    )
      invalid('association');
    if (mode === 'final' && pairs.length !== current.left.length)
      invalid('completeness');
    const byId = new Map(pairs.map((p) => [p.leftId, p]));
    return {
      type: 'MATCHING',
      textAnswer: null,
      answerJson: {
        pairs: current.left.flatMap((i) => {
          const pair = byId.get(i.id);
          return pair ? [pair] : [];
        }),
      },
    };
  }
  const value = record(input, ['textAnswer']);
  return {
    type: 'MEDIA',
    textAnswer: text(value.textAnswer, current.answer.maxLength),
    answerJson: null,
  };
}

export function normalizeHomeworkPrivateAnswerKey(
  definition: HomeworkPublicDefinition,
  input: unknown,
): HomeworkPrivateAnswerKey | null {
  const current = normalizeHomeworkDefinition(typeOf(definition), definition);
  if (input === undefined) return null;
  boundedJson(input);
  if (current.kind === 'media') return invalid('shape');
  if (current.kind === 'fill') {
    const value = record(input, ['keyVersion', 'kind', 'blanks']);
    if (value.keyVersion !== 1) invalid('version');
    if (value.kind !== 'fill') invalid('association');
    const keys = list(value.blanks, 1).map((entry) => {
      const key = record(entry, ['blankId', 'acceptedAnswers']);
      const acceptedAnswers = list(key.acceptedAnswers, 1).map((answer) =>
        text(answer, current.maxAnswerLength),
      );
      unique(acceptedAnswers);
      return { blankId: identifier(key.blankId), acceptedAnswers };
    });
    unique(keys.map((k) => k.blankId));
    if (
      keys.length !== current.blanks.length ||
      keys.some((k) => !current.blanks.some((b) => b.id === k.blankId))
    )
      invalid('association');
    const byId = new Map(keys.map((k) => [k.blankId, k]));
    return {
      keyVersion: 1,
      kind: 'fill',
      blanks: current.blanks.map((b) => byId.get(b.id)!),
    };
  }
  const value = record(input, ['keyVersion', 'kind', 'pairs']);
  if (value.keyVersion !== 1) invalid('version');
  if (value.kind !== 'matching') invalid('association');
  const answer = normalizeHomeworkTypedAnswer(
    current,
    { pairs: value.pairs },
    'final',
    true,
  );
  if (answer?.type !== 'MATCHING') return invalid('shape');
  return { keyVersion: 1, kind: 'matching', pairs: answer.answerJson.pairs };
}

function stored<T>(
  value: unknown,
  sqlNull: boolean,
  validate: () => T | null,
): HomeworkStoredTypedValue<T> {
  if (typeof sqlNull !== 'boolean') return { state: 'invalid' };
  if (sqlNull)
    return value === null ? { state: 'absent' } : { state: 'invalid' };
  if (value === null || value === undefined) return { state: 'invalid' };
  try {
    const normalized = validate();
    return normalized === null
      ? { state: 'invalid' }
      : { state: 'valid', value: normalized };
  } catch (error) {
    if (!(error instanceof HomeworkTypedContentError)) throw error;
    return { state: 'invalid' };
  }
}
/** Caller MUST supply authoritative SQL `answer_json IS NULL`, not Prisma JS null. */
export function classifyStoredHomeworkTypedAnswer(
  definition: HomeworkPublicDefinition,
  value: unknown,
  sqlNull: boolean,
  mode: HomeworkAnswerMode,
): HomeworkStoredTypedValue<HomeworkNormalizedTypedAnswer> {
  if (definition.kind === 'media')
    return { state: sqlNull === true && value === null ? 'absent' : 'invalid' };
  return stored(value, sqlNull, () =>
    normalizeHomeworkTypedAnswer(definition, value, mode, false),
  );
}
/** Caller MUST supply authoritative SQL `answer_key IS NULL`. */
export function classifyStoredHomeworkPrivateAnswerKey(
  definition: HomeworkPublicDefinition,
  value: unknown,
  sqlNull: boolean,
): HomeworkStoredTypedValue<HomeworkPrivateAnswerKey> {
  return stored(value, sqlNull, () =>
    normalizeHomeworkPrivateAnswerKey(definition, value),
  );
}

/** For future new-type metadata readers; no current HTTP projection is wired. */
export function classifyStoredHomeworkDefinition(
  type: HomeworkFoundationType,
  value: unknown,
  sqlNull: boolean,
  mode: HomeworkDefinitionMode = 'complete',
): HomeworkStoredTypedValue<HomeworkPublicDefinition> {
  return stored(value, sqlNull, () =>
    normalizeHomeworkDefinition(type, value, mode),
  );
}
