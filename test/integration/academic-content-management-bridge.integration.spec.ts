import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentType,
  FileVisibility,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import {
  GetAcademicContentForManagementUseCase,
  ListAcademicContentForManagementUseCase,
} from '../../src/modules/academics/academic-content/application/academic-content-management-read.use-cases';
import { AcademicContentLifecycleUseCases } from '../../src/modules/academics/academic-content/application/academic-content-lifecycle.use-cases';
import {
  GetAcademicContentFilePolicyUseCase,
  UpdateAcademicContentFilePolicyUseCase,
} from '../../src/modules/academics/academic-content/files/application/academic-content-file-policy.use-cases';
import { AcademicContentFilePolicyResolver } from '../../src/modules/academics/academic-content/files/application/academic-content-file-policy.resolver';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import {
  CancelAcademicContentUploadUseCase,
  CreateAcademicContentUploadUseCase,
} from '../../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';
import { presentAcademicContentDetail } from '../../src/modules/academics/academic-content/presenters/academic-content.presenter';

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase(
  'ACC-4B PostgreSQL management read and policy boundary',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService({
      datasources: {
        db: {
          url: databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
        },
      },
    });
    const contents = new AcademicContentRepository(prisma);
    const listContent = new ListAcademicContentForManagementUseCase(contents);
    const getContent = new GetAcademicContentForManagementUseCase(contents);
    const lifecycle = new AcademicContentLifecycleUseCases(contents);
    const files = new AcademicContentFileRepository(prisma);
    const policyResolver = new AcademicContentFilePolicyResolver(files);
    const getPolicy = new GetAcademicContentFilePolicyUseCase(policyResolver);
    const updatePolicy = new UpdateAcademicContentFilePolicyUseCase(files);
    const createResumableUploadSession = jest.fn(
      (input: { objectKey: string; origin?: string }) =>
        Promise.resolve({
          sessionUrl: `https://provider.example/upload/${input.objectKey}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
    );
    const storage = {
      getCapabilities: () => ({ resumableUpload: true }),
      resolveBucket: () => 'acc4b-private-test',
      createResumableUploadSession,
    } as unknown as StorageService;
    const createUpload = new CreateAcademicContentUploadUseCase(
      files,
      policyResolver,
      storage,
    );
    const cancelUpload = new CancelAcademicContentUploadUseCase(files);
    const ids: Record<string, string> = {};
    const tag = randomUUID().slice(0, 8);

    function asActor<T>(
      input: {
        schoolId: string;
        organizationId: string;
        actorId: string;
        userType?: UserType;
        permissions: string[];
      },
      action: () => Promise<T>,
    ): Promise<T> {
      return runWithRequestContext(createRequestContext(), () => {
        setActor({
          id: input.actorId,
          userType: input.userType ?? UserType.SCHOOL_USER,
        });
        setActiveMembership({
          membershipId: randomUUID(),
          schoolId: input.schoolId,
          organizationId: input.organizationId,
          roleId: randomUUID(),
          permissions: input.permissions,
        });
        return Promise.resolve().then(action);
      });
    }

    const view = () => ({
      schoolId: ids.schoolA,
      organizationId: ids.organizationA,
      actorId: ids.schoolUser,
      permissions: ['academics.academic_content.view'],
    });
    const manager = () => ({
      ...view(),
      permissions: [
        'academics.academic_content.view',
        'academics.academic_content.manage',
        'academics.academic_content.settings.manage',
      ],
    });

    beforeAll(async () => {
      await prisma.$connect();
      ids.organizationA = (
        await prisma.organization.create({
          data: { name: `ACC4B A ${tag}`, slug: `acc4b-a-${tag}` },
        })
      ).id;
      ids.organizationB = (
        await prisma.organization.create({
          data: { name: `ACC4B B ${tag}`, slug: `acc4b-b-${tag}` },
        })
      ).id;
      ids.schoolA = (
        await prisma.school.create({
          data: {
            organizationId: ids.organizationA,
            name: `ACC4B A ${tag}`,
            slug: `acc4b-a-${tag}`,
          },
        })
      ).id;
      ids.schoolB = (
        await prisma.school.create({
          data: {
            organizationId: ids.organizationB,
            name: `ACC4B B ${tag}`,
            slug: `acc4b-b-${tag}`,
          },
        })
      ).id;
      ids.schoolUser = (
        await prisma.user.create({
          data: {
            email: `acc4b-school-${tag}@example.test`,
            firstName: 'ACC',
            lastName: 'Manager',
            userType: UserType.SCHOOL_USER,
          },
        })
      ).id;
      ids.organizationUser = (
        await prisma.user.create({
          data: {
            email: `acc4b-organization-${tag}@example.test`,
            firstName: 'ACC',
            lastName: 'Organization',
            userType: UserType.ORGANIZATION_USER,
          },
        })
      ).id;
      ids.year = (
        await prisma.academicYear.create({
          data: {
            schoolId: ids.schoolA,
            nameAr: `سنة ${tag}`,
            nameEn: `Year ${tag}`,
            startDate: new Date(Date.now() - 30 * 86_400_000),
            endDate: new Date(Date.now() + 365 * 86_400_000),
          },
        })
      ).id;
      ids.term = (
        await prisma.term.create({
          data: {
            schoolId: ids.schoolA,
            academicYearId: ids.year,
            nameAr: `فصل ${tag}`,
            nameEn: `Term ${tag}`,
            startDate: new Date(Date.now() - 30 * 86_400_000),
            endDate: new Date(Date.now() + 365 * 86_400_000),
            isActive: true,
          },
        })
      ).id;
    });

    afterAll(async () => {
      if (ids.schoolA) {
        await prisma.academicContentAsset.deleteMany({
          where: { schoolId: ids.schoolA },
        });
        await prisma.fileUploadSession.deleteMany({
          where: { schoolId: ids.schoolA },
        });
        await prisma.file.deleteMany({ where: { schoolId: ids.schoolA } });
        await prisma.academicContentTarget.deleteMany({
          where: { schoolId: ids.schoolA },
        });
        await prisma.academicContentFilePolicy.deleteMany({
          where: { schoolId: { in: [ids.schoolA, ids.schoolB] } },
        });
        await prisma.auditLog.deleteMany({
          where: { schoolId: { in: [ids.schoolA, ids.schoolB] } },
        });
        await prisma.academicContent.deleteMany({
          where: { schoolId: ids.schoolA },
        });
        await prisma.term.deleteMany({ where: { schoolId: ids.schoolA } });
        await prisma.academicYear.deleteMany({
          where: { schoolId: ids.schoolA },
        });
        await prisma.school.deleteMany({
          where: { id: { in: [ids.schoolA, ids.schoolB] } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: [ids.schoolUser, ids.organizationUser] } },
        });
        await prisma.organization.deleteMany({
          where: { id: { in: [ids.organizationA, ids.organizationB] } },
        });
      }
      await prisma.$disconnect();
    });

    it('returns platform defaults without creating a policy row', async () => {
      const resolved = await asActor(view(), () => getPolicy.execute());
      expect(resolved).toMatchObject({
        attachmentsEnabled: true,
        maximumFileSizeBytes: 536870912n,
        documentsEnabled: true,
        archivesEnabled: false,
        otherFilesEnabled: false,
      });
      expect(
        await prisma.academicContentFilePolicy.count({
          where: { schoolId: ids.schoolA },
        }),
      ).toBe(0);
    });

    it('persists the 10 GiB school override and one atomic before/after audit', async () => {
      const result = await asActor(manager(), () =>
        updatePolicy.execute({
          maximumFileSizeBytes: '10737418240',
          archivesEnabled: true,
        }),
      );
      expect(result.maximumFileSizeBytes).toBe(10737418240n);
      expect(result.archivesEnabled).toBe(true);
      const persisted =
        await prisma.academicContentFilePolicy.findUniqueOrThrow({
          where: { schoolId: ids.schoolA },
        });
      expect(persisted.maximumFileSizeBytes).toBe(10737418240n);
      const audit = await prisma.auditLog.findMany({
        where: {
          schoolId: ids.schoolA,
          action: 'academics.academic_content.file_policy.update',
        },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: ids.schoolUser,
        organizationId: ids.organizationA,
        schoolId: ids.schoolA,
      });
      expect(audit[0].before).toMatchObject({
        maximumFileSizeBytes: '536870912',
        archivesEnabled: false,
      });
      expect(audit[0].after).toMatchObject({
        maximumFileSizeBytes: '10737418240',
        archivesEnabled: true,
      });
      expect(JSON.stringify(audit[0])).not.toMatch(
        /sessionUrl|objectKey|bucket|credential/,
      );
      const other = await asActor(
        {
          schoolId: ids.schoolB,
          organizationId: ids.organizationB,
          actorId: ids.schoolUser,
          permissions: ['academics.academic_content.view'],
        },
        () => getPolicy.execute(),
      );
      expect(other.maximumFileSizeBytes).toBe(536870912n);
      expect(
        await prisma.academicContentFilePolicy.count({
          where: { schoolId: ids.schoolB },
        }),
      ).toBe(0);
    });

    it('rejects invalid sizes and does not audit an effective no-op', async () => {
      for (const maximumFileSizeBytes of [
        '0',
        '-1',
        '1.5',
        '10737418241',
        '9'.repeat(100),
      ]) {
        await expect(
          asActor(manager(), () =>
            updatePolicy.execute({ maximumFileSizeBytes }),
          ),
        ).rejects.toThrow();
      }
      await asActor(manager(), () =>
        updatePolicy.execute({
          maximumFileSizeBytes: '10737418240',
          archivesEnabled: true,
        }),
      );
      expect(
        await prisma.auditLog.count({
          where: {
            schoolId: ids.schoolA,
            action: 'academics.academic_content.file_policy.update',
          },
        }),
      ).toBe(1);
      await expect(
        asActor(
          { ...manager(), permissions: ['academics.academic_content.manage'] },
          () => updatePolicy.execute({ imagesEnabled: false }),
        ),
      ).rejects.toMatchObject({ httpStatus: 403 });
      await expect(
        asActor({ ...manager(), userType: UserType.TEACHER }, () =>
          updatePolicy.execute({ imagesEnabled: false }),
        ),
      ).rejects.toMatchObject({ httpStatus: 403 });
    });

    it('rolls back policy mutation when atomic audit cannot be written', async () => {
      await expect(
        asActor({ ...manager(), actorId: randomUUID() }, () =>
          updatePolicy.execute({ imagesEnabled: false }),
        ),
      ).rejects.toThrow();
      const persisted =
        await prisma.academicContentFilePolicy.findUniqueOrThrow({
          where: { schoolId: ids.schoolA },
        });
      expect(persisted.imagesEnabled).toBe(true);
      expect(
        await prisma.auditLog.count({
          where: {
            schoolId: ids.schoolA,
            action: 'academics.academic_content.file_policy.update',
          },
        }),
      ).toBe(1);
    });

    it('does not persist or reissue the first actor upload capability to a second actor', async () => {
      const content = await contents.create({
        schoolId: ids.schoolA,
        organizationId: ids.organizationA,
        academicYearId: ids.year,
        termId: ids.term,
        type: AcademicContentType.GENERAL_RESOURCE,
        audience: AcademicContentAudienceType.STUDENTS,
        title: 'Upload Resource',
        description: null,
        status: AcademicContentStatus.DRAFT,
        createdByUserId: ids.schoolUser,
      });
      const clientRequestId = randomUUID();
      const command = {
        contentId: content.id,
        clientRequestId,
        originalName: 'resource.pdf',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: '100',
      };
      const first = await asActor(manager(), () =>
        createUpload.execute(command),
      );
      const secondActor = {
        ...manager(),
        actorId: ids.organizationUser,
        userType: UserType.ORGANIZATION_USER,
      };
      const second = await asActor(secondActor, () =>
        createUpload.execute(command),
      );
      expect(second.uploadId).not.toBe(first.uploadId);
      expect(second.sessionUrl).not.toBe(first.sessionUrl);
      expect(createResumableUploadSession).toHaveBeenCalledWith(
        expect.objectContaining({ origin: undefined }),
      );
      await expect(
        asActor(secondActor, () =>
          cancelUpload.execute({
            contentId: content.id,
            uploadId: first.uploadId,
          }),
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
      const rows = await prisma.fileUploadSession.findMany({
        where: { schoolId: ids.schoolA, purposeContextId: content.id },
      });
      expect(rows).toHaveLength(2);
      expect(
        JSON.stringify(rows, (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ).not.toContain(first.sessionUrl);
      const audits = await prisma.auditLog.findMany({
        where: { schoolId: ids.schoolA },
      });
      expect(JSON.stringify(audits)).not.toContain(first.sessionUrl);
    });

    it('lists and details active same-school content including archived historical content', async () => {
      const created = await contents.create({
        schoolId: ids.schoolA,
        organizationId: ids.organizationA,
        academicYearId: ids.year,
        termId: ids.term,
        type: AcademicContentType.GENERAL_RESOURCE,
        audience: AcademicContentAudienceType.STUDENTS,
        title: 'Historical Resource',
        description: null,
        status: AcademicContentStatus.DRAFT,
        createdByUserId: ids.schoolUser,
      });
      const hidden = await contents.create({
        schoolId: ids.schoolA,
        organizationId: ids.organizationA,
        academicYearId: ids.year,
        termId: ids.term,
        type: AcademicContentType.GENERAL_RESOURCE,
        audience: AcademicContentAudienceType.STUDENTS,
        title: 'Deleted Resource',
        description: null,
        status: AcademicContentStatus.DRAFT,
        createdByUserId: ids.schoolUser,
      });
      await prisma.academicContent.update({
        where: { id: hidden.id },
        data: { deletedAt: new Date() },
      });
      const file = await prisma.file.create({
        data: {
          organizationId: ids.organizationA,
          schoolId: ids.schoolA,
          uploaderId: ids.schoolUser,
          bucket: 'acc4b-internal-test',
          objectKey: `acc4b/${randomUUID()}`,
          originalName: 'resource.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 987n,
          visibility: FileVisibility.PRIVATE,
        },
      });
      await prisma.academicContentAsset.create({
        data: {
          schoolId: ids.schoolA,
          academicContentId: created.id,
          fileId: file.id,
          createdByUserId: ids.schoolUser,
        },
      });
      await prisma.term.update({
        where: { id: ids.term },
        data: { endDate: new Date(Date.now() - 86_400_000) },
      });
      await asActor(manager(), () => lifecycle.archive(created.id));
      const list = await asActor(view(), () =>
        listContent.execute({ page: 1, limit: 1 }),
      );
      expect(list).toMatchObject({ total: 2, page: 1, limit: 1 });
      expect(list.items[0].id).toBe(created.id);
      expect(list.items[0].status).toBe(AcademicContentStatus.ARCHIVED);
      const next = await asActor(view(), () =>
        listContent.execute({ page: 2, limit: 1 }),
      );
      expect(next.items).toHaveLength(1);
      expect(next.items[0].status).toBe(AcademicContentStatus.DRAFT);
      const detail = await asActor(
        {
          ...view(),
          actorId: ids.organizationUser,
          userType: UserType.ORGANIZATION_USER,
        },
        () => getContent.execute(created.id),
      );
      const safe = presentAcademicContentDetail(detail);
      expect(safe.assets[0]).toMatchObject({
        fileId: file.id,
        sizeBytes: '987',
      });
      expect(JSON.stringify(safe)).not.toMatch(/bucket|objectKey|deletedAt/);
      await expect(
        asActor(view(), () => getContent.execute(hidden.id)),
      ).rejects.toMatchObject({ httpStatus: 404 });
      await expect(
        asActor(
          {
            ...view(),
            schoolId: ids.schoolB,
            organizationId: ids.organizationB,
          },
          () => getContent.execute(created.id),
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
      await expect(
        asActor({ ...view(), userType: UserType.TEACHER }, () =>
          listContent.execute({}),
        ),
      ).rejects.toMatchObject({ httpStatus: 403 });
    });
  },
);
