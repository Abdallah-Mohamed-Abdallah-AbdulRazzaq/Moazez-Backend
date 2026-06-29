import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  IMPORT_APPLICATION_DOCUMENT_LIMIT,
  ImportStudentDocumentsFromApplicationDto,
  ImportStudentDocumentsFromApplicationResponseDto,
} from '../dto/student-document.dto';
import { StudentDocumentsRepository } from '../infrastructure/student-documents.repository';
import { presentStudentDocumentImport } from '../presenters/student-document-import.presenter';

@Injectable()
export class ImportApplicationDocumentsUseCase {
  constructor(
    private readonly studentDocumentsRepository: StudentDocumentsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    studentId: string,
    command: ImportStudentDocumentsFromApplicationDto,
  ): Promise<ImportStudentDocumentsFromApplicationResponseDto> {
    const scope = requireStudentsScope();
    const applicationDocumentIds = normalizeApplicationDocumentIds(
      command.applicationDocumentIds,
    );

    const result =
      await this.studentDocumentsRepository.importApplicationDocumentsFromApplication(
        {
          schoolId: scope.schoolId,
          actorId: scope.actorId,
          studentId,
          applicationId: command.applicationId,
          applicationDocumentIds,
        },
      );

    switch (result.status) {
      case 'student_not_found':
      case 'application_not_found':
      case 'source_documents_not_found':
        throw new NotFoundDomainException('Import source not found', {
          studentId,
          applicationId: command.applicationId,
        });
      case 'target_not_registered':
        throw new DomainException({
          code: 'students.document.import_target_not_registered',
          message:
            'Student is not an active registration for the provided admissions application',
          httpStatus: HttpStatus.CONFLICT,
          details: { studentId, applicationId: command.applicationId },
        });
      case 'source_file_unavailable':
        throw new DomainException({
          code: 'students.document.import_file_unavailable',
          message: 'Selected admissions document file is unavailable',
          httpStatus: HttpStatus.CONFLICT,
          details: {
            applicationId: command.applicationId,
            applicationDocumentId: result.applicationDocumentId,
          },
        });
      case 'imported':
        await this.authRepository.createAuditLog({
          actorId: scope.actorId,
          userType: scope.userType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          module: 'students',
          action: 'students.document.import_from_admissions',
          resourceType: 'student_document',
          resourceId: studentId,
          outcome: AuditOutcome.SUCCESS,
          after: {
            studentId,
            applicationId: command.applicationId,
            applicationDocumentIds,
            studentDocumentIds: [
              ...result.imported.map((item) => item.studentDocument.id),
              ...result.skipped.map((item) => item.studentDocumentId),
            ],
            importedCount: result.imported.length,
            skippedCount: result.skipped.length,
            source: 'admissions_application',
          },
        });

        return presentStudentDocumentImport({
          studentId,
          applicationId: command.applicationId,
          imported: result.imported,
          skipped: result.skipped,
        });
    }
  }
}

function normalizeApplicationDocumentIds(ids: string[]): string[] {
  const normalized = ids.map((id) => id.trim()).filter(Boolean);
  const unique = Array.from(new Set(normalized));

  if (unique.length === 0) {
    throw new ValidationDomainException(
      'At least one admissions document is required',
      { field: 'applicationDocumentIds' },
    );
  }

  if (unique.length > IMPORT_APPLICATION_DOCUMENT_LIMIT) {
    throw new ValidationDomainException('Too many admissions documents selected', {
      field: 'applicationDocumentIds',
      limit: IMPORT_APPLICATION_DOCUMENT_LIMIT,
    });
  }

  return unique;
}
