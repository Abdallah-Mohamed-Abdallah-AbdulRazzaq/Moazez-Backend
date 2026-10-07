import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentStatus as Status,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as Type,
  FileUploadPurpose,
  FileUploadSessionStatus as UploadStatus,
  FileVisibility,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { GlobalExceptionFilter } from '../../src/common/exceptions/global-exception.filter';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { ObjectStorageError } from '../../src/infrastructure/storage/object-storage.errors';
import type { ObjectStoragePort } from '../../src/infrastructure/storage/object-storage.port';
import type { SignedUrlService } from '../../src/infrastructure/storage/signed-url.service';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';
import { AcademicContentPreparationTemplateRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-preparation-template.repository';
import { AcademicContentPreparationTemplateUseCases } from '../../src/modules/academics/academic-content/application/academic-content-preparation-template.use-cases';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import { AcademicContentCleanupWorker } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-cleanup.worker';
import type { AcademicContentFileTransaction } from '../../src/modules/academics/academic-content/files/application/academic-content-file.unit-of-work';
import { AcademicContentFilePolicyResolver } from '../../src/modules/academics/academic-content/files/application/academic-content-file-policy.resolver';
import { AcademicContentFileVerifier } from '../../src/modules/academics/academic-content/files/application/academic-content-file-verifier';
import { AcademicContentAssetAccessOperations } from '../../src/modules/academics/academic-content/files/application/academic-content-asset-access.operations';
import { AcademicContentAuthorizedFileSigner } from '../../src/modules/academics/academic-content/files/application/academic-content-authorized-file.signer';
import {
  CancelAcademicContentUploadUseCase,
  CompleteAcademicContentUploadUseCase,
  CreateAcademicContentUploadUseCase,
  UnlinkAcademicContentAssetUseCase,
} from '../../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases';
import { ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES } from '../../src/modules/academics/academic-content/files/domain/academic-content-file.constants';
import { effectiveAcademicContentFilePolicy } from '../../src/modules/academics/academic-content/files/domain/academic-content-file-policy';
import { PrismaTeacherAllocationOperationalWriteGate } from '../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-operational-write-gate';
import { TeacherAppAccessService } from '../../src/modules/teacher-app/access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../../src/modules/teacher-app/access/teacher-app-allocation-read.adapter';
import { TeacherAcademicContentFilesController } from '../../src/modules/teacher-app/academic-content/controller/teacher-academic-content-files.controller';
import { TeacherAcademicContentFilesUseCases } from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-files.use-cases';

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;
describeDatabase(
  'ACC-9C PostgreSQL Teacher files, resource access and templates',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService();
    const ids: Record<string, string> = {};
    const suffix = randomUUID();
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
    const objects = new Map<string, Buffer>();
    let resumable = true,
      capabilityFailure = false,
      retryableVerification = false;
    let verificationHook: (() => Promise<void>) | undefined;
    let capabilityHook: (() => Promise<void>) | undefined;
    let issuedCapabilityExpiresAt: Date;
    const sign = jest
      .fn()
      .mockResolvedValue({ url: 'https://capability.invalid/short-lived' });
    const deleteObject = jest.fn(({ objectKey }: { objectKey: string }) => {
      objects.delete(objectKey);
      return Promise.resolve();
    });
    const provider = {
      getCapabilities: () => ({ resumableUpload: resumable, rangeRead: true }),
      objectExists: ({ objectKey }: { objectKey: string }) =>
        Promise.resolve(objects.has(objectKey)),
      createResumableUploadSession: async () => {
        if (capabilityFailure) throw new Error('Fixture provider failure');
        issuedCapabilityExpiresAt = new Date(Date.now() + 7 * 86400_000);
        await capabilityHook?.();
        return {
          sessionUrl: 'https://capability.invalid/resumable',
          expiresAt: issuedCapabilityExpiresAt,
        };
      },
      statObject: async ({ objectKey }: { objectKey: string }) => {
        const hook = verificationHook;
        verificationHook = undefined;
        await hook?.();
        if (retryableVerification)
          throw new Error('Fixture retryable verification');
        const body = objects.get(objectKey);
        if (!body) throw new ObjectStorageError('not_found');
        return {
          size: body.length,
          etag: null,
          contentType: 'application/pdf',
          metadata: {},
          lastModified: null,
          generation: null,
          version: null,
        };
      },
      readObjectRange: ({
        objectKey,
        offset,
        length,
      }: {
        objectKey: string;
        offset: number;
        length: number;
      }) => {
        const body = objects.get(objectKey);
        if (!body) return Promise.reject(new ObjectStorageError('not_found'));
        return Promise.resolve(body.subarray(offset, offset + length));
      },
      deleteObject,
    } as unknown as ObjectStoragePort;
    const storage = new StorageService(provider, {
      resolveBucket: () => 'acc9c-private-fixture',
      createDownloadUrl: sign,
    } as unknown as SignedUrlService);
    const repository = new AcademicContentFileRepository(
      prisma,
      new PrismaTeacherAllocationOperationalWriteGate(),
    );
    const policy = new AcademicContentFilePolicyResolver(repository);
    const create = new CreateAcademicContentUploadUseCase(
      repository,
      policy,
      storage,
    );
    const complete = new CompleteAcademicContentUploadUseCase(
      repository,
      new AcademicContentFileVerifier(storage),
    );
    const files = new TeacherAcademicContentFilesUseCases(
      new TeacherAppAccessService(new TeacherAppAllocationReadAdapter(prisma)),
      create,
      complete,
      new CancelAcademicContentUploadUseCase(repository),
      new UnlinkAcademicContentAssetUseCase(repository),
      new AcademicContentAssetAccessOperations(
        new AcademicContentRepository(prisma),
        repository,
        policy,
        new AcademicContentAuthorizedFileSigner(storage),
      ),
      new AcademicContentPreparationTemplateUseCases(
        new AcademicContentPreparationTemplateRepository(prisma),
      ),
    );
    const grants = [
      'academics.academic_content.view',
      'academics.academic_content.manage',
    ];
    let app: INestApplication<App>;

    function asTeacher<T>(
      fn: () => T,
      actor = ids.teacher,
      permissions = grants,
      userType: UserType = UserType.TEACHER,
    ): T {
      const context = createRequestContext();
      context.actor = { id: actor, userType };
      context.activeMembership = {
        schoolId: ids.school,
        organizationId: ids.org,
        membershipId: randomUUID(),
        roleId: randomUUID(),
        permissions,
      };
      return runWithRequestContext(context, fn);
    }
    const input = () => ({
      clientRequestId: randomUUID(),
      originalName: 'resource.pdf',
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: String(pdf.length),
    });

    async function content(
      options: {
        creator?: string;
        allocations?: string[];
        status?: Status;
        foreign?: boolean;
        deleted?: boolean;
      } = {},
    ) {
      const prefix = options.foreign ? 'foreign' : '';
      const row = await prisma.academicContent.create({
        data: {
          schoolId: ids[prefix + 'school'],
          academicYearId: ids[prefix + 'year'],
          termId: ids[prefix + 'term'],
          createdByUserId: options.creator ?? ids.teacher,
          title: 'acc9c-' + randomUUID(),
          type: Type.GENERAL_RESOURCE,
          audience: Audience.STUDENTS,
          status: options.status ?? Status.DRAFT,
          deletedAt: options.deleted ? new Date() : null,
        },
      });
      for (const allocationId of options.allocations ?? [ids[prefix + 'a']]) {
        const allocation =
          await prisma.teacherSubjectAllocation.findUniqueOrThrow({
            where: { id: allocationId },
          });
        await prisma.academicContentTarget.create({
          data: {
            schoolId: row.schoolId,
            academicContentId: row.id,
            createdByUserId: row.createdByUserId,
            scopeType: Scope.CLASSROOM,
            classroomId: allocation.classroomId,
            subjectId: allocation.subjectId,
            teacherSubjectAllocationId: allocation.id,
            identityFingerprint: randomUUID(),
          },
        });
      }
      return row;
    }
    async function asset(contentId: string, schoolId = ids.school) {
      const file = await prisma.file.create({
        data: {
          organizationId: schoolId === ids.school ? ids.org : ids.foreignorg,
          schoolId,
          uploaderId: ids.teacher,
          bucket: 'acc9c-private-fixture',
          objectKey: 'fixture/' + randomUUID(),
          originalName: 'resource.pdf',
          mimeType: 'application/pdf',
          sizeBytes: BigInt(pdf.length),
          visibility: FileVisibility.PRIVATE,
        },
      });
      const row = await prisma.academicContentAsset.create({
        data: {
          schoolId,
          academicContentId: contentId,
          fileId: file.id,
          createdByUserId: ids.teacher,
          sortOrder: await prisma.academicContentAsset.count({
            where: { schoolId, academicContentId: contentId },
          }),
        },
      });
      return { file, asset: row };
    }
    async function session(
      contentId: string,
      actorId = ids.teacher,
      schoolId = ids.school,
      status: UploadStatus = UploadStatus.UPLOADING,
    ) {
      return prisma.fileUploadSession.create({
        data: {
          schoolId,
          organizationId: schoolId === ids.school ? ids.org : ids.foreignorg,
          createdByUserId: actorId,
          purpose: FileUploadPurpose.ACADEMIC_CONTENT,
          purposeContextId: contentId,
          clientRequestId: randomUUID(),
          originalName: 'resource.pdf',
          expectedMimeType: 'application/pdf',
          expectedSizeBytes: BigInt(pdf.length),
          finalBucket: 'acc9c-private-fixture',
          finalObjectKey: 'fixture/' + randomUUID(),
          status,
          ...(status === UploadStatus.FAILED
            ? {
                failedAt: new Date(),
                failureReason: 'fixture_terminal',
                finalCleanupEligibleAt: new Date(Date.now() + 7 * 86400_000),
              }
            : {}),
          expiresAt: new Date(Date.now() + 86400_000),
          latestUploadUrlExpiresAt: new Date(Date.now() + 7 * 86400_000),
        },
      });
    }
    async function intent(contentId: string) {
      const result = await asTeacher(() =>
        files.uploadIntent(contentId, input()),
      );
      const upload = await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: result.uploadId },
      });
      objects.set(upload.finalObjectKey, pdf);
      return upload;
    }
    async function revision(
      row: Awaited<ReturnType<typeof content>>,
      fileId: string,
    ) {
      const revision = await prisma.academicContentRevision.create({
        data: {
          schoolId: row.schoolId,
          academicContentId: row.id,
          revisionNumber: 1,
          snapshotContractVersion: 2,
          academicYearId: row.academicYearId,
          termId: row.termId,
          type: row.type,
          audience: row.audience,
          title: row.title,
          sourceStatus: row.status,
          capturedByUserId: ids.teacher,
        },
      });
      await prisma.academicContentRevisionAsset.create({
        data: {
          schoolId: row.schoolId,
          revisionId: revision.id,
          fileId,
          sortOrder: 0,
        },
      });
      return revision;
    }
    async function changeOwner(teacherUserId: string) {
      await prisma.teacherSubjectAllocation.update({
        where: { id: ids.a },
        data: { teacherUserId },
      });
    }

    beforeAll(async () => {
      await prisma.$connect();
      for (const [key, userType] of [
        ['teacher', UserType.TEACHER],
        ['other', UserType.TEACHER],
        ['manager', UserType.SCHOOL_USER],
      ] as const)
        ids[key] = (
          await prisma.user.create({
            data: {
              email: key + suffix + '@fixture.invalid',
              firstName: 'ACC9C',
              lastName: key,
              userType,
            },
          })
        ).id;
      for (const prefix of ['', 'foreign']) {
        ids[prefix + 'org'] = (
          await prisma.organization.create({
            data: {
              name: 'ACC9C ' + prefix + suffix,
              slug: 'acc9c-org-' + prefix + suffix,
            },
          })
        ).id;
        ids[prefix + 'school'] = (
          await prisma.school.create({
            data: {
              organizationId: ids[prefix + 'org'],
              name: 'ACC9C ' + prefix + suffix,
              slug: 'acc9c-school-' + prefix + suffix,
            },
          })
        ).id;
        const schoolId = ids[prefix + 'school'];
        ids[prefix + 'year'] = (
          await prisma.academicYear.create({
            data: {
              schoolId,
              nameAr: suffix,
              nameEn: suffix,
              startDate: new Date('2020-01-01'),
              endDate: new Date('2040-12-31'),
            },
          })
        ).id;
        ids[prefix + 'term'] = (
          await prisma.term.create({
            data: {
              schoolId,
              academicYearId: ids[prefix + 'year'],
              nameAr: suffix,
              nameEn: suffix,
              startDate: new Date('2020-01-01'),
              endDate: new Date('2040-12-31'),
              isActive: true,
            },
          })
        ).id;
        ids[prefix + 'stage'] = (
          await prisma.stage.create({
            data: { schoolId, nameAr: suffix, nameEn: suffix },
          })
        ).id;
        ids[prefix + 'grade'] = (
          await prisma.grade.create({
            data: {
              schoolId,
              stageId: ids[prefix + 'stage'],
              nameAr: suffix,
              nameEn: suffix,
            },
          })
        ).id;
        ids[prefix + 'section'] = (
          await prisma.section.create({
            data: {
              schoolId,
              gradeId: ids[prefix + 'grade'],
              nameAr: suffix,
              nameEn: suffix,
            },
          })
        ).id;
        ids[prefix + 'subject'] = (
          await prisma.subject.create({
            data: { schoolId, code: suffix, nameAr: suffix, nameEn: suffix },
          })
        ).id;
        await prisma.subjectAllocation.create({
          data: {
            schoolId,
            academicYearId: ids[prefix + 'year'],
            termId: ids[prefix + 'term'],
            subjectId: ids[prefix + 'subject'],
            gradeId: ids[prefix + 'grade'],
            weeklyHours: 2,
          },
        });
        for (const key of ['a', 'b', 'c']) {
          const classroom = await prisma.classroom.create({
            data: {
              schoolId,
              sectionId: ids[prefix + 'section'],
              nameAr: key + suffix,
              nameEn: key + suffix,
            },
          });
          ids[prefix + key] = (
            await prisma.teacherSubjectAllocation.create({
              data: {
                schoolId,
                classroomId: classroom.id,
                subjectId: ids[prefix + 'subject'],
                termId: ids[prefix + 'term'],
                teacherUserId: key === 'b' ? ids.other : ids.teacher,
              },
            })
          ).id;
        }
      }
      ids.wrongStage = (
        await prisma.stage.create({
          data: { schoolId: ids.school, nameAr: 'Wrong', nameEn: 'Wrong' },
        })
      ).id;
      ids.wrongSubject = (
        await prisma.subject.create({
          data: { schoolId: ids.school, nameAr: 'Wrong', nameEn: 'Wrong' },
        })
      ).id;
      const templateCases = [
        ['school', null, null, false, false],
        ['stage', ids.stage, null, false, false],
        ['subject', null, ids.subject, false, false],
        ['both', ids.stage, ids.subject, false, false],
        ['wrongStage', ids.wrongStage, null, false, false],
        ['wrongSubject', null, ids.wrongSubject, false, false],
        ['wrongBoth', ids.wrongStage, ids.wrongSubject, false, false],
        ['foreign', null, null, true, false],
        ['deleted', null, null, false, true],
      ] as const;
      for (const [
        index,
        [key, stageId, subjectId, foreign, deleted],
      ] of templateCases.entries()) {
        const name = String(index) + '-' + key;
        ids['template-' + key] = (
          await prisma.academicContentPreparationTemplate.create({
            data: {
              schoolId: foreign ? ids.foreignschool : ids.school,
              name,
              normalizedName: name,
              stageId,
              subjectId,
              objectives: [],
              learningOutcomes: [],
              teachingStrategies: [],
              activities: [],
              createdByUserId: ids.manager,
              deletedAt: deleted ? new Date() : null,
            },
          })
        ).id;
      }
      const module = await Test.createTestingModule({
        controllers: [TeacherAcademicContentFilesController],
        providers: [
          { provide: TeacherAcademicContentFilesUseCases, useValue: files },
        ],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.use(
        (
          req: { headers: Record<string, string> },
          _res: unknown,
          next: () => void,
        ) =>
          asTeacher(
            next,
            ids.teacher,
            req.headers['x-missing'] ? [] : grants,
            (req.headers['x-actor'] as UserType | undefined) ??
              UserType.TEACHER,
          ),
      );
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      app.useGlobalGuards(new PermissionsGuard(new Reflector()));
      app.useGlobalFilters(new GlobalExceptionFilter());
      await app.init();
    });
    afterEach(async () => {
      resumable = true;
      capabilityFailure = false;
      retryableVerification = false;
      verificationHook = undefined;
      capabilityHook = undefined;
      sign.mockClear();
      deleteObject.mockClear();
      await changeOwner(ids.teacher);
      await prisma.term.update({
        where: { id: ids.term },
        data: { isActive: true },
      });
      await prisma.academicContentFilePolicy.deleteMany({
        where: { schoolId: ids.school },
      });
    });
    afterAll(async () => {
      if (app) await app.close();
      if (ids.school && ids.foreignschool) {
        const schoolId = { in: [ids.school, ids.foreignschool] };
        await prisma.auditLog.deleteMany({ where: { schoolId } });
        await prisma.academicContentRevisionAsset.deleteMany({
          where: { schoolId },
        });
        await prisma.academicContentRevisionTarget.deleteMany({
          where: { schoolId },
        });
        await prisma.academicContentRevision.deleteMany({
          where: { schoolId },
        });
        await prisma.academicContentAsset.deleteMany({ where: { schoolId } });
        await prisma.fileUploadSession.deleteMany({ where: { schoolId } });
        await prisma.file.deleteMany({ where: { schoolId } });
        await prisma.academicContentTarget.deleteMany({ where: { schoolId } });
        await prisma.academicContent.deleteMany({ where: { schoolId } });
        await prisma.academicContentPreparationTemplate.deleteMany({
          where: { schoolId },
        });
        await prisma.academicContentFilePolicy.deleteMany({
          where: { schoolId },
        });
        await prisma.teacherSubjectAllocation.deleteMany({
          where: { schoolId },
        });
        await prisma.subjectAllocation.deleteMany({ where: { schoolId } });
        await prisma.classroom.deleteMany({ where: { schoolId } });
        await prisma.section.deleteMany({ where: { schoolId } });
        await prisma.grade.deleteMany({ where: { schoolId } });
        await prisma.stage.deleteMany({ where: { schoolId } });
        await prisma.subject.deleteMany({ where: { schoolId } });
        await prisma.term.deleteMany({ where: { schoolId } });
        await prisma.academicYear.deleteMany({ where: { schoolId } });
        await prisma.school.deleteMany({ where: { id: schoolId } });
        await prisma.organization.deleteMany({
          where: { id: { in: [ids.org, ids.foreignorg] } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: [ids.teacher, ids.other, ids.manager] } },
        });
      }
      await prisma.$disconnect();
    });

    it('creates a private verified File and current asset exactly once, with audit and safe READY replay', async () => {
      const row = await content();
      const upload = await intent(row.id);
      const result = await asTeacher(() => files.complete(row.id, upload.id));
      expect(result.file.visibility).toBe(FileVisibility.PRIVATE);
      expect(result.file.mimeType).toBe('application/pdf');
      expect(result.file.sizeBytes).toBe(BigInt(pdf.length));
      const replay = await asTeacher(() => files.complete(row.id, upload.id));
      expect(replay.file.id).toBe(result.file.id);
      expect(replay.asset.id).toBe(result.asset.id);
      expect(
        await prisma.academicContentAsset.count({
          where: { academicContentId: row.id },
        }),
      ).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: {
            resourceId: result.asset.id,
            action: 'file.upload.completed',
          },
        }),
      ).toBe(1);
      const saved = await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.id },
      });
      expect(saved.status).toBe(UploadStatus.READY);
      expect(saved.verifiedMimeType).toBe('application/pdf');
      expect(
        JSON.stringify(saved, (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ).not.toContain('capability.invalid');
      await expect(
        asTeacher(() => files.complete(row.id, upload.id), ids.other),
      ).rejects.toThrow();
    });
    it('preserves exact idempotency identity and rejects mismatches or capability reissue', async () => {
      const row = await content(),
        command = input();
      await asTeacher(() => files.uploadIntent(row.id, command));
      await expect(
        asTeacher(() => files.uploadIntent(row.id, command)),
      ).rejects.toMatchObject({
        code: 'academic_content.file.upload_capability_not_reissuable',
      });
      await expect(
        asTeacher(() =>
          files.uploadIntent(row.id, { ...command, expectedSizeBytes: '100' }),
        ),
      ).rejects.toMatchObject({
        code: 'academic_content.file.idempotency_payload_mismatch',
      });
      expect(
        await prisma.fileUploadSession.count({
          where: {
            schoolId: ids.school,
            createdByUserId: ids.teacher,
            purpose: FileUploadPurpose.ACADEMIC_CONTENT,
            clientRequestId: command.clientRequestId,
          },
        }),
      ).toBe(1);
    });

    for (const operation of [
      'intent',
      'complete',
      'cancel',
      'unlink',
    ] as const) {
      it.each([
        'schoolCreated',
        'otherCreator',
        'mixed',
        'noTarget',
        'foreign',
        'deleted',
        'reassigned',
      ] as const)(
        operation + ' hides invalid authoring aggregate %s',
        async (condition) => {
          const row = await content({
            creator:
              condition === 'schoolCreated'
                ? ids.manager
                : condition === 'otherCreator'
                  ? ids.other
                  : undefined,
            allocations:
              condition === 'mixed'
                ? [ids.a, ids.b]
                : condition === 'noTarget'
                  ? []
                  : undefined,
            foreign: condition === 'foreign',
            deleted: condition === 'deleted',
          });
          const upload = await session(row.id, ids.teacher, row.schoolId);
          const linked = await asset(row.id, row.schoolId);
          objects.set(upload.finalObjectKey, pdf);
          if (condition === 'reassigned') await changeOwner(ids.other);
          const action = () =>
            operation === 'intent'
              ? files.uploadIntent(row.id, input())
              : operation === 'complete'
                ? files.complete(row.id, upload.id)
                : operation === 'cancel'
                  ? files.cancel(row.id, upload.id)
                  : files.unlink(row.id, linked.asset.id);
          await expect(asTeacher(action)).rejects.toMatchObject({
            httpStatus: 404,
          });
          expect(
            (
              await prisma.fileUploadSession.findUniqueOrThrow({
                where: { id: upload.id },
              })
            ).status,
          ).toBe(UploadStatus.UPLOADING);
          expect(
            (
              await prisma.academicContentAsset.findUniqueOrThrow({
                where: { id: linked.asset.id },
              })
            ).deletedAt,
          ).toBeNull();
        },
      );
    }
    it.each(['intent', 'complete', 'unlink'] as const)(
      '%s preserves read-only and closed-term authoring policy',
      async (operation) => {
        const row = await content({ status: Status.SUBMITTED });
        const upload = await session(row.id);
        const linked = await asset(row.id);
        const action = () =>
          operation === 'intent'
            ? files.uploadIntent(row.id, input())
            : operation === 'complete'
              ? files.complete(row.id, upload.id)
              : files.unlink(row.id, linked.asset.id);
        await expect(asTeacher(action)).rejects.toMatchObject({
          code: 'academic_content.status.read_only',
        });
        await prisma.academicContent.update({
          where: { id: row.id },
          data: { status: Status.DRAFT },
        });
        await prisma.term.update({
          where: { id: ids.term },
          data: { isActive: false },
        });
        await expect(asTeacher(action)).rejects.toMatchObject({
          code: 'academic_content.term.closed',
        });
      },
    );
    it.each([
      'attachments',
      'category',
      'schoolSize',
      'hardSize',
      'pair',
      'resumable',
    ] as const)(
      'rejects upload policy/provider violation %s without a session',
      async (condition) => {
        const row = await content();
        let command = input();
        if (condition === 'attachments')
          await prisma.academicContentFilePolicy.create({
            data: {
              ...effectiveAcademicContentFilePolicy(),
              schoolId: ids.school,
              attachmentsEnabled: false,
            },
          });
        if (condition === 'category')
          await prisma.academicContentFilePolicy.create({
            data: {
              ...effectiveAcademicContentFilePolicy(),
              schoolId: ids.school,
              documentsEnabled: false,
            },
          });
        if (condition === 'schoolSize')
          await prisma.academicContentFilePolicy.create({
            data: {
              ...effectiveAcademicContentFilePolicy(),
              schoolId: ids.school,
              maximumFileSizeBytes: 1n,
            },
          });
        if (condition === 'hardSize')
          command = {
            ...command,
            expectedSizeBytes: String(
              ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES + 1n,
            ),
          };
        if (condition === 'pair')
          command = { ...command, originalName: 'image.png' };
        if (condition === 'resumable') resumable = false;
        await expect(
          asTeacher(() => files.uploadIntent(row.id, command)),
        ).rejects.toThrow();
        expect(
          await prisma.fileUploadSession.count({
            where: { purposeContextId: row.id },
          }),
        ).toBe(0);
      },
    );
    it('marks provider capability failure terminal without deleting a provider object', async () => {
      const row = await content();
      capabilityFailure = true;
      await expect(
        asTeacher(() => files.uploadIntent(row.id, input())),
      ).rejects.toMatchObject({
        code: 'academic_content.file.resumable_capability_failed',
      });
      expect(
        (
          await prisma.fileUploadSession.findFirstOrThrow({
            where: { purposeContextId: row.id },
          })
        ).status,
      ).toBe(UploadStatus.FAILED);
      expect(deleteObject).not.toHaveBeenCalled();
    });
    it('rechecks ownership after external capability creation and defers cleanup to its expiry', async () => {
      const row = await content();
      capabilityHook = () => changeOwner(ids.other);
      await expect(
        asTeacher(() => files.uploadIntent(row.id, input())),
      ).rejects.toMatchObject({ httpStatus: 404 });
      const upload = await prisma.fileUploadSession.findFirstOrThrow({
        where: { purposeContextId: row.id },
      });
      expect(upload.status).toBe(UploadStatus.FAILED);
      expect(upload.finalCleanupEligibleAt!.getTime()).toBeGreaterThan(
        Date.now() + 6 * 86400_000,
      );
      expect(deleteObject).not.toHaveBeenCalled();
    });

    function barrier() {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }

    it('fences capability-issued vs cancel through the persistence gap, late upload and actual cleanup', async () => {
      const row = await content();
      const issued = barrier(),
        resume = barrier();
      capabilityHook = async () => {
        issued.resolve();
        await resume.promise;
      };
      // Attach rejection handling before releasing the provider barrier.
      const pending = asTeacher(() => files.uploadIntent(row.id, input())).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await issued.promise;
      const created = await prisma.fileUploadSession.findFirstOrThrow({
        where: { purposeContextId: row.id },
      });
      expect(created.status).toBe(UploadStatus.CREATED);
      const worker = new AcademicContentCleanupWorker(
        {} as never,
        repository,
        storage,
      );
      try {
        await asTeacher(() => files.cancel(row.id, created.id));
        const beforePersistence =
          await prisma.fileUploadSession.findUniqueOrThrow({
            where: { id: created.id },
          });
        expect(beforePersistence.status).toBe(UploadStatus.CANCELLED);
        expect(
          Number(beforePersistence.finalCleanupEligibleAt),
        ).toBeGreaterThanOrEqual(Number(issuedCapabilityExpiresAt));
        const candidates = await repository.cleanupCandidates(
          new Date(),
          new Date(),
        );
        expect(candidates.map((candidate) => candidate.id)).not.toContain(
          created.id,
        );
        await worker.cleanUpload(created.id);
        expect(deleteObject).not.toHaveBeenCalled();
        expect(
          (
            await prisma.fileUploadSession.findUniqueOrThrow({
              where: { id: created.id },
            })
          ).finalObjectDeletedAt,
        ).toBeNull();
        // A holder finalizes through the still-valid provider capability.
        objects.set(created.finalObjectKey, pdf);
      } finally {
        resume.resolve();
      }
      expect(await pending).toMatchObject({
        error: {
          code: 'academic_content.file.upload_capability_not_reissuable',
        },
      });
      const cancelled = await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(cancelled.status).toBe(UploadStatus.CANCELLED);
      expect(Number(cancelled.latestUploadUrlExpiresAt)).toBeGreaterThanOrEqual(
        Number(issuedCapabilityExpiresAt),
      );
      expect(Number(cancelled.finalCleanupEligibleAt)).toBeGreaterThanOrEqual(
        Number(issuedCapabilityExpiresAt),
      );
      expect(cancelled.finalObjectDeletedAt).toBeNull();
      const beforeExpiry = new Date(
        Number(cancelled.finalCleanupEligibleAt) - 1,
      );
      expect(
        (await repository.cleanupCandidates(beforeExpiry, beforeExpiry)).map(
          (candidate) => candidate.id,
        ),
      ).not.toContain(created.id);
      await worker.cleanUpload(created.id, beforeExpiry);
      expect(deleteObject).not.toHaveBeenCalled();
      expect(objects.has(created.finalObjectKey)).toBe(true);
      expect(
        JSON.stringify(cancelled, (_key, value: unknown) =>
          typeof value === 'bigint' ? String(value) : value,
        ),
      ).not.toContain('capability.invalid');
      // Advance only Date; PostgreSQL/network scheduling remains real.
      jest.useFakeTimers({
        now: Number(cancelled.finalCleanupEligibleAt) + 1,
        doNotFake: [
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
        ],
      });
      try {
        const now = new Date();
        expect(
          (await repository.cleanupCandidates(now, now)).map(
            (candidate) => candidate.id,
          ),
        ).toContain(created.id);
        await worker.cleanUpload(created.id, now);
        expect(objects.has(created.finalObjectKey)).toBe(false);
        expect(
          (
            await prisma.fileUploadSession.findUniqueOrThrow({
              where: { id: created.id },
            })
          ).finalObjectDeletedAt,
        ).not.toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('preserves CANCELLED and fences issuance after a capability-persistence transaction error', async () => {
      const row = await content();
      capabilityHook = async () => {
        const upload = await prisma.fileUploadSession.findFirstOrThrow({
          where: { purposeContextId: row.id },
        });
        await asTeacher(() => files.cancel(row.id, upload.id));
      };
      const error = new Prisma.PrismaClientKnownRequestError(
        'Fixture rollback',
        {
          code: 'P2034',
          clientVersion: 'fixture',
        },
      );
      const persist = jest
        .spyOn(repository, 'persistCapabilityExpiry')
        .mockRejectedValueOnce(error);
      try {
        await expect(
          asTeacher(() => files.uploadIntent(row.id, input())),
        ).rejects.toBe(error);
      } finally {
        persist.mockRestore();
      }
      const upload = await prisma.fileUploadSession.findFirstOrThrow({
        where: { purposeContextId: row.id },
      });
      expect(upload.status).toBe(UploadStatus.CANCELLED);
      expect(Number(upload.latestUploadUrlExpiresAt)).toBeGreaterThanOrEqual(
        Number(issuedCapabilityExpiresAt),
      );
      expect(Number(upload.finalCleanupEligibleAt)).toBeGreaterThanOrEqual(
        Number(issuedCapabilityExpiresAt),
      );
      expect(upload.finalObjectDeletedAt).toBeNull();
    });

    it.each([
      UploadStatus.FAILED,
      UploadStatus.CANCELLED,
      UploadStatus.EXPIRED,
    ])(
      'monotonically fences exact owned %s identity without changing terminal facts',
      async (status) => {
        const row = await content(),
          upload = await intent(row.id);
        const later = new Date(Date.now() + 9 * 86400_000);
        await prisma.fileUploadSession.update({
          where: { id: upload.id },
          data: {
            status,
            finalCleanupEligibleAt: later,
            latestUploadUrlExpiresAt: later,
            ...(status === UploadStatus.FAILED
              ? {
                  failedAt: new Date(),
                  failureReason: 'fixture_terminal',
                }
              : {}),
            ...(status === UploadStatus.CANCELLED
              ? { cancelledAt: new Date() }
              : {}),
          },
        });
        const owner = {
          uploadId: upload.id,
          schoolId: ids.school,
          actorId: ids.teacher,
          contentId: row.id,
        };
        for (const wrong of [
          { actorId: ids.other },
          { schoolId: ids.foreignschool },
          { contentId: randomUUID() },
          { uploadId: randomUUID() },
        ]) {
          await expect(
            repository.fenceIssuedCapability({ ...owner, ...wrong }, later),
          ).rejects.toMatchObject({ httpStatus: 404 });
        }
        await repository.fenceIssuedCapability(
          owner,
          issuedCapabilityExpiresAt,
        );
        const fenced = await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: upload.id },
        });
        expect(fenced.status).toBe(status);
        expect(fenced.latestUploadUrlExpiresAt).toEqual(later);
        expect(fenced.finalCleanupEligibleAt).toEqual(later);
        expect(fenced.finalObjectDeletedAt).toBeNull();
        const extended = new Date(Number(later) + 86400_000);
        await repository.fenceIssuedCapability(owner, extended);
        const after = await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: upload.id },
        });
        expect(after.status).toBe(status);
        expect(after.failedAt).toEqual(fenced.failedAt);
        expect(after.cancelledAt).toEqual(fenced.cancelledAt);
        expect(after.failureReason).toEqual(fenced.failureReason);
        expect(after.latestUploadUrlExpiresAt).toEqual(extended);
        expect(after.finalCleanupEligibleAt).toEqual(extended);
      },
    );

    it('serializes capability persistence and cancel with upload-first locks without a PostgreSQL deadlock', async () => {
      const row = await content();
      const upload = await prisma.fileUploadSession.create({
        data: {
          organizationId: ids.org,
          schoolId: ids.school,
          createdByUserId: ids.teacher,
          purpose: FileUploadPurpose.ACADEMIC_CONTENT,
          purposeContextId: row.id,
          clientRequestId: randomUUID(),
          originalName: 'resource.pdf',
          expectedMimeType: 'application/pdf',
          expectedSizeBytes: BigInt(pdf.length),
          finalBucket: 'acc9c-private-fixture',
          finalObjectKey: 'fixture/' + randomUUID(),
          expiresAt: new Date(Date.now() + 86400_000),
        },
      });
      const held = barrier(),
        release = barrier();
      const blocker = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM academic_contents WHERE id = ${row.id}::uuid FOR UPDATE`;
          held.resolve();
          await release.promise;
        },
        { timeout: 15_000 },
      );
      await Promise.race([held.promise, blocker]);
      async function waitForBlocked(count: number) {
        const until = Date.now() + 3000;
        while (Date.now() < until) {
          const waiting = await prisma.$queryRaw<Array<{ pid: number }>>`
            SELECT pid FROM pg_stat_activity WHERE datname = current_database()
              AND wait_event_type = 'Lock'`;
          if (waiting.length >= count) return;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error('Expected real PostgreSQL lock overlap did not occur');
      }
      const owner = {
        uploadId: upload.id,
        schoolId: ids.school,
        actorId: ids.teacher,
        contentId: row.id,
      };
      const scope = {
        organizationId: ids.org,
        schoolId: ids.school,
        actorId: ids.teacher,
        teacherUserId: ids.teacher,
      };
      const expiry = new Date(Date.now() + 7 * 86400_000);
      const persistence = repository.persistCapabilityExpiry(
        owner,
        expiry,
        scope,
      );
      let cancellation: ReturnType<typeof files.cancel> | undefined;
      try {
        await waitForBlocked(1);
        cancellation = asTeacher(() => files.cancel(row.id, upload.id));
        await waitForBlocked(2);
      } finally {
        release.resolve();
      }
      await blocker;
      const results = await Promise.allSettled([persistence, cancellation]);
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
      }
      expect(results.map((result) => result.status)).toEqual([
        'fulfilled',
        'fulfilled',
      ]);
      expect(results[0]).toMatchObject({ value: true });
      const cancelled = await prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.id },
      });
      expect(cancelled.status).toBe(UploadStatus.CANCELLED);
      expect(cancelled.latestUploadUrlExpiresAt).toEqual(expiry);
      expect(Number(cancelled.finalCleanupEligibleAt)).toBeGreaterThanOrEqual(
        Number(expiry),
      );
      expect(cancelled.finalObjectDeletedAt).toBeNull();
    });
    it.each(['reallocation', 'mixed', 'readOnly', 'termClosed'] as const)(
      'final completion rejects %s during bounded verification without stuck VERIFYING or File/Asset',
      async (condition) => {
        const row = await content(),
          upload = await intent(row.id);
        verificationHook = async () => {
          if (condition === 'reallocation') await changeOwner(ids.other);
          if (condition === 'mixed') {
            const allocation =
              await prisma.teacherSubjectAllocation.findUniqueOrThrow({
                where: { id: ids.b },
              });
            await prisma.academicContentTarget.create({
              data: {
                schoolId: ids.school,
                academicContentId: row.id,
                createdByUserId: ids.teacher,
                scopeType: Scope.CLASSROOM,
                classroomId: allocation.classroomId,
                subjectId: allocation.subjectId,
                teacherSubjectAllocationId: allocation.id,
                identityFingerprint: randomUUID(),
              },
            });
          }
          if (condition === 'readOnly')
            await prisma.academicContent.update({
              where: { id: row.id },
              data: { status: Status.SUBMITTED },
            });
          if (condition === 'termClosed')
            await prisma.term.update({
              where: { id: ids.term },
              data: { isActive: false },
            });
        };
        await expect(
          asTeacher(() => files.complete(row.id, upload.id)),
        ).rejects.toThrow();
        expect(
          await prisma.file.count({
            where: { objectKey: upload.finalObjectKey },
          }),
        ).toBe(0);
        expect(
          await prisma.academicContentAsset.count({
            where: { academicContentId: row.id },
          }),
        ).toBe(0);
        const failed = await prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: upload.id },
        });
        expect(failed.status).toBe(UploadStatus.FAILED);
        expect(failed.finalCleanupEligibleAt).not.toBeNull();
        expect(deleteObject).not.toHaveBeenCalled();
      },
    );
    it.each(['missing', 'signature', 'size', 'retryable'] as const)(
      'retains bounded verification rejection/retry behavior for %s',
      async (condition) => {
        const row = await content(),
          upload = await intent(row.id);
        if (condition === 'missing') objects.delete(upload.finalObjectKey);
        if (condition === 'signature')
          objects.set(upload.finalObjectKey, Buffer.alloc(pdf.length));
        if (condition === 'size')
          objects.set(
            upload.finalObjectKey,
            Buffer.concat([pdf, Buffer.from('x')]),
          );
        if (condition === 'retryable') retryableVerification = true;
        await expect(
          asTeacher(() => files.complete(row.id, upload.id)),
        ).rejects.toThrow();
        expect(
          (
            await prisma.fileUploadSession.findUniqueOrThrow({
              where: { id: upload.id },
            })
          ).status,
        ).toBe(
          condition === 'retryable'
            ? UploadStatus.UPLOADING
            : UploadStatus.FAILED,
        );
        expect(
          await prisma.academicContentAsset.count({
            where: { academicContentId: row.id },
          }),
        ).toBe(0);
      },
    );
    it('rolls File creation back if Asset persistence fails and releases only the exact verification claim', async () => {
      const row = await content(),
        upload = await intent(row.id);
      const transact = repository.withTransaction.bind(
        repository,
      ) as AcademicContentFileRepository['withTransaction'];
      const spy = jest
        .spyOn(repository, 'withTransaction')
        .mockImplementation(
          <T>(
            callback: (tx: AcademicContentFileTransaction) => Promise<T>,
            options?: { timeout?: number },
          ) =>
            transact<T>(
              (tx) =>
                callback({
                  ...tx,
                  createAsset: () =>
                    Promise.reject(
                      new Error('fixture asset persistence failure'),
                    ),
                }),
              options,
            ),
        );
      try {
        await expect(
          asTeacher(() => files.complete(row.id, upload.id)),
        ).rejects.toThrow('fixture asset persistence failure');
      } finally {
        spy.mockRestore();
      }
      expect(
        await prisma.file.count({
          where: { objectKey: upload.finalObjectKey },
        }),
      ).toBe(0);
      expect(
        await prisma.academicContentAsset.count({
          where: { academicContentId: row.id },
        }),
      ).toBe(0);
      expect(
        (
          await prisma.fileUploadSession.findUniqueOrThrow({
            where: { id: upload.id },
          })
        ).status,
      ).toBe(UploadStatus.UPLOADING);
    });
    it('allows exact unfinished cancellation after content becomes read-only, including a closed term', async () => {
      const row = await content(),
        upload = await intent(row.id);
      await prisma.academicContent.update({
        where: { id: row.id },
        data: { status: Status.SUBMITTED },
      });
      await prisma.term.update({
        where: { id: ids.term },
        data: { isActive: false },
      });
      expect(
        (await asTeacher(() => files.cancel(row.id, upload.id))).status,
      ).toBe(UploadStatus.CANCELLED);
      await expect(
        asTeacher(() => files.cancel(row.id, upload.id)),
      ).rejects.toMatchObject({
        code: 'academic_content.file.upload_not_cancellable',
      });
    });
    it.each([
      'wrongContent',
      'otherActor',
      'foreignSchool',
      'terminal',
    ] as const)(
      'hides or rejects invalid cancellation identity %s',
      async (condition) => {
        const row = await content(),
          other = await content({ foreign: condition === 'foreignSchool' });
        const upload = await session(
          condition === 'wrongContent' || condition === 'foreignSchool'
            ? other.id
            : row.id,
          condition === 'otherActor' ? ids.other : ids.teacher,
          condition === 'foreignSchool' ? ids.foreignschool : ids.school,
          condition === 'terminal'
            ? UploadStatus.FAILED
            : UploadStatus.UPLOADING,
        );
        await expect(
          asTeacher(() => files.cancel(row.id, upload.id)),
        ).rejects.toThrow();
        expect(
          (
            await prisma.fileUploadSession.findUniqueOrThrow({
              where: { id: upload.id },
            })
          ).status,
        ).toBe(
          condition === 'terminal'
            ? UploadStatus.FAILED
            : UploadStatus.UPLOADING,
        );
      },
    );
    it('unlinks the current asset without deleting a File still referenced by an immutable Revision', async () => {
      const row = await content(),
        linked = await asset(row.id),
        historical = await revision(row, linked.file.id);
      await asTeacher(() => files.unlink(row.id, linked.asset.id));
      expect(
        (await prisma.file.findUniqueOrThrow({ where: { id: linked.file.id } }))
          .deletedAt,
      ).toBeNull();
      await expect(
        asTeacher(() =>
          files.currentAccess(row.id, linked.asset.id, 'download'),
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
      expect(
        await asTeacher(() =>
          files.revisionAccess(
            row.id,
            historical.id,
            linked.file.id,
            'download',
          ),
        ),
      ).toEqual({ url: 'https://capability.invalid/short-lived' });
      expect(deleteObject).not.toHaveBeenCalled();
      await expect(
        asTeacher(() => files.unlink(row.id, linked.asset.id)),
      ).rejects.toMatchObject({ httpStatus: 404 });
    });
    it.each(['teacherCreated', 'schoolCreated', 'mixed'] as const)(
      'allows current resource read for %s with view only',
      async (condition) => {
        const row = await content({
            creator: condition === 'schoolCreated' ? ids.manager : undefined,
            allocations: condition === 'mixed' ? [ids.a, ids.b] : undefined,
          }),
          linked = await asset(row.id);
        expect(
          await asTeacher(
            () => files.currentAccess(row.id, linked.asset.id, 'download'),
            ids.teacher,
            ['academics.academic_content.view'],
          ),
        ).toEqual({ url: 'https://capability.invalid/short-lived' });
      },
    );
    it.each([
      'noTarget',
      'otherOnly',
      'foreign',
      'wrongContent',
      'deletedAsset',
      'deletedFile',
    ] as const)('hides current asset relation %s', async (condition) => {
      const row = await content({
        allocations:
          condition === 'noTarget'
            ? []
            : condition === 'otherOnly'
              ? [ids.b]
              : undefined,
        foreign: condition === 'foreign',
      });
      const linked = await asset(row.id, row.schoolId);
      if (condition === 'deletedAsset')
        await prisma.academicContentAsset.update({
          where: { id: linked.asset.id },
          data: { deletedAt: new Date() },
        });
      if (condition === 'deletedFile')
        await prisma.file.update({
          where: { id: linked.file.id },
          data: { deletedAt: new Date() },
        });
      const parent =
        condition === 'wrongContent' ? (await content()).id : row.id;
      await expect(
        asTeacher(() =>
          files.currentAccess(parent, linked.asset.id, 'download'),
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
      expect(sign).not.toHaveBeenCalled();
    });
    it('current access loses authority immediately after reassignment unless another owned target remains', async () => {
      const row = await content(),
        linked = await asset(row.id);
      await changeOwner(ids.other);
      await expect(
        asTeacher(() =>
          files.currentAccess(row.id, linked.asset.id, 'download'),
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
      const mixed = await content({ allocations: [ids.a, ids.c] }),
        readable = await asset(mixed.id);
      await expect(
        asTeacher(() =>
          files.currentAccess(mixed.id, readable.asset.id, 'download'),
        ),
      ).resolves.toEqual({ url: 'https://capability.invalid/short-lived' });
    });
    it.each([
      'wrongContent',
      'wrongFile',
      'foreignRevision',
      'deletedFile',
      'guessedFile',
    ] as const)('hides revision asset relation %s', async (condition) => {
      const row = await content(),
        linked = await asset(row.id),
        historical = await revision(row, linked.file.id);
      const foreign = await content({ foreign: true }),
        foreignAsset = await asset(foreign.id, ids.foreignschool),
        foreignRevision = await revision(foreign, foreignAsset.file.id);
      if (condition === 'deletedFile')
        await prisma.file.update({
          where: { id: linked.file.id },
          data: { deletedAt: new Date() },
        });
      const parent =
        condition === 'wrongContent' ? (await content()).id : row.id;
      const revisionId =
        condition === 'foreignRevision' ? foreignRevision.id : historical.id;
      const fileId =
        condition === 'wrongFile'
          ? (await asset(row.id)).file.id
          : condition === 'guessedFile'
            ? randomUUID()
            : linked.file.id;
      await expect(
        asTeacher(() =>
          files.revisionAccess(parent, revisionId, fileId, 'download'),
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
      expect(sign).not.toHaveBeenCalled();
    });
    it('historical Revision targets never grant current Teacher authority', async () => {
      const row = await content(),
        linked = await asset(row.id),
        historical = await revision(row, linked.file.id);
      const allocation =
        await prisma.teacherSubjectAllocation.findUniqueOrThrow({
          where: { id: ids.a },
        });
      await prisma.academicContentRevisionTarget.create({
        data: {
          schoolId: ids.school,
          revisionId: historical.id,
          scopeType: Scope.CLASSROOM,
          classroomId: allocation.classroomId,
          subjectId: allocation.subjectId,
          teacherSubjectAllocationId: allocation.id,
          identityFingerprint: randomUUID(),
        },
      });
      await changeOwner(ids.other);
      await expect(
        asTeacher(() =>
          files.revisionAccess(
            row.id,
            historical.id,
            linked.file.id,
            'download',
          ),
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
      await prisma.academicContentTarget.updateMany({
        where: { academicContentId: row.id },
        data: { teacherSubjectAllocationId: ids.c },
      });
      await expect(
        asTeacher(() =>
          files.revisionAccess(
            row.id,
            historical.id,
            linked.file.id,
            'download',
          ),
        ),
      ).resolves.toEqual({ url: 'https://capability.invalid/short-lived' });
    });

    it('lists only School-wide, Stage, Subject and combined applicable templates in stable bounded order', async () => {
      const result = await asTeacher(() => files.listTemplates(ids.a, {}));
      expect(result.items.map((item) => item.id)).toEqual(
        ['school', 'stage', 'subject', 'both'].map(
          (key) => ids['template-' + key],
        ),
      );
      expect(result).toMatchObject({ page: 1, limit: 50, total: 4 });
      const page = await asTeacher(() =>
        files.listTemplates(ids.a, { page: 2, limit: 2 }),
      );
      expect(page.items.map((item) => item.id)).toEqual([
        ids['template-subject'],
        ids['template-both'],
      ]);
      expect(
        await asTeacher(() =>
          files.listTemplates(ids.a, { page: 2, limit: 2 }),
        ),
      ).toEqual(page);
      expect(
        (
          await asTeacher(() =>
            files.listTemplates(ids.a, { search: '  STAGE  ' }),
          )
        ).items.map((item) => item.id),
      ).toEqual([ids['template-stage']]);
    });
    it.each(['school', 'stage', 'subject', 'both'] as const)(
      'returns applicable template detail %s',
      async (key) => {
        expect(
          (
            await asTeacher(() =>
              files.templateDetail(ids.a, ids['template-' + key]),
            )
          ).id,
        ).toBe(ids['template-' + key]);
      },
    );
    it.each([
      'wrongStage',
      'wrongSubject',
      'wrongBoth',
      'foreign',
      'deleted',
    ] as const)('hides non-applicable template %s', async (key) => {
      await expect(
        asTeacher(() => files.templateDetail(ids.a, ids['template-' + key])),
      ).rejects.toMatchObject({ httpStatus: 404 });
    });
    it.each(['b', 'foreigna'] as const)(
      'hides foreign allocation %s for template list/detail',
      async (key) => {
        await expect(
          asTeacher(() => files.listTemplates(ids[key], {})),
        ).rejects.toMatchObject({ httpStatus: 404 });
        await expect(
          asTeacher(() =>
            files.templateDetail(ids[key], ids['template-school']),
          ),
        ).rejects.toMatchObject({ httpStatus: 404 });
      },
    );
    it.each([
      { page: 0 },
      { limit: 0 },
      { limit: 101 },
      { page: Number.MAX_SAFE_INTEGER },
      { stageId: randomUUID() },
      { subjectId: randomUUID() },
    ])('rejects unsafe direct template query %j', async (query) => {
      await expect(
        asTeacher(() => files.listTemplates(ids.a, query)),
      ).rejects.toThrow();
    });

    it('HTTP upload response is no-store, uses decimal sizes and exposes only the allowed capability', async () => {
      const row = await content();
      const response = await request(app.getHttpServer())
        .post('/api/v1/teacher/academic-content/' + row.id + '/uploads')
        .send(input())
        .expect(201);
      expect(response.headers['cache-control']).toBe(
        'no-store, private, max-age=0',
      );
      expect(response.body).toMatchObject({
        expectedSizeBytes: String(pdf.length),
        uploadMode: 'resumable',
        sessionUrl: 'https://capability.invalid/resumable',
      });
      expect(response.body).not.toHaveProperty('bucket');
      expect(response.body).not.toHaveProperty('objectKey');
    });
    it('HTTP complete, cancel and unlink use the governed existing presenters', async () => {
      const row = await content(),
        upload = await intent(row.id);
      const response = await request(app.getHttpServer())
        .post(
          '/api/v1/teacher/academic-content/' +
            row.id +
            '/uploads/' +
            upload.id +
            '/complete',
        )
        .expect(200);
      expect(response.body).not.toHaveProperty('bucket');
      expect(response.body).not.toHaveProperty('objectKey');
      const linked = await prisma.academicContentAsset.findFirstOrThrow({
        where: { academicContentId: row.id },
      });
      await request(app.getHttpServer())
        .delete(
          '/api/v1/teacher/academic-content/' + row.id + '/assets/' + linked.id,
        )
        .expect(200, { ok: true, assetId: linked.id });
      const unfinished = await intent(row.id);
      const cancelled = await request(app.getHttpServer())
        .post(
          '/api/v1/teacher/academic-content/' +
            row.id +
            '/uploads/' +
            unfinished.id +
            '/cancel',
        )
        .expect(200);
      expect(cancelled.body).toMatchObject({
        uploadId: unfinished.id,
        status: UploadStatus.CANCELLED,
      });
    });
    it('HTTP current and revision access use 307 no-store redirects, with no storage metadata body or engagement/audit write', async () => {
      const row = await content(),
        linked = await asset(row.id),
        historical = await revision(row, linked.file.id);
      const auditBefore = await prisma.auditLog.count({
        where: { schoolId: ids.school },
      });
      for (const tail of [
        '/assets/' + linked.asset.id,
        '/revisions/' + historical.id + '/assets/' + linked.file.id,
      ]) {
        const response = await request(app.getHttpServer())
          .get(
            '/api/v1/teacher/academic-content/' +
              row.id +
              tail +
              '/access?mode=download',
          )
          .expect(307);
        expect(response.headers.location).toBe(
          'https://capability.invalid/short-lived',
        );
        expect(response.headers['cache-control']).toBe(
          'no-store, private, max-age=0',
        );
        expect(response.body).toEqual({});
        expect(response.text).not.toContain('private-fixture');
        expect(response.text).not.toContain(linked.file.objectKey);
      }
      expect(
        await prisma.auditLog.count({ where: { schoolId: ids.school } }),
      ).toBe(auditBefore);
      expect(sign).toHaveBeenCalledWith(
        expect.objectContaining({
          disposition: 'attachment',
          expiresInSeconds: 300,
          downloadFileName: linked.file.originalName,
        }),
      );
    });
    it('HTTP preview enforces effective policy and registry while download remains available', async () => {
      const row = await content(),
        linked = await asset(row.id),
        route =
          '/api/v1/teacher/academic-content/' +
          row.id +
          '/assets/' +
          linked.asset.id +
          '/access';
      await request(app.getHttpServer())
        .get(route + '?mode=preview')
        .expect(307);
      expect(sign).toHaveBeenLastCalledWith(
        expect.objectContaining({
          disposition: 'inline',
          contentType: 'application/pdf',
          expiresInSeconds: 300,
        }),
      );
      await prisma.academicContentFilePolicy.create({
        data: {
          ...effectiveAcademicContentFilePolicy(),
          schoolId: ids.school,
          allowInlinePreview: false,
          allowStudentDownload: false,
          allowGuardianDownload: false,
        },
      });
      await request(app.getHttpServer())
        .get(route + '?mode=preview')
        .expect(403);
      await request(app.getHttpServer())
        .get(route + '?mode=download')
        .expect(307);
      await request(app.getHttpServer())
        .get(route + '?mode=unknown')
        .expect(400);
      await request(app.getHttpServer()).get(route).expect(400);
    });
    it('HTTP templates are class-scoped reads only and reject authority overrides', async () => {
      const route =
        '/api/v1/teacher/classes/' +
        ids.a +
        '/academic-content/templates/preparation';
      const response = await request(app.getHttpServer())
        .get(route + '?limit=2&page=1')
        .expect(200);
      expect(response.body).toMatchObject({ limit: 2, page: 1, total: 4 });
      await request(app.getHttpServer())
        .get(route + '/' + ids['template-both'])
        .expect(200);
      await request(app.getHttpServer())
        .get(route + '?stageId=' + ids.stage)
        .expect(400);
      await request(app.getHttpServer())
        .post(route)
        .send({ name: 'Forbidden' })
        .expect(404);
      await request(app.getHttpServer())
        .patch(route + '/' + ids['template-school'])
        .send({ name: 'Forbidden' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(route + '/' + ids['template-school'])
        .expect(404);
    });
    it.each(['bucket', 'objectKey', 'schoolId', 'fileId', 'trustedOrigin'])(
      'HTTP upload rejects authority field %s',
      async (key) => {
        const row = await content();
        await request(app.getHttpServer())
          .post('/api/v1/teacher/academic-content/' + row.id + '/uploads')
          .send({ ...input(), [key]: 'untrusted' })
          .expect(400);
        expect(
          await prisma.fileUploadSession.count({
            where: { purposeContextId: row.id },
          }),
        ).toBe(0);
      },
    );
    it('HTTP permission/actor rejection precedes the existing Core file pipeline', async () => {
      const row = await content(),
        route = '/api/v1/teacher/academic-content/' + row.id + '/uploads';
      await request(app.getHttpServer())
        .post(route)
        .set('x-missing', '1')
        .send(input())
        .expect(403);
      await request(app.getHttpServer())
        .post(route)
        .set('x-actor', UserType.SCHOOL_USER)
        .send(input())
        .expect(403);
      expect(
        await prisma.fileUploadSession.count({
          where: { purposeContextId: row.id },
        }),
      ).toBe(0);
    });
  },
);
