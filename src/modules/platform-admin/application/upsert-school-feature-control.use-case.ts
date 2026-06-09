import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  SchoolFeatureControlSource,
  SchoolStatus,
} from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  PlatformSchoolFeatureControlsResponseDto,
  UpsertPlatformSchoolFeatureControlDto,
} from '../dto/platform-admin-feature-control.dto';
import {
  mapFeatureControlSourceToApi,
  normalizeSingleFeatureControlInput,
  NormalizedFeatureControlInput,
} from '../domain/platform-admin-feature-control-inputs';
import {
  PlatformFeatureSchoolArchivedException,
  PlatformSchoolNotFoundException,
} from '../domain/platform-admin-errors';
import {
  PlatformAdminFeaturesRepository,
  PlatformSchoolFeatureControlRecord,
} from '../infrastructure/platform-admin-features.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformSchoolFeatureControls } from '../presenters/platform-admin-feature-control.presenter';

type FeatureControlChangedField = 'enabled' | 'source' | 'notes';

@Injectable()
@PlatformScope()
export class UpsertSchoolFeatureControlUseCase {
  constructor(
    private readonly featuresRepository: PlatformAdminFeaturesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    schoolId: string,
    featureKey: string,
    command: UpsertPlatformSchoolFeatureControlDto,
  ): Promise<PlatformSchoolFeatureControlsResponseDto> {
    const scope = requirePlatformAdminScope();
    const normalized = normalizeSingleFeatureControlInput(featureKey, command);

    const school = await this.featuresRepository.findSchoolById(schoolId);
    if (!school) {
      throw new PlatformSchoolNotFoundException(schoolId);
    }

    if (school.status === SchoolStatus.ARCHIVED) {
      throw new PlatformFeatureSchoolArchivedException(schoolId);
    }

    const existing =
      await this.featuresRepository.findFeatureControlBySchoolAndKey({
        schoolId,
        featureKey: normalized.featureKey,
      });
    const changedFields = collectChangedFields(existing, normalized);

    if (existing && changedFields.length === 0) {
      const controls =
        await this.featuresRepository.listFeatureControlsBySchoolId(schoolId);
      return presentPlatformSchoolFeatureControls({ school, controls });
    }

    const control = await this.featuresRepository.upsertFeatureControl({
      schoolId: school.id,
      organizationId: school.organizationId,
      featureKey: normalized.featureKey,
      enabled: normalized.enabled,
      source: normalized.source,
      ...(normalized.notesProvided ? { notes: normalized.notes } : {}),
    });

    await this.auditSingleMutation({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: school.organizationId,
      schoolId: school.id,
      existing,
      control,
      changedFields,
    });

    const controls =
      await this.featuresRepository.listFeatureControlsBySchoolId(schoolId);

    return presentPlatformSchoolFeatureControls({ school, controls });
  }

  private async auditSingleMutation(input: {
    actorId: string;
    userType: Parameters<AuthRepository['createAuditLog']>[0]['userType'];
    organizationId: string;
    schoolId: string;
    existing: PlatformSchoolFeatureControlRecord | null;
    control: PlatformSchoolFeatureControlRecord;
    changedFields: FeatureControlChangedField[];
  }): Promise<void> {
    const before = input.existing ? auditSnapshot(input.existing) : undefined;
    const after = {
      ...auditSnapshot(input.control),
      changedFields: input.changedFields,
    };
    const auditBase = {
      actorId: input.actorId,
      userType: input.userType,
      organizationId: input.organizationId,
      schoolId: input.schoolId,
      module: 'platform_admin',
      resourceType: 'school_feature_control',
      resourceId: input.control.id,
      outcome: AuditOutcome.SUCCESS,
      before,
      after,
    };

    await this.authRepository.createAuditLog({
      ...auditBase,
      action: input.existing
        ? 'platform.feature_control.update'
        : 'platform.feature_control.create',
    });

    const enabledChanged =
      !input.existing || input.existing.enabled !== input.control.enabled;
    if (!enabledChanged) return;

    await this.authRepository.createAuditLog({
      ...auditBase,
      action: input.control.enabled
        ? 'platform.feature_control.enable'
        : 'platform.feature_control.disable',
    });
  }
}

export function collectChangedFields(
  existing: PlatformSchoolFeatureControlRecord | null,
  normalized: NormalizedFeatureControlInput,
): FeatureControlChangedField[] {
  if (!existing) {
    return [
      'enabled',
      'source',
      ...(normalized.notesProvided ? (['notes'] as const) : []),
    ];
  }

  const changedFields: FeatureControlChangedField[] = [];

  if (existing.enabled !== normalized.enabled) {
    changedFields.push('enabled');
  }

  if (existing.source !== normalized.source) {
    changedFields.push('source');
  }

  if (normalized.notesProvided && existing.notes !== normalized.notes) {
    changedFields.push('notes');
  }

  return changedFields;
}

export function auditSnapshot(control: PlatformSchoolFeatureControlRecord): {
  featureControlId: string;
  schoolId: string;
  organizationId: string;
  featureKey: string;
  enabled: boolean;
  source: string;
  notesPresent: boolean;
} {
  return {
    featureControlId: control.id,
    schoolId: control.schoolId,
    organizationId: control.organizationId,
    featureKey: control.featureKey,
    enabled: control.enabled,
    source: mapFeatureControlSourceToApi(
      control.source as SchoolFeatureControlSource,
    ),
    notesPresent: control.notes !== null,
  };
}
