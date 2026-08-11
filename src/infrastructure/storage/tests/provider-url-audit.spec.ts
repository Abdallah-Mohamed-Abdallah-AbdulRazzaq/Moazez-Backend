import {
  ProviderUrlAuditClient,
  auditPersistedProviderUrls,
  formatProviderUrlAuditResult,
} from '../provider-url-audit';

describe('pre-real-data provider URL audit', () => {
  it('passes zero findings using bounded, read-only queries', async () => {
    const client = fakeClient({
      gradeAssessmentQuestion: [
        {
          id: 'grade-1',
          metadata: { mediaUrl: 'https://media.example.org/a' },
        },
      ],
      lessonContentItem: [
        { id: 'lesson-1', url: 'https://video.example.org/a' },
      ],
      heroBadge: [{ id: 'badge-1', assetPath: '/badges/a.svg' }],
      schoolProfile: [{ id: 'profile-1', logoUrl: null }],
      communicationAnnouncement: [{ id: 'announcement-1', actionUrl: null }],
    });

    const result = await auditPersistedProviderUrls(client.value);

    expect(result).toMatchObject({
      status: 'PASS',
      PROVIDER_URL_COUNT: 0,
      LEGACY_PROVIDER_URL_COUNT: 0,
      UNSAFE_LEGACY_URL_COUNT: 0,
    });
    for (const calls of Object.values(client.calls)) {
      expect(calls).not.toHaveLength(0);
      expect(calls[0]).toEqual(
        expect.objectContaining({
          orderBy: { id: 'asc' },
          take: 250,
        }),
      );
      expect(calls[0]).not.toHaveProperty('include');
    }
  });

  it('fails when a provider URL exists on active or legacy surfaces', async () => {
    const client = fakeClient({
      gradeAssessmentQuestion: [
        {
          id: 'grade-1',
          metadata: {
            mediaUrl:
              'https://storage.googleapis.com/private/object?X-Goog-Signature=do-not-print',
          },
        },
      ],
      lessonContentItem: [],
      heroBadge: [
        { id: 'badge-1', assetPath: 'https://bucket.s3.amazonaws.com/object' },
      ],
      schoolProfile: [],
      communicationAnnouncement: [],
    });

    const result = await auditPersistedProviderUrls(client.value);

    expect(result).toMatchObject({
      status: 'FAIL',
      PROVIDER_URL_COUNT: 2,
      LEGACY_PROVIDER_URL_COUNT: 1,
      UNSAFE_LEGACY_URL_COUNT: 0,
    });
  });

  it('fails for an unsafe branding legacy value', async () => {
    const client = fakeClient({
      gradeAssessmentQuestion: [],
      lessonContentItem: [],
      heroBadge: [],
      schoolProfile: [{ id: 'profile-1', logoUrl: 'malformed secret-value' }],
      communicationAnnouncement: [],
    });

    const result = await auditPersistedProviderUrls(client.value);
    expect(result).toMatchObject({
      status: 'FAIL',
      PROVIDER_URL_COUNT: 0,
      LEGACY_PROVIDER_URL_COUNT: 0,
      UNSAFE_LEGACY_URL_COUNT: 1,
    });
  });

  it('never prints raw URLs, signatures, credentials, or database details', async () => {
    const sensitive =
      'https://storage.googleapis.com/private/object?X-Goog-Credential=credential-secret&X-Goog-Signature=signature-secret';
    const client = fakeClient({
      gradeAssessmentQuestion: [],
      lessonContentItem: [],
      heroBadge: [],
      schoolProfile: [{ id: 'profile-1', logoUrl: sensitive }],
      communicationAnnouncement: [],
    });

    const output = formatProviderUrlAuditResult(
      await auditPersistedProviderUrls(client.value),
    );
    expect(output).not.toContain(sensitive);
    expect(output).not.toContain('credential-secret');
    expect(output).not.toContain('signature-secret');
    expect(output).not.toContain('DATABASE_URL');
  });
});

function fakeClient(
  rows: Record<
    keyof ProviderUrlAuditClient,
    Array<Record<string, unknown> & { id: string }>
  >,
): {
  value: ProviderUrlAuditClient;
  calls: Record<keyof ProviderUrlAuditClient, Array<Record<string, unknown>>>;
} {
  const calls = {} as Record<
    keyof ProviderUrlAuditClient,
    Array<Record<string, unknown>>
  >;
  const value = {} as ProviderUrlAuditClient;

  for (const key of Object.keys(rows) as Array<keyof ProviderUrlAuditClient>) {
    calls[key] = [];
    value[key] = {
      findMany: jest.fn(async (args: Record<string, unknown>) => {
        calls[key].push(args);
        const cursor = (args.cursor as { id?: string } | undefined)?.id;
        const start = cursor
          ? Math.max(0, rows[key].findIndex((row) => row.id === cursor) + 1)
          : 0;
        return rows[key].slice(start, start + Number(args.take));
      }),
    };
  }

  return { value, calls };
}
