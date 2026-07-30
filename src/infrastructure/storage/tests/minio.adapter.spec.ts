import { ConfigService } from '@nestjs/config';
import {
  createServer,
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { Readable } from 'node:stream';
import {
  MinioAdapter,
  STORAGE_READINESS_REQUEST_TIMEOUT_MS,
} from '../minio.adapter';

describe('MinioAdapter bounded object listing', () => {
  it('stops after one look-ahead item and returns a continuation key', async () => {
    const adapter = createAdapter([
      object('schools/a'),
      object('schools/b'),
      object('schools/c'),
      object('schools/d'),
    ]);

    await expect(
      adapter.listObjectsPage({
        bucket: 'private-bucket',
        prefix: 'schools/',
        startAfter: 'schools/previous',
        limit: 2,
      }),
    ).resolves.toEqual({
      objects: [resultObject('schools/a'), resultObject('schools/b')],
      nextStartAfter: 'schools/b',
    });

    expect(clientOf(adapter).listObjectsV2).toHaveBeenCalledWith(
      'private-bucket',
      'schools/',
      true,
      'schools/previous',
    );
  });

  it('returns no continuation when the listing ends within the bound', async () => {
    const adapter = createAdapter([object('schools/a')]);

    await expect(
      adapter.listObjectsPage({
        bucket: 'private-bucket',
        prefix: 'schools/',
        limit: 100,
      }),
    ).resolves.toEqual({
      objects: [resultObject('schools/a')],
      nextStartAfter: null,
    });
  });
});

describe('MinioAdapter readiness transport', () => {
  it('keeps product and readiness bucket checks on distinct clients', async () => {
    const adapter = createAdapter([]);
    const { client, readinessClient } = clientsOf(adapter);
    client.bucketExists = jest.fn().mockResolvedValue(true);
    readinessClient.bucketExists = jest.fn().mockResolvedValue(true);

    await expect(adapter.bucketExists('product-bucket')).resolves.toBe(true);
    expect(client.bucketExists).toHaveBeenCalledWith('product-bucket');
    expect(readinessClient.bucketExists).not.toHaveBeenCalled();

    await expect(
      adapter.bucketExistsForReadiness('readiness-bucket'),
    ).resolves.toBe(true);
    expect(readinessClient.bucketExists).toHaveBeenCalledWith(
      'readiness-bucket',
    );
    expect(client.bucketExists).toHaveBeenCalledTimes(1);

    expect(client).not.toBe(readinessClient);
    expect(client.transport.request).toBe(httpRequest);
    expect(readinessClient.transport.request).not.toBe(httpRequest);
    expect(client.transportAgent).not.toBe(readinessClient.transportAgent);
    expect(readinessClient.transportAgent).toMatchObject({
      keepAlive: false,
      maxSockets: 2,
      maxTotalSockets: 2,
    });
  });

  it('destroys a half-open readiness request and recovers on the same endpoint', async () => {
    const sockets = new Set<Socket>();
    let closeCount = 0;
    let requestCount = 0;
    let mode: 'hang' | 'ready' = 'hang';
    const server = createServer((request, response) => {
      requestCount += 1;
      if (mode === 'hang') return;
      respondAsMinio(request.method ?? 'GET', request.url ?? '/', response);
    });
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => {
        closeCount += 1;
        sockets.delete(socket);
      });
    });

    try {
      await listen(server);
      const port = (server.address() as AddressInfo).port;
      const adapter = createAdapter([], `http://127.0.0.1:${port}`);
      const { readinessClient } = clientsOf(adapter);
      const originalRequest = readinessClient.transport.request;
      const clientRequests: ClientRequest[] = [];
      readinessClient.transport.request = ((
        options: RequestOptions,
        callback?: (response: IncomingMessage) => void,
      ): ClientRequest => {
        const clientRequest = originalRequest(options, callback);
        clientRequests.push(clientRequest);
        return clientRequest;
      }) as typeof httpRequest;
      const startedAt = Date.now();

      await expect(
        adapter.bucketExistsForReadiness('private-bucket'),
      ).rejects.toMatchObject({
        code: 'storage_readiness_timeout',
      });

      const elapsedMs = Date.now() - startedAt;
      expect(elapsedMs).toBeGreaterThanOrEqual(450);
      expect(elapsedMs).toBeLessThan(750);
      expect(elapsedMs).toBeGreaterThanOrEqual(
        STORAGE_READINESS_REQUEST_TIMEOUT_MS - 50,
      );
      await waitFor(() => sockets.size === 0);
      expect(closeCount).toBeGreaterThan(0);
      expect(sockets.size).toBe(0);
      expect(clientRequests).not.toHaveLength(0);
      expect(clientRequests.every((request) => request.destroyed)).toBe(true);
      expect(
        clientRequests.every((request) => request.socket?.destroyed === true),
      ).toBe(true);

      const requestCountAfterOutage = requestCount;
      mode = 'ready';

      await expect(
        adapter.bucketExistsForReadiness('private-bucket'),
      ).resolves.toBe(true);

      expect(requestCount).toBeGreaterThan(requestCountAfterOutage);
      await waitFor(() => sockets.size === 0);
      expect(sockets.size).toBe(0);
      process.stdout.write(
        `${JSON.stringify({
          event: 'storage.readiness.half_open_recovery',
          timeoutElapsedMs: elapsedMs,
          observedClosedConnections: closeCount,
          remainingOpenSockets: sockets.size,
          sameAdapter: true,
          sameEndpoint: true,
        })}\n`,
      );
    } finally {
      for (const socket of sockets) socket.destroy();
      await closeServer(server);
    }
  });
});

function createAdapter(
  items: ReturnType<typeof object>[],
  endpoint = 'http://127.0.0.1:9000',
): MinioAdapter {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        STORAGE_ENDPOINT: endpoint,
        STORAGE_ACCESS_KEY: 'test-access-key',
        STORAGE_SECRET_KEY: 'test-secret-key',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const adapter = new MinioAdapter(config);
  clientOf(adapter).listObjectsV2 = jest.fn(() =>
    Readable.from(items, { objectMode: true }),
  );
  return adapter;
}

function clientOf(adapter: MinioAdapter) {
  return (
    adapter as unknown as {
      client: { listObjectsV2: jest.Mock };
    }
  ).client;
}

function clientsOf(adapter: MinioAdapter) {
  return adapter as unknown as {
    client: {
      bucketExists: jest.Mock;
      listObjectsV2: jest.Mock;
      transport: { request: typeof httpRequest };
      transportAgent: {
        keepAlive: boolean;
        maxSockets: number;
        maxTotalSockets: number;
      };
    };
    readinessClient: {
      bucketExists: jest.Mock;
      transport: { request: typeof httpRequest };
      transportAgent: {
        keepAlive: boolean;
        maxSockets: number;
        maxTotalSockets: number;
      };
    };
  };
}

function respondAsMinio(
  method: string,
  url: string,
  response: ServerResponse,
): void {
  response.setHeader('Connection', 'close');
  if (
    method === 'GET' &&
    new URL(url, 'http://localhost').searchParams.has('location')
  ) {
    response.writeHead(200, { 'Content-Type': 'application/xml' });
    response.end(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
        'us-east-1</LocationConstraint>',
    );
    return;
  }
  if (method === 'HEAD') {
    response.writeHead(200);
    response.end();
    return;
  }
  response.writeHead(404);
  response.end();
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('condition_not_met_before_deadline');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function object(objectKey: string) {
  return {
    name: objectKey,
    objectKey,
    size: 10,
    lastModified: new Date('2026-07-16T00:00:00.000Z'),
  };
}

function resultObject(objectKey: string) {
  return {
    objectKey,
    size: 10,
    lastModified: new Date('2026-07-16T00:00:00.000Z'),
  };
}
