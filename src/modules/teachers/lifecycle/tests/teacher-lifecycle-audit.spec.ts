import { HttpStatus } from '@nestjs/common';
import { AuditOutcome, UserType } from '@prisma/client';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  TeacherRejectedTransitionAuditService,
  type TeacherLifecycleOperationalLogger,
} from '../application/teacher-rejected-transition-audit.service';
import {
  TEACHER_LIFECYCLE_AUDIT_ACTIONS,
  TEACHER_LIFECYCLE_AUDIT_RESOURCE_TYPES,
  TeacherLifecycleAuditContractError,
  assertTeacherLifecycleAuditAction,
  assertTeacherLifecycleAuditResourceType,
  buildTeacherLifecycleAuditMetadata,
  type TeacherLifecycleSuccessfulAuditEntry,
} from '../domain/teacher-lifecycle-audit';
import { TeacherLifecycleAuditWriter } from '../infrastructure/teacher-lifecycle-audit.writer';

const IDS = {
  actor: '10000000-0000-4000-8000-000000000001',
  organization: '10000000-0000-4000-8000-000000000002',
  school: '10000000-0000-4000-8000-000000000003',
  user: '10000000-0000-4000-8000-000000000004',
  membership: '10000000-0000-4000-8000-000000000005',
  profile: '10000000-0000-4000-8000-000000000006',
};

function entry(
  overrides: Partial<TeacherLifecycleSuccessfulAuditEntry> = {},
): TeacherLifecycleSuccessfulAuditEntry {
  return {
    actorId: IDS.actor,
    actorUserType: UserType.SCHOOL_USER,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    action: 'teachers.profile.update',
    resourceType: 'teacher_profile',
    resourceId: IDS.profile,
    metadata: {
      teacherProfileId: IDS.profile,
      changedFields: ['department'],
    },
    ...overrides,
  };
}

describe('Teacher lifecycle audit contract', () => {
  it('accepts every locked action and rejects every unknown action', () => {
    expect(TEACHER_LIFECYCLE_AUDIT_ACTIONS).toHaveLength(15);
    for (const action of TEACHER_LIFECYCLE_AUDIT_ACTIONS) {
      expect(() => assertTeacherLifecycleAuditAction(action)).not.toThrow();
    }
    expect(() =>
      assertTeacherLifecycleAuditAction('teachers.assignments.create'),
    ).toThrow(TeacherLifecycleAuditContractError);
  });

  it('accepts only singular locked resource types', () => {
    expect(TEACHER_LIFECYCLE_AUDIT_RESOURCE_TYPES).toEqual([
      'user',
      'membership',
      'teacher_profile',
    ]);
    for (const resourceType of TEACHER_LIFECYCLE_AUDIT_RESOURCE_TYPES) {
      expect(() =>
        assertTeacherLifecycleAuditResourceType(resourceType),
      ).not.toThrow();
    }
    expect(() =>
      assertTeacherLifecycleAuditResourceType('teacher_profiles'),
    ).toThrow(TeacherLifecycleAuditContractError);
  });

  it('serializes allowed metadata in deterministic key and value order', () => {
    const metadata = buildTeacherLifecycleAuditMetadata({
      credentialVersion: 4,
      changedFields: ['status', 'firstName', 'status'],
      termStateLabels: ['invalid', 'future', 'historical'],
      userId: IDS.user,
      membershipId: IDS.membership,
      reasonCode: 'active_or_future_allocations',
      hasPassword: true,
      mustChangePassword: false,
      previousValue: 'SUSPENDED',
      nextValue: 'ACTIVE',
      allocationDependencyCounts: {
        currentActive: 1,
        future: 2,
        currentInactive: 0,
        inconsistent: 0,
        invalid: 0,
        historical: 3,
        timetableEntries: 4,
        lessonPlans: 5,
        homeworkAssignments: 6,
      },
    });

    expect(Object.keys(metadata)).toEqual([
      'userId',
      'membershipId',
      'changedFields',
      'previousValue',
      'nextValue',
      'allocationDependencyCounts',
      'termStateLabels',
      'reasonCode',
      'hasPassword',
      'mustChangePassword',
      'credentialVersion',
    ]);
    expect(metadata.changedFields).toEqual(['firstName', 'status']);
    expect(metadata.termStateLabels).toEqual([
      'future',
      'historical',
      'invalid',
    ]);
  });

  it.each([
    'name',
    'email',
    'phone',
    'notes',
    'password',
    'passwordHash',
    'temporaryPassword',
    'token',
    'sessionId',
    'filename',
    'bucket',
    'objectKey',
    'reason',
    'rawError',
    'requestBody',
  ])('rejects forbidden or unknown metadata key %s', (key) => {
    expect(() =>
      buildTeacherLifecycleAuditMetadata({ [key]: 'sensitive' }),
    ).toThrow(TeacherLifecycleAuditContractError);
  });

  it('rejects non-UUID resource references and free-form reason codes', () => {
    expect(() =>
      buildTeacherLifecycleAuditMetadata({ userId: 'not-a-uuid' }),
    ).toThrow(TeacherLifecycleAuditContractError);
    expect(() =>
      buildTeacherLifecycleAuditMetadata({ reasonCode: 'because I said so' }),
    ).toThrow(TeacherLifecycleAuditContractError);
  });

  it('writes successful audit through the supplied lifecycle transaction only', async () => {
    const baseCreate = jest.fn();
    const transactionCreate = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const writer = new TeacherLifecycleAuditWriter({
      auditLog: { create: baseCreate },
    } as unknown as PrismaService);

    await writer.writeSuccessfulInTransaction(
      { auditLog: { create: transactionCreate } } as never,
      entry(),
    );

    expect(baseCreate).not.toHaveBeenCalled();
    expect(transactionCreate).toHaveBeenCalledTimes(1);
    expect(transactionCreate.mock.calls[0][0].data).toMatchObject({
      module: 'teachers',
      action: 'teachers.profile.update',
      resourceType: 'teacher_profile',
      resourceId: IDS.profile,
      outcome: AuditOutcome.SUCCESS,
    });
  });

  it('uses the standalone writer only for sanitized rejected transitions', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const writer = new TeacherLifecycleAuditWriter({
      auditLog: { create },
    } as unknown as PrismaService);
    const { action: _action, ...rejected } = entry({
      resourceType: 'membership',
      resourceId: IDS.membership,
      metadata: { reasonCode: 'teacher_promotion_requires_profile' },
    });

    await writer.writeRejectedStandalone(rejected);

    expect(create.mock.calls[0][0].data).toMatchObject({
      action: 'teachers.role_transition.rejected',
      outcome: AuditOutcome.FAILURE,
      resourceType: 'membership',
    });
  });

  it('preserves the exact original DomainException when rejection audit fails', async () => {
    const original = new DomainException({
      code: 'teachers.account.role_transition_conflict',
      message: 'Teacher role transition is not allowed',
      httpStatus: HttpStatus.CONFLICT,
      details: { reasonCode: 'teacher_promotion_requires_profile' },
    });
    const writer = {
      writeRejectedStandalone: jest.fn().mockRejectedValue(new Error('raw db')),
    } as unknown as TeacherLifecycleAuditWriter;
    const logger: TeacherLifecycleOperationalLogger = { error: jest.fn() };
    const service = new TeacherRejectedTransitionAuditService(writer, logger);
    const { action: _action, ...rejected } = entry({
      resourceType: 'membership',
      resourceId: IDS.membership,
      metadata: { reasonCode: 'teacher_promotion_requires_profile' },
    });

    let thrown: unknown;
    try {
      await service.auditAndThrow({
        error: original,
        audit: rejected,
        traceId: 'trace-1',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(original);
    expect(original).toMatchObject({
      code: 'teachers.account.role_transition_conflict',
      httpStatus: HttpStatus.CONFLICT,
      message: 'Teacher role transition is not allowed',
      details: { reasonCode: 'teacher_promotion_requires_profile' },
    });
    expect(logger.error).toHaveBeenCalledWith({
      event: 'teachers.role_transition.rejected.audit_delivery_failed',
      traceId: 'trace-1',
    });
    expect(
      JSON.stringify((logger.error as jest.Mock).mock.calls),
    ).not.toContain('raw db');
  });

  it('logs only a stable event and sanitized trace when delivery fails', async () => {
    const original = new DomainException({ code: 'stable', message: 'stable' });
    const writer = {
      writeRejectedStandalone: jest
        .fn()
        .mockRejectedValue(new Error('private')),
    } as unknown as TeacherLifecycleAuditWriter;
    const logger: TeacherLifecycleOperationalLogger = { error: jest.fn() };
    const service = new TeacherRejectedTransitionAuditService(writer, logger);
    const { action: _action, ...rejected } = entry();

    await expect(
      service.auditAndThrow({
        error: original,
        audit: rejected,
        traceId: 'unsafe\nidentity@example.test',
      }),
    ).rejects.toBe(original);
    expect(logger.error).toHaveBeenCalledWith({
      event: 'teachers.role_transition.rejected.audit_delivery_failed',
      traceId: 'unavailable',
    });
  });
});
