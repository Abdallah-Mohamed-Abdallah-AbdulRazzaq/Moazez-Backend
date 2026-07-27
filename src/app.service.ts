import { Injectable } from '@nestjs/common';
import {
  APPLICATION_IDENTITY,
  type ApplicationIdentity,
} from './bootstrap/application-metadata';

@Injectable()
export class AppService {
  getIdentity(): ApplicationIdentity {
    return APPLICATION_IDENTITY;
  }
}
