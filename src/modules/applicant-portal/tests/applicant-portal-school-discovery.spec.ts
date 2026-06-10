import { OrganizationStatus, SchoolStatus } from '@prisma/client';
import { DomainException } from '../../../common/exceptions/domain-exception';
import { GetDiscoverableSchoolUseCase } from '../application/get-discoverable-school.use-case';
import { ListDiscoverableSchoolsUseCase } from '../application/list-discoverable-schools.use-case';
import { normalizeSchoolDiscoveryQuery } from '../domain/school-discovery.inputs';
import {
  ApplicantPortalRepository,
  DiscoverableSchoolRecord,
} from '../infrastructure/applicant-portal.repository';
import {
  presentDiscoverableSchool,
  presentDiscoverableSchoolsList,
} from '../presenters/school-discovery.presenter';

const SCHOOL_ID = '00000000-0000-0000-0000-000000000101';

describe('Applicant Portal school discovery', () => {
  it('normalizes filters, applies pagination defaults, and clamps max limit', () => {
    expect(normalizeSchoolDiscoveryQuery()).toEqual({
      search: undefined,
      city: undefined,
      page: 1,
      limit: 20,
    });

    expect(
      normalizeSchoolDiscoveryQuery({
        search: '  Moazez   Academy ',
        city: ' Cairo ',
        page: 2,
        limit: 250,
      }),
    ).toEqual({
      search: 'Moazez Academy',
      city: 'Cairo',
      page: 2,
      limit: 100,
    });
  });

  it('rejects invalid positive integer pagination values', () => {
    expect(() => normalizeSchoolDiscoveryQuery({ page: 0, limit: 20 })).toThrow(
      DomainException,
    );
    expect(() =>
      normalizeSchoolDiscoveryQuery({ page: 1.5, limit: 20 }),
    ).toThrow(DomainException);
    expect(() => normalizeSchoolDiscoveryQuery({ page: 1, limit: 0 })).toThrow(
      DomainException,
    );
  });

  it('uses explicit active school and organization filters for list queries', async () => {
    const prisma = {
      school: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    await repository.listDiscoverableSchools({
      search: 'Academy',
      city: 'Cairo',
      page: 2,
      limit: 10,
    });

    expect(prisma.school.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            status: SchoolStatus.ACTIVE,
            deletedAt: null,
            organization: {
              status: OrganizationStatus.ACTIVE,
              deletedAt: null,
            },
          },
          {
            schoolProfile: {
              is: {
                city: { equals: 'Cairo', mode: 'insensitive' },
              },
            },
          },
          {
            OR: expect.arrayContaining([
              { name: { contains: 'Academy', mode: 'insensitive' } },
              { slug: { contains: 'Academy', mode: 'insensitive' } },
              {
                schoolProfile: {
                  is: {
                    schoolName: {
                      contains: 'Academy',
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ]),
          },
        ],
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
      select: {
        id: true,
        name: true,
        schoolProfile: {
          select: {
            schoolName: true,
            shortName: true,
            addressLine: true,
            formattedAddress: true,
            city: true,
            country: true,
            logoUrl: true,
          },
        },
      },
    });
    expect(prisma.school.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.any(Array),
        }),
      }),
    );
  });

  it('uses the same active discoverability filters for detail queries', async () => {
    const prisma = {
      school: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    await repository.findDiscoverableSchoolById(SCHOOL_ID);

    expect(prisma.school.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            AND: [
              {
                status: SchoolStatus.ACTIVE,
                deletedAt: null,
                organization: {
                  status: OrganizationStatus.ACTIVE,
                  deletedAt: null,
                },
              },
            ],
          },
          { id: SCHOOL_ID },
        ],
      },
      select: {
        id: true,
        name: true,
        schoolProfile: {
          select: {
            schoolName: true,
            shortName: true,
            addressLine: true,
            formattedAddress: true,
            city: true,
            country: true,
            logoUrl: true,
          },
        },
      },
    });
  });

  it('passes normalized filters from the list use case to the repository', async () => {
    const repository = mockApplicantRepository();
    repository.listDiscoverableSchools.mockResolvedValue({
      items: [schoolRecordFixture()],
      page: 1,
      limit: 100,
      total: 1,
    });
    const useCase = new ListDiscoverableSchoolsUseCase(repository);

    const response = await useCase.execute({
      search: '  public ',
      city: ' cairo ',
      page: 1,
      limit: 500,
    });

    expect(repository.listDiscoverableSchools).toHaveBeenCalledWith({
      search: 'public',
      city: 'cairo',
      page: 1,
      limit: 100,
    });
    expect(response.meta.limit).toBe(100);
  });

  it('returns 404 for nonexistent or non-discoverable detail records', async () => {
    const repository = mockApplicantRepository();
    repository.findDiscoverableSchoolById.mockResolvedValue(null);
    const useCase = new GetDiscoverableSchoolUseCase(repository);

    await expect(useCase.execute(SCHOOL_ID)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('presents only safe public fields for a discoverable school', () => {
    const response = presentDiscoverableSchool(
      schoolRecordFixture({
        organizationId: 'internal-org',
        status: SchoolStatus.ACTIVE,
        deletedAt: null,
        entitlement: { plan: 'internal' },
        featureControls: [{ featureKey: 'applicant_portal' }],
      } as unknown as Partial<DiscoverableSchoolRecord>),
    );

    expect(response).toEqual({
      id: SCHOOL_ID,
      name: 'Public Moazez Academy',
      shortName: 'Moazez',
      city: 'Cairo',
      country: 'Egypt',
      address: 'New Cairo, Cairo, Egypt',
      logoUrl: 'https://assets.example.test/school-logo.png',
    });

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'organizationId',
      'status',
      'deletedAt',
      'entitlement',
      'featureControls',
      'plan',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('does not return raw storage keys as logo URLs', () => {
    const response = presentDiscoverableSchool(
      schoolRecordFixture({
        schoolProfile: {
          ...schoolRecordFixture().schoolProfile,
          logoUrl: 'raw-storage-key/school-logo.png',
        },
      }),
    );

    expect(response.logoUrl).toBeNull();
  });

  it('presents list pagination metadata deterministically', () => {
    const response = presentDiscoverableSchoolsList({
      items: [schoolRecordFixture()],
      page: 2,
      limit: 20,
      total: 41,
    });

    expect(response.meta).toEqual({
      page: 2,
      limit: 20,
      total: 41,
      totalPages: 3,
      hasNextPage: true,
    });
  });
});

function schoolRecordFixture(
  overrides?: Partial<DiscoverableSchoolRecord>,
): DiscoverableSchoolRecord {
  return {
    id: SCHOOL_ID,
    name: 'Moazez Academy',
    schoolProfile: {
      schoolName: ' Public Moazez Academy ',
      shortName: ' Moazez ',
      addressLine: 'Fallback Address',
      formattedAddress: ' New Cairo, Cairo, Egypt ',
      city: ' Cairo ',
      country: ' Egypt ',
      logoUrl: 'https://assets.example.test/school-logo.png',
    },
    ...overrides,
  } as DiscoverableSchoolRecord;
}

function mockApplicantRepository(): jest.Mocked<ApplicantPortalRepository> {
  return {
    listDiscoverableSchools: jest.fn(),
    findDiscoverableSchoolById: jest.fn(),
  } as unknown as jest.Mocked<ApplicantPortalRepository>;
}
