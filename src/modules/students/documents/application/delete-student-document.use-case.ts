import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireStudentsScope } from '../../students/domain/students-scope';
import { DeleteStudentDocumentResponseDto } from '../dto/student-document.dto';
import { StudentDocumentsRepository } from '../infrastructure/student-documents.repository';

@Injectable()
export class DeleteStudentDocumentUseCase {
  constructor(
    private readonly studentDocumentsRepository: StudentDocumentsRepository,
  ) {}

  async execute(
    documentId: string,
  ): Promise<DeleteStudentDocumentResponseDto> {
    requireStudentsScope();

    const result =
      await this.studentDocumentsRepository.deleteStudentDocument(documentId);
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Student document not found', {
        documentId,
      });
    }

    return { ok: true };
  }
}
