import { FileVisibility, ImportJobStatus } from '@prisma/client';
import {
  presentImportJobReport,
  presentImportJobStatus,
} from '../presenters/import-job.presenter';

describe('import job presenters', () => {
  it('returns bounded status metadata for the job endpoint', () => {
    const presented = presentImportJobStatus({
      id: 'job-1',
      schoolId: 'school-1',
      uploadedFileId: 'file-1',
      type: 'students_basic',
      status: ImportJobStatus.PENDING,
      reportJson: {
        status: ImportJobStatus.PENDING,
      },
      createdById: 'user-1',
      createdAt: new Date('2026-05-06T08:30:00.000Z'),
      updatedAt: new Date('2026-05-06T08:30:00.000Z'),
      uploadedFile: {
        id: 'file-1',
        bucket: 'moazez-private',
        objectKey: 'schools/school-1/files/import.csv',
        originalName: 'students.csv',
        mimeType: 'text/csv',
        sizeBytes: BigInt(128),
        visibility: FileVisibility.PRIVATE,
      },
    });

    expect(presented).toEqual({
      id: 'job-1',
      uploadedFileId: 'file-1',
      type: 'students_basic',
      status: ImportJobStatus.PENDING,
      reportAvailable: true,
      createdAt: '2026-05-06T08:30:00.000Z',
      updatedAt: '2026-05-06T08:30:00.000Z',
    });
  });

  it('returns a presenter-shaped validation report', () => {
    const presented = presentImportJobReport({
      id: 'job-1',
      schoolId: 'school-1',
      uploadedFileId: 'file-1',
      type: 'students_basic',
      status: ImportJobStatus.COMPLETED,
      reportJson: {
        status: ImportJobStatus.COMPLETED,
        summary: {
          rowCount: null,
          warningCount: 1,
          errorCount: 0,
        },
        file: {
          uploadedFileId: 'file-1',
          originalName: 'students.csv',
          mimeType: 'text/csv',
          sizeBytes: '128',
        },
        rowCount: null,
        warnings: ['Stub validation only. No domain rows were created.'],
        errors: [],
        updatedAt: '2026-05-06T08:35:00.000Z',
      },
      createdById: 'user-1',
      createdAt: new Date('2026-05-06T08:30:00.000Z'),
      updatedAt: new Date('2026-05-06T08:35:00.000Z'),
      uploadedFile: {
        id: 'file-1',
        bucket: 'moazez-private',
        objectKey: 'schools/school-1/files/import.csv',
        originalName: 'students.csv',
        mimeType: 'text/csv',
        sizeBytes: BigInt(128),
        visibility: FileVisibility.PRIVATE,
      },
    });

    expect(presented).toEqual({
      status: ImportJobStatus.COMPLETED,
      summary: {
        rowCount: null,
        warningCount: 1,
        errorCount: 0,
      },
      file: {
        uploadedFileId: 'file-1',
        originalName: 'students.csv',
        mimeType: 'text/csv',
        sizeBytes: '128',
      },
      rowCount: null,
      warnings: ['Stub validation only. No domain rows were created.'],
      errors: [],
      updatedAt: '2026-05-06T08:35:00.000Z',
    });
  });
});
