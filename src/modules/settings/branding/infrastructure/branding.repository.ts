import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  FileVisibility,
  OrganizationStatus,
  Prisma,
  SchoolProfile,
  SchoolStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  BrandingLogoActorScope,
  BrandingLogoCleanupCursor,
  CleanupBrandingLogoFile,
  ManagedBrandingLogoFile,
} from '../domain/branding-logo.types';
import {
  BRANDING_LOGO_MAX_SIZE_BYTES,
  BRANDING_LOGO_TRANSACTION_MAX_ATTEMPTS,
  isBrandingLogoObjectKeyForSchool,
  isBrandingLogoMimeType,
} from '../domain/branding-logo.constants';

const MANAGED_LOGO_FILE_SELECT = {
  id: true,
  organizationId: true,
  schoolId: true,
  bucket: true,
  objectKey: true,
  mimeType: true,
  sizeBytes: true,
  visibility: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.FileSelect;

const LOGO_RESOLUTION_SELECT = {
  id: true,
  organizationId: true,
  schoolProfile: {
    select: {
      logoUrl: true,
      logoFile: { select: MANAGED_LOGO_FILE_SELECT },
    },
  },
} satisfies Prisma.SchoolSelect;

export type BrandingLogoResolutionRecord = Prisma.SchoolGetPayload<{
  select: typeof LOGO_RESOLUTION_SELECT;
}>;

export interface StoredBrandingLogoMetadata {
  bucket: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint;
  checksumSha256: string;
}

@Injectable()
export class BrandingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySchoolId(schoolId: string): Promise<SchoolProfile | null> {
    return this.prisma.schoolProfile.findUnique({ where: { schoolId } });
  }

  findSchoolName(schoolId: string): Promise<string | null> {
    return this.prisma.school
      .findUnique({ where: { id: schoolId }, select: { name: true } })
      .then((school) => school?.name ?? null);
  }

  upsert(
    schoolId: string,
    updatedById: string,
    data: {
      schoolName?: string;
      shortName?: string;
      timezone?: string;
      addressLine?: string;
      formattedAddress?: string;
      city?: string;
      country?: string;
      footerSignature?: string;
      latitude?: Prisma.Decimal | number;
      longitude?: Prisma.Decimal | number;
      mapPlaceLabel?: string;
    },
  ): Promise<SchoolProfile> {
    return this.prisma.schoolProfile.upsert({
      where: { schoolId },
      update: { ...data, updatedById },
      create: { schoolId, ...data, updatedById },
    });
  }

  findLogoResolutionRecords(
    schoolIds: string[],
  ): Promise<BrandingLogoResolutionRecord[]> {
    if (schoolIds.length === 0) return Promise.resolve([]);

    return this.prisma.school.findMany({
      where: {
        id: { in: schoolIds },
        status: SchoolStatus.ACTIVE,
        deletedAt: null,
        organization: {
          status: OrganizationStatus.ACTIVE,
          deletedAt: null,
        },
      },
      select: LOGO_RESOLUTION_SELECT,
    });
  }

  async replaceManagedLogo(input: {
    scope: BrandingLogoActorScope;
    file: StoredBrandingLogoMetadata;
    expectedPrivateBucket: string;
  }): Promise<{
    profile: SchoolProfile;
    previousFile: ManagedBrandingLogoFile | null;
  }> {
    return this.runSerializable(async (tx) => {
      await this.requireActiveSchoolOrganization(tx, input.scope);

      const previousProfile = await tx.schoolProfile.findUnique({
        where: { schoolId: input.scope.schoolId },
        select: {
          id: true,
          logoUrl: true,
          logoFile: { select: MANAGED_LOGO_FILE_SELECT },
        },
      });
      const priorManagedValueExisted = Boolean(previousProfile?.logoFile);
      const priorLegacyValueExisted = Boolean(previousProfile?.logoUrl);
      const previousLinkedFile = previousProfile?.logoFile ?? null;
      const previousFileIsEligibleManagedLogo =
        this.isEligiblePreviousManagedFile(
          previousLinkedFile,
          input.scope,
          input.expectedPrivateBucket,
        );

      const createdFile = await tx.file.create({
        data: {
          organizationId: input.scope.organizationId,
          schoolId: input.scope.schoolId,
          uploaderId: input.scope.actorId,
          bucket: input.file.bucket,
          objectKey: input.file.objectKey,
          originalName: input.file.originalName,
          mimeType: input.file.mimeType,
          sizeBytes: input.file.sizeBytes,
          checksumSha256: input.file.checksumSha256,
          visibility: FileVisibility.PRIVATE,
        },
      });

      const profile = await tx.schoolProfile.upsert({
        where: { schoolId: input.scope.schoolId },
        update: {
          logoFileId: createdFile.id,
          updatedById: input.scope.actorId,
        },
        create: {
          schoolId: input.scope.schoolId,
          logoFileId: createdFile.id,
          updatedById: input.scope.actorId,
        },
      });

      let previousFile: ManagedBrandingLogoFile | null = null;
      if (previousFileIsEligibleManagedLogo && previousLinkedFile) {
        const deletedAt = new Date();
        const updateResult = await tx.file.updateMany({
          where: {
            id: previousLinkedFile.id,
            schoolId: input.scope.schoolId,
            organizationId: input.scope.organizationId,
            visibility: FileVisibility.PRIVATE,
            bucket: input.expectedPrivateBucket,
            objectKey: previousLinkedFile.objectKey,
            mimeType: previousLinkedFile.mimeType,
            sizeBytes: {
              gt: 0n,
              lte: BigInt(BRANDING_LOGO_MAX_SIZE_BYTES),
            },
            deletedAt: null,
          },
          data: { deletedAt },
        });
        if (updateResult.count === 1) {
          previousFile = { ...previousLinkedFile, deletedAt };
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: input.scope.actorId,
          userType: input.scope.userType,
          organizationId: input.scope.organizationId,
          schoolId: input.scope.schoolId,
          module: 'settings',
          action: previousFileIsEligibleManagedLogo
            ? 'branding.logo.replace'
            : 'branding.logo.upload',
          resourceType: 'school_branding_logo',
          resourceId: profile.id,
          outcome: AuditOutcome.SUCCESS,
          after: {
            changed: true,
            detectedMime: input.file.mimeType,
            byteSize: Number(input.file.sizeBytes),
            priorManagedValueExisted,
            priorLegacyValueExisted,
            replacement: previousFileIsEligibleManagedLogo,
          },
        },
      });

      return {
        profile,
        previousFile,
      };
    });
  }

  async deleteManagedLogo(
    input: BrandingLogoActorScope,
    expectedPrivateBucket: string,
  ): Promise<{
    changed: boolean;
    previousFile: ManagedBrandingLogoFile | null;
  }> {
    return this.runSerializable(async (tx) => {
      await this.requireActiveSchoolOrganization(tx, input);

      const profile = await tx.schoolProfile.findUnique({
        where: { schoolId: input.schoolId },
        select: {
          id: true,
          logoUrl: true,
          logoFile: { select: MANAGED_LOGO_FILE_SELECT },
        },
      });
      const priorManagedValueExisted = Boolean(profile?.logoFile);
      const priorLegacyValueExisted = Boolean(profile?.logoUrl);
      const changed = priorManagedValueExisted || priorLegacyValueExisted;
      const linkedFile = profile?.logoFile ?? null;
      const previousFileIsEligibleManagedLogo =
        this.isEligiblePreviousManagedFile(
          linkedFile,
          input,
          expectedPrivateBucket,
        );

      if (profile && changed) {
        await tx.schoolProfile.update({
          where: { id: profile.id },
          data: {
            logoFileId: null,
            logoUrl: null,
            updatedById: input.actorId,
          },
        });
      }

      let previousFile: ManagedBrandingLogoFile | null = null;
      if (previousFileIsEligibleManagedLogo && linkedFile) {
        const deletedAt = new Date();
        const updateResult = await tx.file.updateMany({
          where: {
            id: linkedFile.id,
            schoolId: input.schoolId,
            organizationId: input.organizationId,
            visibility: FileVisibility.PRIVATE,
            bucket: expectedPrivateBucket,
            objectKey: linkedFile.objectKey,
            mimeType: linkedFile.mimeType,
            sizeBytes: {
              gt: 0n,
              lte: BigInt(BRANDING_LOGO_MAX_SIZE_BYTES),
            },
            deletedAt: null,
          },
          data: { deletedAt },
        });
        if (updateResult.count === 1) {
          previousFile = { ...linkedFile, deletedAt };
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          userType: input.userType,
          organizationId: input.organizationId,
          schoolId: input.schoolId,
          module: 'settings',
          action: 'branding.logo.delete',
          resourceType: 'school_branding_logo',
          resourceId: profile?.id ?? null,
          outcome: AuditOutcome.SUCCESS,
          after: {
            changed,
            priorManagedValueExisted,
            priorLegacyValueExisted,
            replacement: false,
            ...(previousFileIsEligibleManagedLogo && linkedFile
              ? {
                  detectedMime: linkedFile.mimeType,
                  byteSize: Number(linkedFile.sizeBytes),
                }
              : {}),
          },
        },
      });

      return { changed, previousFile };
    });
  }

  async recordLogoFailure(input: {
    scope: BrandingLogoActorScope;
    action: string;
    failureKind: string;
  }): Promise<void> {
    try {
      const profile = await this.prisma.schoolProfile.findUnique({
        where: { schoolId: input.scope.schoolId },
        select: { id: true },
      });
      await this.prisma.auditLog.create({
        data: {
          actorId: input.scope.actorId,
          userType: input.scope.userType,
          organizationId: input.scope.organizationId,
          schoolId: input.scope.schoolId,
          module: 'settings',
          action: input.action,
          resourceType: 'school_branding_logo',
          resourceId: profile?.id ?? null,
          outcome: AuditOutcome.FAILURE,
          after: { changed: false, failureKind: input.failureKind },
        },
      });
    } catch {
      // Failure evidence is best effort and must never mask the original error.
    }
  }

  async findCleanupFile(
    fileId: string,
  ): Promise<CleanupBrandingLogoFile | null> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: { not: null } },
      select: {
        ...MANAGED_LOGO_FILE_SELECT,
        school: { select: { organizationId: true } },
      },
    });
    return file
      ? {
          ...file,
          schoolOrganizationId: file.school?.organizationId ?? null,
        }
      : null;
  }

  async findSoftDeletedBrandingFiles(
    limit: number,
    cursor: BrandingLogoCleanupCursor | null = null,
  ): Promise<CleanupBrandingLogoFile[]> {
    const files = await this.prisma.file.findMany({
      where: {
        deletedAt: { not: null },
        objectKey: { contains: '/branding/logos/' },
        ...(cursor
          ? {
              OR: [
                { deletedAt: { gt: cursor.deletedAt } },
                { deletedAt: cursor.deletedAt, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      select: {
        ...MANAGED_LOGO_FILE_SELECT,
        school: { select: { organizationId: true } },
      },
      orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return files.map((file) => ({
      ...file,
      schoolOrganizationId: file.school?.organizationId ?? null,
    }));
  }

  async findKnownStorageLocations(
    bucket: string,
    objectKeys: string[],
  ): Promise<Set<string>> {
    if (objectKeys.length === 0) return new Set();
    const rows = await this.prisma.file.findMany({
      where: { bucket, objectKey: { in: objectKeys } },
      select: { objectKey: true },
    });
    return new Set(rows.map((row) => row.objectKey));
  }

  private async requireActiveSchoolOrganization(
    tx: Prisma.TransactionClient,
    scope: BrandingLogoActorScope,
  ): Promise<void> {
    const school = await tx.school.findFirst({
      where: {
        id: scope.schoolId,
        organizationId: scope.organizationId,
        status: SchoolStatus.ACTIVE,
        deletedAt: null,
        organization: {
          status: OrganizationStatus.ACTIVE,
          deletedAt: null,
        },
      },
      select: { id: true },
    });
    if (!school) throw new NotFoundDomainException('Resource not found');
  }

  private isEligiblePreviousManagedFile(
    file: ManagedBrandingLogoFile | null,
    scope: BrandingLogoActorScope,
    expectedBucket: string,
  ): boolean {
    return Boolean(
      file &&
      file.deletedAt === null &&
      file.schoolId === scope.schoolId &&
      file.organizationId === scope.organizationId &&
      file.visibility === FileVisibility.PRIVATE &&
      file.bucket === expectedBucket &&
      isBrandingLogoObjectKeyForSchool(file.objectKey, scope.schoolId) &&
      isBrandingLogoMimeType(file.mimeType) &&
      file.sizeBytes > 0n &&
      file.sizeBytes <= BigInt(BRANDING_LOGO_MAX_SIZE_BYTES),
    );
  }

  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 1;
      attempt <= BRANDING_LOGO_TRANSACTION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (
          !isRetryableTransactionConflict(error) ||
          attempt === BRANDING_LOGO_TRANSACTION_MAX_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
    throw new Error('unreachable_transaction_retry_state');
  }
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2034',
  );
}
