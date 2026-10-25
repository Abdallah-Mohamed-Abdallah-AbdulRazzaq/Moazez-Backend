import {
  normalizeRichContent,
  parseRichContentJson,
  serializeRichContent,
  RICH_CONTENT_LIMITS as L,
  RichContentError,
} from './rich-content.validation';
import {
  planRichContentChange,
  readStoredRichContent,
  richContentFallback,
  type RichTarget,
} from './rich-content.compatibility';
import type { RichDocument, RichInline } from './rich-content.types';

const assetId = '12345678-1234-4123-8123-123456789abc';
const text = (text: string): RichInline => ({ type: 'text', text });
const document = (...children: RichInline[]): RichDocument => ({
  language: 'und',
  direction: 'auto',
  blocks: [{ type: 'paragraph', children }],
});
const question = (...children: RichInline[]) => ({
  contentVersion: 1,
  kind: 'question',
  stem: document(...children),
});
const option = (...children: RichInline[]) => ({
  contentVersion: 1,
  kind: 'option',
  label: document(...children),
});
const asset = (): RichInline => ({
  type: 'assetReference',
  assetId,
  kind: 'image',
  altText: 'منحنى السرعة',
});
function rejected(input: unknown, reason?: RichContentError['reason']) {
  try {
    normalizeRichContent(input);
    throw new Error('Accepted adversarial AST');
  } catch (error) {
    expect(error).toBeInstanceOf(RichContentError);
    expect(error).toMatchObject({
      code: 'rich_content.invalid',
      ...(reason ? { reason } : {}),
    });
    expect((error as Error).message).toBe('Rich content rejected');
  }
}

describe('ST08-A Safe Rich Content V1 positive scientific and compatibility contract', () => {
  it.each([
    'س < ص و س ≤ ٣',
    'x < y and y > 2; x ≠ 0',
    'السؤال ١: H₂O and 1.25 × 10⁻³',
    'Question: compare ١٢٣ and 123',
    'x<y',
    'a > b',
    '👩🏽‍🔬 تجربة',
  ])('preserves escaped display data: %s', (value) => {
    const normalized = normalizeRichContent(question(text(value)));
    expect(normalized).toEqual(question(text(value)));
    expect(richContentFallback(normalized, 'homeworkQuestion')).toEqual({
      prompt: value,
      instructions: null,
    });
    expect(parseRichContentJson(serializeRichContent(normalized))).toEqual(
      normalized,
    );
  });
  it('normalizes explicit defaults and node direction without changing Arabic/numeral values', () => {
    const input = {
      contentVersion: 1,
      kind: 'question',
      stem: {
        language: 'ar',
        direction: 'rtl',
        blocks: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'NaCl ١٢',
                language: 'en',
                direction: 'ltr',
              },
            ],
          },
        ],
      },
    };
    expect(normalizeRichContent(input)).toEqual(input);
    expect(normalizeRichContent(normalizeRichContent(input))).toEqual(input);
    expect(normalizeRichContent(input)).not.toBe(input);
  });
  it('renders finite math without TeX execution, preserving grouping and operators', () => {
    const input = question(text('س = '), {
      type: 'math',
      display: 'inline',
      altText: 'معادلة',
      children: [
        {
          type: 'fraction',
          numerator: [text('١') as { type: 'text'; text: string }],
          denominator: [text('2') as { type: 'text'; text: string }],
        },
        { type: 'radical', degree: 3, radicand: [{ type: 'text', text: 'x' }] },
        { type: 'superscript', children: [{ type: 'text', text: '2' }] },
        { type: 'subscript', children: [{ type: 'text', text: 'n' }] },
      ],
    });
    expect(richContentFallback(input, 'gradeQuestion')).toEqual({
      prompt: 'س = (١)/(2)root[3](x)^(2)_(n)',
      promptAr: null,
    });
  });
  it('supports display math, line breaks, emphasis, strong and default square roots', () => {
    const input = question(
      { type: 'strong', children: [text('Force')] },
      { type: 'lineBreak' },
      { type: 'emphasis', children: [text('N')] },
    );
    input.stem.blocks.push({
      type: 'math',
      display: 'block',
      children: [{ type: 'radical', radicand: [{ type: 'text', text: 'x' }] }],
      altText: 'Square root',
    });
    expect(richContentFallback(input, 'gradeQuestion')).toEqual({
      prompt: 'Force\nN\nsqrt(x)',
      promptAr: null,
    });
  });
  it('preserves basic chemical formulas, charges, states and reactions', () => {
    const input = question({
      type: 'chemistry',
      reactants: [
        { coefficient: 2, elements: [{ element: 'H', count: 2 }], state: 'g' },
        { coefficient: 1, elements: [{ element: 'O', count: 2 }], state: 'g' },
      ],
      products: [
        {
          coefficient: 2,
          elements: [
            { element: 'H', count: 2 },
            { element: 'O', count: 1 },
          ],
          state: 'l',
        },
      ],
      arrow: 'yields',
      altText: 'Water formation',
    });
    expect(richContentFallback(input, 'gradeQuestion').prompt).toBe(
      '2H2(g) + O2(g) → 2H2O(l)',
    );
    expect(
      richContentFallback(
        question({
          type: 'chemistry',
          reactants: [
            {
              coefficient: 1,
              elements: [{ element: 'Fe', count: 1 }],
              charge: 3,
              state: 'aq',
            },
          ],
          products: [
            {
              coefficient: 1,
              elements: [{ element: 'Cl', count: 1 }],
              charge: -1,
            },
          ],
          arrow: 'equilibrium',
          altText: 'Ions',
        }),
        'gradeQuestion',
      ).prompt,
    ).toBe('Fe^(3+)(aq) ⇌ Cl^(−)');
  });
  it('uses accessible media-only fallback without asset capabilities', () => {
    expect(richContentFallback(option(asset()), 'homeworkOption')).toEqual({
      text: '[منحنى السرعة]',
    });
    expect(
      JSON.stringify(richContentFallback(option(asset()), 'gradeOption')),
    ).not.toContain(assetId);
  });
  it('stabilizes serialization regardless of incoming property order', () => {
    expect(
      serializeRichContent({
        stem: document(text('x')),
        kind: 'question',
        contentVersion: 1,
      }),
    ).toBe(serializeRichContent(question(text('x'))));
  });
  it('supports question instructions and independent translated display documents', () => {
    expect(
      richContentFallback(
        { ...question(text('Q')), instructions: document(text('اشرح')) },
        'homeworkQuestion',
      ),
    ).toEqual({ prompt: 'Q', instructions: 'اشرح' });
    expect(
      richContentFallback(
        { ...question(text('Q')), stemAr: document(text('س')) },
        'gradeQuestion',
      ),
    ).toEqual({ prompt: 'Q', promptAr: 'س' });
    expect(
      richContentFallback(
        { ...option(text('A')), labelAr: document(text('أ')) },
        'gradeOption',
      ),
    ).toEqual({ label: 'A', labelAr: 'أ' });
  });
  it.each<RichTarget>([
    'homeworkQuestion',
    'homeworkOption',
    'gradeQuestion',
    'gradeOption',
  ])('has deterministic preserve/clear/rich plans for %s', (target) => {
    expect(planRichContentChange(target, { mode: 'preserve' })).toEqual({
      action: 'preserve',
    });
    expect(planRichContentChange(target, { mode: 'clear' })).toEqual({
      action: 'write',
      richContent: null,
      legacy: {},
    });
    const content = target.endsWith('Question')
      ? question(text('Q'))
      : option(text('A'));
    expect(planRichContentChange(target, { mode: 'rich', content })).toEqual({
      action: 'write',
      richContent: content,
      legacy: richContentFallback(content, target),
    });
  });
  it('clears the entire stale envelope on a partial legacy display edit', () => {
    expect(
      planRichContentChange('gradeQuestion', {
        mode: 'legacy',
        patch: { promptAr: 'تغيير' },
      }),
    ).toEqual({
      action: 'write',
      richContent: null,
      legacy: { promptAr: 'تغيير' },
    });
    expect(
      planRichContentChange('homeworkQuestion', {
        mode: 'legacy',
        patch: { instructions: null },
      }),
    ).toEqual({
      action: 'write',
      richContent: null,
      legacy: { instructions: null },
    });
    expect(
      planRichContentChange('gradeOption', { mode: 'legacy', patch: {} }),
    ).toEqual({ action: 'preserve' });
  });
  it('does not lose future or invalid stored data, return it, or rewrite source', () => {
    const future = { ...question(text('secret future')), contentVersion: 2 };
    const before = JSON.stringify(future);
    expect(readStoredRichContent(future, false)).toEqual({
      state: 'unsupported',
    });
    expect(JSON.stringify(future)).toBe(before);
    expect(
      readStoredRichContent({ ...future, answerKey: 'secret' }, false),
    ).toEqual({ state: 'invalid' });
    expect(readStoredRichContent(null, true)).toEqual({ state: 'absent' });
    expect(readStoredRichContent(undefined, true)).toEqual({ state: 'absent' });
    expect(readStoredRichContent(null, false)).toEqual({ state: 'invalid' });
    expect(readStoredRichContent(question(text('x')), true)).toEqual({
      state: 'invalid',
    });
    expect(readStoredRichContent(question(text('x')), false)).toEqual({
      state: 'valid',
      content: question(text('x')),
    });
  });
});

describe('ST08-A strict adversarial validation and bounded processing', () => {
  it('preserves actual DTO length semantics for surrogate pairs and variation selectors', () => {
    for (const character of ['😀', '☑️']) {
      expect(
        richContentFallback(option(text(character.repeat(1000))), 'gradeOption')
          .label,
      ).toBe(character.repeat(1000));
      expect(() =>
        richContentFallback(
          option(text(character.repeat(1001))),
          'gradeOption',
        ),
      ).toThrow(RichContentError);
    }
  });
  it.each(['(', ')', '{x}', 'x++', 'x y', '1.2.3', '\\frac{1}{2}'])(
    'rejects malformed or unsupported math terminal %s',
    (value) => {
      rejected(
        question({
          type: 'math',
          display: 'inline',
          children: [{ type: 'text', text: value }],
          altText: 'Expression',
        }),
      );
    },
  );
  it('accepts finite numeric scientific terminals and exact numeric bounds', () => {
    for (const value of ['1.25e-3', '١٫٢٥', '۱۲', '≤', 'π', 'س'])
      expect(
        normalizeRichContent(
          question({
            type: 'math',
            display: 'inline',
            children: [{ type: 'text', text: value }],
            altText: 'Expression',
          }),
        ),
      ).toEqual(
        question({
          type: 'math',
          display: 'inline',
          children: [{ type: 'text', text: value }],
          altText: 'Expression',
        }),
      );
    const chemical = {
      type: 'chemistry' as const,
      reactants: [
        {
          coefficient: 999,
          elements: [{ element: 'Og', count: 999 }],
          charge: -8,
        },
      ],
      altText: 'Element',
    };
    expect(normalizeRichContent(question(chemical))).toEqual(
      question(chemical),
    );
    rejected(
      question({
        ...chemical,
        reactants: [{ ...chemical.reactants[0], coefficient: 1000 }],
      }),
    );
    rejected(
      question({
        ...chemical,
        reactants: [
          {
            ...chemical.reactants[0],
            elements: [{ element: 'H', count: 1000 }],
          },
        ],
      }),
    );
    rejected(
      question({
        ...chemical,
        reactants: [{ ...chemical.reactants[0], charge: -9 }],
      }),
    );
    const root = {
      type: 'radical' as const,
      degree: 16,
      radicand: [{ type: 'text' as const, text: 'x' }],
    };
    expect(normalizeRichContent(question(root))).toEqual(question(root));
    rejected(question({ ...root, degree: 17 }));
  });
  it('rejects genuinely sparse arrays and leaves frozen source input unchanged', () => {
    const sparse = question(text('x'));
    sparse.stem.blocks = [
      { type: 'paragraph', children: new Array<RichInline>(1) },
    ];
    rejected(sparse);
    const frozen = Object.freeze(
      question(Object.freeze({ type: 'text', text: 'x' })),
    );
    expect(normalizeRichContent(frozen)).toEqual(question(text('x')));
    expect(normalizeRichContent(frozen)).not.toBe(frozen);
  });
  it.each([0, 2, -1, '1', null, NaN, Infinity])(
    'rejects unsupported/invalid version %p',
    (version) => rejected({ ...question(text('x')), contentVersion: version }),
  );
  it.each([
    undefined,
    null,
    1,
    'html',
    true,
    () => 'x',
    Symbol('x'),
    BigInt(1),
  ])('rejects non-document %p', (input) => rejected(input));
  it.each([
    'answerKey',
    'expectedAnswer',
    'isCorrect',
    'explanation',
    'correctAnswer',
    'metadata',
    'fileId',
    'fileUploadSessionId',
    'bucket',
    'objectKey',
    'storageEndpoint',
    'providerUrl',
    'signedUrl',
    'accessToken',
    'credentials',
    'internalFileMetadata',
    'optionId',
    'questionId',
    'sortOrder',
  ])('rejects nested private/capability/association property %s', (key) => {
    const input = question({
      type: 'strong',
      children: [
        { type: 'text', text: 'visible', [key]: 'private rejected payload' },
      ],
    });
    const before = JSON.stringify(input);
    rejected(input, 'shape');
    expect(JSON.stringify(input)).toBe(before);
    expect(readStoredRichContent(input, false)).toEqual({ state: 'invalid' });
  });
  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects nested dangerous key %s without pollution',
    (key) => {
      const malicious: unknown = JSON.parse(
        `{"type":"text","text":"x","${key}":{"polluted":true}}`,
      );
      rejected(question(malicious as RichInline), 'shape');
      expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    },
  );
  it.each([
    '<b>x</b>',
    '<script',
    '<script>alert(1)</script>',
    '<svg/onload=alert(1)>',
    '<iframe src="x">',
    '<!-- x -->',
    '<?xml x?>',
    '&lt;script&gt;',
    'onerror=alert(1)',
    'style=expression(x)',
    'javascript:alert(1)',
    'VBScript:foo',
    'data:image/png,x',
    'file:///etc/passwd',
    'blob:secret',
    'https://storage.googleapis.com/bucket/key?X-Goog-Signature=secret',
    's3://bucket/key',
    '//127.0.0.1/private',
    '\\newcommand{x}{y}',
    '\\href{x}{y}',
    '\\input{secret}',
    '\\htmlClass{x}{y}',
    '\\def\\x{x}',
  ])('rejects active markup/URL/TeX input %s', (value) =>
    rejected(question(text(value)), 'text'),
  );
  it.each([
    '\u202e',
    '\u202a',
    '\u202b',
    '\u202c',
    '\u202d',
    '\u2066',
    '\u2067',
    '\u2068',
    '\u2069',
    '\u061c',
    '\u200e',
    '\u200f',
    '\ud800',
    '\udfff',
    '\u0000',
  ])('rejects bidi/control/surrogate %p', (value) =>
    rejected(question(text('x' + value)), 'text'),
  );
  it('rejects custom prototypes, getters and toJSON without invoking them', () => {
    rejected(Object.create({ contentVersion: 1 }), 'shape');
    rejected(Object.create(null), 'shape');
    const getter = jest.fn(() => 'x');
    const input = question(text('x'));
    Object.defineProperty(input.stem, 'blocks', {
      get: getter,
      enumerable: true,
    });
    rejected(input, 'shape');
    expect(getter).not.toHaveBeenCalled();
    const toJSON = jest.fn(() => question(text('x')));
    rejected({ ...question(text('x')), toJSON });
    expect(toJSON).not.toHaveBeenCalled();
  });
  it('rejects cycles, sparse/extended arrays, undefined, symbols and unsafe numbers', () => {
    const cycle: { x?: unknown } = {};
    cycle.x = cycle;
    rejected(cycle);
    rejected(question(...new Array<RichInline>(1)));
    const extended = [text('x')];
    Object.defineProperty(extended, 'extra', { value: 1 });
    rejected({
      ...question(text('x')),
      stem: { ...document(text('x')), blocks: extended },
    });
    rejected({ ...question(text('x')), [Symbol('key')]: 'x' });
    rejected({ ...question(text('x')), kind: undefined });
    rejected({
      ...question(text('x')),
      contentVersion: Number.MAX_SAFE_INTEGER + 1,
    });
    rejected({ ...question(text('x')), contentVersion: 1.5 });
  });
  it.each([
    { type: 'unknown' },
    { type: 'text', text: '' },
    { type: 'text', text: { raw: 'x' } },
    { type: 'strong', children: [] },
    { type: 'lineBreak', text: 'x' },
    { type: 'fraction', numerator: [], denominator: [text('1')] },
    { type: 'radical', degree: 1, radicand: [text('1')] },
    { type: 'math', display: 'html', children: [text('1')], altText: 'x' },
    { type: 'math', display: 'inline', children: [asset()], altText: 'x' },
    {
      type: 'chemistry',
      reactants: [{ coefficient: 1, elements: [{ element: 'Xx', count: 2 }] }],
      altText: 'x',
    },
    {
      type: 'chemistry',
      reactants: [{ coefficient: 0, elements: [{ element: 'H', count: 1 }] }],
      altText: 'x',
    },
    {
      type: 'chemistry',
      reactants: [{ coefficient: 1, elements: [{ element: 'H', count: -1 }] }],
      altText: 'x',
    },
    {
      type: 'chemistry',
      reactants: [
        { coefficient: 1, elements: [{ element: 'H', count: 1 }], charge: 9 },
      ],
      altText: 'x',
    },
    {
      type: 'chemistry',
      reactants: [
        {
          coefficient: 1,
          elements: [{ element: 'H', count: 1 }],
          state: 'plasma',
        },
      ],
      altText: 'x',
    },
    { type: 'chemistry', reactants: [], products: [], altText: 'x' },
    {
      type: 'assetReference',
      assetId: 'not-a-uuid',
      kind: 'image',
      altText: 'x',
    },
    { type: 'assetReference', assetId, kind: 'script', altText: 'x' },
    { type: 'assetReference', assetId, kind: 'image', altText: ' ' },
  ])('rejects malformed node %#', (node) =>
    rejected(question(node as RichInline)),
  );
  it('accepts and rejects the immediately adjacent text/accessibility limits', () => {
    expect(
      normalizeRichContent(question(text('ع'.repeat(L.MAX_TEXT_LENGTH)))),
    ).toEqual(question(text('ع'.repeat(L.MAX_TEXT_LENGTH))));
    rejected(question(text('ع'.repeat(L.MAX_TEXT_LENGTH + 1))), 'limit');
    const reference = {
      type: 'assetReference',
      assetId,
      kind: 'image',
      altText: 'a'.repeat(L.MAX_ACCESSIBLE_TEXT_LENGTH),
      caption: 'b'.repeat(L.MAX_ACCESSIBLE_TEXT_LENGTH),
    };
    expect(normalizeRichContent(question(reference as RichInline))).toEqual(
      question(reference as RichInline),
    );
    rejected(
      question({
        ...reference,
        altText: reference.altText + 'a',
      } as RichInline),
      'text',
    );
    rejected(
      question({
        ...reference,
        caption: reference.caption + 'b',
      } as RichInline),
      'text',
    );
  });
  it('enforces exact compact UTF-8 byte budget including JSON syntax and multibyte text', () => {
    const input = question(
      ...Array.from({ length: 8 }, () => text('ع'.repeat(4000))),
      text('x'),
    );
    const remaining =
      L.MAX_UTF8_BYTES - Buffer.byteLength(JSON.stringify(input));
    input.stem.blocks[0] = {
      type: 'paragraph',
      children: [
        ...Array.from({ length: 8 }, () => text('ع'.repeat(4000))),
        text('x'.repeat(remaining + 1)),
      ],
    };
    expect(Buffer.byteLength(JSON.stringify(input))).toBe(L.MAX_UTF8_BYTES);
    expect(normalizeRichContent(input)).toEqual(input);
    const block = input.stem.blocks[0];
    if (block.type !== 'paragraph') throw new Error('Fixture shape');
    block.children.push(text('x'));
    // Remove the added node overhead, leaving exactly one byte over the limit.
    block.children.pop();
    block.children[8] = text('x'.repeat(remaining + 2));
    expect(Buffer.byteLength(JSON.stringify(input))).toBe(L.MAX_UTF8_BYTES + 1);
    rejected(input, 'limit');
    expect(() => parseRichContentJson(JSON.stringify(input))).toThrow(
      RichContentError,
    );
  });
  it('bounds exact container count, math work, chemistry work, references and properties', () => {
    const nodes = question(
      ...Array.from({ length: L.MAX_TOTAL_NODES - 5 }, () => text('x')),
    );
    expect(normalizeRichContent(nodes)).toEqual(nodes);
    rejected(
      question(
        ...Array.from({ length: L.MAX_TOTAL_NODES - 4 }, () => text('x')),
      ),
      'limit',
    );
    const math = {
      type: 'math' as const,
      display: 'inline' as const,
      children: Array.from({ length: L.MAX_MATH_COMPLEXITY }, () => ({
        type: 'text' as const,
        text: 'x',
      })),
      altText: 'x',
    };
    expect(normalizeRichContent(question(math))).toEqual(question(math));
    rejected(
      question({
        ...math,
        children: [...math.children, { type: 'text', text: 'x' }],
      }),
      'limit',
    );
    const chemical = {
      type: 'chemistry' as const,
      reactants: [
        {
          coefficient: 1,
          elements: Array.from(
            { length: L.MAX_CHEMISTRY_COMPLEXITY - 1 },
            () => ({ element: 'H', count: 1 }),
          ),
        },
      ],
      altText: 'x',
    };
    expect(normalizeRichContent(question(chemical))).toEqual(
      question(chemical),
    );
    chemical.reactants[0].elements.push({ element: 'H', count: 1 });
    rejected(question(chemical), 'limit');
    expect(
      normalizeRichContent(
        question(...Array.from({ length: L.MAX_ASSET_REFERENCES }, asset)),
      ),
    ).toEqual(
      question(...Array.from({ length: L.MAX_ASSET_REFERENCES }, asset)),
    );
    rejected(
      question(...Array.from({ length: L.MAX_ASSET_REFERENCES + 1 }, asset)),
      'limit',
    );
    const five = {
      ...question(text('x')),
      instructions: document(text('i')),
      stemAr: document(text('س')),
    };
    expect(Object.keys(five)).toHaveLength(L.MAX_NODE_PROPERTIES);
    expect(normalizeRichContent(five)).toEqual(five);
    rejected({ ...five, hidden: 'x' }, 'limit');
  });
  it('accepts structural depth 16 and rejects at the next container at depth 17', () => {
    let child = text('x');
    for (let i = 0; i < 5; i++) child = { type: 'strong', children: [child] };
    expect(normalizeRichContent(question(child))).toEqual(question(child));
    let deep = {
      type: 'chemistry' as const,
      reactants: [{ coefficient: 1, elements: [{ element: 'H', count: 1 }] }],
      altText: 'x',
    } as RichInline;
    for (let i = 0; i < 5; i++) deep = { type: 'strong', children: [deep] };
    rejected(question(deep), 'limit');
    expect(() =>
      parseRichContentJson(
        '['.repeat(L.MAX_NESTING_DEPTH + 2) +
          '0' +
          ']'.repeat(L.MAX_NESTING_DEPTH + 2),
      ),
    ).toThrow(RichContentError);
    expect(() => parseRichContentJson('{')).toThrow(RichContentError);
  });
  it.each<[RichTarget, number, 'prompt' | 'text' | 'label']>([
    ['homeworkQuestion', 8000, 'prompt'],
    ['gradeQuestion', 5000, 'prompt'],
    ['homeworkOption', 1000, 'text'],
    ['gradeOption', 1000, 'label'],
  ])(
    'respects %s exact legacy fallback limit without truncation',
    (target, max, field) => {
      const build = target.endsWith('Question') ? question : option;
      expect(
        richContentFallback(build(text('x'.repeat(max))), target)[field],
      ).toBe('x'.repeat(max));
      expect(() =>
        richContentFallback(build(text('x'.repeat(max)), text('y')), target),
      ).toThrow(RichContentError);
    },
  );
  it('rejects overlong instructions, blank fallback and mismatched entity/translated shapes', () => {
    expect(
      richContentFallback(
        {
          ...question(text('Q')),
          instructions: document(text('i'.repeat(4000))),
        },
        'homeworkQuestion',
      ).instructions,
    ).toHaveLength(4000);
    expect(() =>
      richContentFallback(
        {
          ...question(text('Q')),
          instructions: document(text('i'.repeat(4001))),
        },
        'homeworkQuestion',
      ),
    ).toThrow(RichContentError);
    expect(() =>
      richContentFallback(option({ type: 'lineBreak' }), 'gradeOption'),
    ).toThrow(RichContentError);
    expect(() =>
      richContentFallback(question(text('Q')), 'gradeOption'),
    ).toThrow(RichContentError);
    expect(() =>
      richContentFallback(
        { ...option(text('A')), labelAr: document(text('أ')) },
        'homeworkOption',
      ),
    ).toThrow(RichContentError);
    expect(() =>
      richContentFallback(
        { ...question(text('Q')), instructions: document(text('I')) },
        'gradeQuestion',
      ),
    ).toThrow(RichContentError);
    expect(() =>
      planRichContentChange('gradeOption', {
        mode: 'legacy',
        patch: { prompt: 'wrong association' },
      }),
    ).toThrow(RichContentError);
  });
});
