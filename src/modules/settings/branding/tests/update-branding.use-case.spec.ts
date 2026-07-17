import { AuditOutcome, UserType } from '@prisma/client';
import {
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  runWithRequestContext,
  createRequestContext,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { BrandingRepository } from '../infrastructure/branding.repository';
import { UpdateBrandingUseCase } from '../application/update-branding.use-case';
import { ResolveSchoolLogoUrlService } from '../application/resolve-school-logo-url.service';
import { GetBrandingUseCase } from '../application/get-branding.use-case';

describe('UpdateBrandingUseCase', () => {
  it('returns the resolver-owned absolute logo URL from Branding GET', async () => {
    const brandingRepository = {
      findBySchoolId: jest.fn().mockResolvedValue({
        id: 'profile-1',
        schoolId: 'school-1',
        schoolName: 'School',
        logoUrl: 'raw/private/key.png',
      }),
      findSchoolName: jest.fn().mockResolvedValue('School'),
    } as unknown as BrandingRepository;
    const logoResolver = {
      resolveForSchool: jest
        .fn()
        .mockResolvedValue(
          'https://api.school-domain.com/api/v1/public/schools/school-1/branding/logo?v=managed',
        ),
    } as unknown as ResolveSchoolLogoUrlService;
    const useCase = new GetBrandingUseCase(brandingRepository, logoResolver);

    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['settings.branding.view'],
      });

      await expect(useCase.execute()).resolves.toMatchObject({
        logoUrl:
          'https://api.school-domain.com/api/v1/public/schools/school-1/branding/logo?v=managed',
      });
      expect(logoResolver.resolveForSchool).toHaveBeenCalledWith('school-1');
    });
  });

  it('persists branding changes for the active school', async () => {
    const brandingRepository = {
      upsert: jest.fn().mockResolvedValue({
        id: 'profile-1',
        schoolId: 'school-1',
        schoolName: 'Updated School',
        shortName: 'US',
        timezone: 'Africa/Cairo',
        addressLine: 'North 90',
        formattedAddress: 'North 90, Cairo',
        city: 'Cairo',
        country: 'Egypt',
        footerSignature: 'Footer',
        logoUrl: 'https://example.com/logo.png',
        latitude: { toNumber: () => 30.1 },
        longitude: { toNumber: () => 31.2 },
        mapPlaceLabel: 'Updated School',
      }),
    } as unknown as BrandingRepository;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const logoResolver = {
      resolveForSchool: jest
        .fn()
        .mockResolvedValue(
          'https://api.example.com/api/v1/public/logo?v=opaque',
        ),
    } as unknown as ResolveSchoolLogoUrlService;

    const useCase = new UpdateBrandingUseCase(
      brandingRepository,
      authRepository,
      logoResolver,
    );

    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['settings.branding.manage'],
      });

      const result = await useCase.execute({
        schoolName: 'Updated School',
        timezone: 'Africa/Cairo',
        city: 'Cairo',
      });

      expect(brandingRepository.upsert).toHaveBeenCalledWith(
        'school-1',
        'user-1',
        expect.objectContaining({
          schoolName: 'Updated School',
          timezone: 'Africa/Cairo',
          city: 'Cairo',
        }),
      );
      expect(authRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user-1',
          schoolId: 'school-1',
          module: 'settings',
          action: 'branding.update',
          outcome: AuditOutcome.SUCCESS,
        }),
      );
      expect(result.schoolName).toBe('Updated School');
      expect(result.latitude).toBe(30.1);
      expect(result.longitude).toBe(31.2);
      expect(result.logoUrl).toContain('https://api.example.com/');
    });
  });
});
