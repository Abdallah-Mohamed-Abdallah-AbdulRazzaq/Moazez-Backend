import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import {
  RegisterAppDeviceTokenDto,
  UnregisterAppDeviceTokenDto,
} from '../dto/app-device-token.dto';

describe('App device token DTOs', () => {
  it('accepts safe registration fields and rejects scope override attempts', async () => {
    const pipe = createBodyValidationPipe();
    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype: RegisterAppDeviceTokenDto,
      data: '',
    };

    await expect(
      pipe.transform(
        {
          token: '  fcm-token-value-for-device-123  ',
          platform: 'ANDROID',
          deviceId: ' device-1 ',
          appVersion: ' 1.0.0 ',
          locale: ' en-US ',
          timezone: ' Africa/Cairo ',
        },
        metadata,
      ),
    ).resolves.toMatchObject({
      token: 'fcm-token-value-for-device-123',
      platform: 'android',
      deviceId: 'device-1',
      appVersion: '1.0.0',
      locale: 'en-US',
      timezone: 'Africa/Cairo',
    });

    await expect(
      pipe.transform(
        {
          token: 'fcm-token-value-for-device-123',
          platform: 'ios',
          schoolId: 'other-school',
          userId: 'other-user',
          membershipId: 'membership-1',
          roleId: 'role-1',
          organizationId: 'org-1',
        },
        metadata,
      ),
    ).rejects.toBeDefined();
  });

  it('requires token or deviceId for unregister and rejects unsupported platform values', async () => {
    const pipe = createBodyValidationPipe();

    await expect(
      pipe.transform(
        {
          platform: 'windows',
          token: 'fcm-token-value-for-device-123',
        },
        {
          type: 'body',
          metatype: RegisterAppDeviceTokenDto,
          data: '',
        },
      ),
    ).rejects.toBeDefined();

    await expect(
      pipe.transform(
        {},
        {
          type: 'body',
          metatype: UnregisterAppDeviceTokenDto,
          data: '',
        },
      ),
    ).rejects.toBeDefined();

    await expect(
      pipe.transform(
        {
          token: ' fcm-token-value-for-device-123 ',
          deviceId: ' device-1 ',
        },
        {
          type: 'body',
          metatype: UnregisterAppDeviceTokenDto,
          data: '',
        },
      ),
    ).resolves.toMatchObject({
      token: 'fcm-token-value-for-device-123',
      deviceId: 'device-1',
    });
  });
});

function createBodyValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}
