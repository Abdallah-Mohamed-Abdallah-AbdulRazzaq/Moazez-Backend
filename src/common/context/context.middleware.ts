import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { REQUEST_ID_HEADER } from './correlation-id';
import { createRequestContext, runWithRequestContext } from './request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const context = createRequestContext(req.headers[REQUEST_ID_HEADER]);

    res.setHeader(REQUEST_ID_HEADER, context.requestId);

    runWithRequestContext(context, () => next());
  }
}
