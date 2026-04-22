import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import {
  createRequestContext,
  runWithRequestContext,
} from './request-context';

const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inboundId = req.header(REQUEST_ID_HEADER);
    const context = createRequestContext(
      inboundId && inboundId.length > 0 ? inboundId : undefined,
    );

    res.setHeader(REQUEST_ID_HEADER, context.requestId);

    runWithRequestContext(context, () => next());
  }
}
