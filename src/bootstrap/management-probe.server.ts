import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { APPLICATION_VERSION } from './application-metadata';
import {
  OPERATIONAL_PROBE_KINDS,
  OPERATIONAL_PROBE_ROLES,
  type OperationalProbeKind,
  type OperationalProbeRole,
} from '../modules/health/operational-probe.manifests';
import { OperationalProbeService } from '../modules/health/operational-probe.service';

export const MANAGEMENT_PROBE_HOST = '0.0.0.0';
export const MANAGEMENT_PROBE_PATH_PREFIX = '/internal/probes';

interface ManagementErrorResponse {
  status: 'not_found' | 'method_not_allowed' | 'unavailable';
  version: string;
  timestamp: string;
}

export function createManagementProbeServer(
  probes: Pick<OperationalProbeService, 'evaluate'>,
): Server {
  return createServer((request, response) => {
    void handleManagementRequest(probes, request, response);
  });
}

export function listenManagementProbeServer(
  server: Server,
  port: number,
  host = MANAGEMENT_PROBE_HOST,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export function closeManagementProbeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function handleManagementRequest(
  probes: Pick<OperationalProbeService, 'evaluate'>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setManagementHeaders(response);

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    writeJson(response, 405, errorResponse('method_not_allowed'));
    return;
  }

  const target = parseProbeTarget(request.url);
  if (!target) {
    writeJson(response, 404, errorResponse('not_found'));
    return;
  }

  try {
    const result = await probes.evaluate(target.role, target.kind);
    writeJson(response, result.statusCode, result.response);
  } catch {
    writeJson(response, 503, errorResponse('unavailable'));
  }
}

function parseProbeTarget(
  rawUrl: string | undefined,
): { role: OperationalProbeRole; kind: OperationalProbeKind } | null {
  if (!rawUrl || rawUrl.includes('?') || rawUrl.includes('#')) return null;

  const match = /^\/internal\/probes\/([^/]+)\/([^/]+)$/u.exec(rawUrl);
  if (!match) return null;

  const role = match[1] as OperationalProbeRole;
  const kind = match[2] as OperationalProbeKind;
  if (
    !OPERATIONAL_PROBE_ROLES.includes(role) ||
    !OPERATIONAL_PROBE_KINDS.includes(kind)
  ) {
    return null;
  }

  return { role, kind };
}

function setManagementHeaders(response: ServerResponse): void {
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
}

function errorResponse(
  status: ManagementErrorResponse['status'],
): ManagementErrorResponse {
  return {
    status,
    version: APPLICATION_VERSION,
    timestamp: new Date().toISOString(),
  };
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: object,
): void {
  response.statusCode = statusCode;
  response.end(JSON.stringify(body));
}
