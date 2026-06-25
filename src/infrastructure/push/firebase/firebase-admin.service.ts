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

    if (this.isDryRun()) {
      return { mode: 'dry_run' };
    }

    this.getOrInitializeApp();
    return { mode: 'send_enabled' };
  }

  getMessaging(): Messaging {
    return getMessaging(this.getOrInitializeApp());
  }

  getOrInitializeApp(): App {
    if (this.app) return this.app;

    const existingApp = getApps()[0];
    if (existingApp) {
      this.app = existingApp;
      return existingApp;
    }

    this.app = initializeApp(this.resolveAppOptions());
    return this.app;
  }

  private resolveAppOptions(): AppOptions {
    const credentialsPath = this.readOptionalString(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );
    if (credentialsPath) {
      return { credential: applicationDefault() };
    }

    const projectId = this.readOptionalString('FIREBASE_PROJECT_ID');
    const clientEmail = this.readOptionalString('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.readOptionalString('FIREBASE_PRIVATE_KEY');

    if (projectId && clientEmail && privateKey) {
      return {
        credential: cert({
          projectId,
          clientEmail,
          privateKey: normalizeFirebasePrivateKey(privateKey),
        }),
      };
    }

    throw new Error(
      'Firebase credentials are required when FCM send mode is enabled',
    );
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
