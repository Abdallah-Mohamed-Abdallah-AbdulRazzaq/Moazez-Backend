import {
  normalizeFirebasePushError,
  sanitizeFirebasePushErrorMessage,
} from '../firebase-push-error-normalizer';

describe('Firebase push error normalizer', () => {
  it('maps common Firebase messaging error codes', () => {
    expect(
      normalizeFirebasePushError({
        code: 'messaging/registration-token-not-registered',
        message: 'Registration token is not registered',
      }),
    ).toEqual({
      errorCode: 'fcm/registration-token-not-registered',
      errorMessage: 'Firebase push send failed',
    });

    expect(
      normalizeFirebasePushError({
        code: 'messaging/quota-exceeded',
        message: 'Quota exceeded',
      }),
    ).toEqual({
      errorCode: 'fcm/quota-exceeded',
      errorMessage: 'Quota exceeded',
    });
  });

  it('falls back to unknown for unmapped provider errors', () => {
    expect(
      normalizeFirebasePushError({
        code: 'messaging/something-new',
        message: 'Unexpected Firebase error',
      }),
    ).toEqual({
      errorCode: 'fcm/unknown',
      errorMessage: 'Unexpected Firebase error',
    });
  });

  it('sanitizes dangerous message material', () => {
    expect(
      sanitizeFirebasePushErrorMessage(
        'Authorization: Bearer placeholder-value token=placeholder-value privateKey=placeholder-value',
      ),
    ).toBe('Firebase push send failed');
  });

  it('keeps safe concise provider messages', () => {
    expect(sanitizeFirebasePushErrorMessage('Firebase service unavailable')).toBe(
      'Firebase service unavailable',
    );
  });
});
