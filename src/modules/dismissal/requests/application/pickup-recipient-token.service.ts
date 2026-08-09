import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../../../config/env.validation';
import {
  DismissalDeliveryInvalidPickupRecipientException,
  DismissalDeliveryPickupRecipientExpiredException,
} from '../../shared/dismissal.errors';

const PICKUP_RECIPIENT_TOKEN_VERSION = 1;
const PICKUP_RECIPIENT_TOKEN_TTL_SECONDS = 15 * 60;

export interface PickupRecipientTokenPayload {
  v: typeof PICKUP_RECIPIENT_TOKEN_VERSION;
  requestId: string;
  schoolId: string;
  studentId: string;
  studentGuardianId: string;
  guardianId: string;
  issuedAt: number;
}

@Injectable()
export class PickupRecipientTokenService {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  issue(params: {
    requestId: string;
    schoolId: string;
    studentId: string;
    studentGuardianId: string;
    guardianId: string;
    issuedAt?: Date;
  }): string {
    const payload: PickupRecipientTokenPayload = {
      v: PICKUP_RECIPIENT_TOKEN_VERSION,
      requestId: params.requestId,
      schoolId: params.schoolId,
      studentId: params.studentId,
      studentGuardianId: params.studentGuardianId,
      guardianId: params.guardianId,
      issuedAt: Math.floor((params.issuedAt ?? new Date()).getTime() / 1000),
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );
    const signature = this.sign(body);

    return `${body}.${signature}`;
  }

  verify(token: string): PickupRecipientTokenPayload {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra !== undefined) {
      throw new DismissalDeliveryInvalidPickupRecipientException();
    }

    if (!this.signaturesEqual(signature, this.sign(body))) {
      throw new DismissalDeliveryInvalidPickupRecipientException();
    }

    const payload = this.parsePayload(body);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - payload.issuedAt > PICKUP_RECIPIENT_TOKEN_TTL_SECONDS) {
      throw new DismissalDeliveryPickupRecipientExpiredException();
    }

    return payload;
  }

  private parsePayload(body: string): PickupRecipientTokenPayload {
    try {
      const parsed = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as Partial<PickupRecipientTokenPayload>;

      if (
        parsed.v !== PICKUP_RECIPIENT_TOKEN_VERSION ||
        !isNonEmptyString(parsed.requestId) ||
        !isNonEmptyString(parsed.schoolId) ||
        !isNonEmptyString(parsed.studentId) ||
        !isNonEmptyString(parsed.studentGuardianId) ||
        !isNonEmptyString(parsed.guardianId) ||
        !Number.isInteger(parsed.issuedAt)
      ) {
        throw new Error('invalid_payload');
      }

      return parsed as PickupRecipientTokenPayload;
    } catch {
      throw new DismissalDeliveryInvalidPickupRecipientException();
    }
  }

  private sign(body: string): string {
    return createHmac(
      'sha256',
      this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
    )
      .update(body)
      .digest('base64url');
  }

  private signaturesEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');

    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
