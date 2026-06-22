import { ConfigService } from '@nestjs/config';
import { Env } from '../../../../config/env.validation';
import {
  FirebaseAdminService,
  normalizeFirebasePrivateKey,
} from '../firebase-admin.service';
import {
  findForbiddenFirebasePushDataKey,
  FirebasePushProvider,
} from '../firebase-push.provider';

const mockInitializeApp = jest.fn();
const mockGetApps = jest.fn();
const mockApplicationDefault = jest.fn();
const mockCert = jest.fn();
const mockGetMessaging = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: (...args) => mockInitializeApp(...args),
  getApps: (...args) => mockGetApps(...args),
  applicationDefault: (...args) => mockApplicationDefault(...args),
  cert: (...args) => mockCert(...args),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: (...args) => mockGetMessaging(...args),
}));

describe('FirebasePushProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeApp.mockReturnValue({ name: '[DEFAULT]' });
    mockGetApps.mockReturnValue([]);
    mockApplicationDefault.mockReturnValue({ type: 'applicationDefault' });
    mockCert.mockImplementation((credential) => ({
      type: 'cert',
      credential,
    }));
  });

  it('does not initialize Firebase Admin SDK in disabled mode', async () => {
    const { provider } = createProvider({
      FCM_ENABLED: false,
      FCM_DRY_RUN: false,
    });

    const result = await provider.sendToToken(validSingleInput());

    expect(result).toEqual({
      status: 'skipped',
      provider: 'firebase_fcm',
      skippedReason: 'disabled',
    });
    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(mockGetMessaging).not.toHaveBeenCalled();
  });

  it('returns skipped disabled result for batch sends without tokens in output', async () => {
    const { provider } = createProvider({
      FCM_ENABLED: false,
      FCM_DRY_RUN: false,
    });

    const result = await provider.sendBatch({
      tokens: ['token-a', 'token-b'],
      notification: { title: 'Hello' },
      data: { notificationId: 'notification-1' },
    });

    expect(result.status).toBe('skipped');
    expect(result.skippedReason).toBe('disabled');
    expect(result.results).toEqual([
      { tokenIndex: 0, status: 'skipped', skippedReason: 'disabled' },
      { tokenIndex: 1, status: 'skipped', skippedReason: 'disabled' },
    ]);
    expect(JSON.stringify(result)).not.toContain('token-a');
    expect(JSON.stringify(result)).not.toContain('token-b');
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('does not call Firebase messaging network send in dry-run mode', async () => {
    const { provider } = createProvider({
      FCM_ENABLED: true,
      FCM_DRY_RUN: true,
    });

    const result = await provider.sendToToken(validSingleInput());

    expect(result).toEqual({
      status: 'skipped',
      provider: 'firebase_fcm',
      skippedReason: 'dry_run',
    });
    expect(mockGetMessaging).not.toHaveBeenCalled();
  });

  it('validates forbidden payload keys in dry-run mode', async () => {
    const { provider } = createProvider({
      FCM_ENABLED: true,
      FCM_DRY_RUN: true,
    });

    const result = await provider.sendToToken({
      token: 'fcm-token-abc',
      notification: { title: 'Hello' },
      data: { schoolId: 'school-1' },
    });

    expect(result.status).toBe('skipped');
    expect(result.skippedReason).toBe('invalid_payload');
    expect(result.errorCode).toBe('fcm/invalid-argument');
    expect(result.errorMessage).toContain('forbidden key: schoolId');
    expect(result.errorMessage).not.toContain('school-1');
    expect(mockGetMessaging).not.toHaveBeenCalled();
  });

  it('initializes Firebase once and sends a single message in enabled mode', async () => {
    const messaging = {
      send: jest.fn().mockResolvedValue('projects/moazez/messages/message-1'),
      sendEachForMulticast: jest.fn(),
    };
    mockGetMessaging.mockReturnValue(messaging);
    const { provider } = createProvider({
      FCM_ENABLED: true,
      FCM_DRY_RUN: false,
      FIREBASE_PROJECT_ID: 'moazez-production',
      FIREBASE_CLIENT_EMAIL: 'service-account@example.invalid',
      FIREBASE_PRIVATE_KEY: 'line-one\\nline-two',
    });

    const first = await provider.sendToToken(validSingleInput());
    const second = await provider.sendToToken(validSingleInput());

    expect(first).toEqual({
      status: 'sent',
      provider: 'firebase_fcm',
      providerMessageId: 'projects/moazez/messages/message-1',
    });
    expect(second.status).toBe('sent');
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockCert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'moazez-production',
        clientEmail: 'service-account@example.invalid',
        privateKey: 'line-one\nline-two',
      }),
    );
    expect(messaging.send).toHaveBeenCalledWith({
      token: 'fcm-token-abc',
      notification: { title: 'Hello', body: 'Body' },
      data: { notificationId: 'notification-1' },
    });
  });

  it('prefers GOOGLE_APPLICATION_CREDENTIALS strategy when configured', () => {
    const service = new FirebaseAdminService(
      configService({
        FCM_ENABLED: true,
        FCM_DRY_RUN: false,
        GOOGLE_APPLICATION_CREDENTIALS: 'C:/secure/firebase-admin.json',
      }),
    );

    service.getMessaging();

    expect(mockApplicationDefault).toHaveBeenCalledTimes(1);
    expect(mockCert).not.toHaveBeenCalled();
    expect(mockInitializeApp).toHaveBeenCalledWith({
      credential: { type: 'applicationDefault' },
    });
  });

  it('sends a bounded batch and returns token-indexed results without raw tokens', async () => {
    const messaging = {
      send: jest.fn(),
      sendEachForMulticast: jest.fn().mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        responses: [
          { success: true, messageId: 'message-1' },
          {
            success: false,
            error: {
              code: 'messaging/invalid-registration-token',
              message: 'Invalid token=token-b',
            },
          },
        ],
      }),
    };
    mockGetMessaging.mockReturnValue(messaging);
    const { provider } = createProvider({
      FCM_ENABLED: true,
      FCM_DRY_RUN: false,
      FIREBASE_PROJECT_ID: 'moazez-production',
      FIREBASE_CLIENT_EMAIL: 'service-account@example.invalid',
      FIREBASE_PRIVATE_KEY: 'line-one\\nline-two',
    });

    const result = await provider.sendBatch({
      tokens: ['token-a', 'token-b'],
      notification: { title: 'Hello' },
      data: {
        notificationId: 'notification-1',
        deepLinkType: 'conversation_message',
      },
    });

    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ['token-a', 'token-b'],
      notification: { title: 'Hello' },
      data: {
        notificationId: 'notification-1',
        deepLinkType: 'conversation_message',
      },
    });
    expect(result.status).toBe('partial');
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.results[0]).toEqual({
      tokenIndex: 0,
      status: 'sent',
      providerMessageId: 'message-1',
    });
    expect(result.results[1]).toMatchObject({
      tokenIndex: 1,
      status: 'failed',
      errorCode: 'fcm/invalid-registration-token',
      errorMessage: 'Firebase push send failed',
    });
    expect(JSON.stringify(result)).not.toContain('token-a');
    expect(JSON.stringify(result)).not.toContain('token-b');
  });

  it('normalizes Firebase send failures safely', async () => {
    const messaging = {
      send: jest.fn().mockRejectedValue({
        code: 'messaging/unavailable',
        message: 'Firebase service unavailable',
        stack: 'sensitive stack',
      }),
      sendEachForMulticast: jest.fn(),
    };
    mockGetMessaging.mockReturnValue(messaging);
    const { provider } = createProvider({
      FCM_ENABLED: true,
      FCM_DRY_RUN: false,
      FIREBASE_PROJECT_ID: 'moazez-production',
      FIREBASE_CLIENT_EMAIL: 'service-account@example.invalid',
      FIREBASE_PRIVATE_KEY: 'line-one\\nline-two',
    });

    const result = await provider.sendToToken(validSingleInput());

    expect(result).toEqual({
      status: 'failed',
      provider: 'firebase_fcm',
      errorCode: 'fcm/unavailable',
      errorMessage: 'Firebase service unavailable',
    });
    expect(JSON.stringify(result)).not.toContain('sensitive stack');
  });

  it('rejects non-string data payload values', async () => {
    const { provider } = createProvider({
      FCM_ENABLED: true,
      FCM_DRY_RUN: true,
    });

    const result = await provider.sendToToken({
      token: 'fcm-token-abc',
      notification: { title: 'Hello' },
      data: { notificationId: 123 } as never,
    });

    expect(result.status).toBe('skipped');
    expect(result.skippedReason).toBe('invalid_payload');
    expect(result.errorMessage).toContain('value must be a string');
  });

  it('detects forbidden data keys case-insensitively', () => {
    expect(findForbiddenFirebasePushDataKey({ tokenHash: 'hash' })).toBe(
      'tokenHash',
    );
    expect(findForbiddenFirebasePushDataKey({ SCHOOLID: 'school' })).toBe(
      'SCHOOLID',
    );
    expect(
      findForbiddenFirebasePushDataKey({ notificationId: 'notification-1' }),
    ).toBeNull();
  });

  it('normalizes escaped private key newlines', () => {
    expect(normalizeFirebasePrivateKey('line-one\\nline-two')).toBe(
      'line-one\nline-two',
    );
  });
});

function createProvider(values: Partial<Env>): {
  provider: FirebasePushProvider;
  service: FirebaseAdminService;
} {
  const service = new FirebaseAdminService(configService(values));
  return {
    service,
    provider: new FirebasePushProvider(service),
  };
}

function configService(values: Partial<Env>): ConfigService<Env> {
  return {
    get: jest.fn((key: keyof Env) => values[key]),
  } as unknown as ConfigService<Env>;
}

function validSingleInput() {
  return {
    token: ' fcm-token-abc ',
    notification: {
      title: ' Hello ',
      body: ' Body ',
    },
    data: {
      notificationId: 'notification-1',
    },
  };
}
