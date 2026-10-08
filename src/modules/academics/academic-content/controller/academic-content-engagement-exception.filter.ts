import { ArgumentsHost, Catch } from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { GlobalExceptionFilter } from '../../../../common/exceptions/global-exception.filter';

@Catch()
export class AcademicContentEngagementExceptionFilter extends GlobalExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store, private, max-age=0');
    if (
      exception instanceof DomainException &&
      exception.code === 'rate_limit.exceeded'
    ) {
      response.setHeader('Retry-After', '60');
    }
    super.catch(exception, host);
  }
}
