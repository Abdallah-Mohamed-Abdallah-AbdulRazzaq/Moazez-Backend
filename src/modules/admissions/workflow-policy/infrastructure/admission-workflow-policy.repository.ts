import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ADMISSION_WORKFLOW_POLICY_RECORD_ARGS =
  Prisma.validator<Prisma.AdmissionWorkflowPolicyDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      organizationId: true,
      requiresPlacementTest: true,
      requiresInterview: true,
      allowDirectAcceptance: true,
      updatedAt: true,
    },
  });

export type AdmissionWorkflowPolicyRecord =
  Prisma.AdmissionWorkflowPolicyGetPayload<
    typeof ADMISSION_WORKFLOW_POLICY_RECORD_ARGS
  >;

@Injectable()
export class AdmissionWorkflowPolicyRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  findBySchoolId(
    schoolId: string,
  ): Promise<AdmissionWorkflowPolicyRecord | null> {
    return this.scopedPrisma.admissionWorkflowPolicy.findFirst({
      where: { schoolId },
      ...ADMISSION_WORKFLOW_POLICY_RECORD_ARGS,
    });
  }

  createPolicy(data: {
    schoolId: string;
    organizationId: string;
    requiresPlacementTest: boolean;
    requiresInterview: boolean;
    allowDirectAcceptance: boolean;
  }): Promise<AdmissionWorkflowPolicyRecord> {
    return this.prisma.admissionWorkflowPolicy.create({
      data,
      ...ADMISSION_WORKFLOW_POLICY_RECORD_ARGS,
    });
  }

  async updatePolicy(params: {
    id: string;
    schoolId: string;
    data: Partial<{
      requiresPlacementTest: boolean;
      requiresInterview: boolean;
      allowDirectAcceptance: boolean;
    }>;
  }): Promise<AdmissionWorkflowPolicyRecord | null> {
    const result = await this.scopedPrisma.admissionWorkflowPolicy.updateMany({
      where: {
        id: params.id,
        schoolId: params.schoolId,
      },
      data: params.data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.findBySchoolId(params.schoolId);
  }
}
