import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileVisibility } from '@prisma/client';
import {
  BRANDING_LOGO_MAX_SIZE_BYTES,
  brandingLogoObjectPrefix,
  isBrandingLogoMimeType,
} from '../domain/branding-logo.constants';
import {
  EligibleBrandingLogoFile,
  ManagedBrandingLogoFile,
} from '../domain/branding-logo.types';
import { toSafeLegacyBrandingLogoUrl } from '../domain/legacy-branding-logo-url';
import {
  BrandingLogoResolutionRecord,
  BrandingRepository,
} from '../infrastructure/branding.repository';

@Injectable()
export class ResolveSchoolLogoUrlService {
  private readonly logger = new Logger(ResolveSchoolLogoUrlService.name);

  constructor(
    private readonly brandingRepository: BrandingRepository,
    private readonly configService: ConfigService,
  ) {}

  async resolveForSchool(schoolId: string): Promise<string | null> {
    const resolved = await this.resolveForSchools([schoolId]);
    return resolved.get(schoolId) ?? null;
  }

  async resolveForSchools(
    schoolIds: string[],
  ): Promise<Map<string, string | null>> {
    const uniqueSchoolIds = [...new Set(schoolIds)];
    const records =
      await this.brandingRepository.findLogoResolutionRecords(uniqueSchoolIds);
    const recordsBySchool = new Map(
      records.map((record) => [record.id, record]),
    );

    return new Map(
      uniqueSchoolIds.map((schoolId) => {
        const record = recordsBySchool.get(schoolId);
        return [schoolId, record ? this.resolveRecord(record) : null];
      }),
    );
  }

  async findEligibleManagedFile(
    schoolId: string,
  ): Promise<EligibleBrandingLogoFile | null> {
    const [record] = await this.brandingRepository.findLogoResolutionRecords([
      schoolId,
    ]);
    return record ? this.toEligibleManagedFile(record) : null;
  }

  isEligibleManagedFile(
    file: ManagedBrandingLogoFile | null,
    schoolId: string,
    organizationId: string,
  ): file is EligibleBrandingLogoFile {
    if (!file) return false;
    const expectedBucket =
      this.configService.getOrThrow<string>('STORAGE_BUCKET');

    return (
      file.deletedAt === null &&
      file.schoolId === schoolId &&
      file.organizationId === organizationId &&
      file.visibility === FileVisibility.PRIVATE &&
      file.bucket === expectedBucket &&
      file.objectKey.startsWith(brandingLogoObjectPrefix(schoolId)) &&
      isBrandingLogoMimeType(file.mimeType) &&
      file.sizeBytes > 0n &&
      file.sizeBytes <= BigInt(BRANDING_LOGO_MAX_SIZE_BYTES)
    );
  }

  private resolveRecord(record: BrandingLogoResolutionRecord): string | null {
    const managed = this.toEligibleManagedFile(record);
    if (managed) return this.buildManagedLogoUrl(record.id, managed.id);

    const legacy = toSafeLegacyBrandingLogoUrl(
      record.schoolProfile?.logoUrl ?? null,
    );
    if (legacy) {
      this.logger.log({ event: 'branding.logo.legacy_fallback_used' });
    }
    return legacy;
  }

  private toEligibleManagedFile(
    record: BrandingLogoResolutionRecord,
  ): EligibleBrandingLogoFile | null {
    const file = record.schoolProfile?.logoFile ?? null;
    return this.isEligibleManagedFile(file, record.id, record.organizationId)
      ? file
      : null;
  }

  private buildManagedLogoUrl(schoolId: string, fileId: string): string {
    const appUrlValue = this.configService.getOrThrow<string>('APP_URL');
    const appUrl = new URL(appUrlValue);
    this.assertDeploymentAppUrl(appUrl);
    const version = createHash('sha256')
      .update(fileId)
      .digest('base64url')
      .slice(0, 16);
    const url = new URL(
      `/api/v1/public/schools/${schoolId}/branding/logo`,
      appUrl,
    );
    url.searchParams.set('v', version);
    return url.toString();
  }

  private assertDeploymentAppUrl(appUrl: URL): void {
    const environment =
      this.configService.get<string>('NODE_ENV') ?? 'development';
    if (environment !== 'staging' && environment !== 'production') return;

    if (!toSafeLegacyBrandingLogoUrl(appUrl.toString())) {
      throw new Error('invalid_external_app_url');
    }
  }
}
