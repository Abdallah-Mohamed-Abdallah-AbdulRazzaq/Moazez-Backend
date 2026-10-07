import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AcademicContentCurrentAccessService } from '../../../academics/academic-content/application/academic-content-current-access.service';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppContext } from '../../shared/student-app.types';
import {
  GetStudentAcademicContentUseCase,
  ListStudentAcademicContentUseCase,
  AccessStudentAcademicContentAssetUseCase,
} from '../application/student-academic-content.use-cases';
import { studentContentFixture } from './student-academic-content.fixture';
import { AcademicContentRecipientAssetAccessService } from '../../../academics/academic-content/files/application/academic-content-recipient-asset-access.service';

const context: StudentAppContext = {
  studentUserId: 'actor',
  schoolId: 'school',
  organizationId: 'organization',
  membershipId: 'membership',
  roleId: 'role',
  permissions: ['academics.academic_content.view'],
  studentId: 'student',
  enrollmentId: 'enrollment',
  classroomId: 'classroom',
  academicYearId: 'year',
  termId: 'term',
};
const coreContext = {
  actorKind: 'STUDENT',
  schoolId: 'school',
  userId: 'actor',
  studentId: 'student',
  enrollmentId: 'enrollment',
  classroomId: 'classroom',
  academicYearId: 'year',
  termId: 'term',
};
function setup() {
  const access = {
    getStudentAppContext: jest
      .fn<Promise<StudentAppContext>, []>()
      .mockResolvedValue(context),
  };
  const core = {
    access: jest
      .fn()
      .mockResolvedValue({ url: 'https://capability.invalid/private' }),
    listCurrentStudentPublications: jest
      .fn<
        ReturnType<
          AcademicContentCurrentAccessService['listCurrentStudentPublications']
        >,
        Parameters<
          AcademicContentCurrentAccessService['listCurrentStudentPublications']
        >
      >()
      .mockResolvedValue({
        items: [studentContentFixture()],
        pagination: { page: 1, limit: 20, total: 1 },
      }),
    getCurrentStudentContent: jest
      .fn<
        ReturnType<
          AcademicContentCurrentAccessService['getCurrentStudentContent']
        >,
        Parameters<
          AcademicContentCurrentAccessService['getCurrentStudentContent']
        >
      >()
      .mockResolvedValue(studentContentFixture('ONLINE_SESSION')),
  };
  return {
    access,
    core,
    asset: new AccessStudentAcademicContentAssetUseCase(
      access as unknown as StudentAppAccessService,
      core as unknown as AcademicContentRecipientAssetAccessService,
    ),
    list: new ListStudentAcademicContentUseCase(
      access as unknown as StudentAppAccessService,
      core as unknown as AcademicContentCurrentAccessService,
    ),
    detail: new GetStudentAcademicContentUseCase(
      access as unknown as StudentAppAccessService,
      core as unknown as AcademicContentCurrentAccessService,
    ),
  };
}

describe('Student Academic Content server-owned context coordination', () => {
  it('resolves current Student context before calling the Core asset boundary', async () => {
    const { access, core, asset } = setup();
    await expect(asset.execute('content', 'file', 'download')).resolves.toEqual(
      { url: 'https://capability.invalid/private' },
    );
    expect(core.access).toHaveBeenCalledWith(
      coreContext,
      'content',
      'file',
      'download',
    );
    expect(
      access.getStudentAppContext.mock.invocationCallOrder[0],
    ).toBeLessThan(core.access.mock.invocationCallOrder[0]);
  });
  it('denies null-term assets before Core', async () => {
    const { access, core, asset } = setup();
    access.getStudentAppContext.mockResolvedValue({ ...context, termId: null });
    await expect(
      asset.execute('content', 'file', 'preview'),
    ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
    expect(core.access).not.toHaveBeenCalled();
  });
  it('stops asset resolution when Student authority denies', async () => {
    const { access, core, asset } = setup();
    access.getStudentAppContext.mockRejectedValue(
      new NotFoundDomainException('Student not found'),
    );
    await expect(
      asset.execute('content', 'file', 'download'),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(core.access).not.toHaveBeenCalled();
  });
  it('resolves identity before calling set-based Core feed and presents the result', async () => {
    const { access, core, list } = setup();
    const query = { search: 'published', page: 1, limit: 20 };
    const result = await list.execute(query);
    expect(core.listCurrentStudentPublications).toHaveBeenCalledWith(
      coreContext,
      query,
    );
    expect(
      access.getStudentAppContext.mock.invocationCallOrder[0],
    ).toBeLessThan(
      core.listCurrentStudentPublications.mock.invocationCallOrder[0],
    );
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1 });
    expect(result.items[0]).not.toHaveProperty('studentId');
    expect(result.items[0]).not.toHaveProperty('typeSpecificSnapshot');
  });

  it('resolves stable content identity through Core before returning meeting capabilities', async () => {
    const { access, core, detail } = setup();
    const id = studentContentFixture().contentId;
    const result = await detail.execute(id);
    expect(core.getCurrentStudentContent).toHaveBeenCalledWith(coreContext, id);
    expect(
      access.getStudentAppContext.mock.invocationCallOrder[0],
    ).toBeLessThan(core.getCurrentStudentContent.mock.invocationCallOrder[0]);
    expect(result.content.details).toMatchObject({
      accessCode: 'private-code',
    });
  });

  it('returns an empty term-null feed with bounded pagination and makes no Core read', async () => {
    const { access, core, list } = setup();
    access.getStudentAppContext.mockResolvedValue({ ...context, termId: null });
    await expect(list.execute({ page: 2, limit: 3 })).resolves.toEqual({
      items: [],
      pagination: { page: 2, limit: 3, total: 0 },
    });
    expect(core.listCurrentStudentPublications).not.toHaveBeenCalled();
  });

  it('denies term-null detail without a Core read or fallback term', async () => {
    const { access, core, detail } = setup();
    access.getStudentAppContext.mockResolvedValue({ ...context, termId: null });
    await expect(
      detail.execute(studentContentFixture().contentId),
    ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
    expect(core.getCurrentStudentContent).not.toHaveBeenCalled();
  });

  it('preserves non-disclosing Core denial and stops when Student access fails', async () => {
    const { access, core, list, detail } = setup();
    core.getCurrentStudentContent.mockRejectedValue(
      new NotFoundDomainException('Academic content not found'),
    );
    await expect(
      detail.execute(studentContentFixture().contentId),
    ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
    access.getStudentAppContext.mockRejectedValue(
      new NotFoundDomainException('Student not found'),
    );
    await expect(list.execute()).rejects.toMatchObject({ code: 'not_found' });
    expect(core.listCurrentStudentPublications).not.toHaveBeenCalled();
  });
});
