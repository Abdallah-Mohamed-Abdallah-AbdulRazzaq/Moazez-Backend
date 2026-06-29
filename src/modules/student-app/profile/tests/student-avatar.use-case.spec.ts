import { FileVisibility, UserStatus, UserType } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { RegisterFileMetadataUseCase } from '../../../files/uploads/application/register-file-metadata.use-case';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { UploadedMultipartFile } from '../../../files/uploads/domain/uploaded-file';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import { DeleteStudentAvatarUseCase } from '../application/delete-student-avatar.use-case';
import { UploadStudentAvatarUseCase } from '../application/upload-student-avatar.use-case';
import { STUDENT_AVATAR_MAX_SIZE_BYTES } from '../domain/student-avatar.constraints';
import { StudentAvatarRepository } from '../infrastructure/student-avatar.repository';
import {
  StudentProfileReadAdapter,
  type StudentProfileEnrollmentRecord,
  type StudentProfileIdentityRecord,
} from '../infrastructure/student-profile-read.adapter';

describe('Student avatar use cases', () => {
  it('uploads a first avatar and returns the safe profile contract', async () => {
    const deps = createUseCases();
    deps.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
      currentStudentWithEnrollmentFixture(),
    );
    deps.avatarRepository.findStudentAvatarState.mockResolvedValue({
      id: 'student-1',
      avatarFileId: null,
      avatarFile: null,
    });
    deps.storageService.saveObject.mockResolvedValue({
      bucket: 'private-bucket',
      etag: 'etag-1',
    });
    deps.registerFileMetadataUseCase.execute.mockResolvedValue({
      id: 'avatar-file-1',
      originalName: 'avatar.png',
      mimeType: 'image/png',
      sizeBytes: '1024',
      visibility: FileVisibility.PRIVATE,
      createdAt: new Date('2026-06-29T13:00:00.000Z').toISOString(),
    });
    deps.avatarRepository.setStudentAvatarFile.mockResolvedValue({
      id: 'student-1',
      avatarFileId: 'avatar-file-1',
      avatarFile: avatarFileFixture('avatar-file-1'),
    });
    mockProfileResponse(deps.readAdapter, avatarFileFixture('avatar-file-1'));

    const result = await deps.uploadUseCase.execute(imageFile());

    expect(deps.avatarRepository.setStudentAvatarFile).toHaveBeenCalledWith({
      context: contextFixture(),
      avatarFileId: 'avatar-file-1',
    });
    expect(deps.authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'student-user-1',
        module: 'student_app',
        action: 'student.profile.avatar.upload',
        resourceType: 'student_profile_avatar',
        resourceId: 'student-1',
        after: expect.objectContaining({
          studentId: 'student-1',
          fileId: 'avatar-file-1',
          previousFileId: null,
          mimeType: 'image/png',
          sizeBytes: 1024,
          source: 'student_app',
        }),
      }),
    );
    expect(result.student).not.toHaveProperty('userId');
    expect(result.student.avatarUrl).toBe(
      '/api/v1/files/avatar-file-1/download',
    );
    expect(result.avatar).toEqual({
      fileId: 'avatar-file-1',
      url: '/api/v1/files/avatar-file-1/download',
      mimeType: 'image/png',
      sizeBytes: 1024,
    });
    expect(JSON.stringify(result)).not.toContain('bucket');
    expect(JSON.stringify(result)).not.toContain('objectKey');
  });

  it('replaces an existing avatar and audits the previous file id', async () => {
    const deps = createUseCases();
    deps.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
      currentStudentWithEnrollmentFixture(),
    );
    deps.avatarRepository.findStudentAvatarState.mockResolvedValue({
      id: 'student-1',
      avatarFileId: 'old-avatar-file',
      avatarFile: avatarFileFixture('old-avatar-file'),
    });
    deps.storageService.saveObject.mockResolvedValue({
      bucket: 'private-bucket',
      etag: 'etag-1',
    });
    deps.registerFileMetadataUseCase.execute.mockResolvedValue({
      id: 'new-avatar-file',
      originalName: 'avatar.webp',
      mimeType: 'image/webp',
      sizeBytes: '512',
      visibility: FileVisibility.PRIVATE,
      createdAt: new Date('2026-06-29T13:00:00.000Z').toISOString(),
    });
    deps.avatarRepository.setStudentAvatarFile.mockResolvedValue({
      id: 'student-1',
      avatarFileId: 'new-avatar-file',
      avatarFile: avatarFileFixture('new-avatar-file', 'image/webp', 512),
    });
    mockProfileResponse(
      deps.readAdapter,
      avatarFileFixture('new-avatar-file', 'image/webp', 512),
    );

    await deps.uploadUseCase.execute(
      imageFile({ mimetype: 'image/webp', originalname: 'avatar.webp' }),
    );

    expect(deps.authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'student.profile.avatar.replace',
        after: expect.objectContaining({
          fileId: 'new-avatar-file',
          previousFileId: 'old-avatar-file',
          mimeType: 'image/webp',
        }),
      }),
    );
  });

  it('rejects invalid MIME types before storage writes', async () => {
    const deps = createUseCases();
    deps.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
      currentStudentWithEnrollmentFixture(),
    );
    deps.avatarRepository.findStudentAvatarState.mockResolvedValue({
      id: 'student-1',
      avatarFileId: null,
      avatarFile: null,
    });

    await expect(
      deps.uploadUseCase.execute(imageFile({ mimetype: 'application/pdf' })),
    ).rejects.toMatchObject({ code: 'files.upload.mime_not_allowed' });

    expect(deps.storageService.saveObject).not.toHaveBeenCalled();
    expect(deps.avatarRepository.setStudentAvatarFile).not.toHaveBeenCalled();
  });

  it('rejects oversized avatar images before storage writes', async () => {
    const deps = createUseCases();
    deps.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
      currentStudentWithEnrollmentFixture(),
    );
    deps.avatarRepository.findStudentAvatarState.mockResolvedValue({
      id: 'student-1',
      avatarFileId: null,
      avatarFile: null,
    });

    await expect(
      deps.uploadUseCase.execute(
        imageFile({
          buffer: Buffer.alloc(STUDENT_AVATAR_MAX_SIZE_BYTES + 1, 65),
        }),
      ),
    ).rejects.toMatchObject({ code: 'files.upload.size_exceeded' });

    expect(deps.storageService.saveObject).not.toHaveBeenCalled();
    expect(deps.avatarRepository.setStudentAvatarFile).not.toHaveBeenCalled();
  });

  it('clears an avatar without deleting the underlying file', async () => {
    const deps = createUseCases();
    deps.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
      currentStudentWithEnrollmentFixture(),
    );
    deps.avatarRepository.findStudentAvatarState.mockResolvedValue({
      id: 'student-1',
      avatarFileId: 'avatar-file-1',
      avatarFile: avatarFileFixture('avatar-file-1'),
    });
    deps.avatarRepository.clearStudentAvatarFile.mockResolvedValue({
      id: 'student-1',
      avatarFileId: null,
      avatarFile: null,
    });
    mockProfileResponse(deps.readAdapter, null);

    const result = await deps.deleteUseCase.execute();

    expect(deps.avatarRepository.clearStudentAvatarFile).toHaveBeenCalledWith(
      contextFixture(),
    );
    expect(deps.storageService.deleteObject).not.toHaveBeenCalled();
    expect(deps.authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'student.profile.avatar.delete',
        before: expect.objectContaining({
          previousFileId: 'avatar-file-1',
        }),
        after: expect.objectContaining({
          fileId: null,
          previousFileId: 'avatar-file-1',
        }),
      }),
    );
    expect(result.avatar).toBeNull();
    expect(result.student.avatarUrl).toBeNull();
  });

  it('cleans up a newly registered file when linking it to the student fails', async () => {
    const deps = createUseCases();
    deps.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
      currentStudentWithEnrollmentFixture(),
    );
    deps.avatarRepository.findStudentAvatarState.mockResolvedValue({
      id: 'student-1',
      avatarFileId: null,
      avatarFile: null,
    });
    deps.storageService.saveObject.mockResolvedValue({
      bucket: 'private-bucket',
      etag: 'etag-1',
    });
    deps.registerFileMetadataUseCase.execute.mockResolvedValue({
      id: 'avatar-file-1',
      originalName: 'avatar.png',
      mimeType: 'image/png',
      sizeBytes: '1024',
      visibility: FileVisibility.PRIVATE,
      createdAt: new Date('2026-06-29T13:00:00.000Z').toISOString(),
    });
    deps.avatarRepository.setStudentAvatarFile.mockResolvedValue(null);

    await expect(deps.uploadUseCase.execute(imageFile())).rejects.toMatchObject(
      { code: 'student_app.student.not_found' },
    );

    expect(deps.storageService.deleteObject).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'private-bucket' }),
    );
    expect(deps.filesRepository.softDeleteFile).toHaveBeenCalledWith(
      'avatar-file-1',
    );
  });
});

function createUseCases(): {
  uploadUseCase: UploadStudentAvatarUseCase;
  deleteUseCase: DeleteStudentAvatarUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  avatarRepository: jest.Mocked<StudentAvatarRepository>;
  readAdapter: jest.Mocked<StudentProfileReadAdapter>;
  storageService: jest.Mocked<StorageService>;
  registerFileMetadataUseCase: jest.Mocked<RegisterFileMetadataUseCase>;
  filesRepository: jest.Mocked<FilesRepository>;
  authRepository: jest.Mocked<AuthRepository>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const avatarRepository = {
    findStudentAvatarState: jest.fn(),
    setStudentAvatarFile: jest.fn(),
    clearStudentAvatarFile: jest.fn(),
  } as unknown as jest.Mocked<StudentAvatarRepository>;
  const readAdapter = {
    findStudentProfile: jest.fn(),
    findSchoolDisplay: jest.fn(),
    findCurrentEnrollment: jest.fn(),
    sumTotalXpForCurrentStudent: jest.fn(),
  } as unknown as jest.Mocked<StudentProfileReadAdapter>;
  const storageService = {
    saveObject: jest.fn(),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<StorageService>;
  const registerFileMetadataUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<RegisterFileMetadataUseCase>;
  const filesRepository = {
    softDeleteFile: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<FilesRepository>;
  const authRepository = {
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuthRepository>;

  return {
    uploadUseCase: new UploadStudentAvatarUseCase(
      accessService,
      avatarRepository,
      readAdapter,
      storageService,
      registerFileMetadataUseCase,
      filesRepository,
      authRepository,
    ),
    deleteUseCase: new DeleteStudentAvatarUseCase(
      accessService,
      avatarRepository,
      readAdapter,
      authRepository,
    ),
    accessService,
    avatarRepository,
    readAdapter,
    storageService,
    registerFileMetadataUseCase,
    filesRepository,
    authRepository,
  };
}

function mockProfileResponse(
  readAdapter: jest.Mocked<StudentProfileReadAdapter>,
  avatarFile: StudentProfileIdentityRecord['avatarFile'],
): void {
  readAdapter.findStudentProfile.mockResolvedValue(
    studentProfileFixture(avatarFile),
  );
  readAdapter.findSchoolDisplay.mockResolvedValue({
    name: 'Moazez Demo School',
    logoUrl: null,
  });
  readAdapter.findCurrentEnrollment.mockResolvedValue(enrollmentFixture());
  readAdapter.sumTotalXpForCurrentStudent.mockResolvedValue(0);
}

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function currentStudentWithEnrollmentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: contextFixture(),
    student: {} as StudentAppCurrentStudentWithEnrollment['student'],
    enrollment: {} as StudentAppCurrentStudentWithEnrollment['enrollment'],
  };
}

function studentProfileFixture(
  avatarFile: StudentProfileIdentityRecord['avatarFile'],
): StudentProfileIdentityRecord {
  return {
    id: 'student-1',
    firstName: 'Sara',
    lastName: 'Student',
    status: 'ACTIVE',
    avatarFile,
    user: {
      email: 'sara.student@example.test',
      phone: null,
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  } as StudentProfileIdentityRecord;
}

function avatarFileFixture(
  id: string,
  mimeType = 'image/png',
  sizeBytes = 1024,
): NonNullable<StudentProfileIdentityRecord['avatarFile']> {
  return {
    id,
    mimeType,
    sizeBytes: BigInt(sizeBytes),
    deletedAt: null,
  };
}

function enrollmentFixture(): StudentProfileEnrollmentRecord {
  return {
    id: 'enrollment-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    classroom: {
      id: 'classroom-1',
      nameAr: 'Grade 4A AR',
      nameEn: 'Grade 4A',
      section: {
        id: 'section-1',
        nameAr: 'Section A AR',
        nameEn: 'Section A',
        grade: {
          id: 'grade-1',
          nameAr: 'Grade 4 AR',
          nameEn: 'Grade 4',
          stage: {
            id: 'stage-1',
            nameAr: 'Primary AR',
            nameEn: 'Primary',
          },
        },
      },
    },
  };
}

function imageFile(overrides?: Partial<UploadedMultipartFile>): UploadedMultipartFile {
  const buffer = overrides?.buffer ?? Buffer.alloc(1024, 65);

  return {
    originalname: overrides?.originalname ?? 'avatar.png',
    mimetype: overrides?.mimetype ?? 'image/png',
    size: overrides?.size ?? buffer.byteLength,
    buffer,
  };
}
