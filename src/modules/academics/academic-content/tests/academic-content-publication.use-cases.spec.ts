import { randomUUID } from 'node:crypto';
import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  ScheduleAcademicContentPublicationUseCase,
  UnscheduleAcademicContentPublicationUseCase,
  GetAcademicContentPublicationReadinessUseCase,
  ListAcademicContentPublicationHistoryUseCase,
  GetAcademicContentPublicationUseCase,
  GetAcademicContentAudiencePreviewUseCase,
} from '../application/academic-content-publication.use-cases';
import { AcademicContentAudienceResolver } from '../application/academic-content-audience.resolver';
import { AcademicContentPublicationRepository } from '../infrastructure/academic-content-publication.repository';

describe('ACC-7B publication application boundary', () => {
  const contentId = randomUUID(),
    publicationId = randomUUID(),
    schoolId = randomUUID(),
    organizationId = randomUUID(),
    actorId = randomUUID();
  const command = { clientRequestId: randomUUID() };
  const view = 'academics.academic_content.view',
    publish = 'academics.academic_content.publish';
  const repository = {
    schedule: jest.fn().mockResolvedValue({ publicationId }),
    unschedule: jest.fn().mockResolvedValue({ publicationId }),
    readiness: jest.fn().mockResolvedValue({ canPublish: true }),
    history: jest.fn().mockResolvedValue({ items: [] }),
    detail: jest.fn().mockResolvedValue({ publicationId }),
  };
  const resolver = {
    resolve: jest.fn().mockResolvedValue({ students: [], guardians: [] }),
  };
  const typed = repository as unknown as AcademicContentPublicationRepository;
  const schedule = new ScheduleAcademicContentPublicationUseCase(typed, {
      ensureAfterCommit: jest.fn(),
    } as never),
    unschedule = new UnscheduleAcademicContentPublicationUseCase(typed);
  const readiness = new GetAcademicContentPublicationReadinessUseCase(typed),
    history = new ListAcademicContentPublicationHistoryUseCase(typed);
  const detail = new GetAcademicContentPublicationUseCase(typed),
    preview = new GetAcademicContentAudiencePreviewUseCase(
      resolver as unknown as AcademicContentAudienceResolver,
    );
  function asActor<T>(
    permissions: string[],
    action: () => T,
    userType: UserType = UserType.SCHOOL_USER,
    scoped = true,
  ): T {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: actorId, userType });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId: scoped ? schoolId : undefined,
        organizationId,
        roleId: randomUUID(),
        permissions,
      });
      return action();
    });
  }
  beforeEach(() => jest.clearAllMocks());
  it.each([UserType.SCHOOL_USER, UserType.ORGANIZATION_USER])(
    'allows publish mutations for scoped %s',
    async (userType) => {
      await asActor(
        [publish],
        () => schedule.execute(contentId, command),
        userType,
      );
      await asActor(
        [publish],
        () => unschedule.execute(contentId, publicationId),
        userType,
      );
      expect(repository.schedule).toHaveBeenCalledWith({
        contentId,
        command,
        schoolId,
        organizationId,
        actorId,
      });
      expect(repository.unschedule).toHaveBeenCalledWith({
        contentId,
        publicationId,
        schoolId,
        organizationId,
        actorId,
      });
    },
  );
  it.each([
    UserType.TEACHER,
    UserType.STUDENT,
    UserType.PARENT,
    UserType.APPLICANT,
  ])('denies app management for %s even with publish', (userType) => {
    expect(() =>
      asActor([publish], () => schedule.execute(contentId, command), userType),
    ).toThrow();
    expect(() =>
      asActor(
        [publish],
        () => unschedule.execute(contentId, publicationId),
        userType,
      ),
    ).toThrow();
    expect(repository.schedule).not.toHaveBeenCalled();
    expect(repository.unschedule).not.toHaveBeenCalled();
  });
  it.each(
    [[], [view], ['academics.academic_content.manage']].map((permissions) => [
      permissions,
    ]),
  )('denies mutations without publish: %j', (permissions) => {
    expect(() =>
      asActor(permissions, () => schedule.execute(contentId, command)),
    ).toThrow();
    expect(() =>
      asActor(permissions, () => unschedule.execute(contentId, publicationId)),
    ).toThrow();
  });
  it('requires active School scope and view for every read/preview', async () => {
    const reads = [
      () => readiness.execute(contentId),
      () => history.execute(contentId),
      () => detail.execute(contentId, publicationId),
    ];
    for (const read of reads) {
      expect(() => asActor([publish], read)).toThrow();
      expect(() =>
        asActor([view], read, UserType.ORGANIZATION_USER, false),
      ).toThrow();
      expect(() => asActor([view], read, UserType.TEACHER)).toThrow();
      await asActor([view], read, UserType.ORGANIZATION_USER);
    }
    await expect(
      asActor([publish], () => preview.execute(contentId)),
    ).rejects.toMatchObject({ code: 'auth.scope.missing' });
    await expect(
      asActor([view], () => preview.execute(contentId), UserType.TEACHER),
    ).rejects.toMatchObject({ code: 'auth.scope.missing' });
    await asActor([view], () => preview.execute(contentId));
    expect(repository.schedule).not.toHaveBeenCalled();
    expect(repository.unschedule).not.toHaveBeenCalled();
  });
  it.each(['publishAt', 'visibleFrom', 'visibleUntil'])(
    'rejects invalid %s before persistence',
    (key) => {
      expect(() =>
        asActor([publish], () =>
          schedule.execute(contentId, { ...command, [key]: new Date(NaN) }),
        ),
      ).toThrow();
      expect(repository.schedule).not.toHaveBeenCalled();
    },
  );
  it.each([
    'requestFingerprint',
    'revisionId',
    'status',
    'sourceContentStatus',
    'createdByUserId',
    'schoolId',
    'studentRecipientCount',
  ])('rejects caller-owned %s', (key) => {
    expect(() =>
      asActor([publish], () =>
        schedule.execute(contentId, { ...command, [key]: 'invented' }),
      ),
    ).toThrow();
    expect(repository.schedule).not.toHaveBeenCalled();
  });
  it('rejects malformed command/request/content/publication identities before persistence', () => {
    expect(() =>
      asActor([publish], () =>
        schedule.execute(contentId, { clientRequestId: 'bad' }),
      ),
    ).toThrow();
    expect(() =>
      asActor([publish], () => schedule.execute('bad', command)),
    ).toThrow();
    expect(() =>
      asActor([publish], () => unschedule.execute(contentId, 'bad')),
    ).toThrow();
    expect(repository.schedule).not.toHaveBeenCalled();
    expect(repository.unschedule).not.toHaveBeenCalled();
  });
  it.each([
    { page: 0 },
    { page: 1.5 },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { page: Number.MAX_SAFE_INTEGER },
    { page: 21_474_838, limit: 100 },
  ])('rejects invalid pagination %j', (input) => {
    expect(() =>
      asActor([view], () => history.execute(contentId, input)),
    ).toThrow();
    expect(repository.history).not.toHaveBeenCalled();
  });
  it('uses bounded pagination defaults and carries exact read identity', async () => {
    await asActor([view], () => history.execute(contentId));
    await asActor([view], () =>
      history.execute(contentId, { page: 2, limit: 100 }),
    );
    await asActor([view], () => detail.execute(contentId, publicationId));
    expect(repository.history).toHaveBeenNthCalledWith(1, {
      schoolId,
      contentId,
      page: 1,
      limit: 20,
    });
    expect(repository.history).toHaveBeenNthCalledWith(2, {
      schoolId,
      contentId,
      page: 2,
      limit: 100,
    });
    expect(repository.detail).toHaveBeenCalledWith({
      schoolId,
      contentId,
      publicationId,
    });
  });
  it('returns only current audience aggregates without any publication/revision/audit writer', async () => {
    const student = {
      studentId: randomUUID(),
      enrollmentId: randomUUID(),
      studentUserId: null,
      classroomId: randomUUID(),
      matchedTargetIds: [randomUUID()],
    };
    const user = randomUUID();
    const guardian = {
      guardianId: randomUUID(),
      recipientUserId: user,
      studentId: student.studentId,
      enrollmentId: student.enrollmentId,
      canReceiveNotifications: false,
      matchedTargetIds: student.matchedTargetIds,
    };
    resolver.resolve.mockResolvedValueOnce({
      students: [student, { ...student, enrollmentId: randomUUID() }],
      guardians: [
        guardian,
        { ...guardian, canReceiveNotifications: null },
        { ...guardian, recipientUserId: null },
        {
          ...guardian,
          recipientUserId: randomUUID(),
          canReceiveNotifications: true,
        },
      ],
    });
    const result = await asActor([view], () => preview.execute(contentId));
    expect(result).toEqual({
      asOf: expect.any(Date) as unknown,
      students: 2,
      guardianContexts: 4,
      guardianUsersWithAccounts: 2,
      guardianNotificationOptOutContexts: 2,
    });
    expect(resolver.resolve).toHaveBeenCalledWith(contentId, schoolId);
    expect(JSON.stringify(result)).not.toContain(student.studentId);
    expect(JSON.stringify(result)).not.toContain(user);
    for (const fn of Object.values(repository))
      expect(fn).not.toHaveBeenCalled();
  });
  it('propagates non-disclosing resolver/repository not-found', async () => {
    repository.detail.mockRejectedValueOnce(
      new NotFoundDomainException('Publication not found'),
    );
    resolver.resolve.mockRejectedValueOnce(
      new NotFoundDomainException('Academic content not found'),
    );
    await expect(
      asActor([view], () => detail.execute(contentId, publicationId)),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      asActor([view], () => preview.execute(contentId)),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
