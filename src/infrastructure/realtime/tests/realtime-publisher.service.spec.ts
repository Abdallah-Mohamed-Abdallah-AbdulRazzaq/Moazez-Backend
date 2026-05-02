import type { Server } from 'socket.io';
import { REALTIME_SERVER_EVENTS } from '../realtime-event-names';
import { RealtimePublisherService } from '../realtime-publisher.service';

describe('RealtimePublisherService', () => {
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
