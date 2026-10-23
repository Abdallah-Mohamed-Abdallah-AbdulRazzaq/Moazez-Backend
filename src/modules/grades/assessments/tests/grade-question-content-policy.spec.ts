import { GradeQuestionType } from '@prisma/client';
import { normalizeQuestionPayload } from '../domain/grade-question-domain';
import { validateQuestionForPublish } from '../domain/grade-assessment-question-publish-domain';
import { sanitizeGradeQuestionContent } from '../domain/grade-question-content-policy';

describe('Grade question content boundary', () => {
  const rejected = [
    'http://example.com/media',
    'javascript:alert(1)',
    'javascript:(alert(1))',
    'data:,unsafe',
    'data:text/html,unsafe',
    'file:///private/file',
    'ftp://example.com/file',
    '//example.com/media',
    'https://user:password@example.com/media',
    'https://127.0.0.1/media',
    'https://10.0.0.1/media',
    'https://[::1]/media',
    'https://metadata.google.internal/media',
    'https://storage.googleapis.com/test-only/media',
    'gs://test-only/media',
    'https://test-only.s3.amazonaws.com/media',
    's3://test-only/media',
    'https://minio.example.com/media',
    'https://cdn.example.com/media?X-Amz-Signature=synthetic',
    'https://cdn.example.com/media?X-Goog-Credential=synthetic',
    'https://cdn.example.com/media?token=synthetic',
    'https://example.com/media?next=https%3A%2F%2Fstorage.googleapis.com%2Ftest-only%2Fmedia',
    'https://example.com/media#javascript:(alert(1))',
  ];

  it.each(rejected)(
    'rejects unsafe nested content on create, patch and publish (%#)',
    (url) => {
      for (const content of [
        { metadata: { nested: [{ src: url }] } },
        {
          options: [
            { label: 'A', metadata: { nested: [{ alternateLink: url }] } },
          ],
        },
        { acceptedAnswersEn: [url] },
        { matchingPairs: [{ left: `See ${url}`, right: 'B' }] },
        { answerKey: { alternate: url } },
      ]) {
        expect(() => normalizeQuestionPayload(content)).toThrow(
          expect.objectContaining({ code: 'validation.failed' }),
        );
        expect(() =>
          normalizeQuestionPayload(
            { type: 'ESSAY', prompt: 'Write', points: 5, ...content },
            { requirePrompt: true },
          ),
        ).toThrow();
        const question = {
          id: 'question',
          type: GradeQuestionType.ESSAY,
          points: 5,
          options: [],
          ...content,
        };
        expect(() =>
          validateQuestionForPublish(
            question as Parameters<typeof validateQuestionForPublish>[0],
          ),
        ).toThrow();
      }
    },
  );

  it('preserves harmless text, legacy fields and approved external HTTPS', () => {
    expect(
      normalizeQuestionPayload({
        prompt: 'Compare HTTP: and HTTPS:; ratio 2:3',
      }).prompt,
    ).toBe('Compare HTTP: and HTTPS:; ratio 2:3');
    const metadata = {
      difficulty: 'easy',
      formula: 'Ratio: 2:3',
      nested: [{ mediaUrl: 'https://example.com/video?lang=en' }],
    };
    expect(normalizeQuestionPayload({ metadata }).metadata).toEqual(metadata);
    expect(sanitizeGradeQuestionContent(metadata)).toEqual(metadata);
  });

  it('redacts unsafe historical values and nested storage coordinates without echoing them', () => {
    const content = {
      kept: true,
      bucket: 'synthetic-private',
      nested: [
        {
          src: rejected[0],
          objectKey: 'synthetic-object',
          answer_key: 'hidden',
          is_correct: true,
        },
      ],
    };
    expect(sanitizeGradeQuestionContent(content, true)).toEqual({
      kept: true,
      nested: [{ src: null }],
    });
    try {
      normalizeQuestionPayload({ metadata: content });
    } catch (error) {
      expect(JSON.stringify(error)).not.toMatch(
        /synthetic-private|synthetic-object|hidden|http:/,
      );
    }
  });

  it('bounds nesting before persistence and presentation', () => {
    let value: Record<string, unknown> = { kept: true };
    for (let i = 0; i < 20; i++) value = { nested: value };
    expect(() => normalizeQuestionPayload({ metadata: value })).toThrow();
    expect(() => sanitizeGradeQuestionContent(value)).not.toThrow();
  });
});
