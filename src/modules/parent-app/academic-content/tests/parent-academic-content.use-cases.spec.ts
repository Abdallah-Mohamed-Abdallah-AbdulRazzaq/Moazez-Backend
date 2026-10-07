import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AcademicContentCurrentAccessService } from '../../../academics/academic-content/application/academic-content-current-access.service';
import { normalizeAcademicContentRecipientQuery } from '../../../academics/academic-content/domain/academic-content-recipient.query';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppContext } from '../../shared/parent-app.types';
import {
  GetParentAcademicContentUseCase,
  ListParentAcademicContentUseCase,
  ListParentAcademicContentAccessibleChildrenUseCase,
} from '../application/parent-academic-content.use-cases';
import { parentContentFixture } from './parent-academic-content.fixture';
const child = {
  studentId: 'student',
  enrollmentId: 'enrollment',
  classroomId: 'classroom',
  academicYearId: 'year',
  termId: 'term',
};
const context: ParentAppContext = {
  parentUserId: 'actor',
  schoolId: 'school',
  organizationId: 'org',
  membershipId: 'membership',
  roleId: 'role',
  permissions: ['academics.academic_content.view'],
  guardianIds: ['guardian'],
  children: [child],
};
function setup() {
  const access = {
    getOwnedStudentContext: jest
      .fn<
        ReturnType<ParentAppAccessService['getOwnedStudentContext']>,
        Parameters<ParentAppAccessService['getOwnedStudentContext']>
      >()
      .mockResolvedValue({ context, child }),
    getParentAppContext: jest
      .fn<Promise<ParentAppContext>, []>()
      .mockResolvedValue(context),
  };
  const core = {
    listCurrentParentPublications: jest
      .fn<
        ReturnType<
          AcademicContentCurrentAccessService['listCurrentParentPublications']
        >,
        Parameters<
          AcademicContentCurrentAccessService['listCurrentParentPublications']
        >
      >()
      .mockResolvedValue({
        items: [parentContentFixture()],
        pagination: { page: 1, limit: 20, total: 1 },
      }),
    getCurrentParentContent: jest
      .fn<
        ReturnType<
          AcademicContentCurrentAccessService['getCurrentParentContent']
        >,
        Parameters<
          AcademicContentCurrentAccessService['getCurrentParentContent']
        >
      >()
      .mockResolvedValue(parentContentFixture('ONLINE_SESSION')),
    listCurrentParentAccessibleChildren: jest
      .fn<
        ReturnType<
          AcademicContentCurrentAccessService['listCurrentParentAccessibleChildren']
        >,
        Parameters<
          AcademicContentCurrentAccessService['listCurrentParentAccessibleChildren']
        >
      >()
      .mockResolvedValue({
        academicContentId: 'content',
        publicationId: 'publication',
        children: [{ studentId: 'student' }],
      }),
  };
  const a = access as unknown as ParentAppAccessService,
    c = core as unknown as AcademicContentCurrentAccessService;
  return {
    access,
    core,
    list: new ListParentAcademicContentUseCase(a, c),
    detail: new GetParentAcademicContentUseCase(a, c),
    children: new ListParentAcademicContentAccessibleChildrenUseCase(a, c),
  };
}
describe('Parent Academic Content server-owned context coordination', () => {
  it('uses the owned Student context before querying Core and never returns authorization IDs', async () => {
    const { access, core, list, detail } = setup();
    const query = { type: 'GUARDIAN_WEEKLY_NOTE' as const };
    const output = await list.execute('student', query);
    await detail.execute('student', 'content');
    const expected = {
      ...child,
      actorKind: 'PARENT',
      schoolId: 'school',
      userId: 'actor',
      guardianIds: ['guardian'],
    };
    expect(access.getOwnedStudentContext).toHaveBeenCalledWith('student');
    expect(core.listCurrentParentPublications).toHaveBeenCalledWith(
      expected,
      query,
    );
    expect(core.getCurrentParentContent).toHaveBeenCalledWith(
      expected,
      'content',
    );
    expect(
      access.getOwnedStudentContext.mock.invocationCallOrder[0],
    ).toBeLessThan(
      core.listCurrentParentPublications.mock.invocationCallOrder[0],
    );
    expect(output.items[0]).not.toHaveProperty('guardianIds');
  });
  it('preserves null-term feed/detail boundaries without a Core query or fallback', async () => {
    const { access, core, list, detail } = setup();
    access.getOwnedStudentContext.mockResolvedValue({
      context,
      child: { ...child, termId: null },
    });
    await expect(
      list.execute('student', { page: 2, limit: 3 }),
    ).resolves.toEqual({
      items: [],
      pagination: { page: 2, limit: 3, total: 0 },
    });
    await expect(detail.execute('student', 'content')).rejects.toMatchObject({
      code: 'not_found',
      httpStatus: 404,
    });
    expect(core.listCurrentParentPublications).not.toHaveBeenCalled();
    expect(core.getCurrentParentContent).not.toHaveBeenCalled();
  });
  it('batches all term-bearing children once and whitelists the resolver result', async () => {
    const { access, core, children } = setup();
    access.getParentAppContext.mockResolvedValue({
      ...context,
      children: [
        child,
        { ...child, studentId: 'second', enrollmentId: 'second-enrollment' },
        { ...child, studentId: 'null-term', termId: null },
      ],
    });
    const result = await children.execute('content');
    expect(result).toEqual({
      academicContentId: 'content',
      publicationId: 'publication',
      children: [{ studentId: 'student' }],
    });
    expect(core.listCurrentParentAccessibleChildren).toHaveBeenCalledTimes(1);
    expect(
      core.listCurrentParentAccessibleChildren.mock.calls[0][0].children.map(
        (c) => c.studentId,
      ),
    ).toEqual(['student', 'second']);
    expect(core.getCurrentParentContent).not.toHaveBeenCalled();
  });
  it('denies when every child has a null term', async () => {
    const { access, core, children } = setup();
    access.getParentAppContext.mockResolvedValue({
      ...context,
      children: [{ ...child, termId: null }],
    });
    await expect(children.execute('content')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(core.listCurrentParentAccessibleChildren).not.toHaveBeenCalled();
  });
  it('keeps Parent and Student normalizer allowlists distinct', () => {
    expect(() =>
      normalizeAcademicContentRecipientQuery({ type: 'GUARDIAN_WEEKLY_NOTE' }),
    ).toThrow();
    expect(
      normalizeAcademicContentRecipientQuery(
        { type: 'GUARDIAN_WEEKLY_NOTE' },
        'PARENT',
      ).type,
    ).toBe('GUARDIAN_WEEKLY_NOTE');
  });
  it('stops before Core if Parent ownership fails', async () => {
    const { access, core, list, detail } = setup();
    access.getOwnedStudentContext.mockRejectedValue(
      new NotFoundDomainException('Child not found'),
    );
    await expect(list.execute('foreign')).rejects.toMatchObject({
      httpStatus: 404,
    });
    await expect(detail.execute('foreign', 'content')).rejects.toMatchObject({
      httpStatus: 404,
    });
    expect(core.listCurrentParentPublications).not.toHaveBeenCalled();
    expect(core.getCurrentParentContent).not.toHaveBeenCalled();
  });
});
