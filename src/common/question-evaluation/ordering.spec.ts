import {
  evaluateOrdering,
  normalizeOrderingAnswer,
  normalizeOrderingDefinition,
  normalizeOrderingKey,
  QuestionEvaluationInputError,
} from './index';

const definition = {
  definitionVersion: 1,
  kind: 'ordering',
  items: [
    { id: 'b', displayOrder: 2, label: 'ثانياً' },
    { id: 'a', displayOrder: 1, label: 'First' },
  ],
};
const key = { keyVersion: 1, kind: 'ordering', expectedItemIds: ['b', 'a'] };
describe('ST10-A Ordering pure contracts', () => {
  it('canonicalizes public presentation independently from the private sequence without mutation', () => {
    const original = JSON.stringify(definition);
    expect(
      normalizeOrderingDefinition(definition, 'complete').items.map(
        (item) => item.id,
      ),
    ).toEqual(['a', 'b']);
    expect(normalizeOrderingKey(definition, key).expectedItemIds).toEqual([
      'b',
      'a',
    ]);
    expect(JSON.stringify(definition)).toBe(original);
    expect(
      JSON.stringify(normalizeOrderingDefinition(definition, 'complete')),
    ).not.toContain('expectedItemIds');
  });
  it('compares full sequences only and distinguishes missing manual from invalid configured key', () => {
    const state = { state: 'configured', key };
    expect(
      evaluateOrdering(definition, state, { orderedItemIds: ['b', 'a'] }),
    ).toBe('PROVED_EQUIVALENT');
    expect(
      evaluateOrdering(definition, state, { orderedItemIds: ['a', 'b'] }),
    ).toBe('PROVED_DIFFERENT');
    expect(evaluateOrdering(definition, state, { orderedItemIds: ['a'] })).toBe(
      'INVALID_INPUT',
    );
    expect(
      evaluateOrdering(
        definition,
        { state: 'manual' },
        { orderedItemIds: ['a', 'b'] },
      ),
    ).toBe('UNKNOWN_REQUIRES_MANUAL_REVIEW');
    expect(() =>
      evaluateOrdering(
        definition,
        { state: 'configured', key: { ...key, expectedItemIds: ['a'] } },
        null,
      ),
    ).toThrow(QuestionEvaluationInputError);
    expect(() => evaluateOrdering(definition, {}, null)).toThrow(
      QuestionEvaluationInputError,
    );
  });
  it('preserves partial drafts and optional absence but rejects supplied partial finals', () => {
    expect(
      normalizeOrderingAnswer(
        definition,
        { orderedItemIds: ['b'] },
        'draft',
        true,
      ),
    ).toEqual({ orderedItemIds: ['b'] });
    expect(normalizeOrderingAnswer(definition, null, 'draft', true)).toBeNull();
    expect(
      normalizeOrderingAnswer(definition, undefined, 'final', false),
    ).toBeNull();
    expect(() =>
      normalizeOrderingAnswer(definition, null, 'final', true),
    ).toThrow();
    for (const ids of [[], ['a'], ['a', 'a'], ['b', 'foreign']])
      expect(() =>
        normalizeOrderingAnswer(
          definition,
          { orderedItemIds: ids },
          'final',
          false,
        ),
      ).toThrow();
    expect(() =>
      normalizeOrderingAnswer(
        definition,
        { orderedItemIds: ['a', 'b'], points: 1 },
        'final',
        true,
      ),
    ).toThrow();
  });
  it('bounds items, validates positions/labels/IDs, and refuses stale keys', () => {
    const labeled = (length: number) => ({
      ...definition,
      items: [{ id: 'a', displayOrder: 1, label: 'A'.repeat(length) }],
    });
    expect(
      normalizeOrderingDefinition(labeled(1000), 'complete').items[0].label,
    ).toHaveLength(1000);
    expect(() =>
      normalizeOrderingDefinition(labeled(1001), 'complete'),
    ).toThrow();
    const empty = { ...definition, items: [] };
    expect(normalizeOrderingDefinition(empty, 'draft').items).toEqual([]);
    expect(() => normalizeOrderingDefinition(empty, 'complete')).toThrow();
    const fifty = {
      ...definition,
      items: Array.from({ length: 50 }, (_, i) => ({
        id: `item_${i}`,
        displayOrder: i,
        label: `Item ${i}`,
      })),
    };
    expect(normalizeOrderingDefinition(fifty, 'complete').items).toHaveLength(
      50,
    );
    expect(() =>
      normalizeOrderingDefinition(
        {
          ...fifty,
          items: [
            ...fifty.items,
            { id: 'last', displayOrder: 50, label: 'Last' },
          ],
        },
        'complete',
      ),
    ).toThrow();
    for (const row of [
      { id: 'a', displayOrder: 1, label: 'dup' },
      { id: 'c', displayOrder: 2, label: 'dup position' },
      { id: 'c', displayOrder: -1, label: 'bad' },
      { id: 'c', displayOrder: 0.5, label: 'bad' },
      { id: 'bad id', displayOrder: 3, label: 'bad' },
      { id: 'c', displayOrder: 3, label: '\ud800' },
      { id: 'c', displayOrder: 3, label: '   ' },
      { id: 'c', displayOrder: 3, label: '\u202eevil' },
    ])
      expect(() =>
        normalizeOrderingDefinition(
          { ...definition, items: [...definition.items, row] },
          'complete',
        ),
      ).toThrow();
    expect(() =>
      normalizeOrderingKey(
        {
          ...definition,
          items: [
            ...definition.items,
            { id: 'new', displayOrder: 3, label: 'New' },
          ],
        },
        key,
      ),
    ).toThrow();
    expect(() =>
      normalizeOrderingKey(definition, { ...key, keyVersion: 2 }),
    ).toThrow();
  });
});
