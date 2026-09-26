import {
  normalizeAcademicContentLinks,
  normalizeAcademicContentTags,
} from '../domain/academic-content-links-tags.policy';

describe('Academic Content current link normalization', () => {
  it('accepts ordered HTTP(S) links without fetching them', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const links = normalizeAcademicContentLinks([
      { label: ' First ', url: 'https://example.com/a' },
      { label: 'Second', url: 'http://example.org/b' },
    ]);
    expect(links).toEqual([
      { label: 'First', url: 'https://example.com/a', sortOrder: 0 },
      { label: 'Second', url: 'http://example.org/b', sortOrder: 1 },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it.each([
    'javascript:alert(1)',
    'data:text/plain,secret',
    'file:///etc/passwd',
    'ftp://example.com/a',
    'mailto:user@example.com',
    'https://user@example.com/a',
    'https://user:password@example.com/a',
    'https://',
    'https://?missing-host',
    '',
    'x'.repeat(2049),
  ])('rejects unsafe or invalid URL %s', (url) => {
    expect(() =>
      normalizeAcademicContentLinks([{ label: 'Link', url }]),
    ).toThrow();
  });

  it.each(['', '   ', 'x'.repeat(181)])(
    'rejects blank or overlong labels',
    (label) => {
      expect(() =>
        normalizeAcademicContentLinks([{ label, url: 'https://example.com' }]),
      ).toThrow();
    },
  );
});

describe('Academic Content tag normalization', () => {
  it('normalizes Unicode and spacing while preserving display order', () => {
    expect(
      normalizeAcademicContentTags([
        { value: '  Ｍａｔｈ   Notes  ' },
        { value: 'Science\tLab' },
      ]),
    ).toEqual([
      {
        displayValue: 'Math Notes',
        normalizedValue: 'math notes',
        sortOrder: 0,
      },
      {
        displayValue: 'Science Lab',
        normalizedValue: 'science lab',
        sortOrder: 1,
      },
    ]);
  });

  it('rejects blank, overlong, and case-insensitive duplicates', () => {
    expect(() => normalizeAcademicContentTags([{ value: ' \t ' }])).toThrow();
    expect(() =>
      normalizeAcademicContentTags([{ value: 'x'.repeat(81) }]),
    ).toThrow();
    expect(() =>
      normalizeAcademicContentTags([
        { value: 'Science' },
        { value: '  SCIENCE  ' },
      ]),
    ).toThrow();
  });
});
