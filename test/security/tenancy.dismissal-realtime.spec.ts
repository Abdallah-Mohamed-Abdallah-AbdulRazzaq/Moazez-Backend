import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AppDeviceTokenSurface,
  CommunicationNotificationType,
  DismissalRequestStatus,
  PrismaClient,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import {
  REALTIME_CLIENT_COMMANDS,
  REALTIME_SERVER_EVENTS,
} from '../../src/infrastructure/realtime/realtime-event-names';
import { RealtimeGateway } from '../../src/infrastructure/realtime/realtime.gateway';
import { DismissalRealtimeEventsService } from '../../src/modules/dismissal/realtime/dismissal-realtime-events.service';

const GLOBAL_PREFIX = '/api/v1';

jest.setTimeout(60_000);

describe('DISMISSAL-REALTIME-1A tenancy and realtime security', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it('registers stable dismissal realtime event names without adding subscribe commands', () => {
    expect(Object.values(REALTIME_SERVER_EVENTS)).toEqual(
      expect.arrayContaining([
        'dismissal.request.created',
        'dismissal.request.cancelled',
        'dismissal.request.status_changed',
        'dismissal.request.arrival_confirmed',
        'dismissal.request.delivered',
        'dismissal.queue.changed',
        'parent.smart_pickup.request.changed',
        'dismissal.notification.created',
        'dismissal.notification.read',
        'dismissal.notifications.read_all',
      ]),
    );
    expect(Object.values(REALTIME_CLIENT_COMMANDS)).not.toEqual(
      expect.arrayContaining([
        'dismissal.queue.join',
        'dismissal.notifications.join',
        'parent.smart_pickup.join',
      ]),
    );
  });

  it('rejects unauthenticated realtime sockets before tenant/user room joins', async () => {
    const gateway = new RealtimeGateway(
      { authenticate: jest.fn().mockRejectedValue(new Error('invalid')) } as never,
      { isOnlinePresenceEnabled: jest.fn() } as never,
      {
        bindServer: jest.fn(),
        publishToSchool: jest.fn(),
        publishToUser: jest.fn(),
        publishToConversation: jest.fn(),
      } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      { registerSocket: jest.fn(), unregisterSocket: jest.fn() } as never,
      { startTyping: jest.fn(), stopTyping: jest.fn() } as never,
    );
    const client = {
      id: 'socket-1',
      handshake: { headers: {}, auth: {} },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    } as never;

    await gateway.handleConnection(client);

    expect((client as { join: jest.Mock }).join).not.toHaveBeenCalled();
    expect((client as { disconnect: jest.Mock }).disconnect).toHaveBeenCalledWith(
      true,
    );
  });

  it('keeps role permissions bounded and adds no realtime permissions', async () => {
    await expect(rolePermissionCodes('parent')).resolves.toEqual(
      expect.not.arrayContaining(['dismissal.requests.view']),
    );
    const parentPermissions = await rolePermissionCodes('parent');
    expect(parentPermissions.some((code) => code.startsWith('dismissal.'))).toBe(
      false,
    );

    const dismissalStaffPermissions =
      await rolePermissionCodes('dismissal_staff');
    expect(dismissalStaffPermissions).toEqual(
      expect.arrayContaining([
        'dismissal.requests.view',
        'dismissal.notifications.view',
      ]),
    );
    expect(
      dismissalStaffPermissions.some((code) =>
        code.startsWith('parent.smart_pickup.'),
      ),
    ).toBe(false);

    for (const roleKey of ['teacher', 'student']) {
      const permissions = await rolePermissionCodes(roleKey);
      expect(permissions.some((code) => code.startsWith('dismissal.'))).toBe(
        false,
      );
    }

    const realtimePermissions = await prisma.permission.findMany({
      where: { code: { contains: 'realtime' } },
      select: { code: true },
    });
    expect(realtimePermissions).toEqual([]);
  });

  it('does not add forbidden device-token surface or root realtime/rest routes', async () => {
    expect(Object.values(AppDeviceTokenSurface)).not.toContain(
      'DISMISSAL_STAFF',
    );

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/notifications`)
      .expect(404);
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/pickup`).expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/waiting-students`)
      .expect(404);
  });

  it('publishes request and notification events only to recipient user rooms', async () => {
    const requestRecord = {
      id: 'request-1',
      status: DismissalRequestStatus.REQUESTED,
      requestedById: 'parent-1',
      gateId: 'gate-1',
      student: {
        id: 'student-1',
        firstName: 'Safe',
        lastName: 'Student',
      },
      enrollment: {
        classroomId: 'classroom-1',
        classroom: {
          id: 'classroom-1',
          nameAr: null,
          nameEn: 'Classroom 1',
          sectionId: 'section-1',
          section: {
            id: 'section-1',
            nameAr: null,
            nameEn: 'Section 1',
            gradeId: 'grade-1',
            grade: {
              id: 'grade-1',
              nameAr: null,
              nameEn: 'Grade 1',
              stageId: 'stage-1',
              stage: {
                id: 'stage-1',
                nameAr: null,
                nameEn: 'Stage 1',
              },
            },
          },
        },
      },
      gate: {
        id: 'gate-1',
        code: 'GATE-1',
        name: 'Gate 1',
      },
    };
    const repository = {
      findRequest: jest.fn().mockResolvedValue(requestRecord),
      listMatchingStaffRecipientIds: jest.fn().mockResolvedValue(['staff-1']),
      findParentCancelPolicy: jest
        .fn()
        .mockResolvedValue({ allowParentCancelBeforeCalled: true }),
      listStaffNotificationsForRequestEvent: jest.fn().mockResolvedValue([
        {
          id: 'notification-1',
          recipientUserId: 'staff-1',
          type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
          title: 'New pickup request',
          body: 'Safe body',
          readAt: null,
          createdAt: new Date('2026-07-05T10:00:00.000Z'),
        },
      ]),
    };
    const publisher = {
      publishToUser: jest.fn().mockReturnValue(true),
      publishToSchool: jest.fn().mockReturnValue(true),
    };
    const service = new DismissalRealtimeEventsService(
      repository as never,
      publisher as never,
    );

    await service.publishRequestCreated({
      schoolId: 'school-1',
      requestId: 'request-1',
    });

    expect(publisher.publishToSchool).not.toHaveBeenCalled();
    expect(publisher.publishToUser.mock.calls).toEqual(
      expect.arrayContaining([
        [
          'school-1',
          'staff-1',
          REALTIME_SERVER_EVENTS.DISMISSAL_REQUEST_CREATED,
          expect.objectContaining({ request: { id: 'request-1', status: 'requested', previousStatus: null } }),
        ],
        [
          'school-1',
          'staff-1',
          REALTIME_SERVER_EVENTS.DISMISSAL_QUEUE_CHANGED,
          expect.objectContaining({ reason: 'request_created' }),
        ],
        [
          'school-1',
          'parent-1',
          REALTIME_SERVER_EVENTS.PARENT_SMART_PICKUP_REQUEST_CHANGED,
          expect.objectContaining({
            request: { id: 'request-1', status: 'requested', canCancel: true },
          }),
        ],
        [
          'school-1',
          'staff-1',
          REALTIME_SERVER_EVENTS.DISMISSAL_NOTIFICATION_CREATED,
          expect.objectContaining({
            notification: {
              id: 'notification-1',
              type: 'dismissal_request_created',
              title: 'New pickup request',
              body: 'Safe body',
              readAt: null,
            },
          }),
        ],
      ]),
    );
    expect(
      publisher.publishToUser.mock.calls.some(
        ([, userId]) => userId === 'staff-2' || userId === 'parent-2',
      ),
    ).toBe(false);
    expectNoForbiddenRealtimePayload(publisher.publishToUser.mock.calls);
  });

  async function rolePermissionCodes(roleKey: string): Promise<string[]> {
    const role = await prisma.role.findFirst({
      where: { key: roleKey, schoolId: null, isSystem: true },
      select: {
        rolePermissions: {
          select: {
            permission: {
              select: { code: true },
            },
          },
        },
      },
    });
    if (!role) throw new Error(`${roleKey} system role not found - run seed.`);
    return role.rolePermissions.map((item) => item.permission.code).sort();
  }
});

function expectNoForbiddenRealtimePayload(calls: unknown[][]): void {
  const json = JSON.stringify(calls.map((call) => call[3]));
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'guardianId',
    'requestedById',
    'actorUserId',
    'staffUserId',
    'handedOverById',
    'assignmentId',
    'pickupCode',
    'pickupCodeHash',
    'pickupCodeSalt',
    'parentLatitude',
    'parentLongitude',
    'distanceMeters',
    'geofencePassed',
    'clientRequestId',
    'roomName',
    'socketId',
  ]) {
    expect(json).not.toContain(`"${forbidden}"`);
  }
}
