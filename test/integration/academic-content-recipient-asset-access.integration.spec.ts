import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../src/common/context/request-context';
import { GlobalExceptionFilter } from '../../src/common/exceptions/global-exception.filter';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { AcademicContentRecipientReadRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-recipient-read.repository';
import { AcademicContentCurrentRecipientContext } from '../../src/modules/academics/academic-content/domain/academic-content-current-access.policy';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import { AcademicContentFilePolicyResolver } from '../../src/modules/academics/academic-content/files/application/academic-content-file-policy.resolver';
import { AcademicContentAuthorizedFileSigner } from '../../src/modules/academics/academic-content/files/application/academic-content-authorized-file.signer';
import { AcademicContentRecipientAssetAccessService } from '../../src/modules/academics/academic-content/files/application/academic-content-recipient-asset-access.service';
import { effectiveAcademicContentFilePolicy } from '../../src/modules/academics/academic-content/files/domain/academic-content-file-policy';
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../../src/modules/student-app/access/student-app-student-read.adapter';
import { ParentAppAccessService } from '../../src/modules/parent-app/access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from '../../src/modules/parent-app/access/parent-app-guardian-read.adapter';
import { StudentAcademicContentController } from '../../src/modules/student-app/academic-content/controller/student-academic-content.controller';
import { ParentAcademicContentController } from '../../src/modules/parent-app/academic-content/controller/parent-academic-content.controller';
import {
  AccessStudentAcademicContentAssetUseCase,
  GetStudentAcademicContentUseCase,
  ListStudentAcademicContentUseCase,
} from '../../src/modules/student-app/academic-content/application/student-academic-content.use-cases';
import {
  AccessParentAcademicContentAssetUseCase,
  GetParentAcademicContentUseCase,
  ListParentAcademicContentUseCase,
  ListParentAcademicContentAccessibleChildrenUseCase,
} from '../../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases';

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;
describeDatabase(
  'ACC-10D PostgreSQL current recipient File capabilities',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService();
    const reads = new AcademicContentRecipientReadRepository(prisma);
    const policy = new AcademicContentFilePolicyResolver(
      new AcademicContentFileRepository(prisma),
    );
    const storage = { createDownloadUrl: jest.fn() };
    const assets = new AcademicContentRecipientAssetAccessService(
      reads,
      policy,
      new AcademicContentAuthorizedFileSigner(
        storage as unknown as StorageService,
      ),
    );
    let app: INestApplication;
    const ids: Record<string, string> = {};
    const schoolIds = () => [ids.school, ids.foreignSchool].filter(Boolean);
    const where = () => ({ schoolId: { in: schoolIds() } });
    const context = (
      actorKind: 'STUDENT' | 'PARENT',
    ): AcademicContentCurrentRecipientContext =>
      ({
        actorKind,
        schoolId: ids.school,
        userId: actorKind === 'STUDENT' ? ids.studentUser : ids.parentUser,
        studentId: ids.student,
        enrollmentId: ids.enrollment,
        classroomId: ids.classroom,
        academicYearId: ids.year,
        termId: ids.term,
        ...(actorKind === 'PARENT' ? { guardianIds: [ids.guardian] } : {}),
      }) as AcademicContentCurrentRecipientContext;
    const deny = async (
      actorKind: 'STUDENT' | 'PARENT',
      contentId: string,
      fileId = ids.file,
    ) => {
      await expect(
        assets.access(context(actorKind), contentId, fileId, 'download'),
      ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    };

    beforeAll(async () => {
      await prisma.$connect();
      const suffix = randomUUID();
      ids.organization = (
        await prisma.organization.create({
          data: { name: 'ACC10D', slug: `acc10d-${suffix}` },
        })
      ).id;
      for (const name of ['school', 'foreignSchool'])
        ids[name] = (
          await prisma.school.create({
            data: {
              organizationId: ids.organization,
              name,
              slug: `acc10d-${name}-${suffix}`,
            },
          })
        ).id;
      for (const [name, userType] of [
        ['author', UserType.SCHOOL_USER],
        ['studentUser', UserType.STUDENT],
        ['parentUser', UserType.PARENT],
      ] as const)
        ids[name] = (
          await prisma.user.create({
            data: {
              userType,
              email: `acc10d-${name}-${suffix}@example.test`,
              firstName: 'Test',
              lastName: name,
            },
          })
        ).id;
      ids.year = (
        await prisma.academicYear.create({
          data: {
            schoolId: ids.school,
            nameAr: 'Year',
            nameEn: 'Year',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2027-12-31'),
          },
        })
      ).id;
      ids.term = (
        await prisma.term.create({
          data: {
            schoolId: ids.school,
            academicYearId: ids.year,
            isActive: true,
            nameAr: 'Term',
            nameEn: 'Term',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2027-12-31'),
          },
        })
      ).id;
      ids.stage = (
        await prisma.stage.create({
          data: { schoolId: ids.school, nameAr: 'Stage', nameEn: 'Stage' },
        })
      ).id;
      ids.grade = (
        await prisma.grade.create({
          data: {
            schoolId: ids.school,
            stageId: ids.stage,
            nameAr: 'Grade',
            nameEn: 'Grade',
          },
        })
      ).id;
      ids.section = (
        await prisma.section.create({
          data: {
            schoolId: ids.school,
            gradeId: ids.grade,
            nameAr: 'Section',
            nameEn: 'Section',
          },
        })
      ).id;
      ids.classroom = (
        await prisma.classroom.create({
          data: {
            schoolId: ids.school,
            sectionId: ids.section,
            nameAr: 'Classroom',
            nameEn: 'Classroom',
          },
        })
      ).id;
      ids.subject = (
        await prisma.subject.create({
          data: {
            schoolId: ids.school,
            nameAr: 'Subject',
            nameEn: 'Subject',
            code: `acc10d-${suffix}`,
          },
        })
      ).id;
      ids.student = (
        await prisma.student.create({
          data: {
            schoolId: ids.school,
            organizationId: ids.organization,
            userId: ids.studentUser,
            firstName: 'Student',
            lastName: 'ACC10D',
          },
        })
      ).id;
      ids.enrollment = (
        await prisma.enrollment.create({
          data: {
            schoolId: ids.school,
            studentId: ids.student,
            classroomId: ids.classroom,
            academicYearId: ids.year,
            termId: ids.term,
            enrolledAt: new Date(),
          },
        })
      ).id;
      ids.guardian = (
        await prisma.guardian.create({
          data: {
            schoolId: ids.school,
            organizationId: ids.organization,
            userId: ids.parentUser,
            firstName: 'Parent',
            lastName: 'ACC10D',
            phone: 'test-phone',
            relation: 'PARENT',
          },
        })
      ).id;

      const module = await Test.createTestingModule({
        controllers: [
          StudentAcademicContentController,
          ParentAcademicContentController,
        ],
        providers: [
          {
            provide: AccessStudentAcademicContentAssetUseCase,
            useValue: new AccessStudentAcademicContentAssetUseCase(
              new StudentAppAccessService(
                new StudentAppStudentReadAdapter(prisma),
              ),
              assets,
            ),
          },
          {
            provide: AccessParentAcademicContentAssetUseCase,
            useValue: new AccessParentAcademicContentAssetUseCase(
              new ParentAppAccessService(
                new ParentAppGuardianReadAdapter(prisma),
              ),
              assets,
            ),
          },
          ...[
            GetStudentAcademicContentUseCase,
            ListStudentAcademicContentUseCase,
            GetParentAcademicContentUseCase,
            ListParentAcademicContentUseCase,
            ListParentAcademicContentAccessibleChildrenUseCase,
          ].map((provide) => ({ provide, useValue: { execute: jest.fn() } })),
        ],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.use((req: Request, _res: Response, next: NextFunction) =>
        runWithRequestContext(createRequestContext(), () => {
          const student = req.path.startsWith('/api/v1/student/');
          setActor({
            id: student ? ids.studentUser : ids.parentUser,
            userType: student ? UserType.STUDENT : UserType.PARENT,
          });
          setActiveMembership({
            membershipId: randomUUID(),
            roleId: randomUUID(),
            organizationId: ids.organization,
            schoolId: ids.school,
            permissions: req.header('x-test-no-permission')
              ? []
              : ['academics.academic_content.view'],
          });
          next();
        }),
      );
      app.useGlobalGuards(new PermissionsGuard(new Reflector()));
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      app.useGlobalFilters(new GlobalExceptionFilter());
      await app.init();
    });

    async function clearContent() {
      await prisma.academicContentAudienceRecipientTarget.deleteMany({
        where: where(),
      });
      await prisma.academicContentAudienceRecipient.deleteMany({
        where: where(),
      });
      await prisma.academicContentPublication.deleteMany({
        where: { ...where(), supersedesPublicationId: { not: null } },
      });
      await prisma.academicContentPublication.deleteMany({ where: where() });
      await prisma.academicContentRevisionAsset.deleteMany({ where: where() });
      await prisma.academicContentRevisionTarget.deleteMany({ where: where() });
      await prisma.academicContentRevision.deleteMany({ where: where() });
      await prisma.academicContentAsset.deleteMany({ where: where() });
      await prisma.academicContent.deleteMany({ where: where() });
      await prisma.file.deleteMany({ where: where() });
      await prisma.subjectAllocation.deleteMany({ where: where() });
    }
    beforeEach(async () => {
      jest.restoreAllMocks();
      storage.createDownloadUrl
        .mockReset()
        .mockResolvedValue({ url: 'https://capability.invalid/short-lived' });
      await clearContent();
      await prisma.organization.update({
        where: { id: ids.organization },
        data: { status: 'ACTIVE', deletedAt: null },
      });
      await prisma.school.updateMany({
        where: { id: { in: schoolIds() } },
        data: { status: 'ACTIVE', deletedAt: null },
      });
      await prisma.user.updateMany({
        where: { id: { in: [ids.author, ids.studentUser, ids.parentUser] } },
        data: { status: 'ACTIVE', deletedAt: null },
      });
      await prisma.student.update({
        where: { id: ids.student },
        data: { status: 'ACTIVE', deletedAt: null },
      });
      await prisma.enrollment.update({
        where: { id: ids.enrollment },
        data: { status: 'ACTIVE', deletedAt: null, termId: ids.term },
      });
      await prisma.guardian.update({
        where: { id: ids.guardian },
        data: { deletedAt: null, canReceiveNotifications: true },
      });
      await prisma.studentGuardian.createMany({
        data: [
          {
            schoolId: ids.school,
            studentId: ids.student,
            guardianId: ids.guardian,
          },
        ],
        skipDuplicates: true,
      });
      await prisma.academicContentFilePolicy.upsert({
        where: { schoolId: ids.school },
        create: {
          schoolId: ids.school,
          ...effectiveAcademicContentFilePolicy(),
        },
        update: effectiveAcademicContentFilePolicy(),
      });
      ids.file = (
        await prisma.file.create({
          data: {
            schoolId: ids.school,
            organizationId: ids.organization,
            bucket: 'private-fixture',
            objectKey: `acc10d/${randomUUID()}`,
            originalName: 'resource.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 100n,
            visibility: 'PRIVATE',
          },
        })
      ).id;
    });
    afterAll(async () => {
      try {
        if (app) await app.close();
        if (ids.school) {
          await clearContent();
          await prisma.academicContentFilePolicy.deleteMany({ where: where() });
          await prisma.studentGuardian.deleteMany({ where: where() });
          await prisma.guardian.deleteMany({ where: where() });
          await prisma.enrollment.deleteMany({ where: where() });
          await prisma.student.deleteMany({ where: where() });
          await prisma.subject.deleteMany({ where: where() });
          await prisma.classroom.deleteMany({ where: where() });
          await prisma.section.deleteMany({ where: where() });
          await prisma.grade.deleteMany({ where: where() });
          await prisma.stage.deleteMany({ where: where() });
          await prisma.term.deleteMany({ where: where() });
          await prisma.academicYear.deleteMany({ where: where() });
          await prisma.school.deleteMany({
            where: { id: { in: schoolIds() } },
          });
        }
        await prisma.user.deleteMany({
          where: {
            id: {
              in: [ids.author, ids.studentUser, ids.parentUser].filter(Boolean),
            },
          },
        });
        if (ids.organization)
          await prisma.organization.delete({ where: { id: ids.organization } });
      } finally {
        await prisma.$disconnect();
      }
    });

    async function publish(
      options: {
        type?: AcademicContentType;
        audience?: Audience;
        scope?: Scope;
        qualified?: boolean;
        asset?: boolean;
        contentId?: string;
        revisionNumber?: number;
        visibleFrom?: Date;
        visibleUntil?: Date;
        status?: 'PUBLISHED' | 'CANCELLED' | 'EXPIRED' | 'SCHEDULED';
        publishedAt?: Date;
      } = {},
    ) {
      const type = options.type ?? 'GENERAL_RESOURCE';
      const audience = options.audience ?? Audience.STUDENTS_AND_GUARDIANS;
      const contentId =
        options.contentId ??
        (
          await prisma.academicContent.create({
            data: {
              schoolId: ids.school,
              academicYearId: ids.year,
              termId: ids.term,
              type,
              audience:
                type === 'GUARDIAN_WEEKLY_NOTE'
                  ? 'GUARDIANS'
                  : type === 'TEACHER_PREPARATION'
                    ? 'INTERNAL_STAFF'
                    : audience,
              title: 'Mutable',
              createdByUserId: ids.author,
            },
          })
        ).id;
      const revision = await prisma.academicContentRevision.create({
        data: {
          schoolId: ids.school,
          academicContentId: contentId,
          revisionNumber: options.revisionNumber ?? 1,
          snapshotContractVersion: 2,
          academicYearId: ids.year,
          termId: ids.term,
          type,
          audience,
          title: 'Frozen',
          sourceStatus: 'DRAFT',
          capturedByUserId: ids.author,
          typeSpecificSnapshot: Prisma.DbNull,
        },
      });
      const scope = options.scope ?? Scope.CLASSROOM;
      await prisma.academicContentRevisionTarget.create({
        data: {
          schoolId: ids.school,
          revisionId: revision.id,
          scopeType: scope,
          stageId: scope === 'STAGE' ? ids.stage : null,
          gradeId: scope === 'GRADE' ? ids.grade : null,
          sectionId: scope === 'SECTION' ? ids.section : null,
          classroomId: scope === 'CLASSROOM' ? ids.classroom : null,
          subjectId: options.qualified ? ids.subject : null,
          identityFingerprint: randomBytes(32).toString('hex'),
        },
      });
      if (options.asset !== false)
        await prisma.academicContentRevisionAsset.create({
          data: {
            schoolId: ids.school,
            revisionId: revision.id,
            fileId: ids.file,
            sortOrder: 0,
          },
        });
      const past = new Date(Date.now() - 60_000);
      const status = options.status ?? 'PUBLISHED';
      const publication = await prisma.academicContentPublication.create({
        data: {
          schoolId: ids.school,
          academicContentId: contentId,
          revisionId: revision.id,
          status,
          sourceContentStatus: 'DRAFT',
          publishAt: past,
          publishedAt:
            status === 'SCHEDULED' ? null : (options.publishedAt ?? past),
          visibleFrom: options.visibleFrom ?? past,
          visibleUntil: options.visibleUntil ?? null,
          cancelledAt: status === 'CANCELLED' ? past : null,
          cancellationReason: status === 'CANCELLED' ? 'WITHDRAWN' : null,
          expiredAt: status === 'EXPIRED' ? past : null,
          createdByUserId: ids.author,
          clientRequestId: randomUUID(),
          requestFingerprint: randomBytes(32).toString('hex'),
        },
      });
      return { contentId, revision, publication };
    }

    describe.each(['STUDENT', 'PARENT'] as const)('%s', (actorKind) => {
      it('signs a current exact private RevisionAsset and returns only the capability', async () => {
        const { contentId } = await publish();
        await expect(
          assets.access(context(actorKind), contentId, ids.file, 'download'),
        ).resolves.toEqual({ url: 'https://capability.invalid/short-lived' });
        expect(storage.createDownloadUrl).toHaveBeenCalledWith(
          expect.objectContaining({
            expiresInSeconds: 300,
            disposition: 'attachment',
            contentType: 'application/pdf',
          }),
        );
        expect(
          await prisma.academicContentAudienceRecipient.count({
            where: where(),
          }),
        ).toBe(0);
      });
      it.each(['deleted', 'public', 'zero-size'] as const)(
        'denies %s File without signing',
        async (kind) => {
          const { contentId } = await publish();
          await prisma.file.update({
            where: { id: ids.file },
            data:
              kind === 'deleted'
                ? { deletedAt: new Date() }
                : kind === 'public'
                  ? { visibility: 'PUBLIC' }
                  : { sizeBytes: 0n },
          });
          await deny(actorKind, contentId);
        },
      );
      it.each(['absent', 'mutable-only', 'foreign', 'other-content'] as const)(
        'denies %s file relationship',
        async (kind) => {
          const { contentId } = await publish({ asset: false });
          if (kind === 'mutable-only')
            await prisma.academicContentAsset.create({
              data: {
                schoolId: ids.school,
                academicContentId: contentId,
                fileId: ids.file,
                sortOrder: 0,
                createdByUserId: ids.author,
              },
            });
          if (kind === 'other-content') await publish();
          const fileId =
            kind === 'foreign'
              ? (
                  await prisma.file.create({
                    data: {
                      schoolId: ids.foreignSchool,
                      bucket: 'private-fixture',
                      objectKey: `foreign/${randomUUID()}`,
                      originalName: 'foreign.pdf',
                      mimeType: 'application/pdf',
                      sizeBytes: 100n,
                    },
                  })
                ).id
              : ids.file;
          await deny(actorKind, contentId, fileId);
        },
      );
      it.each([false, true])(
        'requires successor exact membership (retained=%s)',
        async (retained) => {
          const old = await publish({ status: 'CANCELLED' });
          const current = await publish({
            contentId: old.contentId,
            revisionNumber: 2,
            asset: retained,
          });
          if (!retained) await deny(actorKind, old.contentId);
          else {
            const authorized = await reads.findCurrentRecipientAsset(
              context(actorKind),
              old.contentId,
              ids.file,
              new Date(),
            );
            expect(authorized?.revisionId).toBe(current.revision.id);
            await assets.access(
              context(actorKind),
              old.contentId,
              ids.file,
              'download',
            );
          }
        },
      );
      it.each([
        'future',
        'expired-window',
        'CANCELLED',
        'EXPIRED',
        'SCHEDULED',
        'future-published',
      ] as const)('denies %s Publication', async (kind) => {
        const { contentId } = await publish({
          visibleFrom:
            kind === 'future' ? new Date(Date.now() + 60_000) : undefined,
          visibleUntil:
            kind === 'expired-window' ? new Date(Date.now() - 1000) : undefined,
          status: ['CANCELLED', 'EXPIRED', 'SCHEDULED'].includes(kind)
            ? (kind as 'CANCELLED' | 'EXPIRED' | 'SCHEDULED')
            : undefined,
          publishedAt:
            kind === 'future-published'
              ? new Date(Date.now() + 60_000)
              : undefined,
        });
        await deny(actorKind, contentId);
      });
      it.each(Object.values(Audience))(
        'enforces audience %s',
        async (audience) => {
          const { contentId } = await publish({ audience });
          const allow =
            audience === 'STUDENTS_AND_GUARDIANS' ||
            audience === (actorKind === 'STUDENT' ? 'STUDENTS' : 'GUARDIANS');
          if (allow)
            await assets.access(
              context(actorKind),
              contentId,
              ids.file,
              'download',
            );
          else await deny(actorKind, contentId);
        },
      );
      it.each(['TEACHER_PREPARATION', 'GUARDIAN_WEEKLY_NOTE'] as const)(
        'enforces recipient type %s',
        async (type) => {
          const { contentId } = await publish({ type });
          if (type === 'GUARDIAN_WEEKLY_NOTE' && actorKind === 'PARENT')
            await assets.access(
              context(actorKind),
              contentId,
              ids.file,
              'download',
            );
          else await deny(actorKind, contentId);
        },
      );
      it.each(Object.values(Scope))(
        'uses current immutable %s target matching',
        async (scope) => {
          const { contentId } = await publish({ scope });
          await assets.access(
            context(actorKind),
            contentId,
            ids.file,
            'download',
          );
          await prisma.academicContentRevisionTarget.deleteMany({
            where: where(),
          });
          storage.createDownloadUrl.mockClear();
          await deny(actorKind, contentId);
        },
      );
      it('requires current positive SubjectAllocation', async () => {
        const { contentId } = await publish({ qualified: true });
        await deny(actorKind, contentId);
        const allocation = await prisma.subjectAllocation.create({
          data: {
            schoolId: ids.school,
            academicYearId: ids.year,
            termId: ids.term,
            gradeId: ids.grade,
            subjectId: ids.subject,
            weeklyHours: 1,
          },
        });
        await assets.access(
          context(actorKind),
          contentId,
          ids.file,
          'download',
        );
        await prisma.subjectAllocation.update({
          where: { id: allocation.id },
          data: { weeklyHours: 0 },
        });
        storage.createDownloadUrl.mockClear();
        await deny(actorKind, contentId);
      });
      it.each([
        'actor',
        'student',
        'enrollment',
        'school',
        'organization',
        'wrong-term',
      ] as const)('rechecks current %s boundary', async (boundary) => {
        const { contentId } = await publish();
        if (boundary === 'actor')
          await prisma.user.update({
            where: { id: context(actorKind).userId },
            data: { deletedAt: new Date() },
          });
        if (boundary === 'student')
          await prisma.student.update({
            where: { id: ids.student },
            data: { deletedAt: new Date() },
          });
        if (boundary === 'enrollment')
          await prisma.enrollment.update({
            where: { id: ids.enrollment },
            data: { status: 'WITHDRAWN' },
          });
        if (boundary === 'school')
          await prisma.school.update({
            where: { id: ids.school },
            data: { status: 'SUSPENDED' },
          });
        if (boundary === 'organization')
          await prisma.organization.update({
            where: { id: ids.organization },
            data: { status: 'SUSPENDED' },
          });
        if (boundary === 'wrong-term') {
          await expect(
            assets.access(
              { ...context(actorKind), termId: randomUUID() },
              contentId,
              ids.file,
              'download',
            ),
          ).rejects.toMatchObject({ code: 'not_found' });
          expect(storage.createDownloadUrl).not.toHaveBeenCalled();
        } else await deny(actorKind, contentId);
      });
      it('current download flag denies download while retaining preview', async () => {
        const { contentId } = await publish();
        await prisma.academicContentFilePolicy.update({
          where: { schoolId: ids.school },
          data:
            actorKind === 'STUDENT'
              ? { allowStudentDownload: false }
              : { allowGuardianDownload: false },
        });
        await expect(
          assets.access(context(actorKind), contentId, ids.file, 'download'),
        ).rejects.toMatchObject({
          code: 'academic_content.file.download_unavailable',
          httpStatus: 403,
        });
        expect(storage.createDownloadUrl).not.toHaveBeenCalled();
        await assets.access(context(actorKind), contentId, ids.file, 'preview');
      });
      it('authoring category/size toggles do not retroactively deny a published File', async () => {
        const { contentId } = await publish();
        await prisma.academicContentFilePolicy.update({
          where: { schoolId: ids.school },
          data: {
            attachmentsEnabled: false,
            documentsEnabled: false,
            imagesEnabled: false,
            videosEnabled: false,
            audioEnabled: false,
            archivesEnabled: false,
            otherFilesEnabled: false,
            maximumFileSizeBytes: 1n,
          },
        });
        await assets.access(
          context(actorKind),
          contentId,
          ids.file,
          'download',
        );
        await assets.access(context(actorKind), contentId, ids.file, 'preview');
      });
      it('caps finite visibility TTL at the remaining window', async () => {
        const { contentId } = await publish({
          visibleUntil: new Date(Date.now() + 90_000),
        });
        await assets.access(
          context(actorKind),
          contentId,
          ids.file,
          'download',
        );
        const input = (
          storage.createDownloadUrl.mock.calls as [
            Parameters<StorageService['createDownloadUrl']>[0],
          ][]
        )[0][0];
        expect(input.expiresInSeconds).toBeGreaterThan(0);
        expect(input.expiresInSeconds).toBeLessThanOrEqual(90);
        expect(input.expiresInSeconds).toBeLessThanOrEqual(300);
      });
      it('issues no capability when policy work consumes the final whole second', async () => {
        const visibleUntil = new Date(Date.now() + 90_000);
        const { contentId } = await publish({ visibleUntil });
        jest.spyOn(policy, 'resolve').mockImplementation(() => {
          jest.spyOn(Date, 'now').mockReturnValue(visibleUntil.getTime() - 999);
          return Promise.resolve(effectiveAcademicContentFilePolicy());
        });
        await deny(actorKind, contentId);
      });
      it('allows a late current relationship absent from historical audience', async () => {
        const { contentId } = await publish();
        if (actorKind === 'STUDENT')
          await prisma.enrollment.update({
            where: { id: ids.enrollment },
            data: { enrolledAt: new Date() },
          });
        else {
          await prisma.studentGuardian.deleteMany({ where: where() });
          await prisma.studentGuardian.create({
            data: {
              schoolId: ids.school,
              studentId: ids.student,
              guardianId: ids.guardian,
            },
          });
        }
        expect(
          await prisma.academicContentAudienceRecipient.count({
            where: where(),
          }),
        ).toBe(0);
        await assets.access(
          context(actorKind),
          contentId,
          ids.file,
          'download',
        );
      });
      it('denies a former relationship despite historical recipient membership', async () => {
        const { contentId, revision, publication } = await publish();
        await prisma.academicContentAudienceRecipient.create({
          data: {
            schoolId: ids.school,
            publicationId: publication.id,
            revisionId: revision.id,
            recipientKind: actorKind === 'STUDENT' ? 'STUDENT' : 'GUARDIAN',
            identityFingerprint: randomBytes(32).toString('hex'),
            studentId: ids.student,
            enrollmentId: ids.enrollment,
            classroomId: ids.classroom,
            recipientUserId: context(actorKind).userId,
            guardianId: actorKind === 'PARENT' ? ids.guardian : null,
          },
        });
        if (actorKind === 'STUDENT')
          await prisma.enrollment.update({
            where: { id: ids.enrollment },
            data: { status: 'WITHDRAWN' },
          });
        else await prisma.studentGuardian.deleteMany({ where: where() });
        await deny(actorKind, contentId);
        expect(
          await prisma.academicContentAudienceRecipient.count({
            where: where(),
          }),
        ).toBe(1);
      });
      it('HTTP access returns a 307 private no-store redirect without storage metadata', async () => {
        const { contentId } = await publish();
        const prefix =
          actorKind === 'STUDENT'
            ? '/api/v1/student'
            : `/api/v1/parent/children/${ids.student}`;
        const path = `${prefix}/academic-content/${contentId}/assets/${ids.file}/access`;
        const response = await request(app.getHttpServer() as App)
          .get(`${path}?mode=download`)
          .expect(307);
        expect(response.headers.location).toBe(
          'https://capability.invalid/short-lived',
        );
        expect(response.headers['cache-control']).toBe(
          'no-store, private, max-age=0',
        );
        for (const hidden of [
          'bucket',
          'objectKey',
          'expiresAt',
          'private-fixture',
          'acc10d/',
        ])
          expect(response.text).not.toContain(hidden);
        await request(app.getHttpServer() as App)
          .get(`${path}?mode=download`)
          .set('x-test-no-permission', '1')
          .expect(403);
      });
      it('HTTP mode and UUID validation fails before signing', async () => {
        const { contentId } = await publish();
        const prefix =
          actorKind === 'STUDENT'
            ? '/api/v1/student'
            : `/api/v1/parent/children/${ids.student}`;
        const path = `${prefix}/academic-content/${contentId}/assets/${ids.file}/access`;
        for (const query of [
          '',
          '?mode=invalid',
          '?mode=PREVIEW',
          '?mode=preview&schoolId=chosen',
        ]) {
          const response = await request(app.getHttpServer() as App)
            .get(`${path}${query}`)
            .expect(400);
          expect(response.body as unknown).toMatchObject({
            error: { code: 'validation.failed' },
          });
        }
        await request(app.getHttpServer() as App)
          .get(
            `${prefix}/academic-content/invalid/assets/${ids.file}/access?mode=download`,
          )
          .expect(400);
        await request(app.getHttpServer() as App)
          .get(
            `${prefix}/academic-content/${contentId}/assets/invalid/access?mode=download`,
          )
          .expect(400);
        expect(storage.createDownloadUrl).not.toHaveBeenCalled();
      });
    });
    it.each([false, true])(
      'Parent notification opt-out (%s) does not affect content access',
      async (canReceiveNotifications) => {
        const { contentId } = await publish();
        await prisma.guardian.update({
          where: { id: ids.guardian },
          data: { canReceiveNotifications },
        });
        await assets.access(context('PARENT'), contentId, ids.file, 'download');
      },
    );
    it('foreign/random Parent child stops before capability issuance', async () => {
      const { contentId } = await publish();
      await request(app.getHttpServer() as App)
        .get(
          `/api/v1/parent/children/${randomUUID()}/academic-content/${contentId}/assets/${ids.file}/access?mode=download`,
        )
        .expect(404);
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    });
  },
);
