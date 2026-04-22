import { AuditOutcome, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { UpdateSecurityUseCase } from '../application/update-security.use-case';
import { SecurityRepository } from '../infrastructure/security.repository';

describe('UpdateSecurityUseCase', () => {
  it('persists security settings for the active school', async () => {
    const findBySchoolId = jest.fn().mockResolvedValue({
      id: 'security-1',
      schoolId: 'school-1',
      enforceTwoFactor: false,
      ipAllowlistEnabled: false,
      ipAllowlist: '10.0.0.1',
      sessionTimeoutMinutes: 30,
      suspiciousLoginAlerts: false,
      passwordMinLength: 8,
      passwordRotationDays: 90,
    });
    const upsert = jest.fn().mockResolvedValue({
      id: 'security-1',
      schoolId: 'school-1',
      enforceTwoFactor: true,
      ipAllowlistEnabled: true,
      ipAllowlist: '10.0.0.0/24',
      sessionTimeoutMinutes: 45,
      suspiciousLoginAlerts: true,
      passwordMinLength: 12,
      passwordRotationDays: 60,
    });
    const securityRepository = {
      findBySchoolId,
      upsert,
    } as unknown as SecurityRepository;
    const createAuditLog = jest.fn().mockResolvedValue(undefined);
    const authRepository = {
      createAuditLog,
    } as unknown as AuthRepository;

    const useCase = new UpdateSecurityUseCase(
      securityRepository,
      authRepository,
    );

    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['settings.security.manage'],
      });

      const result = await useCase.execute({
        enforceTwoFactor: true,
        ipAllowlistEnabled: true,
        ipAllowlist: '10.0.0.0/24',
        sessionTimeoutMinutes: 45,
        suspiciousLoginAlerts: true,
        passwordMinLength: 12,
        passwordRotationDays: 60,
      });

      expect(findBySchoolId).toHaveBeenCalledWith('school-1');
      expect(upsert).toHaveBeenCalledWith(
        'school-1',
        'user-1',
        expect.objectContaining({
          schoolId: 'school-1',
          enforceTwoFactor: true,
          ipAllowlistEnabled: true,
          sessionTimeoutMinutes: 45,
          suspiciousLoginAlerts: true,
        }),
      );
      const auditEntry = createAuditLog.mock.calls[0][0];
      expect(auditEntry).toEqual(
        expect.objectContaining({
          actorId: 'user-1',
          schoolId: 'school-1',
          module: 'settings',
          action: 'settings.security.change',
          resourceType: 'security_setting',
          outcome: AuditOutcome.SUCCESS,
        }),
      );
      expect(auditEntry.before).toEqual({
        enforceTwoFactor: false,
        ipAllowlistEnabled: false,
        ipAllowlistRuleCount: 1,
        sessionTimeoutMinutes: 30,
        suspiciousLoginAlerts: false,
        passwordMinLength: 8,
        passwordRotationDays: 90,
      });
      expect(auditEntry.after).toEqual({
        enforceTwoFactor: true,
        ipAllowlistEnabled: true,
        ipAllowlistRuleCount: 1,
        sessionTimeoutMinutes: 45,
        suspiciousLoginAlerts: true,
        passwordMinLength: 12,
        passwordRotationDays: 60,
      });
      expect(auditEntry.after).not.toHaveProperty('ipAllowlist');
      expect(result.passwordMinLength).toBe(12);
      expect(result.passwordRotationDays).toBe(60);
    });
  });
});
