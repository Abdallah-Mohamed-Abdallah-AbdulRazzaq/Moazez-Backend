import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { REALTIME_SERVER_EVENTS } from '../realtime-event-names';
import { RealtimeCommunicationAccessService } from '../realtime-communication-access.service';
import { RealtimePresenceService } from '../realtime-presence.service';
import { RealtimePublisherService } from '../realtime-publisher.service';
import { RealtimeStateStoreService } from '../realtime-state-store.service';

describe('RealtimePresenceService', () => {
  let warnSpy: jest.SpyInstance;
  let stateStore: RealtimeStateStoreService;
  let service: RealtimePresenceService;
  let publisher: jest.Mocked<RealtimePublisherService>;
  let accessService: jest.Mocked<RealtimeCommunicationAccessService>;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    stateStore = new RealtimeStateStoreService(configServiceMock());
    publisher = publisherMock();
    accessService = accessServiceMock();
    service = new RealtimePresenceService(stateStore, publisher, accessService);
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
      actor: actorCard(),
    });

    expect(payload).toMatchObject({
      userId: 'user-1',
      status: 'online',
      online: true,
      updatedAt: expect.any(String),
      actor: {
        displayName: 'Test Teacher',
        userType: 'teacher',
        avatarUrl: null,
      },
    });
    expect(payload).not.toHaveProperty('schoolId');
    expect(payload).not.toHaveProperty('lastSeen');
    expect(JSON.stringify(payload)).not.toContain('membershipId');
    expect(
      accessService.listPresenceConversationIdsForActor,
    ).toHaveBeenCalledWith({
      actorId: 'user-1',
    });
    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      'school-1',
      'conversation-1',
      REALTIME_SERVER_EVENTS.COMMUNICATION_PRESENCE_USER_UPDATED,
      payload,
    );
    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      'school-1',
      'conversation-2',
      REALTIME_SERVER_EVENTS.COMMUNICATION_PRESENCE_USER_UPDATED,
      payload,
    );
    expect(publisher.publishToSchool).not.toHaveBeenCalled();
  });

  it('does not emit duplicate online events for additional sockets', async () => {
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
      actor: actorCard(),
    });
    publisher.publishToConversation.mockClear();

    await expect(
      service.registerSocket({
        schoolId: 'school-1',
        userId: 'user-1',
        socketId: 'socket-2',
        actor: actorCard(),
      }),
    ).resolves.toBeNull();

    expect(publisher.publishToConversation).not.toHaveBeenCalled();
    expect(publisher.publishToSchool).not.toHaveBeenCalled();
  });

  it('keeps the user online when one of multiple sockets disconnects', async () => {
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
      actor: actorCard(),
    });
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-2',
      actor: actorCard(),
    });
    publisher.publishToConversation.mockClear();

    await expect(
      service.unregisterSocket({
        schoolId: 'school-1',
        userId: 'user-1',
        socketId: 'socket-1',
        actor: actorCard(),
      }),
    ).resolves.toBeNull();

    await expect(service.getPresenceSnapshot('school-1')).resolves.toEqual([
      {
        userId: 'user-1',
        online: true,
        updatedAt: expect.any(String),
      },
    ]);
    expect(publisher.publishToConversation).not.toHaveBeenCalled();
    expect(publisher.publishToSchool).not.toHaveBeenCalled();
  });

  it('emits offline only after the last socket disconnects', async () => {
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
      actor: actorCard(),
    });
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-2',
      actor: actorCard(),
    });
    await service.unregisterSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
      actor: actorCard(),
    });
    publisher.publishToConversation.mockClear();

    const payload = await service.unregisterSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-2',
      actor: actorCard(),
    });

    expect(payload).toMatchObject({
      userId: 'user-1',
      status: 'offline',
      online: false,
      updatedAt: expect.any(String),
      actor: {
        displayName: 'Test Teacher',
        userType: 'teacher',
        avatarUrl: null,
      },
    });
    expect(payload).not.toHaveProperty('schoolId');
    expect(payload).not.toHaveProperty('lastSeen');
    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      'school-1',
      'conversation-1',
      REALTIME_SERVER_EVENTS.COMMUNICATION_PRESENCE_USER_UPDATED,
      payload,
    );
    expect(publisher.publishToSchool).not.toHaveBeenCalled();
  });

  it('returns the safe payload without publishing when no active shared conversations exist', async () => {
    accessService.listPresenceConversationIdsForActor.mockResolvedValue([]);

    const payload = await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
      actor: actorCard(),
    });

    expect(payload).toMatchObject({
      userId: 'user-1',
      online: true,
      actor: actorCard(),
    });
    expect(publisher.publishToConversation).not.toHaveBeenCalled();
    expect(publisher.publishToSchool).not.toHaveBeenCalled();
  });

  it('scopes presence state by school id', async () => {
    await service.registerSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
      actor: actorCard(),
    });
    await service.registerSocket({
      schoolId: 'school-2',
      userId: 'user-1',
      socketId: 'socket-2',
      actor: actorCard(),
    });
    await service.unregisterSocket({
      schoolId: 'school-1',
      userId: 'user-1',
      socketId: 'socket-1',
      actor: actorCard(),
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
        actor: actorCard(),
      }),
    ).resolves.toMatchObject({
      userId: 'user-1',
      online: true,
      actor: actorCard(),
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
    publishToConversation: jest.fn().mockReturnValue(true),
  } as unknown as jest.Mocked<RealtimePublisherService>;
}

function accessServiceMock(): jest.Mocked<RealtimeCommunicationAccessService> {
  return {
    canJoinConversationRoom: jest.fn(),
    isOnlinePresenceEnabled: jest.fn(),
    listPresenceConversationIdsForActor: jest
      .fn()
      .mockResolvedValue(['conversation-1', 'conversation-2']),
  } as unknown as jest.Mocked<RealtimeCommunicationAccessService>;
}

function actorCard() {
  return {
    displayName: 'Test Teacher',
    userType: 'teacher' as const,
    avatarUrl: null,
  };
}
