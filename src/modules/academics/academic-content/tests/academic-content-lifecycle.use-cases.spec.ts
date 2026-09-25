import {
  AcademicContentAudienceType as Audience,
  AcademicContentType as ContentType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AcademicContentLifecycleUseCases } from '../application/academic-content-lifecycle.use-cases';

describe('ACC-4A metadata command boundary', () => {
  const contents = {
    findByIdInSchool: jest.fn().mockResolvedValue({
      id: 'content',
      type: ContentType.TEACHER_PREPARATION,
    }),
    mutate: jest.fn().mockResolvedValue({ id: 'content' }),
  };
  const useCases = new AcademicContentLifecycleUseCases(contents as never);
  const now = new Date('2030-09-15T12:00:00.000Z');

  function asManager<T>(action: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: 'actor', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership',
        organizationId: 'organization',
        schoolId: 'school',
        roleId: 'role',
        permissions: ['academics.academic_content.manage'],
      });
      return action();
    });
  }

  beforeEach(() => jest.clearAllMocks());

  it('accepts only normalized metadata and records the actor', async () => {
    await asManager(() =>
      useCases.update(
        'content',
        {
          title: '  Preparation  ',
          description: '  Details  ',
          audience: Audience.INTERNAL_STAFF,
        },
        now,
      ),
    );
    expect(contents.mutate).toHaveBeenCalledWith({
      id: 'content',
      schoolId: 'school',
      organizationId: 'organization',
      actorId: 'actor',
      action: 'update',
      now,
      changes: {
        title: 'Preparation',
        description: 'Details',
        audience: Audience.INTERNAL_STAFF,
      },
    });
  });

  it.each([
    'type',
    'academicYearId',
    'termId',
    'schoolId',
    'createdByUserId',
    'status',
    'archivedAt',
  ])('rejects ordinary update of %s', async (field) => {
    await expect(
      asManager(() =>
        useCases.update('content', { [field]: 'new' } as never, now),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(contents.mutate).not.toHaveBeenCalled();
  });

  it('rechecks audience against immutable type', async () => {
    await expect(
      asManager(() =>
        useCases.update('content', { audience: Audience.STUDENTS }, now),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(contents.mutate).not.toHaveBeenCalled();
  });
});
