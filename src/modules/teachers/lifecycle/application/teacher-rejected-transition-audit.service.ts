import { Inject, Injectable } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import type { TeacherLifecycleRejectedAuditEntry } from '../domain/teacher-lifecycle-audit';
import { TeacherLifecycleAuditWriter } from '../infrastructure/teacher-lifecycle-audit.writer';

export const TEACHER_LIFECYCLE_OPERATIONAL_LOGGER = Symbol(
  'TEACHER_LIFECYCLE_OPERATIONAL_LOGGER',
);

export type TeacherLifecycleOperationalEvent =
  | {
      event: 'teachers.role_transition.rejected.audit_delivery_failed';
      traceId: string;
    }
  | {
      event: 'teachers.employment_status.change.unexpected_failure';
      operation: 'employment_status_change';
      traceId: string;
      errorName: string;
      prismaCode?: string;
    };

export interface TeacherLifecycleOperationalLogger {
  error(event: TeacherLifecycleOperationalEvent): void;
}

export function buildEmploymentStatusUnexpectedFailureEvent(
  error: unknown,
  traceId: string,
): TeacherLifecycleOperationalEvent {
  const event = {
    event: 'teachers.employment_status.change.unexpected_failure' as const,
    operation: 'employment_status_change' as const,
    traceId: sanitizeTraceId(traceId),
    errorName: safeErrorName(error),
  };
  const prismaCode = safePrismaCode(error);
  return prismaCode ? { ...event, prismaCode } : event;
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

function safeErrorName(error: unknown): string {
  const name = safeStringProperty(error, 'name');
  return name && /^[a-z][a-z0-9_.-]{0,127}$/iu.test(name)
    ? name
    : 'UnknownError';
}

function safePrismaCode(error: unknown): string | undefined {
  const code = safeStringProperty(error, 'code');
  return code && /^P[0-9]{4}$/u.test(code) ? code : undefined;
}

function safeStringProperty(
  value: unknown,
  property: 'code' | 'name',
): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  try {
    const candidate = (value as Record<string, unknown>)[property];
    return typeof candidate === 'string' ? candidate : undefined;
  } catch {
    return undefined;
  }
}
