import { LeadChannel, LeadStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { CreateLeadUseCase } from '../application/create-lead.use-case';
import { LeadsRepository } from '../infrastructure/leads.repository';

describe('CreateLeadUseCase', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['admissions.leads.manage'],
      });

      return fn();
    });
  }

  it('creates a lead successfully with the bounded admissions payload', async () => {
    const leadsRepository = {
      createLead: jest.fn().mockResolvedValue({
        id: 'lead-1',
        schoolId: 'school-1',
        organizationId: 'org-1',
        studentName: 'Mariam Hassan',
        primaryContactName: 'Hassan Ali',
        phone: '+201001112233',
        email: 'parent@example.com',
        channel: LeadChannel.IN_APP,
        status: LeadStatus.NEW,
        notes: 'Interested in Grade 4',
        ownerUserId: null,
        createdAt: new Date('2026-04-21T10:00:00.000Z'),
        updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        deletedAt: null,
      }),
    } as unknown as LeadsRepository;

    const useCase = new CreateLeadUseCase(leadsRepository);

    const result = await withScope(() =>
      useCase.execute({
        studentName: '  Mariam Hassan  ',
        primaryContactName: ' Hassan Ali ',
        phone: '+201001112233',
        email: ' parent@example.com ',
        channel: 'In-app',
        notes: ' Interested in Grade 4 ',
      }),
    );

    expect(leadsRepository.createLead).toHaveBeenCalledWith({
      schoolId: 'school-1',
      organizationId: 'org-1',
      studentName: 'Mariam Hassan',
      primaryContactName: 'Hassan Ali',
      phone: '+201001112233',
      email: 'parent@example.com',
      channel: LeadChannel.IN_APP,
      status: 'NEW',
      notes: 'Interested in Grade 4',
      ownerUserId: null,
    });
    expect(result).toEqual({
      id: 'lead-1',
      studentName: 'Mariam Hassan',
      primaryContactName: 'Hassan Ali',
      phone: '+201001112233',
      email: 'parent@example.com',
      channel: 'In-app',
      status: 'New',
      notes: 'Interested in Grade 4',
      createdAt: '2026-04-21T10:00:00.000Z',
      updatedAt: '2026-04-21T10:00:00.000Z',
    });
  });
});
