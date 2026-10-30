import {
  assertResponseModalities,
  normalizeResponseConfig,
  ResponseConfigInputError,
  responseAllowsMime,
} from './response-config';

describe('ST11 closed response modality policy', () => {
  it.each([null, undefined])(
    'preserves absent legacy configuration (%s)',
    (value) => {
      expect(normalizeResponseConfig(value)).toBeNull();
    },
  );
  it.each([
    [],
    'FILE_ONLY',
    {},
    { version: 2, mode: 'FILE_ONLY' },
    { version: 1, mode: 'VIDEO_ONLY' },
    { version: 1, mode: 'FILE_ONLY', extra: true },
    { version: 1, mode: 'TEXT_ONLY', maxFiles: 1 },
    ...[null, 0, 4, 1.5, '1'].map((maxFiles) => ({
      version: 1,
      mode: 'FILE_ONLY',
      maxFiles,
    })),
  ])('rejects undefined configuration grammar %#', (value) => {
    expect(() => normalizeResponseConfig(value)).toThrow(
      ResponseConfigInputError,
    );
  });
  it('defaults and bounds attachment count without widening text-only configuration', () => {
    expect(normalizeResponseConfig({ version: 1, mode: 'FILE_ONLY' })).toEqual({
      version: 1,
      mode: 'FILE_ONLY',
      maxFiles: 1,
    });
    expect(normalizeResponseConfig({ version: 1, mode: 'TEXT_ONLY' })).toEqual({
      version: 1,
      mode: 'TEXT_ONLY',
    });
  });
  it.each([
    ['TEXT_ONLY', true, [], false],
    ['FILE_ONLY', false, ['text/plain'], false],
    ['AUDIO_ONLY', false, ['audio/mpeg'], false],
    ['TEXT_OR_FILE', true, [], false],
    ['TEXT_OR_FILE', false, ['application/pdf'], false],
    ['TEXT_AND_FILE', true, ['image/png'], false],
    ['FILE_OR_AUDIO', false, ['audio/webm'], false],
    ['FILE_OR_AUDIO', false, ['image/jpeg'], false],
    ['TEXT_ONLY', false, [], true],
  ] as const)('accepts final modality %s', (mode, hasText, mimes, optional) => {
    const config = normalizeResponseConfig({ version: 1, mode })!;
    expect(() =>
      assertResponseModalities({
        config,
        hasText,
        assets: mimes.map((mimeType: string) => ({ mimeType })),
        required: !optional,
        phase: 'final',
      }),
    ).not.toThrow();
  });
  it.each([
    ['TEXT_ONLY', false, []],
    ['FILE_ONLY', true, ['text/plain']],
    ['FILE_ONLY', false, ['audio/mpeg']],
    ['AUDIO_ONLY', false, ['text/plain']],
    ['TEXT_AND_FILE', true, []],
    ['TEXT_AND_FILE', false, ['text/plain']],
    ['TEXT_OR_FILE', false, []],
    ['FILE_OR_AUDIO', true, ['text/plain']],
    ['FILE_OR_AUDIO', false, ['video/mp4']],
  ] as const)(
    'rejects incompatible final modality %s',
    (mode, hasText, mimes) => {
      const config = normalizeResponseConfig({ version: 1, mode })!;
      expect(() =>
        assertResponseModalities({
          config,
          hasText,
          assets: mimes.map((mimeType: string) => ({ mimeType })),
          required: true,
          phase: 'final',
        }),
      ).toThrow(ResponseConfigInputError);
    },
  );
  it('allows optional absence and partial drafts, but refuses supplied incomplete final answers and excess assets', () => {
    const config = normalizeResponseConfig({
      version: 1,
      mode: 'TEXT_AND_FILE',
    })!;
    expect(() =>
      assertResponseModalities({
        config,
        hasText: false,
        assets: [],
        required: false,
        phase: 'final',
      }),
    ).not.toThrow();
    expect(() =>
      assertResponseModalities({
        config,
        hasText: true,
        assets: [],
        required: true,
        phase: 'draft',
      }),
    ).not.toThrow();
    expect(() =>
      assertResponseModalities({
        config,
        hasText: true,
        assets: [],
        required: false,
        phase: 'final',
      }),
    ).toThrow(ResponseConfigInputError);
    expect(() =>
      assertResponseModalities({
        config,
        hasText: true,
        assets: [{ mimeType: 'text/plain' }, { mimeType: 'text/plain' }],
        required: false,
        phase: 'draft',
      }),
    ).toThrow(ResponseConfigInputError);
    expect(responseAllowsMime(config, 'text/html')).toBe(false);
  });
});
