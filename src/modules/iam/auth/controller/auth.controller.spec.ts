import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { TrustedClientIpResolver } from '../../../../bootstrap/trusted-client-ip.resolver';
import type { Env } from '../../../../config/env.validation';
import type { ChangePasswordUseCase } from '../application/change-password.use-case';
import type { LoginUseCase } from '../application/login.use-case';
import type { LogoutUseCase } from '../application/logout.use-case';
import type { MeUseCase } from '../application/me.use-case';
import type { RefreshUseCase } from '../application/refresh.use-case';
import { AuthController } from './auth.controller';

const RESOLVED_CLIENT_IP = '203.0.113.41';

describe('AuthController trusted client IP boundary', () => {
  let loginUseCase: jest.Mocked<Pick<LoginUseCase, 'execute'>>;
  let refreshUseCase: jest.Mocked<Pick<RefreshUseCase, 'execute'>>;
  let controller: AuthController;

  beforeEach(() => {
    loginUseCase = {
      execute: jest.fn().mockResolvedValue({}),
    };
    refreshUseCase = {
      execute: jest.fn().mockResolvedValue({}),
    };

    controller = buildController(
      loginUseCase,
      refreshUseCase,
      resolverReturning(RESOLVED_CLIENT_IP),
    );
  });

  it('passes the centralized resolved value to login persistence', async () => {
    const request = requestFixture({
      ip: '127.0.0.1',
      rawHeaders: ['X-Moazez-Client-IP', '198.51.100.20'],
    });

    await controller.login(
      { email: 'user@example.test', password: 'Password123!' },
      request,
    );

    expect(loginUseCase.execute).toHaveBeenCalledWith({
      email: 'user@example.test',
      password: 'Password123!',
      userAgent: 'jest-agent',
      ipAddress: RESOLVED_CLIENT_IP,
    });
  });

  it('passes the centralized resolved value to refresh persistence', async () => {
    const request = requestFixture({ ip: '127.0.0.1' });

    await controller.refresh({ refreshToken: 'refresh-token' }, request);

    expect(refreshUseCase.execute).toHaveBeenCalledWith({
      refreshToken: 'refresh-token',
      userAgent: 'jest-agent',
      ipAddress: RESOLVED_CLIENT_IP,
    });
  });

  it('does not reject login when a malformed trusted header falls back to the socket IP', async () => {
    const fallbackIp = '::ffff:127.0.0.1';
    const realResolver = new TrustedClientIpResolver(
      configService('gcp_external_alb'),
    );
    controller = buildController(loginUseCase, refreshUseCase, realResolver);
    const request = requestFixture({
      ip: fallbackIp,
      rawHeaders: [
        'X-Moazez-Client-IP',
        'not-an-ip',
        'X-Forwarded-For',
        '198.51.100.99',
      ],
    });

    await expect(
      controller.login(
        { email: 'user@example.test', password: 'Password123!' },
        request,
      ),
    ).resolves.toEqual({});
    expect(loginUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: fallbackIp }),
    );
  });
});

function buildController(
  loginUseCase: jest.Mocked<Pick<LoginUseCase, 'execute'>>,
  refreshUseCase: jest.Mocked<Pick<RefreshUseCase, 'execute'>>,
  trustedClientIpResolver: TrustedClientIpResolver,
): AuthController {
  return new AuthController(
    loginUseCase as LoginUseCase,
    refreshUseCase as RefreshUseCase,
    { execute: jest.fn() } as unknown as MeUseCase,
    { execute: jest.fn() } as unknown as LogoutUseCase,
    { execute: jest.fn() } as unknown as ChangePasswordUseCase,
    trustedClientIpResolver,
  );
}

function resolverReturning(value: string): TrustedClientIpResolver {
  return {
    resolve: jest.fn().mockReturnValue(value),
  } as unknown as TrustedClientIpResolver;
}

function configService(
  mode: Env['APP_TRUSTED_PROXY_MODE'],
): ConfigService<Env, true> {
  return {
    get: jest.fn().mockReturnValue(mode),
  } as unknown as ConfigService<Env, true>;
}

function requestFixture(options: {
  ip: string;
  rawHeaders?: string[];
}): Request {
  return {
    ip: options.ip,
    rawHeaders: options.rawHeaders ?? [],
    header: jest.fn().mockReturnValue('jest-agent'),
  } as unknown as Request;
}
