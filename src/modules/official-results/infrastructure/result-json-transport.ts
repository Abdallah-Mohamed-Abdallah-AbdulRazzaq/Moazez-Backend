import type { INestApplication } from '@nestjs/common';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { json, type NextFunction, type Request, type Response } from 'express';

const limit = 4 * 1024 * 1024;

// Install before Nest's default JSON parser so large approved selections reach validation.
export function registerOfficialResultsJson(app: INestApplication) {
  const parse = json({ limit });
  app.use(
    ['/api/v1/official-results', '/api/v1/teacher/official-results'],
    (request: Request, response: Response, next: NextFunction) => {
      parse(request, response, (error?: { status?: number }) => {
        if (error?.status === 413) next(new PayloadTooLargeException());
        else if (error)
          next(new BadRequestException('Malformed Official Results JSON body'));
        else next();
      });
    },
  );
}
