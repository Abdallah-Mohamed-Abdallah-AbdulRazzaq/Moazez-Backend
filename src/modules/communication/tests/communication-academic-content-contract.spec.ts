import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CommunicationNotificationType } from '@prisma/client';
import {
  normalizeCommunicationNotificationSourceModule,
  normalizeCommunicationNotificationType,
  COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES,
} from '../domain/communication-notification-domain';
import { ListCommunicationNotificationsQueryDto } from '../dto/communication-notification.dto';
import { ListStudentNotificationsQueryDto } from '../../student-app/notifications/dto/student-notifications.dto';
import { ListParentNotificationsQueryDto } from '../../parent-app/notifications/dto/parent-notifications.dto';
import { ListTeacherNotificationsQueryDto } from '../../teacher-app/notifications/dto/teacher-notifications.dto';
import { CommunicationNotificationRepository } from '../infrastructure/communication-notification.repository';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

describe('ACC-8A shared Communication query contract', () => {
  it('accepts only the additive source/types through normalizers and existing DTOs', () => {
    expect(normalizeCommunicationNotificationSourceModule('academics')).toBe(
      'ACADEMICS',
    );
    expect(
      normalizeCommunicationNotificationSourceModule('announcements'),
    ).toBe('ANNOUNCEMENTS');
    for (const type of COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES) {
      expect(normalizeCommunicationNotificationType(type.toLowerCase())).toBe(
        type,
      );
      const query = { sourceModule: 'academics', type: type.toLowerCase() };
      expect(
        validateSync(
          plainToInstance(ListCommunicationNotificationsQueryDto, query),
        ),
      ).toEqual([]);
      for (const dto of [
        ListStudentNotificationsQueryDto,
        ListParentNotificationsQueryDto,
        ListTeacherNotificationsQueryDto,
      ])
        expect(
          validateSync(
            plainToInstance(dto, { ...query, category: 'academic_content' }),
          ),
        ).toEqual([]);
    }
    for (const dto of [
      ListStudentNotificationsQueryDto,
      ListParentNotificationsQueryDto,
      ListTeacherNotificationsQueryDto,
    ]) {
      for (const query of [
        { type: 'arbitrary' },
        { category: 'arbitrary' },
        { sourceModule: 'arbitrary' },
        { types: ['academic_content_updated'] },
      ])
        expect(
          validateSync(plainToInstance(dto, query), {
            whitelist: true,
            forbidNonWhitelisted: true,
          }).length,
        ).toBeGreaterThan(0);
    }
    expect(() =>
      normalizeCommunicationNotificationType('academic_content_unknown'),
    ).toThrow();
  });

  it('uses a bounded IN filter for list/count and preserves exact type precedence', async () => {
    const delegate = {
      findMany: jest
        .fn<Promise<unknown[]>, [Record<string, unknown>]>()
        .mockResolvedValue([]),
      count: jest
        .fn<Promise<number>, [Record<string, unknown>]>()
        .mockResolvedValue(0),
    };
    const repository = new CommunicationNotificationRepository({
      scoped: { communicationNotification: delegate },
    } as unknown as PrismaService);
    const filters = {
      recipientUserId: 'actor',
      types: [...COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES],
    };
    await repository.listCurrentSchoolNotifications({ filters });
    await repository.countCurrentSchoolNotifications({ filters });
    expect(delegate.findMany.mock.calls[0][0]).toMatchObject({
      where: { type: { in: filters.types } },
    });
    expect(delegate.count.mock.calls[0][0]).toMatchObject({
      where: { type: { in: filters.types } },
    });
    await repository.listCurrentSchoolNotifications({
      filters: {
        ...filters,
        type: CommunicationNotificationType.ACADEMIC_CONTENT_UPDATED,
      },
    });
    expect(delegate.findMany.mock.calls[1][0]).toMatchObject({
      where: { type: CommunicationNotificationType.ACADEMIC_CONTENT_UPDATED },
    });
  });
});
