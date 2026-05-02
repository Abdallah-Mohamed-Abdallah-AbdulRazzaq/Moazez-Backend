import type { Server } from 'socket.io';
import { Logger } from '@nestjs/common';
import { REALTIME_SERVER_EVENTS } from '../realtime-event-names';
import { RealtimePublisherService } from '../realtime-publisher.service';

describe('RealtimePublisherService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns false when the Socket.io server is not bound yet', () => {
    const service = new RealtimePublisherService();

    expect(
      service.publishToSchool(
        'school-1',
        REALTIME_SERVER_EVENTS.COMMUNICATION_NOTIFICATION_CREATED,
        { ok: true },
      ),
    ).toBe(false);
  });

  it('publishes to the school room', () => {
    const { service, emit, to } = createBoundPublisher();
    const payload = { id: 'notification-1' };

    expect(
      service.publishToSchool(
        'school-1',
        REALTIME_SERVER_EVENTS.COMMUNICATION_NOTIFICATION_CREATED,
        payload,
      ),
    ).toBe(true);
    expect(to).toHaveBeenCalledWith('school:school-1');
    expect(emit).toHaveBeenCalledWith(
      'communication.notification.created',
      payload,
    );
  });

  it('publishes to the user room', () => {
    const { service, emit, to } = createBoundPublisher();

    service.publishToUser(
      'school-1',
      'user-1',
      REALTIME_SERVER_EVENTS.COMMUNICATION_NOTIFICATION_READ,
      { read: true },
    );

    expect(to).toHaveBeenCalledWith('school:school-1:user:user-1');
    expect(emit).toHaveBeenCalledWith('communication.notification.read', {
      read: true,
    });
  });

  it('publishes to the conversation room', () => {
    const { service, emit, to } = createBoundPublisher();

    service.publishToConversation(
      'school-1',
      'conversation-1',
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_CREATED,
      { messageId: 'message-1' },
    );

    expect(to).toHaveBeenCalledWith(
      'school:school-1:conversation:conversation-1',
    );
    expect(emit).toHaveBeenCalledWith('communication.chat.message.created', {
      messageId: 'message-1',
    });
  });

  it('rejects empty event names', () => {
    const { service } = createBoundPublisher();

    expect(() => service.publishToSchool('school-1', ' ', {})).toThrow(
      'eventName is required',
    );
  });

  it('returns false when Socket.io delivery fails', () => {
    const service = new RealtimePublisherService();
    const to = jest.fn(() => {
      throw new Error('socket adapter unavailable');
    });
    service.bindServer({ to } as unknown as Server);

    expect(
      service.publishToConversation(
        'school-1',
        'conversation-1',
        REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_CREATED,
        { messageId: 'message-1' },
      ),
    ).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('communication.chat.message.created'),
    );
  });
});

function createBoundPublisher(): {
  service: RealtimePublisherService;
  emit: jest.Mock;
  to: jest.Mock;
} {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const service = new RealtimePublisherService();
  service.bindServer({ to } as unknown as Server);

  return { service, emit, to };
}
