import { Injectable } from '@nestjs/common';
import { AuditOutcome, SchoolStatus } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  BulkUpdatePlatformSchoolFeatureControlsDto,
  PlatformSchoolFeatureControlsResponseDto,
} from '../dto/platform-admin-feature-control.dto';
import { normalizeBulkFeatureControlInput } from '../domain/platform-admin-feature-control-inputs';
import {
  PlatformFeatureSchoolArchivedException,
  PlatformSchoolNotFoundException,
} from '../domain/platform-admin-errors';
import {
  PlatformAdminFeaturesRepository,
  PlatformSchoolFeatureControlRecord,
  UpsertSchoolFeatureControlData,
} from '../infrastructure/platform-admin-features.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformSchoolFeatureControls } from '../presenters/platform-admin-feature-control.presenter';
import {
  auditSnapshot,
  collectChangedFields,
} from './upsert-school-feature-control.use-case';

@Injectable()
@PlatformScope()
export class BulkUpdateSchoolFeatureControlsUseCase {
  constructor(
    private readonly featuresRepository: PlatformAdminFeaturesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    schoolId: string,
    command: BulkUpdatePlatformSchoolFeatureControlsDto,
  ): Promise<PlatformSchoolFeatureControlsResponseDto> {
    const scope = requirePlatformAdminScope();
    const normalized = normalizeBulkFeatureControlInput(command.features);

    const school = await this.featuresRepository.findSchoolById(schoolId);
    if (!school) {
      throw new PlatformSchoolNotFoundException(schoolId);
    }

    if (school.status === SchoolStatus.ARCHIVED) {
      throw new PlatformFeatureSchoolArchivedException(schoolId);
    }

    const existingControls =
      await this.featuresRepository.listFeatureControlsBySchoolId(schoolId);
    const existingByFeatureKey = new Map(
      existingControls.map((control) => [control.featureKey, control]),
    );

    const changeSet = normalized
      .map((control) => {
        const existing = existingByFeatureKey.get(control.featureKey) ?? null;
        const changedFields = collectChangedFields(existing, control);
        return { control, existing, changedFields };
      })
      .filter((item) => item.changedFields.length > 0);

    const controlsToWrite: UpsertSchoolFeatureControlData[] = changeSet.map(
      ({ control }) => ({
        schoolId: school.id,
        organizationId: school.organizationId,
        featureKey: control.featureKey,
        enabled: control.enabled,
        source: control.source,
        ...(control.notesProvided ? { notes: control.notes } : {}),
      }),
    );

    const controls =
      controlsToWrite.length > 0
        ? await this.featuresRepository.upsertFeatureControlsTransactionally({
            schoolId: school.id,
            organizationId: school.organizationId,
            controls: controlsToWrite,
          })
        : existingControls;

    if (changeSet.length > 0) {
      const updatedByFeatureKey = new Map(
        controls.map((control) => [control.featureKey, control]),
      );
      await this.authRepository.createAuditLog({
        actorId: scope.actorId,
        userType: scope.userType,
        organizationId: school.organizationId,
        schoolId: school.id,
        module: 'platform_admin',
        action: 'platform.feature_controls.bulk_update',
        resourceType: 'school_feature_controls',
        resourceId: school.id,
        outcome: AuditOutcome.SUCCESS,
        after: {
          schoolId: school.id,
          organizationId: school.organizationId,
          requestedFeatureKeys: normalized.map((item) => item.featureKey),
          changedFeatureKeys: changeSet.map((item) => item.control.featureKey),
          changes: changeSet.map((item) => {
            const updated = updatedByFeatureKey.get(item.control.featureKey);
            return {
              featureKey: item.control.featureKey,
              changedFields: item.changedFields,
              previous: item.existing ? auditSnapshot(item.existing) : null,
              next: updated ? auditSnapshot(updated) : null,
            };
          }),
        },
      });
    }

    return presentPlatformSchoolFeatureControls({ school, controls });
  }
}
