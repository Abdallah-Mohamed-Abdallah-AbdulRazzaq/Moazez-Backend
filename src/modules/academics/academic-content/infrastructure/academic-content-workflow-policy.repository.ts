import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { effectiveAcademicContentWorkflowPolicy } from '../domain/academic-content-workflow.policy';

@Injectable()
export class AcademicContentWorkflowPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPolicy(schoolId: string) {
    return this.prisma.academicContentWorkflowPolicy.findUnique({
      where: { schoolId },
      select: { preparationApprovalRequired: true },
    });
  }

  async updatePolicy(input: {
    schoolId: string;
    organizationId: string;
    actorId: string;
    preparationApprovalRequired: boolean;
  }) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const current = await tx.academicContentWorkflowPolicy.findUnique({
              where: { schoolId: input.schoolId },
              select: { id: true, preparationApprovalRequired: true },
            });
            const before = effectiveAcademicContentWorkflowPolicy(current);
            const after = {
              preparationApprovalRequired: input.preparationApprovalRequired,
            };
            if (
              before.preparationApprovalRequired ===
              after.preparationApprovalRequired
            )
              return before;

            const policy = current
              ? await tx.academicContentWorkflowPolicy.update({
                  where: { schoolId: input.schoolId },
                  data: after,
                  select: { id: true },
                })
              : await tx.academicContentWorkflowPolicy.create({
                  data: { schoolId: input.schoolId, ...after },
                  select: { id: true },
                });

            await tx.auditLog.create({
              data: {
                actorId: input.actorId,
                organizationId: input.organizationId,
                schoolId: input.schoolId,
                module: 'academic-content',
                action: 'academics.academic_content.workflow_policy.update',
                resourceType: 'academic_content_workflow_policy',
                resourceId: policy.id,
                outcome: AuditOutcome.SUCCESS,
                before: {
                  preparationApprovalRequired:
                    before.preparationApprovalRequired,
                },
                after,
              },
            });
            return after;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code) ||
          attempt === 2
        )
          throw error;
      }
    }
    throw new Error('Unreachable Academic Content workflow policy retry state');
  }
}
