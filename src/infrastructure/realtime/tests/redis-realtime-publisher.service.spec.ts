import { Logger } from '@nestjs/common';
import { REALTIME_SERVER_EVENTS } from '../realtime-event-names';
import { RedisRealtimePublisherService } from '../redis-realtime-publisher.service';

describe('RedisRealtimePublisherService', () => {
  it('publishes the existing event and payload to the API namespace user room', () => {
    const redis = redisClient();
    const service = new RedisRealtimePublisherService(redis as never);
    const payload = { id: 'notification-1', createdAt: '2026-08-03T00:00:00Z' };

    expect(
      service.publishToUser(
        'school-1',
        'user-1',
        REALTIME_SERVER_EVENTS.COMMUNICATION_NOTIFICATION_CREATED,
        payload,
      ),
    ).toBe(true);

    expect(redis.publish).toHaveBeenCalledTimes(1);
    const [channel, message] = redis.publish.mock.calls[0];
    expect(channel).toBe(
      'socket.io#/api/v1/realtime#school:school-1:user:user-1#',
    );
    const encoded = message as Buffer;
    expect(encoded.includes(Buffer.from('communication.notification.created'))).toBe(
      true,
    );
    expect(encoded.includes(Buffer.from('notification-1'))).toBe(true);
  });

  it('logs an asynchronous Redis failure without failing persisted work', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const redis = redisClient();
    redis.publish.mockRejectedValueOnce(
      new Error('redis://user:secret@private-host/0 notification-1'),
    );
    const service = new RedisRealtimePublisherService(redis as never);

    expect(
      service.publishToUser(
        'school-1',
        'user-1',
        REALTIME_SERVER_EVENTS.COMMUNICATION_NOTIFICATION_CREATED,
        { id: 'notification-1' },
      ),
    ).toBe(true);
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith({
      event: 'realtime.publish.failed',
      transport: 'redis-emitter',
      stage: 'emit',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('notification-1');
    warn.mockRestore();
  });

  it('checks Redis readiness and closes its owned client once', async () => {
    const redis = redisClient();
    const service = new RedisRealtimePublisherService(redis as never);

    await expect(service.checkReadiness()).resolves.toBeUndefined();
    await service.onModuleDestroy();
    await service.onModuleDestroy();

    expect(redis.ping).toHaveBeenCalledTimes(1);
    expect(redis.quit).toHaveBeenCalledTimes(1);
  });
});

function redisClient() {
  return {
    status: 'ready',
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    publish: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  };
}
