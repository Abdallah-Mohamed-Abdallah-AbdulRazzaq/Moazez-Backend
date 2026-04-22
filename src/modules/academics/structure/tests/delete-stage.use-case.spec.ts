import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { DeleteStageUseCase } from '../application/delete-stage.use-case';
import { StructureChildExistsException } from '../domain/structure.exceptions';
import { StructureRepository } from '../infrastructure/structure.repository';

describe('DeleteStageUseCase', () => {
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

  it('rejects deleting a stage that still has child grades', async () => {
    const repository = {
      softDeleteStage: jest.fn().mockResolvedValue({
        status: 'has_children',
        childType: 'grade',
        childCount: 2,
      }),
    } as unknown as StructureRepository;

    const useCase = new DeleteStageUseCase(repository);

    await withScope(async () => {
      await expect(useCase.execute('stage-1')).rejects.toBeInstanceOf(
        StructureChildExistsException,
      );
    });
  });
});
