import type { Request, Response } from 'express';

export interface HttpRequestWorkLease {
  release(): void;
}

const HTTP_WORK_LEASE = Symbol('httpWorkLease');

type LifecycleTrackedRequest = Request & {
  [HTTP_WORK_LEASE]?: HttpRequestWorkLease;
};

export class HttpShutdownAdmissionRejectedError extends Error {
  constructor() {
    super('http_shutdown_admission_rejected');
    this.name = HttpShutdownAdmissionRejectedError.name;
  }
}

export function attachHttpRequestWorkLease(
  request: Request,
  lease: HttpRequestWorkLease,
): void {
  (request as LifecycleTrackedRequest)[HTTP_WORK_LEASE] = lease;
}

export function releaseHttpRequestWorkLease(request: Request): void {
  const trackedRequest = request as LifecycleTrackedRequest;
  const lease = trackedRequest[HTTP_WORK_LEASE];
  if (!lease) return;

  delete trackedRequest[HTTP_WORK_LEASE];
  lease.release();
}

export function sendHttpShutdownResponse(response: Response): void {
  response.statusCode = 503;
  response.setHeader('connection', 'close');
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(
    JSON.stringify({
      statusCode: 503,
      message: 'Service unavailable',
    }),
  );
}
