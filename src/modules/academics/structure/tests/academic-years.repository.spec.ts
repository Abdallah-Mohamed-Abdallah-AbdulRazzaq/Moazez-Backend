import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
} from '../../../../common/context/request-context';
import { AcademicYearsRepository } from '../infrastructure/academic-years.repository';

describe('AcademicYearsRepository', () => {
  it('deactivates the previous active year when activating another year', async () => {
    const years = [
      {
        id: 'year-1',
        schoolId: 'school-1',
        nameAr: '2025/2026',
        nameEn: '2025/2026',
        startDate: new Date('2025-09-01'),
        endDate: new Date('2026-06-30'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        id: 'year-2',
        schoolId: 'school-1',
        nameAr: '2026/2027',
        nameEn: '2026/2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-06-30'),
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];

    const transactionClient = {
      academicYear: {
        updateMany: jest.fn().mockImplementation(async (args) => {
          years.forEach((year) => {
            if (year.isActive && year.id !== args.where.id.not) {
              year.isActive = args.data.isActive;
            }
          });
          return { count: 1 };
        }),
        update: jest.fn().mockImplementation(async (args) => {
          const year = years.find(
            (item) => item.id === args.where.id_schoolId.id,
          );
          if (!year) {
            throw new Error('Year not found');
          }
          Object.assign(year, args.data, { updatedAt: new Date() });
          return year;
        }),
      },
    };

    const prisma = {
      $transaction: async (
        callback: (tx: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    } as unknown as ConstructorParameters<typeof AcademicYearsRepository>[0];

    const repository = new AcademicYearsRepository(prisma);

    const updated = await runWithRequestContext(createRequestContext(), async () => {
      setActiveMembership({
        membershipId: 'membership-1',
        schoolId: 'school-1',
        organizationId: 'organization-1',
        roleId: 'role-1',
        permissions: ['academics.structure.manage'],
      });

      return repository.updateYearAndDeactivateOthers('year-2', {
        isActive: true,
      });
    });

    expect(updated.id).toBe('year-2');
    expect(updated.isActive).toBe(true);
    expect(years.find((year) => year.id === 'year-1')?.isActive).toBe(false);
    expect(years.find((year) => year.id === 'year-2')?.isActive).toBe(true);
  });
});
