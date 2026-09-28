import {
  normalizePreparationTemplate,
  normalizeTemplateName,
  normalizeTemplateSearch,
} from '../domain/academic-content-preparation-template.policy';

describe('Preparation template policy', () => {
  it('normalizes display and duplicate keys with NFKC and whitespace collapse', () => {
    expect(normalizeTemplateName('  Weekly\t Algebra\n ')).toEqual({
      name: 'Weekly Algebra',
      normalizedName: 'weekly algebra',
    });
    expect(normalizeTemplateName('Ｆｕｌｌ  Ｗｉｄｔｈ')).toEqual({
      name: 'Full Width',
      normalizedName: 'full width',
    });
    expect(() => normalizeTemplateName('  ')).toThrow();
    expect(() => normalizeTemplateName('x'.repeat(181))).toThrow();
    expect(normalizeTemplateName('x'.repeat(180)).name).toHaveLength(180);
  });

  it('uses the Teacher Preparation normalization authority for every preset', () => {
    const fields = normalizePreparationTemplate({
      name: 'Preset',
      topic: 'x'.repeat(500),
      objectives: ['  one \t two '],
      learningOutcomes: [' three   four '],
      teachingStrategies: [' five \n six '],
      activities: [' seven   eight '],
      resourceNotes: 'x'.repeat(4000),
      assessmentNotes: 'x'.repeat(4000),
      teacherNotes: 'x'.repeat(4000),
    });
    expect(fields.objectives).toEqual(['one two']);
    expect(fields.learningOutcomes).toEqual(['three four']);
    expect(fields.teachingStrategies).toEqual(['five six']);
    expect(fields.activities).toEqual(['seven eight']);
    expect(fields.resourceNotes).toHaveLength(4000);
    expect(normalizePreparationTemplate({ name: 'Empty' }).objectives).toEqual(
      [],
    );
    for (const key of [
      'objectives',
      'learningOutcomes',
      'teachingStrategies',
      'activities',
    ] as const) {
      expect(() =>
        normalizePreparationTemplate({ name: 'X', [key]: Array(51).fill('x') }),
      ).toThrow();
      expect(() =>
        normalizePreparationTemplate({ name: 'X', [key]: [' '] }),
      ).toThrow();
      expect(() =>
        normalizePreparationTemplate({ name: 'X', [key]: null } as never),
      ).toThrow();
      expect(() =>
        normalizePreparationTemplate({ name: 'X', [key]: ['x'.repeat(501)] }),
      ).toThrow();
      expect(
        normalizePreparationTemplate({ name: 'X', [key]: ['x'.repeat(500)] })[
          key
        ][0],
      ).toHaveLength(500);
      expect(
        normalizePreparationTemplate({ name: 'X', [key]: Array(50).fill('x') })[
          key
        ],
      ).toHaveLength(50);
    }
    expect(() =>
      normalizePreparationTemplate({ name: 'X', topic: 'x'.repeat(501) }),
    ).toThrow();
    expect(
      normalizePreparationTemplate({ name: 'X', topic: 'x'.repeat(500) }).topic,
    ).toHaveLength(500);
    expect(
      normalizePreparationTemplate({ name: 'X', description: '  ' })
        .description,
    ).toBeNull();
    expect(() =>
      normalizePreparationTemplate({
        name: 'X',
        description: 'x'.repeat(1001),
      }),
    ).toThrow();
    for (const key of [
      'resourceNotes',
      'assessmentNotes',
      'teacherNotes',
    ] as const)
      expect(() =>
        normalizePreparationTemplate({ name: 'X', [key]: 'x'.repeat(4001) }),
      ).toThrow();
  });

  it('bounds search after normalizing whitespace', () => {
    expect(normalizeTemplateSearch('  Full\t Width ')).toBe('Full Width');
    expect(() => normalizeTemplateSearch('x'.repeat(121))).toThrow();
  });
});
