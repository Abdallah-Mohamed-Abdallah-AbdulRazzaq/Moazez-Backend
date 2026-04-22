import { FileVisibility, StudentDocumentStatus } from '@prisma/client';
import { presentStudentDocument } from '../presenters/student-document.presenter';

describe('student document presenter', () => {
  it('returns contract-backed metadata without exposing storage internals', () => {
    expect(
      presentStudentDocument({
        id: 'document-1',
        schoolId: 'school-1',
        studentId: 'student-1',
        fileId: 'file-1',
        documentType: 'Birth Certificate',
        status: StudentDocumentStatus.COMPLETE,
        notes: null,
        createdAt: new Date('2026-04-22T10:00:00.000Z'),
        updatedAt: new Date('2026-04-22T10:00:00.000Z'),
        file: {
          id: 'file-1',
          originalName: 'birth-certificate.pdf',
          mimeType: 'application/pdf',
          sizeBytes: BigInt(2048),
          visibility: FileVisibility.PRIVATE,
        },
      }),
    ).toEqual({
      id: 'document-1',
      studentId: 'student-1',
      fileId: 'file-1',
      type: 'Birth Certificate',
      name: 'birth-certificate.pdf',
      status: 'complete',
      uploadedDate: '2026-04-22T10:00:00.000Z',
      url: '/api/v1/files/file-1/download',
      fileType: 'pdf',
      notes: null,
    });
  });
});
