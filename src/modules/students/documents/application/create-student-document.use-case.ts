import { Injectable } from '@nestjs/common';
import { StudentDocumentStatus } from '@prisma/client';
import { NotFoundDomainException, ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { UploadedMultipartFile } from '../../../files/uploads/domain/uploaded-file';
import { FilesNotFoundException } from '../../../files/uploads/domain/file-upload.exceptions';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { UploadFileUseCase } from '../../../files/uploads/application/upload-file.use-case';
import { requireStudentsScope } from '../../students/domain/students-scope';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import {
  mapStudentDocumentStatusFromApi,
} from '../domain/student-document-status.enums';
import {
  CreateStudentDocumentDto,
  StudentDocumentResponseDto,
} from '../dto/student-document.dto';
import { StudentDocumentsRepository } from '../infrastructure/student-documents.repository';
import { presentStudentDocument } from '../presenters/student-document.presenter';

function normalizeDocumentType(type: string): string {
  const normalized = type.trim();
  if (normalized.length === 0) {
    throw new ValidationDomainException('Document type is required', {
      field: 'type',
    });
  }

  return normalized;
}

function normalizeOptionalText(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

@Injectable()
export class CreateStudentDocumentUseCase {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly studentDocumentsRepository: StudentDocumentsRepository,
    private readonly filesRepository: FilesRepository,
    private readonly uploadFileUseCase: UploadFileUseCase,
  ) {}

  async execute(
    studentId: string,
    command: CreateStudentDocumentDto,
    uploadedFile?: UploadedMultipartFile,
  ): Promise<StudentDocumentResponseDto> {
    const scope = requireStudentsScope();

    const student = await this.studentsRepository.findStudentById(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const documentType = normalizeDocumentType(command.type);
    const existing =
      await this.studentDocumentsRepository.findStudentDocumentByType({
        studentId,
        documentType,
      });

    const uploadedRecord = uploadedFile
      ? await this.uploadFileUseCase.execute(uploadedFile)
      : null;
    const fileId = uploadedRecord?.id ?? command.fileId ?? existing?.fileId ?? null;

    if (command.fileId) {
      const file = await this.filesRepository.findScopedFileById(command.fileId);
      if (!file) {
        throw new FilesNotFoundException({ fileId: command.fileId });
      }
    }

    if (!fileId) {
      throw new ValidationDomainException(
        'A student document file is required when creating a new record',
        { field: 'fileId' },
      );
    }

    const status = command.status
      ? mapStudentDocumentStatusFromApi(command.status)
      : existing?.status ?? StudentDocumentStatus.COMPLETE;
    const notes = normalizeOptionalText(command.notes);

    const document = existing
      ? await this.studentDocumentsRepository.updateStudentDocument(existing.id, {
          fileId,
          documentType,
          status,
          notes,
        })
      : await this.studentDocumentsRepository.createStudentDocument({
          schoolId: scope.schoolId,
          studentId,
          fileId,
          documentType,
          status,
          notes,
        });

    if (!document) {
      throw new NotFoundDomainException('Student document not found', {
        studentId,
        documentType,
      });
    }

    return presentStudentDocument(document);
  }
}
