import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { RealtimeCommunicationAccessService } from '../realtime-communication-access.service';
import { REALTIME_SERVER_EVENTS } from '../realtime-event-names';
import { RealtimePublisherService } from '../realtime-publisher.service';
import {
  RealtimeStateStoreService,
  RealtimeTypingUser,
} from '../realtime-state-store.service';
import { RealtimeTypingService } from '../realtime-typing.service';

describe('RealtimeTypingService', () => {
  it('validates conversation access before typing start', async () => {
    const stateStore = stateStoreMock();
    const service = new RealtimeTypingService(
      stateStore,
      accessServiceMock({
        canJoinConversationRoom: jest.fn().mockResolvedValue(false),
      }),
      publisherMock(),
    );

    await expect(service.startTyping(commandInput())).rejects.toThrow();
    expect(stateStore.setTyping).not.toHaveBeenCalled();
  });

  it('validates conversation access before typing stop', async () => {
    const stateStore = stateStoreMock();
    const service = new RealtimeTypingService(
      stateStore,
      accessServiceMock({
        canJoinConversationRoom: jest.fn().mockResolvedValue(false),
      }),
      publisherMock(),
    );

    await expect(service.stopTyping(commandInput())).rejects.toThrow();
    expect(stateStore.clearTyping).not.toHaveBeenCalled();
  });

  it('publishes typing start to the expected conversation room', async () => {
    const stateStore = stateStoreMock({
      setTyping: jest.fn().mockResolvedValue({
        userId: 'user-1',
        startedAt: '2026-05-03T10:00:00.000Z',
        expiresAt: '2026-05-03T10:00:08.000Z',
      }),
    });
    const publisher = publisherMock();
    const service = new RealtimeTypingService(
      stateStore,
      accessServiceMock(),
      publisher,
    );

    const payload = await service.startTyping(commandInput());

    expect(payload).toEqual({
      conversationId: 'conversation-1',
      userId: 'user-1',
      startedAt: '2026-05-03T10:00:00.000Z',
      expiresAt: '2026-05-03T10:00:08.000Z',
    });
    expect(payload).not.toHaveProperty('schoolId');
    expect(payload).not.toHaveProperty('body');
    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      'school-1',
      'conversation-1',
      REALTIME_SERVER_EVENTS.COMMUNICATION_TYPING_STARTED,
      payload,
    );
  });

  it('publishes typing stop to the expected conversation room', async () => {
    jest.useFakeTimers({
      now: new Date('2026-05-03T10:00:10.000Z'),
    });
    const publisher = publisherMock();
    const service = new RealtimeTypingService(
      stateStoreMock(),
      accessServiceMock(),
      publisher,
    );

    const payload = await service.stopTyping(commandInput());

    expect(payload).toEqual({
      conversationId: 'conversation-1',
      userId: 'user-1',
      stoppedAt: '2026-05-03T10:00:10.000Z',
    });
    expect(payload).not.toHaveProperty('schoolId');
    expect(payload).not.toHaveProperty('body');
    expect(publisher.publishToConversation).toHaveBeenCalledWith(
      'school-1',
      'conversation-1',
      REALTIME_SERVER_EVENTS.COMMUNICATION_TYPING_STOPPED,
      payload,
    );
    jest.useRealTimers();
  });
});

describe('RealtimeStateStoreService typing TTL', () => {
  let warnSpy: jest.SpyInstance;
  let store: RealtimeStateStoreService;

  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date('2026-05-03T10:00:00.000Z'),
    });
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    store = new RealtimeStateStoreService(configServiceMock());
  });

  afterEach(async () => {
    await store.onModuleDestroy();
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  it('expires typing users through the state-store TTL', async () => {
    await store.setTyping('school-1', 'conversation-1', 'user-1', 1);

    await expect(
      store.getTypingUsers('school-1', 'conversation-1'),
    ).resolves.toEqual([
      {
        userId: 'user-1',
        startedAt: '2026-05-03T10:00:00.000Z',
        expiresAt: '2026-05-03T10:00:01.000Z',
      },
    ]);

    jest.setSystemTime(new Date('2026-05-03T10:00:02.000Z'));

    await expect(
      store.getTypingUsers('school-1', 'conversation-1'),
    ).resolves.toEqual([]);
  });
});

function commandInput() {
  return {
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    userId: 'user-1',
    permissions: ['communication.messages.view'],
  };
}

function stateStoreMock(
  overrides?: Partial<jest.Mocked<RealtimeStateStoreService>>,
): jest.Mocked<RealtimeStateStoreService> {
  return {
    incrementPresence: jest.fn(),
    decrementPresence: jest.fn(),
    refreshPresence: jest.fn(),
    getPresenceSnapshot: jest.fn(),
    setTyping: jest.fn().mockResolvedValue({
      userId: 'user-1',
      startedAt: '2026-05-03T10:00:00.000Z',
      expiresAt: '2026-05-03T10:00:08.000Z',
    } satisfies RealtimeTypingUser),
    clearTyping: jest.fn().mockResolvedValue(undefined),
    getTypingUsers: jest.fn(),
    onModuleDestroy: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as jest.Mocked<RealtimeStateStoreService>;
}

function accessServiceMock(
  overrides?: Partial<jest.Mocked<RealtimeCommunicationAccessService>>,
): jest.Mocked<RealtimeCommunicationAccessService> {
  return {
    canJoinConversationRoom: jest.fn().mockResolvedValue(true),
    isOnlinePresenceEnabled: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as jest.Mocked<RealtimeCommunicationAccessService>;
}

function publisherMock(): jest.Mocked<RealtimePublisherService> {
  return {
    bindServer: jest.fn(),
    publishToSchool: jest.fn(),
    publishToUser: jest.fn(),
    publishToConversation: jest.fn().mockReturnValue(true),
  } as unknown as jest.Mocked<RealtimePublisherService>;
}

function configServiceMock(): ConfigService {
  return {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
}
