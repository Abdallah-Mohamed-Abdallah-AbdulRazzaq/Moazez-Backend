import { randomUUID } from 'node:crypto';
import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AcademicContentPreparationTemplateUseCases } from '../application/academic-content-preparation-template.use-cases';
import { AcademicContentPreparationTemplateRepository } from '../infrastructure/academic-content-preparation-template.repository';

describe('ACC-6D template application boundary', () => {
  const schoolId = randomUUID();
  const templateId = randomUUID();
  const repository = {
    list: jest
      .fn()
      .mockResolvedValue({ items: [], page: 1, limit: 50, total: 0 }),
    detail: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({ ok: true }),
  };
  const useCases = new AcademicContentPreparationTemplateUseCases(
    repository as unknown as AcademicContentPreparationTemplateRepository,
  );

  function asActor<T>(
    permissions: string[],
    action: () => T,
    userType = UserType.SCHOOL_USER,
  ): T {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: randomUUID(), userType });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId,
        organizationId: randomUUID(),
        roleId: randomUUID(),
        permissions,
      });
      return action();
    });
  }

  beforeEach(() => jest.clearAllMocks());

  it('keeps view and settings.manage independent for all five operations', async () => {
    const view = ['academics.academic_content.view'];
    const settings = ['academics.academic_content.settings.manage'];
    await asActor(view, () => useCases.list({}));
    expect(repository.list).toHaveBeenCalledWith(schoolId, {
      page: 1,
      limit: 50,
      stageId: undefined,
      subjectId: undefined,
      search: undefined,
    });
    await asActor(view, () => useCases.list({ page: 2, limit: 100 }));
    await asActor(view, () => useCases.detail(templateId));
    expect(() => asActor(view, () => useCases.create({ name: 'X' }))).toThrow();
    expect(() =>
      asActor(view, () => useCases.update(templateId, { name: 'X' })),
    ).toThrow();
    expect(() => asActor(view, () => useCases.delete(templateId))).toThrow();
    await asActor(settings, () => useCases.create({ name: 'X' }));
    await asActor(settings, () => useCases.update(templateId, { topic: 'X' }));
    await asActor(settings, () => useCases.delete(templateId));
    expect(() => asActor(settings, () => useCases.list({}))).toThrow();
    expect(() =>
      asActor(settings, () => useCases.detail(templateId)),
    ).toThrow();
    for (const permission of [
      'academics.academic_content.manage',
      'academics.academic_content.approve',
    ]) {
      expect(() => asActor([permission], () => useCases.list({}))).toThrow();
      expect(() =>
        asActor([permission], () => useCases.create({ name: 'X' })),
      ).toThrow();
    }
    for (const actor of [
      UserType.TEACHER,
      UserType.STUDENT,
      UserType.PARENT,
      UserType.APPLICANT,
    ])
      expect(() =>
        asActor([...view, ...settings], () => useCases.list({}), actor),
      ).toThrow();
  });

  it('rejects empty patch, unknown fields, and unsafe pagination before querying', () => {
    const settings = ['academics.academic_content.settings.manage'];
    expect(() =>
      asActor(settings, () => useCases.update(templateId, {})),
    ).toThrow();
    expect(() =>
      asActor(settings, () =>
        useCases.update(templateId, { schoolId } as never),
      ),
    ).toThrow();
    for (const query of [
      { page: 0 },
      { page: 1.5 },
      { limit: 0 },
      { limit: 101 },
      { page: Number.MAX_SAFE_INTEGER, limit: 100 },
    ])
      expect(() =>
        asActor(['academics.academic_content.view'], () =>
          useCases.list(query),
        ),
      ).toThrow();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.list).not.toHaveBeenCalled();
  });
});
