import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  App,
  AppOptions,
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { Env } from '../../../config/env.validation';
import {
  assertFirebaseCredentialEnvironment,
  FirebaseCredentialEnvironment,
  FirebaseCredentialMode,
} from './firebase-credential-env.validation';

@Injectable()
export class FirebaseAdminService {
  private app: App | null = null;

  constructor(private readonly configService: ConfigService<Env>) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('FCM_ENABLED') === true;
  }

  isDryRun(): boolean {
    return this.configService.get<boolean>('FCM_DRY_RUN') !== false;
  }

  checkReadiness(): { mode: 'disabled' | 'dry_run' | 'send_enabled' } {
    if (!this.isEnabled()) {
      return { mode: 'disabled' };
    }

    this.getOrInitializeApp();

    if (this.isDryRun()) {
      return { mode: 'dry_run' };
    }

    return { mode: 'send_enabled' };
  }

  getMessaging(): Messaging {
    return getMessaging(this.getOrInitializeApp());
  }

  getOrInitializeApp(): App {
    if (this.app) return this.app;

    const credentialEnvironment = this.readCredentialEnvironment();
    assertFirebaseCredentialEnvironment(credentialEnvironment);

    const existingApp = getApps()[0];
    if (existingApp) {
      this.app = existingApp;
      return existingApp;
    }

    this.app = initializeApp(this.resolveAppOptions(credentialEnvironment));
    return this.app;
  }

  private resolveAppOptions(
    env: FirebaseCredentialEnvironment & {
      FIREBASE_CREDENTIAL_MODE: FirebaseCredentialMode;
    },
  ): AppOptions {
    switch (env.FIREBASE_CREDENTIAL_MODE) {
      case 'application_default': {
        const projectId = this.readOptionalString('GCP_PROJECT_ID');
        return {
          credential: applicationDefault(),
          ...(projectId ? { projectId } : {}),
        };
      }
      case 'google_application_credentials':
        return { credential: applicationDefault() };
      case 'service_account_env':
        return {
          credential: cert({
            projectId: env.FIREBASE_PROJECT_ID!,
            clientEmail: env.FIREBASE_CLIENT_EMAIL!,
            privateKey: normalizeFirebasePrivateKey(env.FIREBASE_PRIVATE_KEY!),
          }),
        };
    }
  }

  private readCredentialEnvironment(): FirebaseCredentialEnvironment {
    return {
      FCM_ENABLED: this.isEnabled(),
      FIREBASE_CREDENTIAL_MODE:
        this.readOptionalString('FIREBASE_CREDENTIAL_MODE') ?? undefined,
      GOOGLE_APPLICATION_CREDENTIALS:
        this.readOptionalString('GOOGLE_APPLICATION_CREDENTIALS') ?? undefined,
      FIREBASE_PROJECT_ID:
        this.readOptionalString('FIREBASE_PROJECT_ID') ?? undefined,
      FIREBASE_CLIENT_EMAIL:
        this.readOptionalString('FIREBASE_CLIENT_EMAIL') ?? undefined,
      FIREBASE_PRIVATE_KEY:
        this.readOptionalString('FIREBASE_PRIVATE_KEY') ?? undefined,
    };
  }

  private readOptionalString(key: keyof Env): string | null {
    const value = this.configService.get<string>(key);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

export function normalizeFirebasePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, '\n');
}
