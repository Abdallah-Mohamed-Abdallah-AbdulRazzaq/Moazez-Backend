import {
  AuditOutcome,
  SchoolFeatureControlSource,
  SchoolStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setPlatformPermissions,
} from '../../../common/context/request-context';
import { BulkUpdateSchoolFeatureControlsUseCase } from '../application/bulk-update-school-feature-controls.use-case';
import { GetSchoolFeatureControlsUseCase } from '../application/get-school-feature-controls.use-case';
import { UpsertSchoolFeatureControlUseCase } from '../application/upsert-school-feature-control.use-case';
import {
  PlatformFeatureDuplicateKeyException,
  PlatformFeatureSchoolArchivedException,
  PlatformFeatureUnknownException,
} from '../domain/platform-admin-errors';
import {
  PlatformAdminFeaturesRepository,
  PlatformFeatureControlSchoolRecord,
  PlatformSchoolFeatureControlRecord,
} from '../infrastructure/platform-admin-features.repository';

describe('Platform Admin feature control use cases', () => {
  it('reads all known features without creating missing controls', async () => {
    const { repository } = mocks();
    repository.findSchoolById.mockResolvedValue(schoolRecord());
    repository.listFeatureControlsBySchoolId.mockResolvedValue([]);
    const useCase = new GetSchoolFeatureControlsUseCase(repository as never);

    const response = await withPlatformScope(['platform.features.view'], () =>
      useCase.execute('school-1'),
    );

    expect(response.features).toHaveLength(15);
    expect(response.summary).toMatchObject({
      configured: 0,
      enabled: 0,
      disabled: 15,
    });
    expect(repository.listFeatureControlsBySchoolId).toHaveBeenCalledWith(
      'school-1',
    );
  });

  it('creates an enabled feature control and audits create plus enable safely', async () => {
    const { repository, authRepository } = mocks();
    repository.findSchoolById.mockResolvedValue(schoolRecord());
    repository.findFeatureControlBySchoolAndKey.mockResolvedValue(null);
    repository.upsertFeatureControl.mockResolvedValue(
      featureControlRecord({
        enabled: true,
        notes: 'Enabled for launch',
      }),
    );
    repository.listFeatureControlsBySchoolId.mockResolvedValue([
      featureControlRecord({ enabled: true, notes: 'Enabled for launch' }),
    ]);
    const useCase = new UpsertSchoolFeatureControlUseCase(
      repository as never,
      authRepository as never,
    );

    const response = await withPlatformScope(['platform.features.manage'], () =>
      useCase.execute('school-1', 'dashboard', {
        enabled: true,
        source: 'platform',
        notes: ' Enabled for launch ',
      }),
    );

    expect(repository.upsertFeatureControl).toHaveBeenCalledWith({
      schoolId: 'school-1',
      organizationId: 'org-1',
      featureKey: 'dashboard',
      enabled: true,
      source: SchoolFeatureControlSource.PLATFORM,
      notes: 'Enabled for launch',
    });
    expect(response.summary).toMatchObject({ configured: 1, enabled: 1 });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'platform-1',
        userType: UserType.PLATFORM_USER,
        organizationId: 'org-1',
        schoolId: 'school-1',
        module: 'platform_admin',
        action: 'platform.feature_control.create',
        resourceType: 'school_feature_control',
        resourceId: 'feature-control-1',
        outcome: AuditOutcome.SUCCESS,
        after: expect.objectContaining({
          featureKey: 'dashboard',
          enabled: true,
          source: 'platform',
          changedFields: ['enabled', 'source', 'notes'],
          notesPresent: true,
        }),
      }),
    );
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.feature_control.enable',
      }),
    );
    expect(JSON.stringify(authRepository.createAuditLog.mock.calls)).not.toContain(
      'Enabled for launch',
    );
  });

  it('disables an existing feature control and audits previous/new states', async () => {
    const { repository, authRepository } = mocks();
    const existing = featureControlRecord({ enabled: true });
    repository.findSchoolById.mockResolvedValue(schoolRecord());
    repository.findFeatureControlBySchoolAndKey.mockResolvedValue(existing);
    repository.upsertFeatureControl.mockResolvedValue(
      featureControlRecord({ enabled: false }),
    );
    repository.listFeatureControlsBySchoolId.mockResolvedValue([
      featureControlRecord({ enabled: false }),
    ]);
    const useCase = new UpsertSchoolFeatureControlUseCase(
      repository as never,
      authRepository as never,
    );

    await withPlatformScope(['platform.features.manage'], () =>
      useCase.execute('school-1', 'dashboard', { enabled: false }),
    );

    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.feature_control.update',
        before: expect.objectContaining({ enabled: true }),
        after: expect.objectContaining({
          enabled: false,
          changedFields: ['enabled'],
        }),
      }),
    );
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.feature_control.disable',
      }),
    );
  });

  it('rejects unknown and duplicate feature keys before writing', async () => {
    const { repository, authRepository } = mocks();
    repository.findSchoolById.mockResolvedValue(schoolRecord());
    const singleUseCase = new UpsertSchoolFeatureControlUseCase(
      repository as never,
      authRepository as never,
    );
    const bulkUseCase = new BulkUpdateSchoolFeatureControlsUseCase(
      repository as never,
      authRepository as never,
    );

    await expect(
      withPlatformScope(['platform.features.manage'], () =>
        singleUseCase.execute('school-1', 'billing', { enabled: true }),
      ),
    ).rejects.toBeInstanceOf(PlatformFeatureUnknownException);

    await expect(
      withPlatformScope(['platform.features.manage'], () =>
        bulkUseCase.execute('school-1', {
          features: [
            { featureKey: 'dashboard', enabled: true },
            { featureKey: 'dashboard', enabled: false },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(PlatformFeatureDuplicateKeyException);

    expect(repository.upsertFeatureControl).not.toHaveBeenCalled();
    expect(repository.upsertFeatureControlsTransactionally).not.toHaveBeenCalled();
  });

  it('bulk-updates changed controls transactionally and audits changed keys', async () => {
    const { repository, authRepository } = mocks();
    const existingDashboard = featureControlRecord({
      featureKey: 'dashboard',
      enabled: false,
    });
    repository.findSchoolById.mockResolvedValue(schoolRecord());
    repository.listFeatureControlsBySchoolId.mockResolvedValueOnce([
      existingDashboard,
    ]);
    repository.upsertFeatureControlsTransactionally.mockResolvedValue([
      featureControlRecord({
        featureKey: 'dashboard',
        enabled: true,
      }),
      featureControlRecord({
        id: 'feature-control-2',
        featureKey: 'teacher_app',
        enabled: false,
      }),
    ]);
    const useCase = new BulkUpdateSchoolFeatureControlsUseCase(
      repository as never,
      authRepository as never,
    );

    const response = await withPlatformScope(['platform.features.manage'], () =>
      useCase.execute('school-1', {
        features: [
          { featureKey: 'dashboard', enabled: true, source: 'platform' },
          {
            featureKey: 'teacher_app',
            enabled: false,
            source: 'platform',
            notes: 'Deferred until onboarding',
          },
        ],
      }),
    );

    expect(repository.upsertFeatureControlsTransactionally).toHaveBeenCalledWith({
      schoolId: 'school-1',
      organizationId: 'org-1',
      controls: [
        {
          schoolId: 'school-1',
          organizationId: 'org-1',
          featureKey: 'dashboard',
          enabled: true,
          source: SchoolFeatureControlSource.PLATFORM,
        },
        {
          schoolId: 'school-1',
          organizationId: 'org-1',
          featureKey: 'teacher_app',
          enabled: false,
          source: SchoolFeatureControlSource.PLATFORM,
          notes: 'Deferred until onboarding',
        },
      ],
    });
    expect(response.summary).toMatchObject({ configured: 2, enabled: 1 });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.feature_controls.bulk_update',
        resourceType: 'school_feature_controls',
        after: expect.objectContaining({
          requestedFeatureKeys: ['dashboard', 'teacher_app'],
          changedFeatureKeys: ['dashboard', 'teacher_app'],
        }),
      }),
    );
    expect(JSON.stringify(authRepository.createAuditLog.mock.calls)).not.toContain(
      'Deferred until onboarding',
    );
  });

  it('rejects archived schools before feature writes', async () => {
    const { repository, authRepository } = mocks();
    repository.findSchoolById.mockResolvedValue(
      schoolRecord({ status: SchoolStatus.ARCHIVED }),
    );
    const useCase = new UpsertSchoolFeatureControlUseCase(
      repository as never,
      authRepository as never,
    );

    await expect(
      withPlatformScope(['platform.features.manage'], () =>
        useCase.execute('school-1', 'dashboard', { enabled: true }),
      ),
    ).rejects.toBeInstanceOf(PlatformFeatureSchoolArchivedException);

    expect(repository.upsertFeatureControl).not.toHaveBeenCalled();
  });
});

function mocks(): {
  repository: jest.Mocked<Partial<PlatformAdminFeaturesRepository>>;
  authRepository: { createAuditLog: jest.Mock };
} {
  return {
    repository: {
      findSchoolById: jest.fn(),
      listFeatureControlsBySchoolId: jest.fn(),
      findFeatureControlBySchoolAndKey: jest.fn(),
      upsertFeatureControl: jest.fn(),
      upsertFeatureControlsTransactionally: jest.fn(),
      loadOverviewCounters: jest.fn(),
    },
    authRepository: { createAuditLog: jest.fn().mockResolvedValue(undefined) },
  };
}

function withPlatformScope<T>(
  permissions: string[],
  fn: () => Promise<T>,
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'platform-1', userType: UserType.PLATFORM_USER });
    setPlatformPermissions(permissions);
    return fn();
  });
}

function schoolRecord(
  overrides: Partial<PlatformFeatureControlSchoolRecord> = {},
): PlatformFeatureControlSchoolRecord {
  return {
    id: 'school-1',
    organizationId: 'org-1',
    name: 'Moazez Primary',
    slug: 'primary',
    status: SchoolStatus.ACTIVE,
    deletedAt: null,
    ...overrides,
  };
}

function featureControlRecord(
  overrides: Partial<PlatformSchoolFeatureControlRecord> = {},
): PlatformSchoolFeatureControlRecord {
  return {
    id: 'feature-control-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    featureKey: 'dashboard',
    enabled: true,
    source: SchoolFeatureControlSource.PLATFORM,
    notes: null,
    createdAt: new Date('2026-06-01T09:00:00.000Z'),
    updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    ...overrides,
  };
}
