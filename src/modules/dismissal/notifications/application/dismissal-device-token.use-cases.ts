import { Injectable } from '@nestjs/common';
import { AppDeviceTokenSurface, UserType } from '@prisma/client';
import { AppDeviceTokenService } from '../../../app-device-tokens/application/app-device-token.service';
import {
  AppDeviceTokenRegisterResponseDto,
  AppDeviceTokenUnregisterResponseDto,
  RegisterAppDeviceTokenDto,
  UnregisterAppDeviceTokenDto,
} from '../../../app-device-tokens/dto/app-device-token.dto';
import { requireDismissalScope } from '../../shared/dismissal-context';
import { DismissalNotificationInvalidActorTypeException } from '../../shared/dismissal.errors';

const DISMISSAL_DEVICE_TOKEN_ALIAS_STYLE = 'camel' as const;

@Injectable()
export class RegisterDismissalDeviceTokenUseCase {
  constructor(private readonly deviceTokenService: AppDeviceTokenService) {}

  execute(
    dto: RegisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenRegisterResponseDto> {
    const scope = requireDismissalStaffScope();

    return this.deviceTokenService.registerForActor({
      schoolId: scope.schoolId,
      userId: scope.actorId,
      appSurface: AppDeviceTokenSurface.DISMISSAL_STAFF,
      body: dto,
      aliasStyle: DISMISSAL_DEVICE_TOKEN_ALIAS_STYLE,
    }) as Promise<AppDeviceTokenRegisterResponseDto>;
  }
}

@Injectable()
export class UnregisterDismissalDeviceTokenUseCase {
  constructor(private readonly deviceTokenService: AppDeviceTokenService) {}

  execute(
    dto: UnregisterAppDeviceTokenDto,
  ): Promise<AppDeviceTokenUnregisterResponseDto> {
    const scope = requireDismissalStaffScope();

    return this.deviceTokenService.unregisterForActor({
      schoolId: scope.schoolId,
      userId: scope.actorId,
      appSurface: AppDeviceTokenSurface.DISMISSAL_STAFF,
      body: dto,
      aliasStyle: DISMISSAL_DEVICE_TOKEN_ALIAS_STYLE,
    }) as Promise<AppDeviceTokenUnregisterResponseDto>;
  }
}

function requireDismissalStaffScope(): ReturnType<typeof requireDismissalScope> {
  const scope = requireDismissalScope();
  if (scope.userType !== UserType.DISMISSAL_STAFF) {
    throw new DismissalNotificationInvalidActorTypeException();
  }

  return scope;
}
