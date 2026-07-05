import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  StudentStatus,
  UserType,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import {
  CreateParentSmartPickupRequestDto,
  CreateParentSmartPickupRequestResponseDto,
  ParentSmartPickupRequestPoliciesDto,
} from '../dto/parent-smart-pickup-request.dto';
import {
  isAvailablePickupGate,
  isPrismaUniqueConflict,
  ParentSmartPickupRequestEnrollmentRecord,
  ParentSmartPickupRequestGateRecord,
  ParentSmartPickupRequestRepository,
  ParentSmartPickupRequestSettingsRecord,
  ParentSmartPickupRequestSchoolProfileRecord,
} from '../infrastructure/parent-smart-pickup-request.repository';
import { ParentSmartPickupRequestPresenter } from '../presenter/parent-smart-pickup-request.presenter';
import {
  DismissalGateClosedForRequestException,
  DismissalGateNotFoundForRequestException,
  DismissalRequestDuplicateActiveException,
  DismissalRequestGateRequiredException,
  DismissalRequestGuardianNotAllowedException,
  DismissalRequestIdempotencyConflictException,
  DismissalRequestNoActiveEnrollmentException,
  DismissalRequestOutsideGeofenceException,
  DismissalRequestOutsideWindowException,
  DismissalRequestStudentNotActiveException,
  DismissalRequestStudentNotOwnedException,
  DismissalSettingsCoordinatesRequiredException,
  DismissalSettingsDisabledException,
  ParentSmartPickupInvalidActorTypeException,
  ParentSmartPickupSchoolContextRequiredException,
} from './parent-smart-pickup.errors';
import {
  calculateParentSmartPickupWindow,
  ParentSmartPickupClock,
} from './parent-smart-pickup-window';

const DEFAULT_TIMEZONE = 'Africa/Cairo';
const EARTH_RADIUS_METERS = 6_371_000;

interface ParentSmartPickupRequestScope {
  actorId: string;
  schoolId: string;
  organizationId: string;
  userType: UserType;
}

interface OwnedPickupChild {
  studentId: string;
  enrollment: ParentSmartPickupRequestEnrollmentRecord;
  guardianId: string;
}

interface ResolvedSchoolZone {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

@Injectable()
export class CreateParentSmartPickupRequestUseCase {
  constructor(
    private readonly requestRepository: ParentSmartPickupRequestRepository,
    private readonly clock: ParentSmartPickupClock,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: CreateParentSmartPickupRequestDto,
  ): Promise<CreateParentSmartPickupRequestResponseDto> {
    const scope = this.resolveScope();
    const clientRequestId = normalizeClientRequestId(command.clientRequestId);

    const idempotentResponse = await this.resolveIdempotentRetry({
      command,
      clientRequestId,
      requestedById: scope.actorId,
    });
    if (idempotentResponse) return idempotentResponse;

    const ownedChild = await this.resolveOwnedPickupChild({
      parentUserId: scope.actorId,
      childId: command.childId,
    });
    const [settings, schoolProfile, availableGates] = await Promise.all([
      this.requestRepository.findSettings(),
      this.requestRepository.findSchoolProfile(),
      this.requestRepository.listAvailableGates(),
    ]);

    if (!settings?.enabled) {
      throw new DismissalSettingsDisabledException({
        reason: settings ? 'dismissal_disabled' : 'settings_missing',
      });
    }

    const zone = this.resolveSchoolZone(settings, schoolProfile);
    const timezone = settings.timezone || schoolProfile?.timezone || DEFAULT_TIMEZONE;
    const window = calculateParentSmartPickupWindow({
      startLocal: settings.requestWindowStartLocal,
      endLocal: settings.requestWindowEndLocal,
      timezone,
      now: this.clock.now(),
    });
    if (!window.requestWindowOpen) {
      throw new DismissalRequestOutsideWindowException();
    }

    const distanceMeters = calculateDistanceMeters({
      fromLatitude: command.latitude,
      fromLongitude: command.longitude,
      toLatitude: zone.latitude,
      toLongitude: zone.longitude,
    });
    if (distanceMeters > zone.radiusMeters) {
      throw new DismissalRequestOutsideGeofenceException();
    }

    const duplicate = await this.requestRepository.findActiveRequestForStudent(
      ownedChild.studentId,
    );
    if (duplicate) {
      throw new DismissalRequestDuplicateActiveException();
    }

    const gate = await this.resolveGate({
      gateId: command.gateId,
      settings,
      availableGates,
    });

    try {
      const request = await this.requestRepository.createRequestWithEvent({
        schoolId: scope.schoolId,
        studentId: ownedChild.studentId,
        enrollmentId: ownedChild.enrollment.id,
        guardianId: ownedChild.guardianId,
        requestedById: scope.actorId,
        gateId: gate.id,
        clientRequestId,
        parentLatitude: command.latitude,
        parentLongitude: command.longitude,
        distanceMeters,
      });

      await this.authRepository.createAuditLog({
        actorId: scope.actorId,
        userType: scope.userType,
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        module: 'dismissal',
        action: 'dismissal.request.created',
        resourceType: 'dismissal_request',
        resourceId: request.id,
        outcome: AuditOutcome.SUCCESS,
        after: {
          status: request.status,
          childId: ownedChild.studentId,
          gateId: gate.id,
          clientRequestId: Boolean(clientRequestId),
          geofencePassed: true,
        },
      });

      return ParentSmartPickupRequestPresenter.present({
        request,
        policies: this.resolvePolicies(settings),
      });
    } catch (error) {
      if (isPrismaUniqueConflict(error)) {
        return this.resolveUniqueConflict({
          command,
          clientRequestId,
          requestedById: scope.actorId,
          settings,
        });
      }
      throw error;
    }
  }

  private resolveScope(): ParentSmartPickupRequestScope {
    const context = getRequestContext();
    if (!context?.actor) {
      throw new ParentSmartPickupInvalidActorTypeException({
        reason: 'actor_missing',
      });
    }
    if (context.actor.userType !== UserType.PARENT) {
      throw new ParentSmartPickupInvalidActorTypeException({
        reason: 'actor_not_parent',
        userType: context.actor.userType,
      });
    }
    if (!context.activeMembership?.schoolId) {
      throw new ParentSmartPickupSchoolContextRequiredException({
        reason: 'active_school_missing',
      });
    }

    return {
      actorId: context.actor.id,
      userType: context.actor.userType,
      schoolId: context.activeMembership.schoolId,
      organizationId: context.activeMembership.organizationId,
    };
  }

  private async resolveIdempotentRetry(params: {
    command: CreateParentSmartPickupRequestDto;
    clientRequestId: string | null;
    requestedById: string;
  }): Promise<CreateParentSmartPickupRequestResponseDto | null> {
    if (!params.clientRequestId) return null;

    const existing = await this.requestRepository.findRequestByClientRequestId({
      requestedById: params.requestedById,
      clientRequestId: params.clientRequestId,
    });
    if (!existing) return null;

    if (
      existing.studentId !== params.command.childId ||
      (params.command.gateId && existing.gateId !== params.command.gateId)
    ) {
      throw new DismissalRequestIdempotencyConflictException();
    }

    const settings = await this.requestRepository.findSettings();
    return ParentSmartPickupRequestPresenter.present({
      request: existing,
      policies: this.resolvePolicies(settings),
    });
  }

  private async resolveOwnedPickupChild(params: {
    parentUserId: string;
    childId: string;
  }): Promise<OwnedPickupChild> {
    const links = await this.requestRepository.listOwnedChildLinks(params);
    const firstStudent = links.find((link) => link.student)?.student ?? null;

    if (!firstStudent || firstStudent.deletedAt !== null) {
      throw new DismissalRequestStudentNotOwnedException();
    }
    if (firstStudent.status !== StudentStatus.ACTIVE) {
      throw new DismissalRequestStudentNotActiveException();
    }

    const pickupLink = links.find(
      (link) =>
        link.guardian?.deletedAt === null && link.guardian.canPickup === true,
    );
    if (!pickupLink?.guardian) {
      throw new DismissalRequestGuardianNotAllowedException();
    }

    const enrollment =
      await this.requestRepository.findActiveEnrollmentForStudent(
        params.childId,
      );
    if (!enrollment) {
      throw new DismissalRequestNoActiveEnrollmentException();
    }

    return {
      studentId: params.childId,
      guardianId: pickupLink.guardianId,
      enrollment,
    };
  }

  private resolveSchoolZone(
    settings: ParentSmartPickupRequestSettingsRecord,
    schoolProfile: ParentSmartPickupRequestSchoolProfileRecord | null,
  ): ResolvedSchoolZone {
    const settingsLatitude = toNumber(settings.schoolLatitude);
    const settingsLongitude = toNumber(settings.schoolLongitude);
    const profileLatitude = toNumber(schoolProfile?.latitude);
    const profileLongitude = toNumber(schoolProfile?.longitude);
    const hasSettingsCoordinates =
      settingsLatitude !== null && settingsLongitude !== null;
    const hasProfileCoordinates =
      profileLatitude !== null && profileLongitude !== null;

    const latitude = hasSettingsCoordinates
      ? settingsLatitude
      : hasProfileCoordinates
        ? profileLatitude
        : null;
    const longitude = hasSettingsCoordinates
      ? settingsLongitude
      : hasProfileCoordinates
        ? profileLongitude
        : null;

    if (latitude === null || longitude === null) {
      throw new DismissalSettingsCoordinatesRequiredException();
    }

    return {
      latitude,
      longitude,
      radiusMeters: settings.allowedRadiusMeters,
    };
  }

  private async resolveGate(params: {
    gateId?: string;
    settings: ParentSmartPickupRequestSettingsRecord;
    availableGates: ParentSmartPickupRequestGateRecord[];
  }): Promise<ParentSmartPickupRequestGateRecord> {
    if (params.gateId) {
      const gate = await this.requestRepository.findGateById(params.gateId);
      if (!gate) {
        throw new DismissalGateNotFoundForRequestException();
      }
      if (!isAvailablePickupGate(gate)) {
        throw new DismissalGateClosedForRequestException();
      }

      return gate;
    }

    if (params.settings.defaultGateId) {
      const defaultGate = params.availableGates.find(
        (gate) => gate.id === params.settings.defaultGateId,
      );
      if (defaultGate) return defaultGate;
    }

    if (params.availableGates.length === 1) {
      return params.availableGates[0];
    }

    throw new DismissalRequestGateRequiredException();
  }

  private async resolveUniqueConflict(params: {
    command: CreateParentSmartPickupRequestDto;
    clientRequestId: string | null;
    requestedById: string;
    settings: ParentSmartPickupRequestSettingsRecord;
  }): Promise<CreateParentSmartPickupRequestResponseDto> {
    if (params.clientRequestId) {
      const existing =
        await this.requestRepository.findRequestByClientRequestId({
          requestedById: params.requestedById,
          clientRequestId: params.clientRequestId,
        });
      if (existing) {
        if (
          existing.studentId !== params.command.childId ||
          (params.command.gateId && existing.gateId !== params.command.gateId)
        ) {
          throw new DismissalRequestIdempotencyConflictException();
        }

        return ParentSmartPickupRequestPresenter.present({
          request: existing,
          policies: this.resolvePolicies(params.settings),
        });
      }
    }

    throw new DismissalRequestDuplicateActiveException();
  }

  private resolvePolicies(
    settings: ParentSmartPickupRequestSettingsRecord | null,
  ): ParentSmartPickupRequestPoliciesDto {
    return {
      requirePickupCode: settings?.requirePickupCode ?? true,
      allowParentCancelBeforeCalled:
        settings?.allowParentCancelBeforeCalled ?? true,
    };
  }
}

function normalizeClientRequestId(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function toNumber(
  value: { toNumber(): number } | null | undefined,
): number | null {
  return value ? value.toNumber() : null;
}

function calculateDistanceMeters(params: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
}): number {
  const fromLat = toRadians(params.fromLatitude);
  const toLat = toRadians(params.toLatitude);
  const latDelta = toRadians(params.toLatitude - params.fromLatitude);
  const lonDelta = toRadians(params.toLongitude - params.fromLongitude);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(lonDelta / 2) *
      Math.sin(lonDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
