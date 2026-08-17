import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { isIP } from 'node:net';
import type { Env } from '../config/env.validation';

export const TRUSTED_CLIENT_IP_HEADER = 'X-Moazez-Client-IP';

const TRUSTED_CLIENT_IP_HEADER_LOWERCASE =
  TRUSTED_CLIENT_IP_HEADER.toLowerCase();

@Injectable()
export class TrustedClientIpResolver {
  constructor(private readonly config: ConfigService<Env, true>) {}

  resolve(request: Request): string | null {
    if (
      this.config.get('APP_TRUSTED_PROXY_MODE', { infer: true }) ===
      'gcp_external_alb'
    ) {
      const trustedValue = this.readSingleTrustedHeader(request.rawHeaders);
      if (trustedValue !== null) {
        return trustedValue;
      }
    }

    return request.ip ?? null;
  }

  private readSingleTrustedHeader(
    rawHeaders: readonly string[],
  ): string | null {
    let matchedValue: string | null = null;
    let matchCount = 0;

    for (let index = 0; index < rawHeaders.length; index += 2) {
      const name = rawHeaders[index];
      const value = rawHeaders[index + 1];
      if (name === undefined || value === undefined) {
        return null;
      }
      if (name.toLowerCase() !== TRUSTED_CLIENT_IP_HEADER_LOWERCASE) {
        continue;
      }

      matchCount += 1;
      if (matchCount > 1) {
        return null;
      }
      matchedValue = value;
    }

    if (matchCount !== 1 || matchedValue === null) {
      return null;
    }

    const candidate = matchedValue.trim();
    if (candidate.length === 0 || candidate.includes(',')) {
      return null;
    }

    return isIP(candidate) === 0 ? null : candidate;
  }
}
