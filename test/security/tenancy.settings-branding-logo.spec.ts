import { ConfigService } from '@nestjs/config';
import { FileVisibility, PrismaClient } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PUBLIC_ROUTE_METADATA } from '../../src/common/decorators/public-route.decorator';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { SCHOOL_MANAGEMENT_ONLY_METADATA } from '../../src/common/decorators/school-management-only.decorator';
import { ResolveSchoolLogoUrlService } from '../../src/modules/settings/branding/application/resolve-school-logo-url.service';
import { BrandingController } from '../../src/modules/settings/branding/controller/branding.controller';
import { PublicSchoolBrandingController } from '../../src/modules/settings/branding/controller/public-school-branding.controller';
import { UploadBrandingLogoDto } from '../../src/modules/settings/branding/dto/upload-branding-logo.dto';
import { BrandingRepository } from '../../src/modules/settings/branding/infrastructure/branding.repository';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';

jest.setTimeout(30_000);

describe('Settings branding logo tenancy invariants (security)', () => {
  let prisma: PrismaClient;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterEach(async () => {
    if (createdSchoolIds.length > 0) {
      await prisma.schoolProfile.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.file.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
    }
    if (createdOrganizationIds.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
    }
    createdSchoolIds.length = 0;
    createdOrganizationIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('locks management routes to the permission and school-management guard', () => {
    for (const handler of [
      BrandingController.prototype.uploadLogo,
      BrandingController.prototype.deleteLogo,
    ]) {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, handler),
      ).toEqual(['settings.branding.manage']);
      expect(
        Reflect.getMetadata(SCHOOL_MANAGEMENT_ONLY_METADATA, handler),
      ).toBe(true);
      expect(Reflect.getMetadata(PUBLIC_ROUTE_METADATA, handler)).not.toBe(
        true,
      );
    }
    expect(
      Reflect.getMetadata(
        PUBLIC_ROUTE_METADATA,
        PublicSchoolBrandingController.prototype.getLogo,
      ),
    ).toBe(true);
  });

  it('rejects client ownership fields in the multipart body contract', async () => {
    const body = plainToInstance(UploadBrandingLogoDto, {
      schoolId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      logoFileId: '33333333-3333-4333-8333-333333333333',
      objectKey: 'private/key',
    });
    const errors = await validate(body, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((error) => error.property).sort()).toEqual([
      'logoFileId',
      'objectKey',
      'organizationId',
      'schoolId',
    ]);
  });

  it('enforces the same-school composite relation in PostgreSQL', async () => {
    const { schoolAId, schoolBId, organizationAId, organizationBId } =
      await createTwoSchools();
    const fileB = await prisma.file.create({
      data: {
        schoolId: schoolBId,
        organizationId: organizationBId,
        bucket: 'private-test-bucket',
        objectKey: `schools/${schoolBId}/branding/logos/cross-school.png`,
        originalName: 'cross-school.png',
        mimeType: 'image/png',
        sizeBytes: 10,
        visibility: FileVisibility.PRIVATE,
      },
    });

    await expect(
      prisma.schoolProfile.create({
        data: { schoolId: schoolAId, logoFileId: fileB.id },
      }),
    ).rejects.toThrow();
    expect(organizationAId).not.toBe(organizationBId);
  });

  it('fails closed when a same-school File has mismatched organization metadata', async () => {
    const { schoolAId, organizationBId } = await createTwoSchools();
    const file = await prisma.file.create({
      data: {
        schoolId: schoolAId,
        organizationId: organizationBId,
        bucket: 'private-test-bucket',
        objectKey: `schools/${schoolAId}/branding/logos/org-mismatch.png`,
        originalName: 'org-mismatch.png',
        mimeType: 'image/png',
        sizeBytes: 10,
        visibility: FileVisibility.PRIVATE,
      },
    });
    await prisma.schoolProfile.create({
      data: { schoolId: schoolAId, logoFileId: file.id },
    });

    const repository = new BrandingRepository(
      prisma as unknown as PrismaService,
    );
    const config = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'STORAGE_BUCKET') return 'private-test-bucket';
        if (key === 'APP_URL') return 'https://api.example.com';
        throw new Error(`unexpected key ${key}`);
      }),
      get: jest.fn().mockReturnValue('test'),
    } as unknown as ConfigService;
    const resolver = new ResolveSchoolLogoUrlService(repository, config);

    await expect(resolver.resolveForSchool(schoolAId)).resolves.toBeNull();
    await expect(
      resolver.findEligibleManagedFile(schoolAId),
    ).resolves.toBeNull();
  });

  async function createTwoSchools(): Promise<{
    schoolAId: string;
    schoolBId: string;
    organizationAId: string;
    organizationBId: string;
  }> {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const organizationA = await prisma.organization.create({
      data: {
        name: 'Branding Security A',
        slug: `branding-security-a-${suffix}`,
      },
    });
    const organizationB = await prisma.organization.create({
      data: {
        name: 'Branding Security B',
        slug: `branding-security-b-${suffix}`,
      },
    });
    createdOrganizationIds.push(organizationA.id, organizationB.id);
    const schoolA = await prisma.school.create({
      data: {
        organizationId: organizationA.id,
        name: 'Branding Security A',
        slug: `branding-security-school-a-${suffix}`,
      },
    });
    const schoolB = await prisma.school.create({
      data: {
        organizationId: organizationB.id,
        name: 'Branding Security B',
        slug: `branding-security-school-b-${suffix}`,
      },
    });
    createdSchoolIds.push(schoolA.id, schoolB.id);
    return {
      schoolAId: schoolA.id,
      schoolBId: schoolB.id,
      organizationAId: organizationA.id,
      organizationBId: organizationB.id,
    };
  }
});
