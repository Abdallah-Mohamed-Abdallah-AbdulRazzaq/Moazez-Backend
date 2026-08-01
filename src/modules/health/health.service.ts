import { Injectable } from '@nestjs/common';
import { APPLICATION_VERSION } from '../../bootstrap/application-metadata';

export interface PublicHealthReport {
  status: 'ok';
  version: string;
  timestamp: string;
}

@Injectable()
export class HealthService {
  check(): PublicHealthReport {
    return {
      status: 'ok',
      version: APPLICATION_VERSION,
      timestamp: new Date().toISOString(),
    };
  }
}
