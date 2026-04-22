import { FileVisibility } from '@prisma/client';
import { presentFileRecord } from '../presenters/file-record.presenter';

describe('presentFileRecord', () => {
  it('returns upload metadata without exposing storage internals', () => {
    const presented = presentFileRecord({
      id: 'file-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      uploaderId: 'user-1',
      bucket: 'private-bucket',
      objectKey: 'files/object-key',
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(5120),
      checksumSha256:
        'a3f5f5d0a3f5f5d0a3f5f5d0a3f5f5d0a3f5f5d0a3f5f5d0a3f5f5d0a3f5f5d0',
      visibility: FileVisibility.PRIVATE,
      createdAt: new Date('2026-05-06T08:00:00.000Z'),
      updatedAt: new Date('2026-05-06T08:00:00.000Z'),
      deletedAt: null,
    });

    expect(presented).toEqual({
      id: 'file-1',
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: '5120',
      visibility: FileVisibility.PRIVATE,
      createdAt: '2026-05-06T08:00:00.000Z',
    });
  });
});
