import { TeacherAllocationOperationalWriteGate } from '../../teacher-allocation/application/teacher-allocation-operational-write-gate';
import { authorizeTeacherAcademicContentMutation } from './academic-content-teacher-write.authorization';
import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import {
  AcademicContentApprovalStatus,
  AcademicContentStatus,
  AcademicContentType,
  AuditOutcome,
  Prisma,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { evaluateAcademicContentReadiness } from '../domain/academic-content-readiness.policy';
import {
  effectiveAcademicContentWorkflowPolicy,
  isAcademicContentApprovalRequired,
  isAcademicContentSubmissionSource,
} from '../domain/academic-content-workflow.policy';
import { AcademicContentRevisionRepository } from './academic-content-revision.repository';

type WorkflowCommand = {
  teacherUserId?: string;
  schoolId: string;
  organizationId: string;
  actorId: string;
  contentId: string;
  now?: Date;
};

function conflict(code: string, message: string): never {
  throw new DomainException({ code, message, httpStatus: HttpStatus.CONFLICT });
}

@Injectable()
export class AcademicContentWorkflowRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: AcademicContentRevisionRepository,
    @Optional()
    private readonly teacherGate?: TeacherAllocationOperationalWriteGate,
  ) {}

  private async lockContent(
    tx: Prisma.TransactionClient,
    input: WorkflowCommand,
  ) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM academic_contents
      WHERE id = ${input.contentId}::uuid AND school_id = ${input.schoolId}::uuid
        AND deleted_at IS NULL FOR UPDATE`;
    if (!locked.length)
      throw new NotFoundDomainException('Academic content not found');
    return tx.academicContent.findFirstOrThrow({
      where: { id: input.contentId, schoolId: input.schoolId, deletedAt: null },
      select: {
        createdByUserId: true,
        status: true,
        type: true,
        audience: true,
        title: true,
        academicYearId: true,
        termId: true,
      },
    });
  }

  async submit(input: WorkflowCommand) {
    return this.prisma.$transaction(
      async (tx) => {
        const content = await this.lockContent(tx, input);
        if (input.teacherUserId)
          await authorizeTeacherAcademicContentMutation(
            tx,
            this.teacherGate,
            {
              ...input,
              id: input.contentId,
              teacherUserId: input.teacherUserId,
            },
            content.createdByUserId,
          );
        if (content.type !== AcademicContentType.TEACHER_PREPARATION)
          conflict(
            'academic_content.approval.type_unsupported',
            'Content type cannot be submitted',
          );
        if (!isAcademicContentSubmissionSource(content.status))
          conflict(
            'academic_content.approval.invalid_status',
            'Content cannot be submitted in its current status',
          );

        const policy = effectiveAcademicContentWorkflowPolicy(
          await tx.academicContentWorkflowPolicy.findUnique({
            where: { schoolId: input.schoolId },
            select: { preparationApprovalRequired: true },
          }),
        );
        if (!isAcademicContentApprovalRequired(content.type, policy))
          conflict(
            'academic_content.approval.not_required',
            'Approval is not required',
          );

        const [year, term, targets, preparationDetail] = await Promise.all([
          tx.academicYear.findFirst({
            where: {
              id: content.academicYearId,
              schoolId: input.schoolId,
              deletedAt: null,
            },
            select: { id: true },
          }),
          tx.term.findFirst({
            where: {
              id: content.termId,
              schoolId: input.schoolId,
              deletedAt: null,
            },
            select: {
              academicYearId: true,
              startDate: true,
              endDate: true,
              isActive: true,
            },
          }),
          tx.academicContentTarget.findMany({
            where: {
              schoolId: input.schoolId,
              academicContentId: input.contentId,
            },
            select: { subjectId: true },
          }),
          tx.academicContentPreparationDetail.findFirst({
            where: {
              schoolId: input.schoolId,
              academicContentId: input.contentId,
            },
            select: { id: true },
          }),
        ]);
        const readiness = evaluateAcademicContentReadiness({
          status: content.status,
          type: content.type,
          audience: content.audience,
          title: content.title,
          academicYearId: content.academicYearId,
          targets,
          hasTypeDetail: preparationDetail !== null,
          academicYearExists: year !== null,
          term,
          now: input.now ?? new Date(),
        });
        if (!readiness.canAdvance)
          throw new DomainException({
            code: 'academic_content.approval.not_ready',
            message: 'Academic content is not ready for submission',
            httpStatus: HttpStatus.CONFLICT,
            details: { blockingReasons: readiness.blockingReasons },
          });

        const revision = await this.revisions.captureInTransaction(tx, input);
        const latest = await tx.academicContentApproval.findFirst({
          where: {
            schoolId: input.schoolId,
            academicContentId: input.contentId,
          },
          orderBy: { roundNumber: 'desc' },
          select: { roundNumber: true },
        });
        const submittedAt = input.now ?? new Date();
        const approval = await tx.academicContentApproval.create({
          data: {
            schoolId: input.schoolId,
            academicContentId: input.contentId,
            revisionId: revision.id,
            roundNumber: (latest?.roundNumber ?? 0) + 1,
            status: AcademicContentApprovalStatus.PENDING,
            submittedByUserId: input.actorId,
            submittedAt,
          },
        });
        await tx.academicContent.update({
          where: {
            id_schoolId: { id: input.contentId, schoolId: input.schoolId },
          },
          data: {
            status: AcademicContentStatus.SUBMITTED,
            updatedByUserId: input.actorId,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            organizationId: input.organizationId,
            schoolId: input.schoolId,
            module: 'academic-content',
            action:
              content.status === AcademicContentStatus.DRAFT
                ? 'academics.academic_content.submit'
                : 'academics.academic_content.resubmit',
            resourceType: 'academic_content',
            resourceId: input.contentId,
            outcome: AuditOutcome.SUCCESS,
            after: {
              contentId: input.contentId,
              revisionId: revision.id,
              approvalId: approval.id,
              roundNumber: approval.roundNumber,
              fromStatus: content.status,
              toStatus: AcademicContentStatus.SUBMITTED,
            },
          },
        });
        return {
          contentId: input.contentId,
          contentStatus: AcademicContentStatus.SUBMITTED,
          approvalId: approval.id,
          approvalStatus: approval.status,
          revisionId: revision.id,
          roundNumber: approval.roundNumber,
          submittedAt: approval.submittedAt,
          decidedAt: null,
        };
      },
      { maxWait: 20_000, timeout: 20_000 },
    );
  }

  async decide(
    input: WorkflowCommand & {
      decision: 'approve' | 'request-changes';
      note: string | null;
    },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const content = await this.lockContent(tx, input);
        if (content.status !== AcademicContentStatus.SUBMITTED)
          conflict(
            'academic_content.approval.invalid_status',
            'Content is not submitted',
          );
        const pending = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM academic_content_approvals
          WHERE school_id = ${input.schoolId}::uuid
            AND academic_content_id = ${input.contentId}::uuid
            AND status = 'PENDING'
          FOR UPDATE`;
        if (pending.length !== 1)
          conflict(
            'academic_content.approval.pending_missing',
            'Current approval is unavailable',
          );
        const approval = await tx.academicContentApproval.findFirstOrThrow({
          where: {
            id: pending[0].id,
            schoolId: input.schoolId,
            academicContentId: input.contentId,
          },
        });
        const [latest, revision] = await Promise.all([
          tx.academicContentApproval.findFirst({
            where: {
              schoolId: input.schoolId,
              academicContentId: input.contentId,
            },
            orderBy: { roundNumber: 'desc' },
            select: { id: true },
          }),
          tx.academicContentRevision.findFirst({
            where: {
              id: approval.revisionId,
              schoolId: input.schoolId,
              academicContentId: input.contentId,
            },
            select: { snapshotContractVersion: true },
          }),
        ]);
        if (
          latest?.id !== approval.id ||
          revision?.snapshotContractVersion !== 2
        )
          conflict(
            'academic_content.approval.invalid_revision',
            'Current approval revision is unavailable',
          );

        const approved = input.decision === 'approve';
        const approvalStatus = approved
          ? AcademicContentApprovalStatus.APPROVED
          : AcademicContentApprovalStatus.CHANGES_REQUESTED;
        const contentStatus = approved
          ? AcademicContentStatus.APPROVED
          : AcademicContentStatus.CHANGES_REQUESTED;
        const decidedAt = input.now ?? new Date();
        await tx.academicContentApproval.update({
          where: {
            id: approval.id,
            schoolId: input.schoolId,
            academicContentId: input.contentId,
          },
          data: {
            status: approvalStatus,
            decidedByUserId: input.actorId,
            decidedAt,
            decisionNote: input.note,
          },
        });
        await tx.academicContent.update({
          where: {
            id_schoolId: { id: input.contentId, schoolId: input.schoolId },
          },
          data: { status: contentStatus, updatedByUserId: input.actorId },
        });
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            organizationId: input.organizationId,
            schoolId: input.schoolId,
            module: 'academic-content',
            action: approved
              ? 'academics.academic_content.approve'
              : 'academics.academic_content.request_changes',
            resourceType: 'academic_content',
            resourceId: input.contentId,
            outcome: AuditOutcome.SUCCESS,
            after: {
              contentId: input.contentId,
              revisionId: approval.revisionId,
              approvalId: approval.id,
              roundNumber: approval.roundNumber,
              decision: approvalStatus,
            },
          },
        });
        return {
          contentId: input.contentId,
          contentStatus,
          approvalId: approval.id,
          approvalStatus,
          revisionId: approval.revisionId,
          roundNumber: approval.roundNumber,
          submittedAt: approval.submittedAt,
          decidedAt,
        };
      },
      { maxWait: 20_000, timeout: 20_000 },
    );
  }
}
