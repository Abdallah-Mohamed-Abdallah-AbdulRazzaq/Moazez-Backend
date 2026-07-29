import {
  COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
} from '../communication/domain/communication-notification-generation-domain';
import { DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME } from '../dismissal/requests/worker/dismissal-request-expiry.worker';
import { LEARNING_MEDIA_CLEANUP_QUEUE } from '../files/uploads/application/learning-media-cleanup.service';
import { FILES_IMPORT_QUEUE_NAME } from '../files/imports/domain/import-job.types';
import { BRANDING_LOGO_CLEANUP_QUEUE } from '../settings/branding/domain/branding-logo.constants';
import { SCHOOL_EMAIL_DELIVERY_QUEUE_NAME } from '../settings/email/delivery/domain/email-delivery.constants';
import {
  CORE_WORKER_ASSIGNED_CONSUMERS,
  createOperationalRoleManifests,
  MEDIA_WORKER_ASSIGNED_CONSUMERS,
} from './operational-probe.manifests';

describe('operational role dependency manifests', () => {
  it('matches the approved current Core and Media worker assignments', () => {
    expect(CORE_WORKER_ASSIGNED_CONSUMERS).toEqual([
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
      SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
      FILES_IMPORT_QUEUE_NAME,
      DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME,
      BRANDING_LOGO_CLEANUP_QUEUE,
    ]);
    expect(MEDIA_WORKER_ASSIGNED_CONSUMERS).toEqual([
      LEARNING_MEDIA_CLEANUP_QUEUE,
    ]);
  });

  it('keeps storage and realtime conditional only for the API manifest', () => {
    const disabled = createOperationalRoleManifests({
      realtimeEnabled: false,
      storageRequiredForApi: false,
    });

    expect(disabled.api.readiness).toEqual(['prisma', 'queue-redis']);
    expect(disabled['core-worker'].readiness).toEqual([
      'prisma',
      'queue-redis',
      'core-consumers',
    ]);
    expect(disabled['media-worker'].readiness).toContain('storage');
  });
});
