import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const APPLICATION_DOCUMENT_RECORD_ARGS =
  Prisma.validator<Prisma.ApplicationDocumentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      applicationId: true,
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

export type ApplicationDocumentRecord = Prisma.ApplicationDocumentGetPayload<
  typeof APPLICATION_DOCUMENT_RECORD_ARGS
>;

export type DeleteApplicationDocumentResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

@Injectable()
export class ApplicationDocumentsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  listApplicationDocuments(
    applicationId: string,
  ): Promise<ApplicationDocumentRecord[]> {
    return this.scopedPrisma.applicationDocument.findMany({
      where: { applicationId },
      orderBy: [{ createdAt: 'asc' }],
      ...APPLICATION_DOCUMENT_RECORD_ARGS,
    });
  }

  findApplicationDocumentById(
    documentId: string,
  ): Promise<ApplicationDocumentRecord | null> {
    return this.scopedPrisma.applicationDocument.findFirst({
      where: { id: documentId },
      ...APPLICATION_DOCUMENT_RECORD_ARGS,
    });
  }

  findApplicationDocumentByType(params: {
    applicationId: string;
    documentType: string;
  }): Promise<ApplicationDocumentRecord | null> {
    return this.scopedPrisma.applicationDocument.findFirst({
      where: {
        applicationId: params.applicationId,
        documentType: params.documentType,
      },
      orderBy: [{ createdAt: 'asc' }],
      ...APPLICATION_DOCUMENT_RECORD_ARGS,
    });
  }

  createApplicationDocument(
    data: Prisma.ApplicationDocumentUncheckedCreateInput,
  ): Promise<ApplicationDocumentRecord> {
    return this.prisma.applicationDocument.create({
      data,
      ...APPLICATION_DOCUMENT_RECORD_ARGS,
    });
  }

  async updateApplicationDocument(
    documentId: string,
    data: Prisma.ApplicationDocumentUncheckedUpdateInput,
  ): Promise<ApplicationDocumentRecord | null> {
    const result = await this.scopedPrisma.applicationDocument.updateMany({
      where: { id: documentId },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.findApplicationDocumentById(documentId);
  }

  async deleteApplicationDocument(params: {
    applicationId: string;
    documentId: string;
  }): Promise<DeleteApplicationDocumentResult> {
    const result = await this.scopedPrisma.applicationDocument.deleteMany({
      where: {
        id: params.documentId,
        applicationId: params.applicationId,
      },
    });

    return result.count > 0 ? { status: 'deleted' } : { status: 'not_found' };
  }
}
