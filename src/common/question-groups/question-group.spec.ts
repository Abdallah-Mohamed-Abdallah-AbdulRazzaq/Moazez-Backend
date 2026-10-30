import {
  groupOrder,
  groupStimulus,
  groupText,
  mixedQuestionLayout,
} from './question-group';
import {
  attachQuestionGroupContext,
  presentQuestionGroupContext,
  presentQuestionGroupMembership,
} from './question-group.projection';

describe('ST11 non-answerable multipart display policy', () => {
  it('preserves legacy question order while sorting mixed blocks and children deterministically', () => {
    const questions = [
      { id: 'b', sortOrder: 1, groupId: null, layoutOrder: 9 },
      { id: 'a', sortOrder: 0, groupId: 'g', layoutOrder: 5 },
      { id: 'c', sortOrder: 2, groupId: 'g', layoutOrder: 5 },
      { id: 'd', sortOrder: 3, groupId: null, layoutOrder: 0 },
    ];
    const before = structuredClone(questions);
    const result = mixedQuestionLayout(questions, [
      { id: 'g', layoutOrder: 0 },
    ]);
    expect(result.displayItems).toEqual([
      { kind: 'question', questionId: 'd' },
      { kind: 'group', groupId: 'g', questionIds: ['a', 'c'] },
      { kind: 'question', questionId: 'b' },
    ]);
    expect(questions).toEqual(before);
  });
  it('does not silently flatten dangling/deleted/cross-parent membership', () => {
    expect(() =>
      mixedQuestionLayout(
        [{ id: 'q', sortOrder: 0, groupId: 'unavailable', layoutOrder: null }],
        [],
      ),
    ).toThrow();
  });
  it.each([-1, 1.5, 2147483648, '1', null])(
    'rejects invalid display order %s',
    (value) => {
      expect(() => groupOrder(value)).toThrow();
    },
  );
  it('requires a bounded title and refuses HTML display and undefined Rich shapes', () => {
    expect(groupText(' Group ', 255, true)).toBe('Group');
    for (const value of [
      '',
      ' ',
      '<script>',
      'x'.repeat(256),
      'bad\u0000title',
      'bad\u007Ftitle',
      null,
    ])
      expect(() => groupText(value, 255, true)).toThrow();
    for (const value of [
      { html: '<p>unsafe</p>' },
      { contentVersion: 2 },
      { contentVersion: 1, kind: 'option' },
      { contentVersion: 1, kind: 'question', answerKey: {} },
    ])
      expect(() => groupStimulus(value)).toThrow();
    expect(groupStimulus(null)).toBeNull();
  });
  it('only presents registered authorized context and omits new fields for legacy records', () => {
    const records = [{ id: 'q' }];
    expect(presentQuestionGroupContext(records)).toEqual({});
    expect(presentQuestionGroupMembership(records[0])).toEqual({});
    attachQuestionGroupContext(
      records,
      { groups: [], displayItems: [{ kind: 'question', questionId: 'q' }] },
      new Map([['q', 'g']]),
    );
    expect(presentQuestionGroupMembership(records[0])).toEqual({
      groupId: 'g',
    });
    expect(presentQuestionGroupContext(records).displayItems).toHaveLength(1);
    expect(presentQuestionGroupContext([{ id: 'q' }])).toEqual({});
  });
});
