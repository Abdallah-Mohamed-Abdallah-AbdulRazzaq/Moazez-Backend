import {
  ImportStudentDocumentsFromApplicationResponseDto,
} from '../dto/student-document.dto';
import {
  ImportedApplicationDocumentRecord,
  SkippedApplicationDocumentImportRecord,
} from '../infrastructure/student-documents.repository';
import { presentStudentDocument } from './student-document.presenter';

export function presentStudentDocumentImport(params: {
  studentId: string;
  applicationId: string;
  imported: ImportedApplicationDocumentRecord[];
  skipped: SkippedApplicationDocumentImportRecord[];
}): ImportStudentDocumentsFromApplicationResponseDto {
  return {
    studentId: params.studentId,
    applicationId: params.applicationId,
    imported: params.imported.map((item) => ({
      applicationDocumentId: item.applicationDocumentId,
      studentDocument: presentStudentDocument(item.studentDocument),
      source: item.source,
    })),
    skipped: params.skipped,
    warnings: [],
  };
}
