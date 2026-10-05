import { randomUUID } from 'node:crypto';
import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAcademicContentFilesUseCases } from '../application/teacher-academic-content-files.use-cases';
import {
  CreateAcademicContentUploadUseCase,
  CompleteAcademicContentUploadUseCase,
  CancelAcademicContentUploadUseCase,
  UnlinkAcademicContentAssetUseCase,
} from '../../../academics/academic-content/files/application/academic-content-upload.use-cases';
import { AcademicContentAssetAccessOperations } from '../../../academics/academic-content/files/application/academic-content-asset-access.operations';
import { AcademicContentPreparationTemplateUseCases } from '../../../academics/academic-content/application/academic-content-preparation-template.use-cases';

describe('ACC-9C Teacher application actor and permission defense', () => {
  const teacher = randomUUID(),
    school = randomUUID(),
    organization = randomUUID();
  const content = randomUUID(),
    resource = randomUUID();
  const create = { executeForTeacher: jest.fn() };
  const complete = { executeForTeacher: jest.fn() };
  const cancel = { executeForTeacher: jest.fn() };
  const unlink = { executeForTeacher: jest.fn() };
  const assets = { current: jest.fn(), revision: jest.fn() };
  const templates = { listApplicable: jest.fn(), detailApplicable: jest.fn() };
  const allocations = { findOwnedAllocationById: jest.fn() };
  const operations = new TeacherAcademicContentFilesUseCases(
    new TeacherAppAccessService(
      allocations as unknown as TeacherAppAllocationReadAdapter,
    ),
    create as unknown as CreateAcademicContentUploadUseCase,
    complete as unknown as CompleteAcademicContentUploadUseCase,
    cancel as unknown as CancelAcademicContentUploadUseCase,
    unlink as unknown as UnlinkAcademicContentAssetUseCase,
    assets as unknown as AcademicContentAssetAccessOperations,
    templates as unknown as AcademicContentPreparationTemplateUseCases,
  );
  const input = {
    clientRequestId: randomUUID(),
    originalName: 'file.pdf',
    expectedMimeType: 'application/pdf',
    expectedSizeBytes: '10',
  };
  const calls = [
    ['uploadIntent', 'manage', () => operations.uploadIntent(content, input)],
    ['complete', 'manage', () => operations.complete(content, resource)],
    ['cancel', 'manage', () => operations.cancel(content, resource)],
    ['unlink', 'manage', () => operations.unlink(content, resource)],
    [
      'currentAccess',
      'view',
      () => operations.currentAccess(content, resource, 'download'),
    ],
    [
      'revisionAccess',
      'view',
      () => operations.revisionAccess(content, resource, resource, 'preview'),
    ],
    ['listTemplates', 'view', () => operations.listTemplates(resource, {})],
    [
      'templateDetail',
      'view',
      () => operations.templateDetail(resource, resource),
    ],
  ] as const;

  function asActor<T>(call: () => T, type: UserType, permissions: string[]): T {
    const context = createRequestContext();
    context.actor = { id: teacher, userType: type };
    context.activeMembership = {
      schoolId: school,
      organizationId: organization,
      membershipId: randomUUID(),
      roleId: randomUUID(),
      permissions,
    };
    return runWithRequestContext(context, call);
  }

  beforeEach(() => jest.clearAllMocks());
  function assertCoreUntouched() {
    for (const mocked of [
      create.executeForTeacher,
      complete.executeForTeacher,
      cancel.executeForTeacher,
      unlink.executeForTeacher,
      assets.current,
      assets.revision,
      templates.listApplicable,
      templates.detailApplicable,
      allocations.findOwnedAllocationById,
    ])
      expect(mocked).not.toHaveBeenCalled();
  }

  it.each(calls)(
    '%s rejects direct invocation without its permission',
    async (_name, _permission, call) => {
      await expect(
        Promise.resolve().then(() => asActor(call, UserType.TEACHER, [])),
      ).rejects.toThrow();
      assertCoreUntouched();
    },
  );
  it.each(calls)(
    '%s rejects a non-Teacher with the same permission',
    async (_name, permission, call) => {
      await expect(
        Promise.resolve().then(() =>
          asActor(call, UserType.SCHOOL_USER, [
            'academics.academic_content.' + permission,
          ]),
        ),
      ).rejects.toThrow();
      assertCoreUntouched();
    },
  );
  it.each([
    'schoolId',
    'organizationId',
    'teacherUserId',
    'bucket',
    'objectKey',
    'storageProvider',
    'fileId',
    'assetId',
    'trustedOrigin',
    'contentId',
    'owner',
  ])('rejects upload authority override %s', async (key) => {
    await expect(
      Promise.resolve().then(() =>
        asActor(
          () => operations.uploadIntent(content, { ...input, [key]: resource }),
          UserType.TEACHER,
          ['academics.academic_content.manage'],
        ),
      ),
    ).rejects.toThrow('Invalid Teacher upload intent');
    assertCoreUntouched();
  });
  it('passes only the trusted actor scope to the existing Core upload engine', async () => {
    await asActor(
      () => operations.uploadIntent(content, input),
      UserType.TEACHER,
      ['academics.academic_content.manage'],
    );
    expect(create.executeForTeacher).toHaveBeenCalledWith(
      { contentId: content, ...input },
      {
        schoolId: school,
        organizationId: organization,
        actorId: teacher,
        teacherUserId: teacher,
      },
    );
  });
  it('uses current read authority without requiring manage or content authorship', async () => {
    await asActor(
      () => operations.currentAccess(content, resource, 'download'),
      UserType.TEACHER,
      ['academics.academic_content.view'],
    );
    expect(assets.current).toHaveBeenCalledWith(
      {
        schoolId: school,
        organizationId: organization,
        actorId: teacher,
        teacherUserId: teacher,
      },
      content,
      resource,
      'download',
    );
  });
});
