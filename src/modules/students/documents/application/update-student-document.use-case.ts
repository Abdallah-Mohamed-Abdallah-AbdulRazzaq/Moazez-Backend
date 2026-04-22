import { Injectable } from '@nestjs/common';
import { NotFoundDomainException, ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { FilesNotFoundException } from '../../../files/uploads/domain/file-upload.exceptions';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  mapStudentDocumentStatusFromApi,
} from '../domain/student-document-status.enums';
import {
  StudentDocumentResponseDto,
  UpdateStudentDocumentDto,
} from '../dto/student-document.dto';
import { StudentDocumentsRepository } from '../infrastructure/student-documents.repository';
import { presentStudentDocument } from '../presenters/student-document.presenter';

function normalizeDocumentType(type?: string): string | undefined {
  if (type === undefined) {
    return undefined;
  }

  const normalized = type.trim();
  if (normalized.length === 0) {
    throw new ValidationDomainException('Document type is required', {
      field: 'type',
    });
  }

  return normalized;
}

function normalizeOptionalText(value?: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

@Injectable()
export class UpdateStudentDocumentUseCase {
  constructor(
    private readonly studentDocumentsRepository: StudentDocumentsRepository,
    private readonly filesRepository: FilesRepository,
  ) {}

  async execute(
    documentId: string,
    command: UpdateStudentDocumentDto,
  ): Promise<StudentDocumentResponseDto> {
    requireStudentsScope();

    const existing =
      await this.studentDocumentsRepository.findStudentDocumentById(documentId);
    if (!existing) {
      throw new NotFoundDomainException('Student document not found', {
        documentId,
      });
    }

    if (command.fileId) {
      const file = await this.filesRepository.findScopedFileById(command.fileId);
      if (!file) {
        throw new FilesNotFoundException({ fileId: command.fileId });
      }
    }

    const documentType = normalizeDocumentType(command.type);
    const notes = normalizeOptionalText(command.notes);

    const document = await this.studentDocumentsRepository.updateStudentDocument(
      documentId,
      {
        ...(command.fileId ? { fileId: command.fileId } : {}),
        ...(documentType ? { documentType } : {}),
        ...(command.status
          ? { status: mapStudentDocumentStatusFromApi(command.status) }
          : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    );

    if (!document) {
      throw new NotFoundDomainException('Student document not found', {
        documentId,
      });
    }

    return presentStudentDocument(document);
  }
}
