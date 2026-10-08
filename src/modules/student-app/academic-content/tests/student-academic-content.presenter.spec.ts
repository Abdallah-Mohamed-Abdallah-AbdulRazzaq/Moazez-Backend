import { STUDENT_ACADEMIC_CONTENT_TYPES } from '../../../academics/academic-content/domain/academic-content-recipient.query';
import { StudentAcademicContentPresenter as Presenter } from '../presenters/student-academic-content.presenter';
import { studentContentFixture } from './student-academic-content.fixture';

describe('Student Academic Content immutable safe projection', () => {
  it.each(STUDENT_ACADEMIC_CONTENT_TYPES)(
    'presents %s immutable summary and detail',
    (type) => {
      const row = studentContentFixture(type);
      const detail = Presenter.presentDetail(row).content;
      expect(detail.title).toBe('Published title');
      expect(detail.assets).toEqual(row.assets);
      expect(detail.links).toEqual(row.links);
      expect(detail.tags).toEqual([{ value: 'Published Tag', sortOrder: 0 }]);
      if (type === 'GENERAL_RESOURCE') {
        expect(detail.summary).toBeNull();
        expect(detail.details).toBeNull();
      } else
        expect(detail.details).toEqual(
          row.typeSpecificSnapshot &&
            typeof row.typeSpecificSnapshot === 'object' &&
            !Array.isArray(row.typeSpecificSnapshot)
            ? row.typeSpecificSnapshot.state
            : null,
        );
    },
  );

  it('adds immutable RevisionLink identity while preserving every legacy link field', () => {
    const row = studentContentFixture('GENERAL_RESOURCE');
    const projected = Presenter.presentDetail(row).content;
    expect(projected.links).toEqual([
      {
        revisionLinkId: row.links[0].revisionLinkId,
        label: 'Published link',
        url: 'https://example.test/published',
        sortOrder: 0,
      },
    ]);
    const { revisionLinkId, ...legacy } = projected.links[0];
    expect(revisionLinkId).toBe('55555555-5555-4555-8555-555555555555');
    expect(legacy).toEqual({
      label: 'Published link',
      url: 'https://example.test/published',
      sortOrder: 0,
    });
    expect(
      Presenter.presentList({
        items: [row],
        pagination: { page: 1, limit: 20, total: 1 },
      }).items[0],
    ).not.toHaveProperty('links');
  });

  it('excludes meeting capabilities from feed while authorized detail includes them', () => {
    const row = studentContentFixture('ONLINE_SESSION');
    const list = Presenter.presentList({
      items: [row],
      pagination: { page: 1, limit: 20, total: 1 },
    });
    expect(list.items[0].summary).toEqual({
      platform: 'GOOGLE_MEET',
      startAt: '2026-10-07T10:00:00.000Z',
      endAt: '2026-10-07T11:00:00.000Z',
    });
    for (const forbidden of [
      'joinUrl',
      'accessCode',
      'instructions',
      'private-code',
    ])
      expect(JSON.stringify(list)).not.toContain(forbidden);
    expect(Presenter.presentDetail(row).content.details).toMatchObject({
      joinUrl: 'https://meet.example.test/private',
      accessCode: 'private-code',
    });
  });

  it('whitelists every nested field despite internal or future properties', () => {
    const forbidden = {
      teacherSubjectAllocationId: 'allocation',
      targets: ['raw-target'],
      recipientUserId: 'recipient',
      guardianId: 'guardian',
      studentRecipientCount: 123,
      guardianRecipientContextCount: 456,
      bucket: 'private-bucket',
      objectKey: 'private-key',
      approvalId: 'approval',
      approvalStatus: 'review',
      capturedByUserId: 'author',
      identityFingerprint: 'fingerprint',
      requestFingerprint: 'request',
      capabilities: { manage: true },
      isRead: true,
      readAt: 'yesterday',
      viewedAt: 'today',
      openedAt: 'today',
      downloadedAt: 'today',
      acknowledgedAt: 'today',
      signedUrl: 'https://private.example.test',
    };
    const original = studentContentFixture('ONLINE_SESSION');
    const row = {
      ...original,
      ...forbidden,
      assets: original.assets.map((asset) => ({ ...asset, ...forbidden })),
      links: original.links.map((link) => ({ ...link, ...forbidden })),
      tags: original.tags.map((tag) => ({ ...tag, ...forbidden })),
    };
    const serialized = JSON.stringify(Presenter.presentDetail(row));
    for (const key of Object.keys(forbidden))
      expect(serialized).not.toContain(`"${key}"`);
  });
});
