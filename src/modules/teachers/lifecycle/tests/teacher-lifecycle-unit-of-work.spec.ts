import { UserStatus, UserType } from '@prisma/client';
import { readFileSync } from 'node:fs';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherLifecycleSuccessfulAuditEntry } from '../domain/teacher-lifecycle-audit';
import type { PrismaTeacherLifecycleTransactionOperations } from '../infrastructure/prisma-teacher-lifecycle-transaction.operations';
import { PrismaTeacherLifecycleUnitOfWork } from '../infrastructure/prisma-teacher-lifecycle.unit-of-work';

const IDS = {
  actor: '00000000-0000-4000-8000-000000000001',
  organization: '00000000-0000-4000-8000-000000000002',
  school: '00000000-0000-4000-8000-000000000003',
  user: '00000000-0000-4000-8000-000000000004',
  membership: '00000000-0000-4000-8000-000000000005',
  profile: '00000000-0000-4000-8000-000000000006',
};

function auditEntry(): TeacherLifecycleSuccessfulAuditEntry {
  return {
    actorId: IDS.actor,
    actorUserType: UserType.SCHOOL_USER,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    action: 'teachers.account.disable',
    resourceType: 'user',
    resourceId: IDS.user,
  };
}

function operations(overrides: Record<string, jest.Mock> = {}) {
  const defaults: Record<string, jest.Mock> = {};
  for (const name of [
    'findUser',
    'updateUserDisplayNames',
    'setUserStatus',
    'setUserType',
    'findMembership',
    'listMembershipFootprints',
    'createMembership',
    'setMembershipRoleAndType',
    'setMembershipActive',
    'setMembershipSuspended',
    'setMembershipInactive',
    'setMembershipTransferred',
    'softDeleteMembership',
    'findLiveProfile',
    'findArchivedProfile',
    'findTrustedProfileIncludingArchived',
    'listLiveProfileFootprints',
    'findExactProfileFootprint',
    'createProfile',
    'updateProfile',
    'restoreProfile',
    'setProfileEmploymentStatus',
    'archiveProfile',
    'writeSuccessfulAudit',
    'revokeUserSessions',
  ]) {
    defaults[name] = jest.fn().mockResolvedValue({});
  }
  return {
    ...defaults,
    ...overrides,
  } as unknown as PrismaTeacherLifecycleTransactionOperations;
}

describe('PrismaTeacherLifecycleUnitOfWork', () => {
  it('opens one interactive transaction and commits one successful callback', async () => {
    const transaction = { marker: 'one-transaction' };
    let commits = 0;
    const prisma = {
      $transaction: jest.fn(async (callback, options) => {
        expect(options).toEqual({
          isolationLevel: 'Serializable',
          maxWait: 5_000,
          timeout: 30_000,
        });
        const result = await callback(transaction);
        commits += 1;
        return result;
      }),
    } as unknown as PrismaService;
    const unitOfWork = new PrismaTeacherLifecycleUnitOfWork(
      prisma,
      operations(),
    );

    await expect(unitOfWork.execute(async () => 'committed')).resolves.toBe(
      'committed',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(commits).toBe(1);
  });

  it('passes the exact same hidden transaction to every operation family', async () => {
    const transaction = { marker: 'shared' };
    const operationSet = operations();
    const prisma = {
      $transaction: (callback) => callback(transaction),
    } as unknown as PrismaService;
    const unitOfWork = new PrismaTeacherLifecycleUnitOfWork(
      prisma,
      operationSet,
    );

    await unitOfWork.execute(async (context) => {
      expect('transaction' in context).toBe(false);
      expect('prisma' in context).toBe(false);
      await context.user.setStatus(IDS.user, UserStatus.DISABLED);
      await context.membership.setSuspended({
        membershipId: IDS.membership,
        schoolId: IDS.school,
      });
      await context.profile.archive({
        profileId: IDS.profile,
        schoolId: IDS.school,
        deletedAt: new Date('2026-07-19T00:00:00.000Z'),
      });
      await context.audit.writeSuccessful(auditEntry());
      await context.sessions.revokeUserSessions(
        IDS.user,
        new Date('2026-07-19T00:00:00.000Z'),
      );
    });

    for (const method of [
      operationSet.setUserStatus,
      operationSet.setMembershipSuspended,
      operationSet.archiveProfile,
      operationSet.writeSuccessfulAudit,
      operationSet.revokeUserSessions,
    ]) {
      expect((method as jest.Mock).mock.calls[0][0]).toBe(transaction);
    }
  });

  it.each([
    ['user', 0],
    ['membership', 1],
    ['profile', 2],
    ['audit', 3],
    ['sessions', 4],
  ] as const)(
    'propagates a %s failure and rolls back every staged operation',
    async (failedStage, failedIndex) => {
      const committed: string[] = [];
      let rollbacks = 0;
      const transaction = { staged: [] as string[] };
      const stage = (name: string) =>
        jest.fn(async (receivedTransaction: typeof transaction) => {
          expect(receivedTransaction).toBe(transaction);
          receivedTransaction.staged.push(name);
          if (name === failedStage) throw new Error(`${name}_failed`);
          return {};
        });
      const operationSet = operations({
        setUserStatus: stage('user'),
        setMembershipSuspended: stage('membership'),
        archiveProfile: stage('profile'),
        writeSuccessfulAudit: stage('audit'),
        revokeUserSessions: stage('sessions'),
      });
      const prisma = {
        async $transaction(callback) {
          try {
            const result = await callback(transaction);
            committed.push(...transaction.staged);
            return result;
          } catch (error) {
            rollbacks += 1;
            transaction.staged.length = 0;
            throw error;
          }
        },
      } as unknown as PrismaService;
      const unitOfWork = new PrismaTeacherLifecycleUnitOfWork(
        prisma,
        operationSet,
      );

      await expect(
        unitOfWork.execute(async (context) => {
          await context.user.setStatus(IDS.user, UserStatus.DISABLED);
          await context.membership.setSuspended({
            membershipId: IDS.membership,
            schoolId: IDS.school,
          });
          await context.profile.archive({
            profileId: IDS.profile,
            schoolId: IDS.school,
            deletedAt: new Date('2026-07-19T00:00:00.000Z'),
          });
          await context.audit.writeSuccessful(auditEntry());
          await context.sessions.revokeUserSessions(
            IDS.user,
            new Date('2026-07-19T00:00:00.000Z'),
          );
        }),
      ).rejects.toThrow(`${failedStage}_failed`);
      expect(committed).toEqual([]);
      expect(rollbacks).toBe(1);
      const methods = [
        operationSet.setUserStatus,
        operationSet.setMembershipSuspended,
        operationSet.archiveProfile,
        operationSet.writeSuccessfulAudit,
        operationSet.revokeUserSessions,
      ];
      expect(
        methods
          .slice(0, failedIndex + 1)
          .every((mock) => (mock as jest.Mock).mock.calls.length === 1),
      ).toBe(true);
      expect(
        methods
          .slice(failedIndex + 1)
          .every((mock) => (mock as jest.Mock).mock.calls.length === 0),
      ).toBe(true);
    },
  );

  it('contains no base-client delegate fallback', () => {
    const source = readFileSync(
      require.resolve('../infrastructure/prisma-teacher-lifecycle.unit-of-work'),
      'utf8',
    );
    expect(source).toContain('this.prisma.$transaction');
    expect(source).not.toMatch(
      /this\.prisma\.(user|membership|teacherProfile|auditLog|session)/u,
    );
    expect(source).not.toContain('transaction?:');
  });
});
