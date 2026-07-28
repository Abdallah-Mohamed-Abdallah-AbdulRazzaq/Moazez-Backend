import {
  Injectable,
  type CallHandler,
  type CanActivate,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs';
import {
  REQUEST_ID_HEADER,
  resolveCorrelationId,
} from '../common/context/correlation-id';
import {
  attachHttpRequestWorkLease,
  HttpShutdownAdmissionRejectedError,
  releaseHttpRequestWorkLease,
  sendHttpShutdownResponse,
} from '../common/lifecycle/http-request-lifecycle';
import { ApplicationLifecycleState } from './application-lifecycle.state';

export function createHttpDrainMiddleware(
  lifecycle: ApplicationLifecycleState,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    const requestId = resolveCorrelationId(request.headers[REQUEST_ID_HEADER]);
    request.headers[REQUEST_ID_HEADER] = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    if (lifecycle.isDraining()) {
      sendHttpShutdownResponse(response);
      return;
    }

    next();
  };
}

@Injectable()
export class HttpLifecycleAdmissionGuard implements CanActivate {
  constructor(private readonly lifecycle: ApplicationLifecycleState) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const lease = this.lifecycle.tryAdmit('http');
    if (!lease) throw new HttpShutdownAdmissionRejectedError();

    attachHttpRequestWorkLease(request, lease);
    return true;
  }
}

@Injectable()
export class HttpLifecycleCompletionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    try {
      return next
        .handle()
        .pipe(finalize(() => releaseHttpRequestWorkLease(request)));
    } catch (error) {
      releaseHttpRequestWorkLease(request);
      throw error;
    }
  }
}
