import type { AddressInfo } from 'node:net';
import {
  closeManagementProbeServer,
  createManagementProbeServer,
  listenManagementProbeServer,
} from './management-probe.server';

describe('management probe HTTP server', () => {
  const servers: ReturnType<typeof createManagementProbeServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => closeManagementProbeServer(server)),
    );
  });

  it('serves all role probe paths with safe headers and bounded fields', async () => {
    const evaluate = jest.fn().mockResolvedValue({
      statusCode: 200,
      response: {
        status: 'ok',
        version: '0.0.1',
        timestamp: '2026-07-29T00:00:00.000Z',
      },
    });
    const { origin } = await start({ evaluate });

    for (const role of ['api', 'core-worker', 'media-worker']) {
      for (const kind of ['startup', 'liveness', 'readiness']) {
        const response = await fetch(
          `${origin}/internal/probes/${role}/${kind}`,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/json');
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({
          status: 'ok',
          version: '0.0.1',
          timestamp: '2026-07-29T00:00:00.000Z',
        });
      }
    }
    expect(evaluate).toHaveBeenCalledTimes(9);
  });

  it('binds the management listener on all container interfaces by default', async () => {
    const server = createManagementProbeServer({
      evaluate: jest.fn(),
    });
    servers.push(server);

    await listenManagementProbeServer(server, 0);

    expect((server.address() as AddressInfo).address).toBe('0.0.0.0');
  });

  it('returns 404 for unknown paths and query-bearing variants', async () => {
    const { origin } = await start({
      evaluate: jest.fn(),
    });

    for (const path of [
      '/unknown',
      '/internal/probes/api/unknown',
      '/internal/probes/unknown/readiness',
      '/internal/probes/api/readiness?details=true',
    ]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        status: 'not_found',
        version: '0.0.1',
        timestamp: expect.any(String),
      });
    }
  });

  it('returns 405 with Allow GET and never evaluates an unsupported method', async () => {
    const evaluate = jest.fn();
    const { origin } = await start({ evaluate });

    const response = await fetch(`${origin}/internal/probes/api/readiness`, {
      method: 'POST',
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('sanitizes an unexpected evaluator failure', async () => {
    const secret = 'redis://user:password@internal:6379';
    const { origin } = await start({
      evaluate: jest.fn().mockRejectedValue(new Error(secret)),
    });

    const response = await fetch(`${origin}/internal/probes/api/readiness`);
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(body).not.toContain(secret);
    expect(body).not.toContain('redis');
  });

  async function start(probes: {
    evaluate: jest.Mock;
  }): Promise<{ origin: string }> {
    const server = createManagementProbeServer(probes);
    servers.push(server);
    await listenManagementProbeServer(server, 0, '127.0.0.1');
    const address = server.address() as AddressInfo;
    return { origin: `http://127.0.0.1:${address.port}` };
  }
});
