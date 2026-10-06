import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma } from '@prisma/client';
import {
  ACADEMIC_CONTENT_NOTIFICATION_BOOLEAN_FIELDS,
  effectiveAcademicContentNotificationPolicy,
  normalizeAcademicContentNotificationPolicyPatch,
} from '../domain/academic-content-notification.policy';
import { UpdateAcademicContentNotificationPolicyDto } from '../dto/academic-content-notification-policy.dto';
import { AcademicContentNotificationPolicyRepository } from '../infrastructure/academic-content-notification-policy.repository';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const normalize = normalizeAcademicContentNotificationPolicyPatch;
describe('ACC-8A notification policy contracts', () => {
  it('returns twelve safe defaults, copies/sorts offsets, and preserves disabled configuration', () => {
    const defaults = effectiveAcademicContentNotificationPolicy();
    expect(Object.keys(defaults)).toHaveLength(12);
    for (const field of ACADEMIC_CONTENT_NOTIFICATION_BOOLEAN_FIELDS)
      expect(defaults[field]).toBe(field !== 'onlineSessionRemindersEnabled');
    expect(defaults.onlineSessionReminderOffsetsMinutes).toEqual([]);
    const offsets = [1440, 5, 60];
    expect(
      effectiveAcademicContentNotificationPolicy({
        onlineSessionReminderOffsetsMinutes: offsets,
      }),
    ).toMatchObject({
      onlineSessionReminderOffsetsMinutes: [5, 60, 1440],
      onlineSessionRemindersEnabled: false,
    });
    expect(offsets).toEqual([1440, 5, 60]);
    expect(
      normalize({
        onlineSessionRemindersEnabled: true,
        onlineSessionReminderOffsetsMinutes: [],
      }),
    ).toEqual({
      onlineSessionRemindersEnabled: true,
      onlineSessionReminderOffsetsMinutes: [],
    });
  });

  it.each(ACADEMIC_CONTENT_NOTIFICATION_BOOLEAN_FIELDS)(
    'strictly validates %s in both DTO and domain',
    (field) => {
      for (const value of [null, 'true', 1, [], {}]) {
        expect(() => normalize({ [field]: value })).toThrow();
        expect(
          validateSync(
            plainToInstance(UpdateAcademicContentNotificationPolicyDto, {
              [field]: value,
            }),
          ).length,
        ).toBeGreaterThan(0);
      }
      for (const value of [true, false]) {
        expect(normalize({ [field]: value })).toEqual({ [field]: value });
        expect(
          validateSync(
            plainToInstance(UpdateAcademicContentNotificationPolicyDto, {
              [field]: value,
            }),
          ),
        ).toEqual([]);
      }
      expect(
        normalize({
          [field]: undefined,
          onlineSessionReminderOffsetsMinutes: [],
        }),
      ).toEqual({ onlineSessionReminderOffsetsMinutes: [] });
    },
  );

  it.each([
    null,
    60,
    '60',
    [60, 60],
    [4],
    [10081],
    [60.5],
    ['60'],
    [null],
    [5, 6, 7, 8, 9, 10],
  ])('rejects invalid offsets %j in DTO and domain', (value) => {
    expect(() =>
      normalize({ onlineSessionReminderOffsetsMinutes: value }),
    ).toThrow();
    expect(
      validateSync(
        plainToInstance(UpdateAcademicContentNotificationPolicyDto, {
          onlineSessionReminderOffsetsMinutes: value,
        }),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('rejects empty/unknown patches and permits both numeric bounds', () => {
    for (const value of [
      undefined,
      null,
      [],
      {},
      { notificationsEnabled: undefined },
      { schoolId: 'foreign', notificationsEnabled: false },
      { id: 'id' },
      { createdAt: 'now' },
      { updatedAt: 'now' },
    ])
      expect(() => normalize(value)).toThrow();
    expect(
      normalize({ onlineSessionReminderOffsetsMinutes: [10080, 5] }),
    ).toEqual({ onlineSessionReminderOffsetsMinutes: [5, 10080] });
  });

  it.each(['P2034', 'P2002'])(
    'retries %s and does not write or audit a default no-op',
    async (code) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        academicContentNotificationPolicy: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          update: jest.fn(),
        },
        auditLog: { create: jest.fn() },
      };
      const transaction = jest
        .fn()
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('race', {
            code,
            clientVersion: 'test',
          }),
        )
        .mockImplementation((work: (tx: unknown) => unknown) => work(tx));
      const repository = new AcademicContentNotificationPolicyRepository({
        $transaction: transaction,
      } as unknown as PrismaService);
      await expect(
        repository.updatePolicy({
          schoolId: 'school',
          organizationId: 'org',
          actorId: 'actor',
          patch: { notificationsEnabled: true },
        }),
      ).resolves.toEqual(effectiveAcademicContentNotificationPolicy());
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(
        tx.academicContentNotificationPolicy.create,
      ).not.toHaveBeenCalled();
      expect(
        tx.academicContentNotificationPolicy.update,
      ).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it('bounds retries to three and propagates unrelated errors', async () => {
    for (const code of ['P2034', 'P2002', 'P2003']) {
      const error = new Prisma.PrismaClientKnownRequestError('failure', {
        code,
        clientVersion: 'test',
      });
      const transaction = jest.fn().mockRejectedValue(error);
      const repository = new AcademicContentNotificationPolicyRepository({
        $transaction: transaction,
      } as unknown as PrismaService);
      await expect(
        repository.updatePolicy({
          schoolId: 'school',
          organizationId: 'org',
          actorId: 'actor',
          patch: { notificationsEnabled: false },
        }),
      ).rejects.toBe(error);
      expect(transaction).toHaveBeenCalledTimes(code === 'P2003' ? 1 : 3);
    }
  });
});
