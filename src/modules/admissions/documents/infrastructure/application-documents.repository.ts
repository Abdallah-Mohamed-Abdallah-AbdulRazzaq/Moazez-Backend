import { Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  AdmissionDocumentStatus,
  ApplicantAdmissionRequestDocumentStatus,
  Prisma,
} from '@prisma/client';
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

const APPLICATION_DOCUMENT_REVIEW_ARGS =
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
      application: {
        select: {
          id: true,
          schoolId: true,
          organizationId: true,
          status: true,
          deletedAt: true,
        },
      },
      applicantAdmissionRequestDocuments: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          requestId: true,
          applicantUserId: true,
          schoolId: true,
          organizationId: true,
          requiredDocumentId: true,
          applicationDocumentId: true,
          fileId: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

export type ApplicationDocumentReviewRecord =
  Prisma.ApplicationDocumentGetPayload<typeof APPLICATION_DOCUMENT_REVIEW_ARGS>;

export type LinkedApplicantDocumentReviewRecord =
  ApplicationDocumentReviewRecord['applicantAdmissionRequestDocuments'][number];

export type DeleteApplicationDocumentResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

export interface ReviewApplicantApplicationDocumentCommand {
  schoolId: string;
  applicationId: string;
  documentId: string;
  applicantDocumentId: string;
  nextApplicationDocumentStatus: AdmissionDocumentStatus;
  nextApplicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus;
  note?: string | null;
  reopenApplicationDocuments: boolean;
}

export type ReviewApplicantApplicationDocumentResult =
  | {
      status: 'reviewed';
      document: ApplicationDocumentRecord;
      applicationStatusAfter: AdmissionApplicationStatus;
    }
  | { status: 'not_found' }
  | { status: 'invalid_state' };

class ReviewDocumentNotFoundError extends Error {}
class ReviewDocumentInvalidStateError extends Error {}

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

  findApplicantBridgedApplicationDocument(params: {
    applicationId: string;
    documentId: string;
  }): Promise<ApplicationDocumentReviewRecord | null> {
    return this.scopedPrisma.applicationDocument.findFirst({
      where: {
        id: params.documentId,
        applicationId: params.applicationId,
      },
      ...APPLICATION_DOCUMENT_REVIEW_ARGS,
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

  async reviewApplicantApplicationDocument(
    params: ReviewApplicantApplicationDocumentCommand,
  ): Promise<ReviewApplicantApplicationDocumentResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
      const document = await tx.applicationDocument.findFirst({
        where: {
          id: params.documentId,
          applicationId: params.applicationId,
          schoolId: params.schoolId,
        },
        ...APPLICATION_DOCUMENT_REVIEW_ARGS,
      });

      if (!document) {
        throw new ReviewDocumentNotFoundError();
      }

      const applicantDocument =
        document.applicantAdmissionRequestDocuments.find(
          (candidate) => candidate.id === params.applicantDocumentId,
        );
      if (
        document.status !== AdmissionDocumentStatus.PENDING_REVIEW ||
        !applicantDocument ||
        applicantDocument.schoolId !== params.schoolId ||
        applicantDocument.applicationDocumentId !== params.documentId ||
        applicantDocument.status !==
          ApplicantAdmissionRequestDocumentStatus.UPLOADED
      ) {
        return { status: 'invalid_state' };
      }

      const documentUpdate = await tx.applicationDocument.updateMany({
        where: {
          id: params.documentId,
          applicationId: params.applicationId,
          schoolId: params.schoolId,
          status: AdmissionDocumentStatus.PENDING_REVIEW,
        },
        data: {
          status: params.nextApplicationDocumentStatus,
          ...(params.note !== undefined ? { notes: params.note } : {}),
        },
      });
      if (documentUpdate.count !== 1) {
        throw new ReviewDocumentInvalidStateError();
      }

      const applicantDocumentUpdate =
        await tx.applicantAdmissionRequestDocument.updateMany({
          where: {
            id: params.applicantDocumentId,
            schoolId: params.schoolId,
            applicationDocumentId: params.documentId,
            deletedAt: null,
            status: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
          },
          data: { status: params.nextApplicantDocumentStatus },
        });
      if (applicantDocumentUpdate.count !== 1) {
        throw new ReviewDocumentInvalidStateError();
      }

      let applicationStatusAfter = document.application.status;
      if (params.reopenApplicationDocuments) {
        const applicationUpdate = await tx.application.updateMany({
          where: {
            id: params.applicationId,
            schoolId: params.schoolId,
            deletedAt: null,
            status: {
              notIn: [
                AdmissionApplicationStatus.ACCEPTED,
                AdmissionApplicationStatus.WAITLISTED,
                AdmissionApplicationStatus.REJECTED,
              ],
            },
          },
          data: { status: AdmissionApplicationStatus.DOCUMENTS_PENDING },
        });
        if (applicationUpdate.count !== 1) {
          throw new ReviewDocumentInvalidStateError();
        }
        applicationStatusAfter = AdmissionApplicationStatus.DOCUMENTS_PENDING;
      }

      const updatedDocument = await tx.applicationDocument.findFirst({
        where: {
          id: params.documentId,
          applicationId: params.applicationId,
          schoolId: params.schoolId,
        },
        ...APPLICATION_DOCUMENT_RECORD_ARGS,
      });
      if (!updatedDocument) {
        throw new ReviewDocumentNotFoundError();
      }

      return {
        status: 'reviewed',
        document: updatedDocument,
        applicationStatusAfter,
      };
      });
    } catch (error) {
      if (error instanceof ReviewDocumentNotFoundError) {
        return { status: 'not_found' };
      }
      if (error instanceof ReviewDocumentInvalidStateError) {
        return { status: 'invalid_state' };
      }
      throw error;
    }
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
