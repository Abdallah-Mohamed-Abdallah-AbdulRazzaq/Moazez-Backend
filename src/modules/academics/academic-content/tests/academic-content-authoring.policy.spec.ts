import {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { CreateAcademicContentUseCase } from '../application/create-academic-content.use-case';
import { AcademicContentContextValidator } from '../application/academic-content-context-validator';
import {
  ACADEMIC_CONTENT_MANAGE_PERMISSION,
  canManageAcademicContent,
  canReplaceAcademicContentTargets,
} from '../domain/academic-content-authoring.policy';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';

const manage = [ACADEMIC_CONTENT_MANAGE_PERMISSION];

describe('Academic Content authoring boundary', () => {
  it.each([UserType.ORGANIZATION_USER, UserType.SCHOOL_USER])(
    'allows %s management only with the permission',
    (userType) => {
      expect(canManageAcademicContent(userType, manage)).toBe(true);
      expect(canReplaceAcademicContentTargets(userType, manage)).toBe(true);
      expect(canManageAcademicContent(userType, [])).toBe(false);
      expect(canReplaceAcademicContentTargets(userType, [])).toBe(false);
    },
  );

  it('allows Teacher targeting, but never generic management creation', () => {
    expect(canManageAcademicContent(UserType.TEACHER, manage)).toBe(false);
    expect(canReplaceAcademicContentTargets(UserType.TEACHER, [])).toBe(true);
  });

  it.each([
    UserType.PLATFORM_USER,
    UserType.PARENT,
    UserType.STUDENT,
    UserType.APPLICANT,
    UserType.PICKUP_DELEGATE,
    UserType.DISMISSAL_STAFF,
    UserType.SERVICE_ACCOUNT,
  ])('rejects %s even if management permission is injected', (userType) => {
    expect(canManageAcademicContent(userType, manage)).toBe(false);
    expect(canReplaceAcademicContentTargets(userType, manage)).toBe(false);
  });

  it.each([
    [UserType.SCHOOL_USER, manage, true],
    [UserType.ORGANIZATION_USER, manage, true],
    [UserType.SCHOOL_USER, [], false],
    [UserType.ORGANIZATION_USER, [], false],
    [UserType.TEACHER, manage, false],
    [UserType.PARENT, manage, false],
    [UserType.STUDENT, manage, false],
  ] as const)(
    'enforces the create use case for %s with permissions %j',
    async (userType, permissions, allowed) => {
      const contextValidator = {
        validate: jest.fn().mockResolvedValue(undefined),
      };
      const contentRepository = {
        create: jest.fn().mockResolvedValue({ id: 'content-1' }),
      };
      const useCase = new CreateAcademicContentUseCase(
        contextValidator as unknown as AcademicContentContextValidator,
        contentRepository as unknown as AcademicContentRepository,
      );
      await runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'actor-1', userType });
        setActiveMembership({
          membershipId: 'membership-1',
          organizationId: 'organization-1',
          schoolId: 'school-1',
          roleId: 'role-1',
          permissions: [...permissions],
        });
        const command = {
          title: 'Resource',
          academicYearId: 'year-1',
          termId: 'term-1',
          type: AcademicContentType.GENERAL_RESOURCE,
          audience: AcademicContentAudienceType.STUDENTS_AND_GUARDIANS,
        };
        if (allowed) {
          await expect(useCase.execute(command)).resolves.toEqual({
            id: 'content-1',
          });
          expect(contentRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
              schoolId: 'school-1',
              createdByUserId: 'actor-1',
              title: 'Resource',
              status: AcademicContentStatus.DRAFT,
            }),
          );
        } else {
          await expect(useCase.execute(command)).rejects.toMatchObject({
            code: 'auth.scope.missing',
            httpStatus: 403,
          });
          expect(contentRepository.create).not.toHaveBeenCalled();
        }
      });
    },
  );
});
