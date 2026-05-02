import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UserType } from '@prisma/client';
import { TokenInvalidException } from '../../../modules/iam/auth/domain/auth.exceptions';
import { RealtimeAuthService } from '../realtime-auth.service';
import { RealtimeGateway } from '../realtime.gateway';
import { RealtimePublisherService } from '../realtime-publisher.service';
import type { RealtimeSocket } from '../realtime.types';

describe('RealtimeGateway', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('disconnects unauthenticated sockets without joining tenant rooms', async () => {
    const authService = {
      authenticate: jest.fn().mockRejectedValue(new TokenInvalidException()),
    } as unknown as RealtimeAuthService;
    const gateway = new RealtimeGateway(
      authService,
      publisherMock(),
      configServiceMock(),
    );
    const client = socketMock();

    await gateway.handleConnection(client);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.data).toEqual({});
  });

  it('joins authenticated sockets to school and user baseline rooms', async () => {
    const authenticated = {
      actorId: 'user-1',
      userType: UserType.SCHOOL_USER,
      schoolId: 'school-1',
      organizationId: 'organization-1',
      roleId: 'role-1',
      permissions: ['communication.messages.view'],
      sessionId: 'session-1',
    };
    const authService = {
      authenticate: jest.fn().mockResolvedValue(authenticated),
    } as unknown as RealtimeAuthService;
    const gateway = new RealtimeGateway(
      authService,
      publisherMock(),
      configServiceMock(),
    );
    const client = socketMock();

    await gateway.handleConnection(client);

    expect(client.data).toMatchObject(authenticated);
    expect(client.join).toHaveBeenCalledWith([
      'school:school-1',
      'school:school-1:user:user-1',
    ]);
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});

function socketMock(): RealtimeSocket {
  return {
    id: 'socket-1',
    data: {},
    handshake: {
      auth: {},
      headers: {},
    },
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  } as unknown as RealtimeSocket;
}

function publisherMock(): RealtimePublisherService {
  return {
    bindServer: jest.fn(),
  } as unknown as RealtimePublisherService;
}

function configServiceMock(): ConfigService {
  return {
    get: jest.fn(),
  } as unknown as ConfigService;
}
