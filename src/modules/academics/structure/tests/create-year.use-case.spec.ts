import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { CreateYearUseCase } from '../application/create-year.use-case';
import { AcademicYearOverlapException } from '../domain/structure.exceptions';
import { AcademicYearsRepository } from '../infrastructure/academic-years.repository';

describe('CreateYearUseCase', () => {
  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['academics.structure.manage'],
      });

      await testFn();
    });
  }

  it('rejects overlapping academic years', async () => {
    const repository = {
      findOverlappingYear: jest.fn().mockResolvedValue({
        id: 'year-overlap',
      }),
    } as unknown as AcademicYearsRepository;

    const useCase = new CreateYearUseCase(repository);

    await withScope(async () => {
      await expect(
        useCase.execute({
          nameEn: '2026/2027',
          nameAr: '2026/2027',
          startDate: '2026-09-01',
          endDate: '2027-06-30',
          isActive: false,
        }),
      ).rejects.toBeInstanceOf(AcademicYearOverlapException);
    });
  });
});
