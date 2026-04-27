import {
  AttendanceExcuseStatus,
  AttendanceExcuseType,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { FilesNotFoundException } from '../../../files/uploads/domain/file-upload.exceptions';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { DeleteAttendanceExcuseAttachmentUseCase } from '../application/delete-attendance-excuse-attachment.use-case';
import { LinkAttendanceExcuseAttachmentsUseCase } from '../application/link-attendance-excuse-attachments.use-case';
import { ListAttendanceExcuseAttachmentsUseCase } from '../application/list-attendance-excuse-attachments.use-case';
import {
  AttendanceExcuseAttachmentRecord,
  AttendanceExcusesRepository,
} from '../infrastructure/attendance-excuses.repository';

describe('Attendance excuse attachment use cases', () => {
  async function withAttendanceScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['attendance.excuses.view', 'attendance.excuses.manage'],
      });

      return fn();
    });
  }

  function activeTerm() {
    return {
      id: 'term-1',
      academicYearId: 'year-1',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      isActive: true,
    };
  }

  function excuseRecord() {
    return {
      id: 'excuse-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      type: AttendanceExcuseType.ABSENCE,
      status: AttendanceExcuseStatus.PENDING,
      dateFrom: new Date('2026-09-15T00:00:00.000Z'),
      dateTo: new Date('2026-09-15T00:00:00.000Z'),
      selectedPeriodKeys: [],
      lateMinutes: null,
      earlyLeaveMinutes: null,
      reasonAr: null,
      reasonEn: 'Family note',
      decisionNote: null,
      createdById: 'user-1',
      decidedById: null,
      decidedAt: null,
      createdAt: new Date('2026-09-15T08:00:00.000Z'),
      updatedAt: new Date('2026-09-15T08:00:00.000Z'),
      deletedAt: null,
      student: {
        id: 'student-1',
        firstName: 'Layla',
        lastName: 'Hassan',
        status: StudentStatus.ACTIVE,
      },
      linkedSessions: [],
    };
  }

  function attachmentRecord(
    overrides?: Partial<AttendanceExcuseAttachmentRecord>,
  ): AttendanceExcuseAttachmentRecord {
    return {
      id: overrides?.id ?? 'attachment-1',
      fileId: overrides?.fileId ?? 'file-1',
      schoolId: overrides?.schoolId ?? 'school-1',
      resourceType: overrides?.resourceType ?? 'attendance.excuse_request',
      resourceId: overrides?.resourceId ?? 'excuse-1',
      createdById: overrides?.createdById ?? 'user-1',
      createdAt:
        overrides?.createdAt ?? new Date('2026-09-15T09:00:00.000Z'),
      file: overrides?.file ?? {
        id: overrides?.fileId ?? 'file-1',
        originalName: 'medical-note.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(4096),
      },
    };
  }

  function baseRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      findById: jest.fn().mockResolvedValue(excuseRecord()),
      validateAcademicYearAndTerm: jest.fn().mockResolvedValue({
        academicYear: { id: 'year-1' },
        term: activeTerm(),
      }),
      findScopedFileIds: jest.fn().mockResolvedValue(['file-1']),
      linkFilesToExcuseRequest: jest.fn().mockResolvedValue([
        attachmentRecord(),
      ]),
      listAttachmentsForExcuseRequest: jest.fn().mockResolvedValue([
        attachmentRecord(),
      ]),
      findAttachmentForExcuseRequest: jest
        .fn()
        .mockResolvedValue(attachmentRecord()),
      deleteAttachmentForExcuseRequest: jest
        .fn()
        .mockResolvedValue({ status: 'deleted' }),
      deleteFile: jest.fn(),
      ...overrides,
    } as unknown as AttendanceExcusesRepository & { deleteFile: jest.Mock };
  }

  function baseAuthRepository(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AuthRepository;
  }

  it('links an uploaded file to a pending excuse request', async () => {
    const repository = baseRepository();
    const authRepository = baseAuthRepository();
    const useCase = new LinkAttendanceExcuseAttachmentsUseCase(
      repository,
      authRepository,
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('excuse-1', { fileIds: ['file-1'] }),
    );

    expect(repository.findScopedFileIds).toHaveBeenCalledWith(['file-1']);
    expect(repository.linkFilesToExcuseRequest).toHaveBeenCalledWith({
      excuseRequestId: 'excuse-1',
      fileIds: ['file-1'],
      schoolId: 'school-1',
      createdById: 'user-1',
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'attachment-1',
        fileId: 'file-1',
        originalName: 'medical-note.pdf',
        downloadUrl: '/api/v1/files/file-1/download',
      }),
    ]);
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attendance.excuse.attachment.add',
        resourceType: 'attendance_excuse_request',
        resourceId: 'excuse-1',
      }),
    );
  });

  it('rejects a cross-school file link as not found', async () => {
    const repository = baseRepository({
      findScopedFileIds: jest.fn().mockResolvedValue([]),
      linkFilesToExcuseRequest: jest.fn(),
    });
    const useCase = new LinkAttendanceExcuseAttachmentsUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('excuse-1', { fileIds: ['file-b'] }),
      ),
    ).rejects.toBeInstanceOf(FilesNotFoundException);
    expect(repository.linkFilesToExcuseRequest).not.toHaveBeenCalled();
  });

  it('lists safe attachment metadata', async () => {
    const repository = baseRepository();
    const useCase = new ListAttendanceExcuseAttachmentsUseCase(repository);

    const result = await withAttendanceScope(() =>
      useCase.execute('excuse-1'),
    );

    expect(result.items).toEqual([
      {
        id: 'attachment-1',
        fileId: 'file-1',
        filename: 'medical-note.pdf',
        originalName: 'medical-note.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '4096',
        createdAt: '2026-09-15T09:00:00.000Z',
        downloadUrl: '/api/v1/files/file-1/download',
      },
    ]);
  });

  it('deletes only the attachment link and leaves the file record alone', async () => {
    const repository = baseRepository();
    const authRepository = baseAuthRepository();
    const useCase = new DeleteAttendanceExcuseAttachmentUseCase(
      repository,
      authRepository,
    );

    const result = await withAttendanceScope(() =>
      useCase.execute('excuse-1', 'attachment-1'),
    );

    expect(repository.deleteAttachmentForExcuseRequest).toHaveBeenCalledWith({
      excuseRequestId: 'excuse-1',
      attachmentId: 'attachment-1',
    });
    expect(repository.deleteFile).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attendance.excuse.attachment.remove',
      }),
    );
  });

  it('rejects deleting an attachment from another request', async () => {
    const repository = baseRepository({
      findAttachmentForExcuseRequest: jest.fn().mockResolvedValue(null),
      deleteAttachmentForExcuseRequest: jest.fn(),
    });
    const useCase = new DeleteAttendanceExcuseAttachmentUseCase(
      repository,
      baseAuthRepository(),
    );

    await expect(
      withAttendanceScope(() =>
        useCase.execute('excuse-1', 'attachment-from-other-request'),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.deleteAttachmentForExcuseRequest).not.toHaveBeenCalled();
  });

  it('deduplicates repeated fileIds for stable idempotent linking', async () => {
    const repository = baseRepository();
    const useCase = new LinkAttendanceExcuseAttachmentsUseCase(
      repository,
      baseAuthRepository(),
    );

    await withAttendanceScope(() =>
      useCase.execute('excuse-1', { fileIds: ['file-1', 'file-1'] }),
    );

    expect(repository.findScopedFileIds).toHaveBeenCalledWith(['file-1']);
    expect(repository.linkFilesToExcuseRequest).toHaveBeenCalledWith(
      expect.objectContaining({ fileIds: ['file-1'] }),
    );
  });
});
