import { Injectable } from '@nestjs/common';
import { Prisma, ReinforcementTaskStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';

const PARENT_TASK_PROOF_FILE_DOWNLOAD_ARGS =
  Prisma.validator<Prisma.ReinforcementSubmissionDefaultArgs>()({
    select: {
      id: true,
      proofFile: {
        select: {
          id: true,
          bucket: true,
          objectKey: true,
          originalName: true,
          visibility: true,
          deletedAt: true,
        },
      },
    },
  });

type ParentTaskProofFileDownloadRecord =
  Prisma.ReinforcementSubmissionGetPayload<
    typeof PARENT_TASK_PROOF_FILE_DOWNLOAD_ARGS
  >;

export interface ParentDownloadableTaskProofFile {
  id: string;
  bucket: string;
  objectKey: string;
  originalName: string;
  visibility: NonNullable<
    ParentTaskProofFileDownloadRecord['proofFile']
  >['visibility'];
}

@Injectable()
export class ParentFilesReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async findTaskProofFileForDownload(params: {
    child: ParentAppAccessibleChild;
    fileId: string;
  }): Promise<ParentDownloadableTaskProofFile | null> {
    const submission = await this.scopedPrisma.reinforcementSubmission.findFirst(
      {
        where: {
          proofFileId: params.fileId,
          studentId: params.child.studentId,
          enrollmentId: params.child.enrollmentId,
          assignment: {
            is: {
              studentId: params.child.studentId,
              enrollmentId: params.child.enrollmentId,
              academicYearId: params.child.academicYearId,
              ...(params.child.termId ? { termId: params.child.termId } : {}),
              status: { not: ReinforcementTaskStatus.CANCELLED },
              task: {
                is: {
                  deletedAt: null,
                  status: { not: ReinforcementTaskStatus.CANCELLED },
                },
              },
            },
          },
          proofFile: {
            is: {
              deletedAt: null,
            },
          },
        },
        ...PARENT_TASK_PROOF_FILE_DOWNLOAD_ARGS,
      },
    );

    if (!submission?.proofFile || submission.proofFile.deletedAt) {
      return null;
    }

    return {
      id: submission.proofFile.id,
      bucket: submission.proofFile.bucket,
      objectKey: submission.proofFile.objectKey,
      originalName: submission.proofFile.originalName,
      visibility: submission.proofFile.visibility,
    };
  }
}
