import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../config/env.validation';
import { DismissalDeliveryInvalidPickupRecipientException } from '../../shared/dismissal.errors';
import { PickupRecipientTokenService } from './pickup-recipient-token.service';

const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

describe('PickupRecipientTokenService', () => {
  const service = new PickupRecipientTokenService({
    get: jest.fn(() => 'pickup-recipient-token-test-secret'),
  } as unknown as ConfigService<Env, true>);

  it('issues and verifies a canonical pickup recipient token', () => {
    const token = issueToken(service);

    expect(service.verify(token)).toMatchObject({
      requestId: 'request-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      studentGuardianId: 'student-guardian-1',
      guardianId: 'guardian-1',
    });
  });

  it('rejects a textually different Base64URL signature alias', () => {
    const token = issueToken(service);
    const [body, signature] = token.split('.');
    const aliasedSignature = makeNonCanonicalBase64UrlAlias(signature);

    expect(aliasedSignature).not.toBe(signature);
    expect(Buffer.from(aliasedSignature, 'base64url')).toEqual(
      Buffer.from(signature, 'base64url'),
    );

    expect(() => service.verify(`${body}.${aliasedSignature}`)).toThrow(
      DismissalDeliveryInvalidPickupRecipientException,
    );
    expect(() => service.verify(`${body}.${aliasedSignature}`)).toThrow(
      expect.objectContaining({
        code: 'dismissal.delivery.invalid_pickup_recipient',
      }),
    );
  });
});

function issueToken(service: PickupRecipientTokenService): string {
  return service.issue({
    requestId: 'request-1',
    schoolId: 'school-1',
    studentId: 'student-1',
    studentGuardianId: 'student-guardian-1',
    guardianId: 'guardian-1',
  });
}

function makeNonCanonicalBase64UrlAlias(signature: string): string {
  const lastCharacter = signature.at(-1);
  const lastCharacterIndex = lastCharacter
    ? BASE64URL_ALPHABET.indexOf(lastCharacter)
    : -1;

  if (lastCharacterIndex < 0 || (lastCharacterIndex & 0b11) !== 0) {
    throw new Error(
      'Expected a canonical unpadded SHA-256 Base64URL signature',
    );
  }

  return `${signature.slice(0, -1)}${BASE64URL_ALPHABET[lastCharacterIndex + 1]}`;
}
