import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { DismissalGatesRepository } from '../../gates/infrastructure/dismissal-gates.repository';
import { requireDismissalScope } from '../../shared/dismissal-context';
import {
  DismissalCoordinatesRequiredWhenEnabledException,
  DismissalDefaultGateNotFoundException,
  DismissalSettingsInvalidCoordinatesException,
  DismissalSettingsInvalidRadiusException,
  DismissalSettingsInvalidThresholdsException,
  DismissalSettingsInvalidTimezoneException,
  DismissalSettingsInvalidWindowException,
} from '../../shared/dismissal.errors';
import { UpdateDismissalSettingsDto } from '../dto/dismissal-settings.dto';
import {
  DismissalSchoolProfileLocationRecord,
  DismissalSettingsRecord,
  DismissalSettingsRepository,
} from '../infrastructure/dismissal-settings.repository';
import { presentDismissalSettings } from '../presenter/dismissal-settings.presenter';

const DEFAULT_TIMEZONE = 'Africa/Cairo';
const DEFAULT_ALLOWED_RADIUS_METERS = 150;
const DEFAULT_DELAY_THRESHOLD_MINUTES = 15;
const DEFAULT_URGENT_THRESHOLD_MINUTES = 30;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

@Injectable()
export class UpdateDismissalSettingsUseCase {
  constructor(
    private readonly dismissalSettingsRepository: DismissalSettingsRepository,
    private readonly dismissalGatesRepository: DismissalGatesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: UpdateDismissalSettingsDto) {
    const scope = requireDismissalScope();
    const [existing, profile] = await Promise.all([
      this.dismissalSettingsRepository.findSettings(),
      this.dismissalSettingsRepository.findSchoolProfileLocation(),
    ]);

    const timezone = this.resolveTimezone(command, existing, profile);
    const schoolLatitude = this.resolveNullableNumber(
      command,
      'schoolLatitude',
      existing?.schoolLatitude,
    );
    const schoolLongitude = this.resolveNullableNumber(
      command,
      'schoolLongitude',
      existing?.schoolLongitude,
    );
    this.validateSettingsCoordinates(command);

    const allowedRadiusMeters = this.resolveInteger(
      command,
      'allowedRadiusMeters',
      existing?.allowedRadiusMeters ?? DEFAULT_ALLOWED_RADIUS_METERS,
    );
    if (allowedRadiusMeters < 10 || allowedRadiusMeters > 5000) {
      throw new DismissalSettingsInvalidRadiusException();
    }

    const requestWindowStartLocal = this.resolveWindowValue(
      command,
      'requestWindowStartLocal',
      existing?.requestWindowStartLocal ?? null,
    );
    const requestWindowEndLocal = this.resolveWindowValue(
      command,
      'requestWindowEndLocal',
      existing?.requestWindowEndLocal ?? null,
    );

    const delayThresholdMinutes = this.resolveInteger(
      command,
      'delayThresholdMinutes',
      existing?.delayThresholdMinutes ?? DEFAULT_DELAY_THRESHOLD_MINUTES,
    );
    const urgentThresholdMinutes = this.resolveInteger(
      command,
      'urgentThresholdMinutes',
      existing?.urgentThresholdMinutes ?? DEFAULT_URGENT_THRESHOLD_MINUTES,
    );
    if (
      delayThresholdMinutes < 1 ||
      urgentThresholdMinutes < delayThresholdMinutes
    ) {
      throw new DismissalSettingsInvalidThresholdsException();
    }

    const defaultGateId = this.hasOwn(command, 'defaultGateId')
      ? command.defaultGateId ?? null
      : existing?.defaultGateId ?? null;
    if (defaultGateId) {
      const defaultGate =
        await this.dismissalGatesRepository.findGateById(defaultGateId);
      if (!defaultGate) {
        throw new DismissalDefaultGateNotFoundException();
      }
    }

    const enabled = this.hasOwn(command, 'enabled')
      ? Boolean(command.enabled)
      : existing?.enabled ?? false;
    this.validateEnabledCoordinates({
      enabled,
      schoolLatitude,
      schoolLongitude,
      profile,
    });

    const updated =
      await this.dismissalSettingsRepository.upsertSettings(scope.schoolId, {
        schoolId: scope.schoolId,
        enabled,
        timezone,
        schoolLatitude:
          schoolLatitude === null ? null : (schoolLatitude as Prisma.Decimal | number),
        schoolLongitude:
          schoolLongitude === null
            ? null
            : (schoolLongitude as Prisma.Decimal | number),
        allowedRadiusMeters,
        requestWindowStartLocal,
        requestWindowEndLocal,
        delayThresholdMinutes,
        urgentThresholdMinutes,
        requirePickupCode: this.hasOwn(command, 'requirePickupCode')
          ? Boolean(command.requirePickupCode)
          : existing?.requirePickupCode ?? true,
        allowDelegatePickup: this.hasOwn(command, 'allowDelegatePickup')
          ? Boolean(command.allowDelegatePickup)
          : existing?.allowDelegatePickup ?? true,
        allowParentCancelBeforeCalled: this.hasOwn(
          command,
          'allowParentCancelBeforeCalled',
        )
          ? Boolean(command.allowParentCancelBeforeCalled)
          : existing?.allowParentCancelBeforeCalled ?? true,
        defaultGateId,
        updatedById: scope.actorId,
      });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'dismissal',
      action: 'dismissal.settings.update',
      resourceType: 'dismissal_settings',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      before: existing ? this.auditSettings(existing) : undefined,
      after: this.auditSettings(updated),
    });

    return presentDismissalSettings(updated, profile);
  }

  private resolveTimezone(
    command: UpdateDismissalSettingsDto,
    existing: DismissalSettingsRecord | null,
    profile: DismissalSchoolProfileLocationRecord | null,
  ): string {
    const raw = this.hasOwn(command, 'timezone')
      ? command.timezone
      : existing?.timezone ?? profile?.timezone ?? DEFAULT_TIMEZONE;

    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new DismissalSettingsInvalidTimezoneException();
    }

    return raw.trim();
  }

  private resolveNullableNumber(
    command: UpdateDismissalSettingsDto,
    key: 'schoolLatitude' | 'schoolLongitude',
    existingValue: { toNumber(): number } | null | undefined,
  ): number | null {
    if (!this.hasOwn(command, key)) {
      return existingValue ? existingValue.toNumber() : null;
    }

    const value = command[key];
    return value === null || value === undefined ? null : Number(value);
  }

  private resolveInteger(
    command: UpdateDismissalSettingsDto,
    key:
      | 'allowedRadiusMeters'
      | 'delayThresholdMinutes'
      | 'urgentThresholdMinutes',
    fallback: number,
  ): number {
    const value = this.hasOwn(command, key) ? command[key] : fallback;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      if (key === 'allowedRadiusMeters') {
        throw new DismissalSettingsInvalidRadiusException();
      }
      throw new DismissalSettingsInvalidThresholdsException();
    }

    return value;
  }

  private resolveWindowValue(
    command: UpdateDismissalSettingsDto,
    key: 'requestWindowStartLocal' | 'requestWindowEndLocal',
    fallback: string | null,
  ): string | null {
    const value = this.hasOwn(command, key) ? command[key] : fallback;
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') {
      throw new DismissalSettingsInvalidWindowException();
    }

    const trimmed = value.trim();
    if (!LOCAL_TIME_PATTERN.test(trimmed)) {
      throw new DismissalSettingsInvalidWindowException();
    }

    return trimmed;
  }

  private validateSettingsCoordinates(command: UpdateDismissalSettingsDto): void {
    if (
      this.hasOwn(command, 'schoolLatitude') &&
      command.schoolLatitude !== null &&
      !this.isLatitude(Number(command.schoolLatitude))
    ) {
      throw new DismissalSettingsInvalidCoordinatesException();
    }
    if (
      this.hasOwn(command, 'schoolLongitude') &&
      command.schoolLongitude !== null &&
      !this.isLongitude(Number(command.schoolLongitude))
    ) {
      throw new DismissalSettingsInvalidCoordinatesException();
    }
  }

  private validateEnabledCoordinates(params: {
    enabled: boolean;
    schoolLatitude: number | null;
    schoolLongitude: number | null;
    profile: DismissalSchoolProfileLocationRecord | null;
  }): void {
    if (!params.enabled) return;

    const profileLatitude = params.profile?.latitude?.toNumber() ?? null;
    const profileLongitude = params.profile?.longitude?.toNumber() ?? null;
    const hasSettingsCoordinates =
      params.schoolLatitude !== null && params.schoolLongitude !== null;
    const hasProfileCoordinates =
      profileLatitude !== null && profileLongitude !== null;

    if (!hasSettingsCoordinates && !hasProfileCoordinates) {
      throw new DismissalCoordinatesRequiredWhenEnabledException();
    }
  }

  private isLatitude(value: number): boolean {
    return Number.isFinite(value) && value >= -90 && value <= 90;
  }

  private isLongitude(value: number): boolean {
    return Number.isFinite(value) && value >= -180 && value <= 180;
  }

  private hasOwn<T extends object>(object: T, key: keyof T): boolean {
    return (
      Object.prototype.hasOwnProperty.call(object, key) &&
      (object as Record<string, unknown>)[key as string] !== undefined
    );
  }

  private auditSettings(
    settings: DismissalSettingsRecord,
  ): Record<string, unknown> {
    return {
      enabled: settings.enabled,
      timezone: settings.timezone,
      allowedRadiusMeters: settings.allowedRadiusMeters,
      requestWindowStartLocal: settings.requestWindowStartLocal,
      requestWindowEndLocal: settings.requestWindowEndLocal,
      delayThresholdMinutes: settings.delayThresholdMinutes,
      urgentThresholdMinutes: settings.urgentThresholdMinutes,
      requirePickupCode: settings.requirePickupCode,
      allowDelegatePickup: settings.allowDelegatePickup,
      allowParentCancelBeforeCalled: settings.allowParentCancelBeforeCalled,
      defaultGateConfigured: Boolean(settings.defaultGateId),
    };
  }
}
