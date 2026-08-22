import { ConfigService } from '@nestjs/config';
import { Env } from '../../../../config/env.validation';
import { FirebaseAdminService } from '../firebase-admin.service';
import { FirebasePushProvider } from '../firebase-push.provider';

const mockInitializeApp = jest.fn();
const mockGetApps = jest.fn();
const mockApplicationDefault = jest.fn();
const mockCert = jest.fn();
const mockGetMessaging = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  getApps: (...args: unknown[]) => mockGetApps(...args),
  applicationDefault: (...args: unknown[]) => mockApplicationDefault(...args),
  cert: (...args: unknown[]) => mockCert(...args),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: (...args: unknown[]) => mockGetMessaging(...args),
}));

describe('FirebaseAdminService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetApps.mockReturnValue([]);
    mockInitializeApp.mockReturnValue({ name: '[DEFAULT]' });
    mockApplicationDefault.mockReturnValue({ type: 'applicationDefault' });
    mockCert.mockImplementation((credential) => ({
      type: 'cert',
      credential,
    }));
    mockGetMessaging.mockReturnValue({ send: jest.fn() });
  });

  it('initializes application_default without file or private-key credentials', () => {
    const service = createService({
      FCM_ENABLED: true,
      FCM_DRY_RUN: false,
      FIREBASE_CREDENTIAL_MODE: 'application_default',
      GCP_PROJECT_ID: 'moazez-nonprod-91001421934',
    });

    service.getMessaging();

    expect(mockApplicationDefault).toHaveBeenCalledTimes(1);
    expect(mockCert).not.toHaveBeenCalled();
    expect(mockInitializeApp).toHaveBeenCalledWith({
      credential: { type: 'applicationDefault' },
      projectId: 'moazez-nonprod-91001421934',
    });
  });

  it('supports explicit google_application_credentials compatibility', () => {
    const service = createService({
      FCM_ENABLED: true,
      FCM_DRY_RUN: false,
      FIREBASE_CREDENTIAL_MODE: 'google_application_credentials',
      GOOGLE_APPLICATION_CREDENTIALS:
        'C:/synthetic/firebase-admin-credential.json',
    });

    service.getMessaging();

    expect(mockApplicationDefault).toHaveBeenCalledTimes(1);
    expect(mockCert).not.toHaveBeenCalled();
    expect(mockInitializeApp).toHaveBeenCalledWith({
      credential: { type: 'applicationDefault' },
    });
  });

  it('supports explicit service_account_env compatibility', () => {
    const service = createService({
      FCM_ENABLED: true,
      FCM_DRY_RUN: false,
      FIREBASE_CREDENTIAL_MODE: 'service_account_env',
      FIREBASE_PROJECT_ID: 'synthetic-firebase-project',
      FIREBASE_CLIENT_EMAIL: 'synthetic-firebase@example.invalid',
      FIREBASE_PRIVATE_KEY: 'synthetic-line-one\\nsynthetic-line-two',
    });

    service.getMessaging();

    expect(mockApplicationDefault).not.toHaveBeenCalled();
    expect(mockCert).toHaveBeenCalledWith({
      projectId: 'synthetic-firebase-project',
      clientEmail: 'synthetic-firebase@example.invalid',
      privateKey: 'synthetic-line-one\nsynthetic-line-two',
    });
  });

  it('initializes Firebase before reporting enabled dry-run readiness', () => {
    const service = createService({
      FCM_ENABLED: true,
      FCM_DRY_RUN: true,
      FIREBASE_CREDENTIAL_MODE: 'application_default',
      GCP_PROJECT_ID: 'moazez-nonprod-91001421934',
    });

    expect(service.checkReadiness()).toEqual({ mode: 'dry_run' });
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockGetMessaging).not.toHaveBeenCalled();
  });

  it('does not initialize Firebase when FCM is disabled', () => {
    const service = createService({
      FCM_ENABLED: false,
      FCM_DRY_RUN: true,
    });

    expect(service.checkReadiness()).toEqual({ mode: 'disabled' });
    expect(mockGetApps).not.toHaveBeenCalled();
    expect(mockApplicationDefault).not.toHaveBeenCalled();
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('initializes only one app across repeated readiness and messaging access', () => {
    const service = createService({
      FCM_ENABLED: true,
      FCM_DRY_RUN: true,
      FIREBASE_CREDENTIAL_MODE: 'application_default',
      GCP_PROJECT_ID: 'moazez-nonprod-91001421934',
    });

    service.checkReadiness();
    service.getMessaging();
    service.checkReadiness();

    expect(mockGetApps).toHaveBeenCalledTimes(1);
    expect(mockApplicationDefault).toHaveBeenCalledTimes(1);
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
  });

  it('reuses its resolved app without re-reading later configuration changes', () => {
    const values: Partial<Env> = {
      FCM_ENABLED: true,
      FCM_DRY_RUN: true,
      FIREBASE_CREDENTIAL_MODE: 'application_default',
    };
    const service = createService(values);

    const initializedApp = service.getOrInitializeApp();
    values.FIREBASE_CREDENTIAL_MODE = undefined;

    expect(service.getOrInitializeApp()).toBe(initializedApp);
    expect(mockGetApps).toHaveBeenCalledTimes(1);
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing Firebase app without initializing another app', () => {
    const existingApp = { name: '[DEFAULT]' };
    mockGetApps.mockReturnValue([existingApp]);
    const service = createService({
      FCM_ENABLED: true,
      FCM_DRY_RUN: true,
      FIREBASE_CREDENTIAL_MODE: 'application_default',
    });

    service.checkReadiness();
    service.getMessaging();

    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(mockGetMessaging).toHaveBeenCalledWith(existingApp);
  });

  it('fails closed with a bounded secret-safe configuration error', () => {
    const credentialPathMarker =
      'C:/synthetic/do-not-disclose-credential-marker.json';
    const privateKeyMarker = 'synthetic-do-not-disclose-private-key-marker';
    const service = createService({
      FCM_ENABLED: true,
      FCM_DRY_RUN: true,
      FIREBASE_CREDENTIAL_MODE: 'application_default',
      GOOGLE_APPLICATION_CREDENTIALS: credentialPathMarker,
      FIREBASE_PROJECT_ID: 'synthetic-project',
      FIREBASE_CLIENT_EMAIL: 'synthetic@example.invalid',
      FIREBASE_PRIVATE_KEY: privateKeyMarker,
    });

    let message = '';
    try {
      service.checkReadiness();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe('Firebase credential configuration is invalid');
    expect(message).not.toContain(credentialPathMarker);
    expect(message).not.toContain(privateKeyMarker);
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('fails closed when enabled dry-run configuration omits the mode', () => {
    const service = createService({
      FCM_ENABLED: true,
      FCM_DRY_RUN: true,
    });

    expect(() => service.checkReadiness()).toThrow(
      'Firebase credential configuration is invalid',
    );
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('fails closed on direct app access without a selected mode', () => {
    const service = createService({
      FCM_ENABLED: false,
      FCM_DRY_RUN: true,
    });

    expect(() => service.getOrInitializeApp()).toThrow(
      'Firebase credential configuration is invalid',
    );
    expect(mockGetApps).not.toHaveBeenCalled();
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('keeps provider dry-run sends network-free', async () => {
    const messaging = { send: jest.fn() };
    mockGetMessaging.mockReturnValue(messaging);
    const service = createService({
      FCM_ENABLED: true,
      FCM_DRY_RUN: true,
      FIREBASE_CREDENTIAL_MODE: 'application_default',
    });
    const provider = new FirebasePushProvider(service);

    await expect(
      provider.sendToToken({
        token: 'synthetic-token',
        notification: { title: 'Synthetic notification' },
        data: { notificationId: 'synthetic-notification-id' },
      }),
    ).resolves.toMatchObject({
      status: 'skipped',
      skippedReason: 'dry_run',
    });
    expect(mockGetMessaging).not.toHaveBeenCalled();
    expect(messaging.send).not.toHaveBeenCalled();
  });
});

function createService(values: Partial<Env>): FirebaseAdminService {
  return new FirebaseAdminService({
    get: jest.fn((key: keyof Env) => values[key]),
  } as unknown as ConfigService<Env>);
}
