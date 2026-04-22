import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { CreateSubjectUseCase } from '../application/create-subject.use-case';
import { DeleteSubjectUseCase } from '../application/delete-subject.use-case';
import { ListSubjectsUseCase } from '../application/list-subjects.use-case';
import { UpdateSubjectUseCase } from '../application/update-subject.use-case';
import { SubjectCodeConflictException } from '../domain/subject.exceptions';
import { SubjectsRepository } from '../infrastructure/subjects.repository';

type SubjectStoreItem = {
  id: string;
  schoolId: string;
  nameAr: string;
  nameEn: string;
  code: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

describe('Subjects use cases', () => {
  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['academics.subjects.view', 'academics.subjects.manage'],
      });

      await testFn();
    });
  }

  function createRepository(seed: SubjectStoreItem[] = []): SubjectsRepository {
    const store = [...seed];

    return {
      listSubjects: jest.fn().mockImplementation(async () =>
        store
          .filter((subject) => subject.deletedAt === null)
          .sort((left, right) => left.nameEn.localeCompare(right.nameEn)),
      ),
      findSubjectById: jest.fn().mockImplementation(async (subjectId: string) =>
        store.find(
          (subject) => subject.id === subjectId && subject.deletedAt === null,
        ) ?? null,
      ),
      createSubject: jest.fn().mockImplementation(async (data) => {
        if (
          data.code &&
          store.some(
            (subject) =>
              subject.schoolId === data.schoolId &&
              subject.code === data.code,
          )
        ) {
          throw { code: 'P2002' };
        }

        const subject: SubjectStoreItem = {
          id: `subject-${store.length + 1}`,
          schoolId: String(data.schoolId),
          nameAr: String(data.nameAr),
          nameEn: String(data.nameEn),
          code: (data.code as string | null | undefined) ?? null,
          color: (data.color as string | null | undefined) ?? null,
          isActive: Boolean(data.isActive),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        store.push(subject);
        return subject;
      }),
      updateSubject: jest.fn().mockImplementation(async (subjectId: string, data) => {
        const subject = store.find(
          (item) => item.id === subjectId && item.deletedAt === null,
        );
        if (!subject) {
          throw new Error('Subject not found');
        }

        if (
          data.code !== undefined &&
          store.some(
            (item) =>
              item.id !== subjectId &&
              item.schoolId === subject.schoolId &&
              item.code === data.code,
          )
        ) {
          throw { code: 'P2002' };
        }

        Object.assign(subject, data, { updatedAt: new Date() });
        return subject;
      }),
      softDeleteSubject: jest.fn().mockImplementation(async (subjectId: string) => {
        const subject = store.find(
          (item) => item.id === subjectId && item.deletedAt === null,
        );
        if (!subject) {
          return { status: 'not_found' as const };
        }

        subject.deletedAt = new Date();
        subject.updatedAt = new Date();
        return { status: 'deleted' as const };
      }),
    } as unknown as SubjectsRepository;
  }

  it('supports create, list, update, and soft delete flow', async () => {
    const repository = createRepository();
    const createSubjectUseCase = new CreateSubjectUseCase(repository);
    const listSubjectsUseCase = new ListSubjectsUseCase(repository);
    const updateSubjectUseCase = new UpdateSubjectUseCase(repository);
    const deleteSubjectUseCase = new DeleteSubjectUseCase(repository);

    await withScope(async () => {
      const created = await createSubjectUseCase.execute({
        nameEn: 'Mathematics',
        nameAr: 'Mathematics',
        code: 'MATH-101',
        color: '#ff0000',
        isActive: true,
      });

      expect(created.code).toBe('MATH-101');

      const listed = await listSubjectsUseCase.execute();
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0].nameEn).toBe('Mathematics');

      const updated = await updateSubjectUseCase.execute(created.id, {
        nameEn: 'Advanced Mathematics',
        isActive: false,
        color: '#00ff00',
      });

      expect(updated.nameEn).toBe('Advanced Mathematics');
      expect(updated.isActive).toBe(false);
      expect(updated.color).toBe('#00ff00');

      await expect(deleteSubjectUseCase.execute(created.id)).resolves.toEqual({
        ok: true,
      });

      const afterDelete = await listSubjectsUseCase.execute();
      expect(afterDelete.items).toHaveLength(0);
    });
  });

  it('maps duplicate subject code conflicts to a safe conflict error', async () => {
    const repository = createRepository([
      {
        id: 'subject-1',
        schoolId: 'school-1',
        nameAr: 'Math',
        nameEn: 'Math',
        code: 'MATH-101',
        color: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ]);
    const createSubjectUseCase = new CreateSubjectUseCase(repository);

    await withScope(async () => {
      await expect(
        createSubjectUseCase.execute({
          nameEn: 'Physics',
          nameAr: 'Physics',
          code: 'MATH-101',
        }),
      ).rejects.toBeInstanceOf(SubjectCodeConflictException);
    });
  });
});
