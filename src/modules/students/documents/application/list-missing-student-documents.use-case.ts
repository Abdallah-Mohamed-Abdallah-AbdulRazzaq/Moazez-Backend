import { Injectable } from '@nestjs/common';
import { StudentDocumentStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireStudentsScope } from '../../students/domain/students-scope';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { StudentDocumentResponseDto } from '../dto/student-document.dto';
import { StudentDocumentsRepository } from '../infrastructure/student-documents.repository';
import { presentStudentDocument } from '../presenters/student-document.presenter';

@Injectable()
export class ListMissingStudentDocumentsUseCase {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly studentDocumentsRepository: StudentDocumentsRepository,
  ) {}

  async execute(studentId: string): Promise<StudentDocumentResponseDto[]> {
    requireStudentsScope();

    const student = await this.studentsRepository.findStudentById(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const documents =
      await this.studentDocumentsRepository.listStudentDocuments({
        studentId,
        status: StudentDocumentStatus.MISSING,
      });

    return documents.map((document) => presentStudentDocument(document));
  }
}
