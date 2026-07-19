import { Inject, Injectable } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import type { TeacherLifecycleRejectedAuditEntry } from '../domain/teacher-lifecycle-audit';
import { TeacherLifecycleAuditWriter } from '../infrastructure/teacher-lifecycle-audit.writer';

export const TEACHER_LIFECYCLE_OPERATIONAL_LOGGER = Symbol(
  'TEACHER_LIFECYCLE_OPERATIONAL_LOGGER',
);

export interface TeacherLifecycleOperationalLogger {
  error(event: {
    event: 'teachers.role_transition.rejected.audit_delivery_failed';
    traceId: string;
  }): void;
}

@Injectable()
export class TeacherRejectedTransitionAuditService {
  constructor(
    private readonly auditWriter: TeacherLifecycleAuditWriter,
    @Inject(TEACHER_LIFECYCLE_OPERATIONAL_LOGGER)
    private readonly operationalLogger: TeacherLifecycleOperationalLogger,
  ) {}

  async auditAndThrow(input: {
    error: DomainException;
    audit: TeacherLifecycleRejectedAuditEntry;
    traceId: string;
  }): Promise<never> {
    try {
      await this.auditWriter.writeRejectedStandalone(input.audit);
    } catch {
      this.operationalLogger.error({
        event: 'teachers.role_transition.rejected.audit_delivery_failed',
        traceId: sanitizeTraceId(input.traceId),
      });
    }
    throw input.error;
  }
}

function sanitizeTraceId(value: string): string {
  return /^[a-z0-9._:-]{1,128}$/iu.test(value) ? value : 'unavailable';
}
