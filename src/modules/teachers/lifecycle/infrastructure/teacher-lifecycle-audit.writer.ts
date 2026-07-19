import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  assertTeacherLifecycleAuditAction,
  assertTeacherLifecycleAuditResourceType,
  assertTeacherLifecycleTrustedUuid,
  buildTeacherLifecycleAuditMetadata,
  type TeacherLifecycleRejectedAuditEntry,
  type TeacherLifecycleSuccessfulAuditEntry,
} from '../domain/teacher-lifecycle-audit';

@Injectable()
export class TeacherLifecycleAuditWriter {
  constructor(private readonly prisma: PrismaService) {}

  async writeSuccessfulInTransaction(
    transaction: Prisma.TransactionClient,
    entry: TeacherLifecycleSuccessfulAuditEntry,
  ): Promise<void> {
    assertTeacherLifecycleAuditAction(entry.action);
    await transaction.auditLog.create({
      data: this.buildData(entry, AuditOutcome.SUCCESS, entry.action),
      select: { id: true },
    });
  }

  async writeRejectedStandalone(
    entry: TeacherLifecycleRejectedAuditEntry,
  ): Promise<void> {
    const action = 'teachers.role_transition.rejected' as const;
    await this.prisma.auditLog.create({
      data: this.buildData(entry, AuditOutcome.FAILURE, action),
      select: { id: true },
    });
  }

  private buildData(
    entry: TeacherLifecycleRejectedAuditEntry,
    outcome: AuditOutcome,
    action: string,
  ): Prisma.AuditLogUncheckedCreateInput {
    assertTeacherLifecycleAuditAction(action);
    assertTeacherLifecycleAuditResourceType(entry.resourceType);
    for (const id of [
      entry.actorId,
      entry.organizationId,
      entry.schoolId,
      entry.resourceId,
    ]) {
      assertTeacherLifecycleTrustedUuid(id);
    }
    const metadata = buildTeacherLifecycleAuditMetadata(entry.metadata);
    return {
      actorId: entry.actorId,
      userType: entry.actorUserType,
      organizationId: entry.organizationId,
      schoolId: entry.schoolId,
      module: 'teachers',
      action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      outcome,
      after: metadata as Prisma.InputJsonValue,
    };
  }
}
