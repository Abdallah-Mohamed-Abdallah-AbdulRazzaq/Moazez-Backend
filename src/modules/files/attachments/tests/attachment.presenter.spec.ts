import { FileVisibility } from '@prisma/client';
import { presentAttachment } from '../presenters/attachment.presenter';

describe('presentAttachment', () => {
  it('returns listed attachment metadata with embedded file summary', () => {
    const presented = presentAttachment({
      id: 'attachment-1',
      fileId: 'file-1',
      schoolId: 'school-1',
      resourceType: 'admissions.application',
      resourceId: 'application-1',
      createdById: 'user-1',
      createdAt: new Date('2026-05-06T08:15:00.000Z'),
      file: {
        id: 'file-1',
        originalName: 'application.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(4096),
        visibility: FileVisibility.PRIVATE,
      },
    });

    expect(presented).toEqual({
      id: 'attachment-1',
      fileId: 'file-1',
      resourceType: 'admissions.application',
      resourceId: 'application-1',
      createdAt: '2026-05-06T08:15:00.000Z',
      file: {
        id: 'file-1',
        originalName: 'application.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '4096',
        visibility: FileVisibility.PRIVATE,
      },
    });
  });
});
