import { AcademicContentType } from '@prisma/client';
import {
  createRequestContext,
  getRequestContext,
  runWithRequestContext,
  setActiveMembership,
} from '../../src/common/context/request-context';
import { schoolScopeExtension } from '../../src/infrastructure/database/school-scope.extension';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';

type ContentRow = {
  id: string;
  schoolId: string;
  type: AcademicContentType;
  createdByUserId: string;
  updatedByUserId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ExtensionOperation = (input: {
  model: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
}) => Promise<unknown>;

type ExtensionDefinition = {
  query: { $allModels: { $allOperations: ExtensionOperation } };
};

describe('AcademicContentRepository tenancy', () => {
  const schoolA = '00000000-0000-4000-8000-000000000001';
  const schoolB = '00000000-0000-4000-8000-000000000002';
  const actorId = '00000000-0000-4000-8000-000000000003';
  const now = new Date('2026-09-22T00:00:00.000Z');
  const rows: ContentRow[] = [
    content('same-school-live', schoolA, null),
    content('cross-school-live', schoolB, null),
    content('same-school-deleted', schoolA, now),
  ];

  it('returns same-school live content and hides cross-school or soft-deleted content', async () => {
    const repository = createRepository(rows);

    await withSchool(schoolA, async () => {
      await expect(
        repository.findById('same-school-live'),
      ).resolves.toMatchObject({ id: 'same-school-live', schoolId: schoolA });
      await expect(
        repository.findById('cross-school-live'),
      ).resolves.toBeNull();
      await expect(
        repository.findById('same-school-deleted'),
      ).resolves.toBeNull();
    });
  });

  it('persists the explicit schoolId supplied to create without a transaction', async () => {
    const transaction = jest.fn();
    const repository = createRepository(rows, transaction);

    const created = await withSchool(schoolA, () =>
      repository.create({
        schoolId: schoolA,
        type: AcademicContentType.WEEKLY_PLAN,
        createdByUserId: actorId,
      }),
    );

    expect(created).toMatchObject({
      schoolId: schoolA,
      type: AcademicContentType.WEEKLY_PLAN,
      createdByUserId: actorId,
    });
    expect(rows.at(-1)?.schoolId).toBe(schoolA);
    expect(transaction).not.toHaveBeenCalled();
  });

  function content(
    id: string,
    schoolId: string,
    deletedAt: Date | null,
  ): ContentRow {
    return {
      id,
      schoolId,
      type: AcademicContentType.TEACHER_PREPARATION,
      createdByUserId: actorId,
      updatedByUserId: null,
      deletedAt,
      createdAt: now,
      updatedAt: now,
    };
  }
});

function createRepository(
  rows: ContentRow[],
  transaction = jest.fn(),
): AcademicContentRepository {
  const extensionOperation = extractExtensionOperation();
  const delegate = {
    findFirst: (args: Record<string, unknown>) =>
      extensionOperation({
        model: 'AcademicContent',
        operation: 'findFirst',
        args,
        query: (scopedArgs) => {
          const where = scopedArgs.where as Record<string, unknown>;
          return Promise.resolve(
            rows.find(
              (row) =>
                row.id === where.id &&
                row.schoolId === where.schoolId &&
                row.deletedAt === where.deletedAt,
            ) ?? null,
          );
        },
      }),
    create: (args: {
      data: Omit<ContentRow, 'id' | 'deletedAt' | 'createdAt' | 'updatedAt'>;
    }) =>
      extensionOperation({
        model: 'AcademicContent',
        operation: 'create',
        args,
        query: (createArgs) => {
          const data = createArgs.data as typeof args.data;
          const row: ContentRow = {
            id: `created-${rows.length}`,
            ...data,
            updatedByUserId: data.updatedByUserId ?? null,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          rows.push(row);
          return Promise.resolve(row);
        },
      }),
  };
  const prisma = {
    scoped: { academicContent: delegate },
    $transaction: transaction,
  } as unknown as ConstructorParameters<typeof AcademicContentRepository>[0];

  return new AcademicContentRepository(prisma);
}

function extractExtensionOperation(): ExtensionOperation {
  const captured: { definition?: ExtensionDefinition } = {};
  const extension = schoolScopeExtension as unknown as (client: {
    $extends: (value: ExtensionDefinition) => unknown;
  }) => unknown;

  extension({
    $extends: (value) => {
      captured.definition = value;
      return {};
    },
  });

  const definition = captured.definition;
  if (!definition) throw new Error('schoolScope extension definition missing');
  return definition.query.$allModels.$allOperations;
}

async function withSchool<T>(
  schoolId: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActiveMembership({
      membershipId: `membership:${schoolId}`,
      organizationId: '00000000-0000-4000-8000-000000000004',
      schoolId,
      roleId: '00000000-0000-4000-8000-000000000005',
      permissions: [],
    });
    expect(getRequestContext()?.activeMembership?.schoolId).toBe(schoolId);
    return operation();
  });
}
