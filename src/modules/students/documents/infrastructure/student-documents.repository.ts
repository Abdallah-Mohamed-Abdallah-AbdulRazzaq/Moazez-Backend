import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

export type DeleteStudentDocumentResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

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
}
