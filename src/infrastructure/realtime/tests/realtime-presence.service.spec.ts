import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { REALTIME_SERVER_EVENTS } from '../realtime-event-names';
import { RealtimePresenceService } from '../realtime-presence.service';
import { RealtimePublisherService } from '../realtime-publisher.service';
import { RealtimeStateStoreService } from '../realtime-state-store.service';

describe('RealtimePresenceService', () => {
  let warnSpy: jest.SpyInstance;
  let stateStore: RealtimeStateStoreService;
  let service: RealtimePresenceService;
  let publisher: jest.Mocked<RealtimePublisherService>;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    stateStore = new RealtimeStateStoreService(configServiceMock());
    publisher = publisherMock();
    service = new RealtimePresenceService(stateStore, publisher);
  });

  afterEach(async () => {
    service.onModuleDestroy();
    await stateStore.onModuleDestroy();
    warnSpy.mockRestore();
  });

  it('marks a user online on the first socket and emits a sanitized payload', async () => {
    const payload = await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
    });

    expect(payload).toMatchObject({
      userId: 'user-1',
      status: 'online',
      online: true,
      updatedAt: expect.any(String),
    });
    expect(payload).not.toHaveProperty('schoolId');
    expect(publisher.publishToSchool).toHaveBeenCalledWith(
      'school-1',
      REALTIME_SERVER_EVENTS.COMMUNICATION_PRESENCE_USER_UPDATED,
      payload,
    );
  });

  it('does not emit duplicate online events for additional sockets', async () => {
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
    });
    publisher.publishToSchool.mockClear();

    await expect(
      service.registerSocket({
        schoolId: 'school-1',
        userId: 'user-1',
        socketId: 'socket-2',
      }),
    ).resolves.toBeNull();

    expect(publisher.publishToSchool).not.toHaveBeenCalled();
  });

  it('keeps the user online when one of multiple sockets disconnects', async () => {
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
    });
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-2',
    });
    publisher.publishToSchool.mockClear();

    await expect(
      service.unregisterSocket({
        schoolId: 'school-1',
        userId: 'user-1',
        socketId: 'socket-1',
      }),
    ).resolves.toBeNull();

    await expect(service.getPresenceSnapshot('school-1')).resolves.toEqual([
      {
        userId: 'user-1',
        online: true,
        updatedAt: expect.any(String),
      },
    ]);
    expect(publisher.publishToSchool).not.toHaveBeenCalled();
  });

  it('emits offline only after the last socket disconnects', async () => {
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
    });
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-2',
    });
    await service.unregisterSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
    });
    publisher.publishToSchool.mockClear();

    const payload = await service.unregisterSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-2',
    });

    expect(payload).toMatchObject({
      userId: 'user-1',
      status: 'offline',
      online: false,
      updatedAt: expect.any(String),
    });
    expect(payload).not.toHaveProperty('schoolId');
    expect(publisher.publishToSchool).toHaveBeenCalledWith(
      'school-1',
      REALTIME_SERVER_EVENTS.COMMUNICATION_PRESENCE_USER_UPDATED,
      payload,
    );
  });

  it('scopes presence state by school id', async () => {
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
    });
    await service.registerSocket({
      schoolId: 'school-2',
      userId: 'user-1',
      socketId: 'socket-2',
    });
    await service.unregisterSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
    });

    await expect(service.getPresenceSnapshot('school-1')).resolves.toEqual([]);
    await expect(service.getPresenceSnapshot('school-2')).resolves.toEqual([
      {
        userId: 'user-1',
        online: true,
        updatedAt: expect.any(String),
      },
    ]);
  });

  it('falls back safely to in-memory state when Redis is unavailable', async () => {
    await expect(
      service.registerSocket({
        schoolId: 'school-1',
        userId: 'user-1',
        socketId: 'socket-1',
      }),
    ).resolves.toMatchObject({
      userId: 'user-1',
      online: true,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      'Realtime state Redis unavailable; using in-memory presence and typing state.',
    );
  });
});

function configServiceMock(): ConfigService {
  return {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
}

function publisherMock(): jest.Mocked<RealtimePublisherService> {
  return {
    bindServer: jest.fn(),
    publishToSchool: jest.fn().mockReturnValue(true),
    publishToUser: jest.fn(),
    publishToConversation: jest.fn(),
  } as unknown as jest.Mocked<RealtimePublisherService>;
}
