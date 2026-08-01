import { randomUUID } from 'node:crypto';
import { FileVisibility, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { ReinforcementReviewsRepository } from '../../src/modules/reinforcement/reviews/infrastructure/reinforcement-reviews.repository';

jest.setTimeout(120_000);

describe('ReinforcementReviewsRepository proof-file boundary (real PostgreSQL)', () => {
  const marker = `g06-proof-repository-${randomUUID().slice(0, 8)}`;
  let prisma: PrismaService;
  let repository: ReinforcementReviewsRepository;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let actorId: string;
  let otherUploaderId: string;
  let otherStudentUploaderId: string;

  beforeAll(async () => {
    assertDisposableDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new ReinforcementReviewsRepository(prisma);

    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: `${marker}-organization-a`, slug: `${marker}-org-a` },
        select: { id: true },
      }),
      prisma.organization.create({
        data: { name: `${marker}-organization-b`, slug: `${marker}-org-b` },
        select: { id: true },
      }),
    ]);
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;

    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId: organizationAId,
          name: `${marker}-school-a`,
          slug: `${marker}-school-a`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId: organizationAId,
          name: `${marker}-school-b`,
          slug: `${marker}-school-b`,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;

    [actorId, otherUploaderId, otherStudentUploaderId] = await Promise.all([
      createUser('actor', UserType.SCHOOL_USER),
      createUser('other-uploader', UserType.SCHOOL_USER),
      createUser('other-student', UserType.STUDENT),
    ]);
  });

  afterEach(async () => {
    await prisma.file.deleteMany({
      where: { originalName: { startsWith: marker } },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.file.deleteMany({
      where: { originalName: { startsWith: marker } },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [actorId, otherUploaderId, otherStudentUploaderId] },
      },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [schoolAId, schoolBId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationAId, organizationBId] } },
    });
    await prisma.$disconnect();
  });

  it('returns only an actor-owned private live non-empty file with a valid storage locator', async () => {
    const file = await createFile('valid');

    await expect(
      inScope(organizationAId, schoolAId, () =>
        findProofFile(file.id, {
          organizationId: organizationAId,
          schoolId: schoolAId,
          uploaderId: actorId,
        }),
      ),
    ).resolves.toMatchObject({
      id: file.id,
      mimeType: 'image/png',
      sizeBytes: 33n,
      visibility: FileVisibility.PRIVATE,
    });
  });

  it.each([
    ['missing file', 'missing'],
    ['wrong organization', 'wrong-organization'],
    ['wrong school', 'wrong-school'],
    ['wrong uploader', 'wrong-uploader'],
    ['another student uploader', 'other-student-uploader'],
    ['public visibility', 'public'],
    ['soft-deleted file', 'deleted'],
    ['zero database size', 'zero-size'],
    ['empty bucket', 'empty-bucket'],
    ['empty object key', 'empty-object-key'],
    ['file outside request scope', 'outside-request-scope'],
  ] as const)(
    'returns null for %s without enumerating the file',
    async (_label, scenario) => {
      const file =
        scenario === 'missing'
          ? { id: randomUUID() }
          : await createScenarioFile(scenario);

      const lookupOrganizationId =
        scenario === 'wrong-organization' ? organizationAId : organizationAId;
      const lookupSchoolId = schoolAId;
      const lookupUploaderId = actorId;
      const requestSchoolId = schoolAId;

      await expect(
        inScope(organizationAId, requestSchoolId, () =>
          findProofFile(file.id, {
            organizationId: lookupOrganizationId,
            schoolId: lookupSchoolId,
            uploaderId: lookupUploaderId,
          }),
        ),
      ).resolves.toBeNull();
    },
  );

  async function createScenarioFile(
    scenario:
      | 'wrong-organization'
      | 'wrong-school'
      | 'wrong-uploader'
      | 'other-student-uploader'
      | 'public'
      | 'deleted'
      | 'zero-size'
      | 'empty-bucket'
      | 'empty-object-key'
      | 'outside-request-scope',
  ) {
    switch (scenario) {
      case 'wrong-organization':
        return createFile(scenario, { organizationId: organizationBId });
      case 'wrong-school':
        return createFile(scenario, { schoolId: schoolBId });
      case 'wrong-uploader':
        return createFile(scenario, { uploaderId: otherUploaderId });
      case 'other-student-uploader':
        return createFile(scenario, { uploaderId: otherStudentUploaderId });
      case 'public':
        return createFile(scenario, { visibility: FileVisibility.PUBLIC });
      case 'deleted':
        return createFile(scenario, { deletedAt: new Date() });
      case 'zero-size':
        return createFile(scenario, { sizeBytes: 0n });
      case 'empty-bucket':
        return createFile(scenario, { bucket: '' });
      case 'empty-object-key':
        return createFile(scenario, { objectKey: '' });
      case 'outside-request-scope':
        return createFile(scenario, {
          organizationId: null,
          schoolId: null,
        });
    }
  }

  function createFile(
    label: string,
    overrides: {
      organizationId?: string | null;
      schoolId?: string | null;
      uploaderId?: string;
      bucket?: string;
      objectKey?: string;
      sizeBytes?: bigint;
      visibility?: FileVisibility;
      deletedAt?: Date;
    } = {},
  ) {
    return prisma.file.create({
      data: {
        organizationId:
          overrides.organizationId === undefined
            ? organizationAId
            : overrides.organizationId,
        schoolId:
          overrides.schoolId === undefined ? schoolAId : overrides.schoolId,
        uploaderId: overrides.uploaderId ?? actorId,
        bucket: overrides.bucket ?? 'g06-private-files',
        objectKey: overrides.objectKey ?? `${marker}/${label}/${randomUUID()}`,
        originalName: `${marker}-${label}.png`,
        mimeType: 'image/png',
        sizeBytes: overrides.sizeBytes ?? 33n,
        visibility: overrides.visibility ?? FileVisibility.PRIVATE,
        deletedAt: overrides.deletedAt,
      },
      select: { id: true },
    });
  }

  function findProofFile(
    fileId: string,
    scope: { organizationId: string; schoolId: string; uploaderId: string },
  ) {
    return repository.findProofFile({ fileId, ...scope });
  }

  function inScope<T>(
    organizationId: string,
    schoolId: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    const context = createRequestContext(`${marker}-request`);
    context.activeMembership = {
      membershipId: randomUUID(),
      organizationId,
      schoolId,
      roleId: randomUUID(),
      permissions: [],
    };
    return runWithRequestContext(context, callback);
  }

  async function createUser(
    label: string,
    userType: UserType,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}@example.test`,
        firstName: 'G06',
        lastName: label,
        userType,
      },
      select: { id: true },
    });
    return user.id;
  }
});

function assertDisposableDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('Disposable DATABASE_URL is required');
  const databaseName = decodeURIComponent(new URL(raw).pathname.slice(1));
  if (!/^g06_[a-z0-9_]+$/u.test(databaseName)) {
    throw new Error('G06 repository tests require a disposable G06 database');
  }
}
