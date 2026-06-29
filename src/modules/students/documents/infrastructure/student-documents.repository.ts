import { Injectable } from '@nestjs/common';
import {
  AdmissionDocumentStatus,
  Prisma,
  StudentDocumentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const STUDENT_DOCUMENT_RECORD_ARGS =
  Prisma.validator<Prisma.StudentDocumentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      fileId: true,
      documentType: true,
      status: true,
      notes: true,
      sourceApplicationId: true,
      sourceApplicationDocumentId: true,
      sourceApplicantRequestDocumentId: true,
      importedAt: true,
      importedBy: true,
      sourceDocumentType: true,
      sourceReviewStatus: true,
      sourceNotes: true,
      sourceFileId: true,
      createdAt: true,
      updatedAt: true,
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          visibility: true,
        },
      },
    },
  });

export type StudentDocumentRecord = Prisma.StudentDocumentGetPayload<
  typeof STUDENT_DOCUMENT_RECORD_ARGS
>;

const APPLICATION_DOCUMENT_IMPORT_ARGS =
  Prisma.validator<Prisma.ApplicationDocumentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      applicationId: true,
      fileId: true,
      documentType: true,
      status: true,
      notes: true,
      file: {
        select: {
          id: true,
          schoolId: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          visibility: true,
          deletedAt: true,
        },
      },
      applicantAdmissionRequestDocuments: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'asc' }],
        select: { id: true },
      },
    },
  });

type ApplicationDocumentImportRecord = Prisma.ApplicationDocumentGetPayload<
  typeof APPLICATION_DOCUMENT_IMPORT_ARGS
>;

export type DeleteStudentDocumentResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

export interface ImportedApplicationDocumentRecord {
  applicationDocumentId: string;
  studentDocument: StudentDocumentRecord;
  source: {
    sourceApplicationId: string;
    sourceApplicationDocumentId: string;
    sourceApplicantRequestDocumentId: string | null;
  };
}

export interface SkippedApplicationDocumentImportRecord {
  applicationDocumentId: string;
  reason: 'already_imported';
  studentDocumentId: string;
}

export type ImportApplicationDocumentsResult =
  | {
      status: 'imported';
      imported: ImportedApplicationDocumentRecord[];
      skipped: SkippedApplicationDocumentImportRecord[];
    }
  | { status: 'student_not_found' }
  | { status: 'application_not_found' }
  | { status: 'target_not_registered' }
  | { status: 'source_documents_not_found'; missingDocumentIds: string[] }
  | { status: 'source_file_unavailable'; applicationDocumentId: string };

export interface ImportApplicationDocumentsParams {
  schoolId: string;
  actorId: string;
  studentId: string;
  applicationId: string;
  applicationDocumentIds: string[];
}

@Injectable()
export class StudentDocumentsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  listStudentDocuments(params: {
    studentId: string;
    status?: StudentDocumentRecord['status'];
  }): Promise<StudentDocumentRecord[]> {
    return this.scopedPrisma.studentDocument.findMany({
      where: {
        studentId: params.studentId,
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      ...STUDENT_DOCUMENT_RECORD_ARGS,
    });
  }

  findStudentDocumentById(
    documentId: string,
  ): Promise<StudentDocumentRecord | null> {
    return this.scopedPrisma.studentDocument.findFirst({
      where: { id: documentId },
      ...STUDENT_DOCUMENT_RECORD_ARGS,
    });
  }

  findStudentDocumentByType(params: {
    studentId: string;
    documentType: string;
  }): Promise<StudentDocumentRecord | null> {
    return this.scopedPrisma.studentDocument.findFirst({
      where: {
        studentId: params.studentId,
        documentType: params.documentType,
      },
      orderBy: [{ createdAt: 'asc' }],
      ...STUDENT_DOCUMENT_RECORD_ARGS,
    });
  }

  createStudentDocument(
    data: Prisma.StudentDocumentUncheckedCreateInput,
  ): Promise<StudentDocumentRecord> {
    return this.prisma.studentDocument.create({
      data,
      ...STUDENT_DOCUMENT_RECORD_ARGS,
    });
  }

  async updateStudentDocument(
    documentId: string,
    data: Prisma.StudentDocumentUncheckedUpdateInput,
  ): Promise<StudentDocumentRecord | null> {
    const result = await this.scopedPrisma.studentDocument.updateMany({
      where: { id: documentId },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.findStudentDocumentById(documentId);
  }

  async deleteStudentDocument(
    documentId: string,
  ): Promise<DeleteStudentDocumentResult> {
    const result = await this.scopedPrisma.studentDocument.deleteMany({
      where: { id: documentId },
    });

    return result.count > 0 ? { status: 'deleted' } : { status: 'not_found' };
  }

  async importApplicationDocumentsFromApplication(
    params: ImportApplicationDocumentsParams,
  ): Promise<ImportApplicationDocumentsResult> {
    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findFirst({
        where: {
          id: params.studentId,
          schoolId: params.schoolId,
          deletedAt: null,
        },
        select: {
          id: true,
          applicationId: true,
          status: true,
        },
      });

      if (!student) {
        return { status: 'student_not_found' };
      }

      const application = await tx.application.findFirst({
        where: {
          id: params.applicationId,
          schoolId: params.schoolId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!application) {
        return { status: 'application_not_found' };
      }

      if (
        student.applicationId !== params.applicationId ||
        student.status !== StudentStatus.ACTIVE
      ) {
        return { status: 'target_not_registered' };
      }

      const sourceDocuments = await tx.applicationDocument.findMany({
        where: {
          id: { in: params.applicationDocumentIds },
          schoolId: params.schoolId,
          applicationId: params.applicationId,
        },
        ...APPLICATION_DOCUMENT_IMPORT_ARGS,
      });
      const sourceDocumentMap = new Map(
        sourceDocuments.map((document) => [document.id, document]),
      );
      const missingDocumentIds = params.applicationDocumentIds.filter(
        (documentId) => !sourceDocumentMap.has(documentId),
      );

      if (missingDocumentIds.length > 0) {
        return { status: 'source_documents_not_found', missingDocumentIds };
      }

      for (const documentId of params.applicationDocumentIds) {
        const sourceDocument = sourceDocumentMap.get(documentId);
        if (!sourceDocument || !isImportableFile(sourceDocument, params.schoolId)) {
          return {
            status: 'source_file_unavailable',
            applicationDocumentId: documentId,
          };
        }
      }

      const existingImports = await tx.studentDocument.findMany({
        where: {
          schoolId: params.schoolId,
          studentId: params.studentId,
          sourceApplicationDocumentId: { in: params.applicationDocumentIds },
        },
        ...STUDENT_DOCUMENT_RECORD_ARGS,
      });
      const existingImportMap = new Map(
        existingImports.map((document) => [
          document.sourceApplicationDocumentId,
          document,
        ]),
      );
      const imported: ImportedApplicationDocumentRecord[] = [];
      const skipped: SkippedApplicationDocumentImportRecord[] = [];
      const now = new Date();

      for (const documentId of params.applicationDocumentIds) {
        const existingImport = existingImportMap.get(documentId);
        if (existingImport) {
          skipped.push({
            applicationDocumentId: documentId,
            reason: 'already_imported',
            studentDocumentId: existingImport.id,
          });
          continue;
        }

        const sourceDocument = sourceDocumentMap.get(documentId);
        if (!sourceDocument) {
          return {
            status: 'source_documents_not_found',
            missingDocumentIds: [documentId],
          };
        }

        const sourceApplicantRequestDocumentId =
          sourceDocument.applicantAdmissionRequestDocuments[0]?.id ?? null;
        const studentDocument = await tx.studentDocument.upsert({
          where: {
            studentDocumentSourceImport: {
              schoolId: params.schoolId,
              studentId: params.studentId,
              sourceApplicationDocumentId: sourceDocument.id,
            },
          },
          create: {
            schoolId: params.schoolId,
            studentId: params.studentId,
            fileId: sourceDocument.fileId,
            documentType: sourceDocument.documentType,
            status: mapImportedStudentDocumentStatus(sourceDocument.status),
            notes: normalizeOptionalText(sourceDocument.notes),
            sourceApplicationId: params.applicationId,
            sourceApplicationDocumentId: sourceDocument.id,
            sourceApplicantRequestDocumentId,
            importedAt: now,
            importedBy: params.actorId,
            sourceDocumentType: sourceDocument.documentType,
            sourceReviewStatus: sourceDocument.status.toLowerCase(),
            sourceNotes: normalizeOptionalText(sourceDocument.notes),
            sourceFileId: sourceDocument.fileId,
          },
          update: {},
          ...STUDENT_DOCUMENT_RECORD_ARGS,
        });

        if (
          studentDocument.importedAt?.getTime() === now.getTime() &&
          studentDocument.importedBy === params.actorId
        ) {
          imported.push({
            applicationDocumentId: sourceDocument.id,
            studentDocument,
            source: {
              sourceApplicationId: params.applicationId,
              sourceApplicationDocumentId: sourceDocument.id,
              sourceApplicantRequestDocumentId,
            },
          });
        } else {
          skipped.push({
            applicationDocumentId: sourceDocument.id,
            reason: 'already_imported',
            studentDocumentId: studentDocument.id,
          });
        }
      }

      return { status: 'imported', imported, skipped };
    });
  }
}

function isImportableFile(
  document: ApplicationDocumentImportRecord,
  schoolId: string,
): boolean {
  return document.file.schoolId === schoolId && document.file.deletedAt === null;
}

function mapImportedStudentDocumentStatus(
  status: AdmissionDocumentStatus,
): StudentDocumentStatus {
  return status === AdmissionDocumentStatus.COMPLETE
    ? StudentDocumentStatus.COMPLETE
    : StudentDocumentStatus.MISSING;
}

function normalizeOptionalText(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
