import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { GlobalExceptionFilter } from '../../src/common/exceptions/global-exception.filter';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { TeacherAcademicContentAuthoringController } from '../../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentStatus as Status,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as Type,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';
import { AcademicContentTargetRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-target.repository';
import { AcademicContentTypeDetailRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-type-detail.repository';
import { AcademicContentLinksTagsRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-links-tags.repository';
import { AcademicContentValidationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-validation.repository';
import { AcademicContentWorkflowPolicyRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-workflow-policy.repository';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import { AcademicContentFilePolicyResolver } from '../../src/modules/academics/academic-content/files/application/academic-content-file-policy.resolver';
import { AcademicContentAuthoringOperations } from '../../src/modules/academics/academic-content/application/academic-content-authoring.operations';
import { GetAcademicContentReadinessUseCase } from '../../src/modules/academics/academic-content/application/academic-content-readiness.use-case';
import { normalizeAcademicContentTargets } from '../../src/modules/academics/academic-content/domain/academic-content-target.policy';
import { assertAcademicContentAudience } from '../../src/modules/academics/academic-content/domain/academic-content-audience.policy';
import {
  normalizePreparation,
  normalizeWeeklyPlan,
  normalizeGuardianNote,
  normalizeSubjectResource,
  normalizeOnlineSession,
} from '../../src/modules/academics/academic-content/domain/academic-content-type-detail.policy';
import { PrismaTeacherAllocationOperationalWriteGate } from '../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-operational-write-gate';
import { TeacherAppAccessService } from '../../src/modules/teacher-app/access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../../src/modules/teacher-app/access/teacher-app-allocation-read.adapter';
import { TeacherAcademicContentReadAdapter } from '../../src/modules/teacher-app/academic-content/infrastructure/teacher-academic-content-read.adapter';
import { TeacherAcademicContentAuthoringUseCases } from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases';

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;
describeDatabase(
  'ACC-9B PostgreSQL Teacher authoring and transactional ownership',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService();
    const gate = new PrismaTeacherAllocationOperationalWriteGate();
    const contents = new AcademicContentRepository(prisma, gate);
    const operations = new AcademicContentAuthoringOperations(
      contents,
      new AcademicContentTargetRepository(prisma, gate),
      new AcademicContentLinksTagsRepository(prisma, gate),
      new AcademicContentTypeDetailRepository(prisma, gate),
    );
    const read = new TeacherAcademicContentReadAdapter(
      contents,
      new AcademicContentWorkflowPolicyRepository(prisma),
      new AcademicContentFilePolicyResolver(
        new AcademicContentFileRepository(prisma),
      ),
    );
    const coreReadiness = new GetAcademicContentReadinessUseCase(
      contents,
      new AcademicContentValidationRepository(prisma),
    );
    const useCases = new TeacherAcademicContentAuthoringUseCases(
      new TeacherAppAccessService(new TeacherAppAllocationReadAdapter(prisma)),
      operations,
      read,
      coreReadiness,
    );
    const suffix = randomUUID();
    let app: INestApplication<App>;
    const ids: Record<string, string> = {};
    const rows: Record<string, string> = {};
    const now = new Date('2030-06-01');
    const grants = [
      'academics.academic_content.view',
      'academics.academic_content.manage',
      'academics.academic_content.publish',
    ];

    function asTeacher<T>(
      fn: () => T,
      teacherUserId = ids.teacher,
      permissions = grants,
      userType: UserType = UserType.TEACHER,
    ): T {
      const context = createRequestContext();
      context.actor = { id: teacherUserId, userType };
      context.activeMembership = {
        schoolId: ids.school,
        organizationId: ids.org,
        membershipId: randomUUID(),
        roleId: randomUUID(),
        permissions,
      };
      return runWithRequestContext(context, fn);
    }

    async function createContent(
      name: string,
      options: {
        creator?: string;
        allocations?: string[];
        type?: Type;
        status?: Status;
        audience?: Audience;
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
          title: 'acc9b-' + name,
          type: options.type ?? Type.GENERAL_RESOURCE,
          status: options.status ?? Status.DRAFT,
          archivedAt: options.status === Status.ARCHIVED ? now : null,
          audience: options.audience ?? Audience.STUDENTS,
          deletedAt: options.deleted ? now : null,
        },
      });
      for (const allocationId of options.allocations ?? [ids.a]) {
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
      rows[name] = row.id;
      return row;
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
              email: key + suffix + '@example.test',
              firstName: 'ACC9B',
              lastName: key,
              userType,
            },
          })
        ).id;
      for (const prefix of ['', 'foreign']) {
        ids[prefix + 'org'] = (
          await prisma.organization.create({
            data: {
              name: 'ACC9B ' + prefix + suffix,
              slug: 'acc9b-org-' + prefix + suffix,
            },
          })
        ).id;
        ids[prefix + 'school'] = (
          await prisma.school.create({
            data: {
              organizationId: ids[prefix + 'org'],
              name: 'ACC9B ' + prefix + suffix,
              slug: 'acc9b-school-' + prefix + suffix,
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
              startDate: new Date('2030-01-01'),
              endDate: new Date('2030-12-31'),
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
              startDate: new Date('2030-01-01'),
              endDate: new Date('2030-12-31'),
              isActive: true,
            },
          })
        ).id;
        const stage = await prisma.stage.create({
          data: { schoolId, nameAr: suffix, nameEn: suffix },
        });
        const grade = await prisma.grade.create({
          data: { schoolId, stageId: stage.id, nameAr: suffix, nameEn: suffix },
        });
        const section = await prisma.section.create({
          data: { schoolId, gradeId: grade.id, nameAr: suffix, nameEn: suffix },
        });
        const subject = await prisma.subject.create({
          data: { schoolId, code: suffix, nameAr: suffix, nameEn: suffix },
        });
        ids[prefix + 'subject'] = subject.id;
        ids[prefix + 'grade'] = grade.id;
        await prisma.subjectAllocation.create({
          data: {
            schoolId,
            academicYearId: ids[prefix + 'year'],
            termId: ids[prefix + 'term'],
            subjectId: subject.id,
            gradeId: grade.id,
            weeklyHours: 4,
          },
        });
        for (const key of ['a', 'b', 'c']) {
          const classroom = await prisma.classroom.create({
            data: {
              schoolId,
              sectionId: section.id,
              nameAr: key + suffix,
              nameEn: key + suffix,
            },
          });
          ids[prefix + key] = (
            await prisma.teacherSubjectAllocation.create({
              data: {
                schoolId,
                classroomId: classroom.id,
                subjectId: subject.id,
                termId: ids[prefix + 'term'],
                teacherUserId: key === 'b' ? ids.other : ids.teacher,
              },
            })
          ).id;
        }
      }
      ids.otherterm = (
        await prisma.term.create({
          data: {
            schoolId: ids.school,
            academicYearId: ids.year,
            nameAr: 'Other' + suffix,
            nameEn: 'Other' + suffix,
            startDate: new Date('2030-01-01'),
            endDate: new Date('2030-12-31'),
            isActive: true,
          },
        })
      ).id;
      const allocation =
        await prisma.teacherSubjectAllocation.findUniqueOrThrow({
          where: { id: ids.a },
        });
      ids.crossTerm = (
        await prisma.teacherSubjectAllocation.create({
          data: {
            schoolId: ids.school,
            classroomId: allocation.classroomId,
            subjectId: allocation.subjectId,
            termId: ids.otherterm,
            teacherUserId: ids.teacher,
          },
        })
      ).id;
      const subject = await prisma.subject.create({
        data: {
          schoolId: ids.school,
          code: 'other' + suffix,
          nameAr: 'Other',
          nameEn: 'Other',
        },
      });
      await prisma.subjectAllocation.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          subjectId: subject.id,
          gradeId: ids.grade,
          weeklyHours: 2,
        },
      });
      ids.crossSubject = (
        await prisma.teacherSubjectAllocation.create({
          data: {
            schoolId: ids.school,
            classroomId: allocation.classroomId,
            subjectId: subject.id,
            termId: ids.term,
            teacherUserId: ids.teacher,
          },
        })
      ).id;
      ids.curriculum = (
        await prisma.curriculum.create({
          data: {
            schoolId: ids.school,
            academicYearId: ids.year,
            termId: ids.term,
            subjectId: ids.subject,
            gradeId: ids.grade,
            title: 'Curriculum',
            createdByUserId: ids.teacher,
          },
        })
      ).id;
      const module = await Test.createTestingModule({
        controllers: [TeacherAcademicContentAuthoringController],
        providers: [
          {
            provide: TeacherAcademicContentAuthoringUseCases,
            useValue: useCases,
          },
        ],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.use(
        (
          req: { headers: Record<string, string> },
          _res: unknown,
          next: () => void,
        ) => {
          asTeacher(
            next,
            ids.teacher,
            req.headers['x-missing'] ? [] : grants,
            (req.headers['x-actor'] as UserType | undefined) ??
              UserType.TEACHER,
          );
        },
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

    afterAll(async () => {
      if (app) await app.close();
      if (ids.school && ids.foreignschool) {
        const schoolId = { in: [ids.school, ids.foreignschool] };
        await prisma.auditLog.deleteMany({ where: { schoolId } });
        await prisma.academicContentRevision.deleteMany({
          where: { schoolId },
        });
        await prisma.academicContentLink.deleteMany({ where: { schoolId } });
        await prisma.academicContentPreparationDetail.deleteMany({
          where: { schoolId },
        });
        await prisma.academicContentSubjectResourceDetail.deleteMany({
          where: { schoolId },
        });
        await prisma.curriculum.deleteMany({ where: { schoolId } });
        await prisma.academicContentTag.deleteMany({ where: { schoolId } });
        await prisma.academicContentWeeklyPlanDetail.deleteMany({
          where: { schoolId },
        });
        await prisma.academicContentOnlineSessionDetail.deleteMany({
          where: { schoolId },
        });
        await prisma.academicContentGuardianNoteDetail.deleteMany({
          where: { schoolId },
        });
        await prisma.academicContentTarget.deleteMany({ where: { schoolId } });
        await prisma.academicContent.deleteMany({ where: { schoolId } });
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

    const preparation = {
      topic: '  Topic  ',
      objectives: ['  Learn   well '],
      learningOutcomes: [],
      teachingStrategies: [],
      activities: [],
    };
    const weekly = {
      weekStartDate: '2030-06-01',
      weekEndDate: '2030-06-07',
      objectives: [],
      topics: ['  Topic  '],
      homeworkAssignmentIds: [],
      gradeAssessmentIds: [],
    };
    const note = {
      body: '  Note  ',
      priority: 'NORMAL' as const,
      requiresAcknowledgement: false,
    };
    const resource = { resourceCategory: 'OTHER' as const };
    const session = {
      platform: 'ZOOM' as const,
      joinUrl: ' https://example.test/meeting ',
      startAt: '2030-06-05T10:00:00Z',
      endAt: '2030-06-05T11:00:00Z',
      timezone: 'Africa/Cairo',
    };
    function actions(
      contentId: string,
    ): Array<[string, () => Promise<unknown>]> {
      return [
        [
          'metadata',
          () => useCases.update(contentId, { title: 'Changed' }, now),
        ],
        ['archive', () => useCases.archive(contentId, now)],
        ['restore', () => useCases.restore(contentId, now)],
        ['delete', () => useCases.delete(contentId, now)],
        ['targets', () => useCases.targets(contentId, { classIds: [ids.c] })],
        [
          'preparation',
          () => useCases.preparation(contentId, preparation, now),
        ],
        ['weeklyPlan', () => useCases.weeklyPlan(contentId, weekly, now)],
        ['guardianNote', () => useCases.guardianNote(contentId, note, now)],
        [
          'subjectResource',
          () => useCases.subjectResource(contentId, resource, now),
        ],
        [
          'onlineSession',
          () => useCases.onlineSession(contentId, session, now),
        ],
        ['links', () => useCases.links(contentId, [], now)],
        ['tags', () => useCases.tags(contentId, [], now)],
      ];
    }
    async function create(
      type: Type = Type.GENERAL_RESOURCE,
      audience: Audience = Audience.STUDENTS,
    ) {
      return asTeacher(() =>
        useCases.create(
          ids.a,
          {
            type,
            audience,
            title: '  Created  ',
            description: '  Description  ',
          },
          now,
        ),
      );
    }

    it.each(Object.values(Type))(
      'atomically creates %s with Core audience truth and one server-derived target',
      async (type) => {
        for (const audience of Object.values(Audience)) {
          let allowed = true;
          try {
            assertAcademicContentAudience(type, audience);
          } catch {
            allowed = false;
          }
          const before = await prisma.academicContent.count({
            where: { schoolId: ids.school },
          });
          if (!allowed) {
            await expect(create(type, audience)).rejects.toMatchObject({
              httpStatus: 400,
            });
            expect(
              await prisma.academicContent.count({
                where: { schoolId: ids.school },
              }),
            ).toBe(before);
            continue;
          }
          const row = await create(type, audience);
          expect(row).toMatchObject({
            schoolId: ids.school,
            academicYearId: ids.year,
            termId: ids.term,
            createdByUserId: ids.teacher,
            status: Status.DRAFT,
            type,
            audience,
            title: 'Created',
            description: 'Description',
          });
          const allocation =
            await prisma.teacherSubjectAllocation.findUniqueOrThrow({
              where: { id: ids.a },
            });
          const targets = await prisma.academicContentTarget.findMany({
            where: { academicContentId: row.id },
          });
          const [expected] = normalizeAcademicContentTargets(
            type,
            UserType.TEACHER,
            [
              {
                scopeType: Scope.CLASSROOM,
                classroomId: allocation.classroomId,
                subjectId: allocation.subjectId,
                teacherSubjectAllocationId: allocation.id,
              },
            ],
          );
          expect(targets).toHaveLength(1);
          expect(targets[0]).toMatchObject({
            ...expected,
            schoolId: ids.school,
            academicContentId: row.id,
            createdByUserId: ids.teacher,
            stageId: null,
            gradeId: null,
            sectionId: null,
          });
          expect(
            await prisma.auditLog.count({
              where: {
                resourceId: row.id,
                action: 'academics.academic_content.create',
              },
            }),
          ).toBe(1);
        }
      },
    );
    it('hides another Teacher, foreign School and missing allocations without leaving ownerless drafts', async () => {
      const before = await prisma.academicContent.count();
      const targets = await prisma.academicContentTarget.count();
      for (const classId of [ids.b, ids.foreigna, randomUUID()]) {
        await expect(
          asTeacher(() =>
            useCases.create(
              classId,
              {
                type: Type.GENERAL_RESOURCE,
                audience: Audience.STUDENTS,
                title: 'Denied',
              },
              now,
            ),
          ),
        ).rejects.toMatchObject({ httpStatus: 404 });
      }
      expect(await prisma.academicContent.count()).toBe(before);
      expect(await prisma.academicContentTarget.count()).toBe(targets);
    });
    it('rolls back header, target and audit when target reference validation fails after header creation', async () => {
      const before = [
        await prisma.academicContent.count(),
        await prisma.academicContentTarget.count(),
        await prisma.auditLog.count(),
      ];
      await prisma.subjectAllocation.updateMany({
        where: {
          schoolId: ids.school,
          termId: ids.term,
          subjectId: ids.subject,
        },
        data: { weeklyHours: 0 },
      });
      try {
        await expect(create()).rejects.toMatchObject({ httpStatus: 400 });
      } finally {
        await prisma.subjectAllocation.updateMany({
          where: {
            schoolId: ids.school,
            termId: ids.term,
            subjectId: ids.subject,
          },
          data: { weeklyHours: 4 },
        });
      }
      expect([
        await prisma.academicContent.count(),
        await prisma.academicContentTarget.count(),
        await prisma.auditLog.count(),
      ]).toEqual(before);
    });
    it('rejects server context overrides during direct invocation', async () => {
      for (const field of [
        'academicYearId',
        'termId',
        'subjectId',
        'classroomId',
        'teacherSubjectAllocationId',
        'teacherUserId',
        'schoolId',
        'organizationId',
      ]) {
        const command = {
          type: Type.GENERAL_RESOURCE,
          audience: Audience.STUDENTS,
          title: 'Denied',
          [field]: randomUUID(),
        };
        await expect(
          Promise.resolve().then(() =>
            asTeacher(() => useCases.create(ids.a, command, now)),
          ),
        ).rejects.toMatchObject({ httpStatus: 400 });
      }
    });
    it.each([
      'school-created',
      'other-creator',
      'mixed',
      'untargeted',
      'foreign',
      'deleted',
      'reassigned',
    ])(
      'denies every final mutation for %s and preserves database truth',
      async (kind) => {
        const row = await createContent(kind, {
          creator:
            kind === 'school-created'
              ? ids.manager
              : kind === 'other-creator'
                ? ids.other
                : ids.teacher,
          allocations:
            kind === 'untargeted'
              ? []
              : kind === 'mixed'
                ? [ids.a, ids.b]
                : kind === 'foreign'
                  ? [ids.foreigna]
                  : [ids.a],
          foreign: kind === 'foreign',
          deleted: kind === 'deleted',
        });
        const beforeTargets = await prisma.academicContentTarget.findMany({
          where: { academicContentId: row.id },
          orderBy: { id: 'asc' },
        });
        if (kind === 'reassigned')
          await prisma.teacherSubjectAllocation.update({
            where: { id: ids.a },
            data: { teacherUserId: ids.other },
          });
        try {
          for (const [, action] of actions(row.id))
            await expect(asTeacher(action)).rejects.toMatchObject({
              httpStatus: 404,
            });
          expect(
            await prisma.academicContent.findUnique({ where: { id: row.id } }),
          ).toEqual(row);
          expect(
            await prisma.academicContentTarget.findMany({
              where: { academicContentId: row.id },
              orderBy: { id: 'asc' },
            }),
          ).toEqual(beforeTargets);
          expect(
            await prisma.auditLog.count({ where: { resourceId: row.id } }),
          ).toBe(0);
        } finally {
          if (kind === 'reassigned')
            await prisma.teacherSubjectAllocation.update({
              where: { id: ids.a },
              data: { teacherUserId: ids.teacher },
            });
        }
      },
    );
    it.each([Status.DRAFT, Status.CHANGES_REQUESTED])(
      'reuses mutable metadata and lifecycle rules for %s',
      async (status) => {
        const row = await createContent(status, { status });
        expect(
          await asTeacher(() =>
            useCases.update(
              row.id,
              {
                title: '  Changed  ',
                description: '  ',
                audience: Audience.GUARDIANS,
              },
              now,
            ),
          ),
        ).toMatchObject({
          title: 'Changed',
          description: null,
          audience: Audience.GUARDIANS,
          status,
        });
        expect(
          await asTeacher(() => useCases.archive(row.id, now)),
        ).toMatchObject({ status: Status.ARCHIVED, archivedAt: now });
        expect(
          await asTeacher(() => useCases.restore(row.id, now)),
        ).toMatchObject({ status: Status.DRAFT, archivedAt: null });
        await asTeacher(() => useCases.delete(row.id, now));
        expect(
          await prisma.academicContent.findUnique({ where: { id: row.id } }),
        ).toMatchObject({ deletedAt: now });
      },
    );
    it.each(
      Object.values(Status).filter(
        (status) =>
          status !== Status.DRAFT && status !== Status.CHANGES_REQUESTED,
      ),
    )('rejects authoring mutations in read-only %s', async (status) => {
      const row = await createContent(status, { status });
      for (const [name, action] of actions(row.id).filter(
        ([name]) =>
          ![
            'archive',
            'restore',
            'preparation',
            'weeklyPlan',
            'guardianNote',
            'subjectResource',
            'onlineSession',
          ].includes(name),
      )) {
        await expect(asTeacher(action)).rejects.toMatchObject({
          httpStatus: 409,
        });
        expect(name).toBeTruthy();
      }
    });
    it('preserves closed-term authoring rejection, explicit archive allowance and restore rejection', async () => {
      const row = await createContent('closed');
      await prisma.term.update({
        where: { id: ids.term },
        data: {
          startDate: new Date('2020-01-01'),
          endDate: new Date('2020-12-31'),
        },
      });
      try {
        await expect(create()).rejects.toMatchObject({
          code: 'academic_content.term.closed',
        });
        for (const [, action] of actions(row.id).filter(
          ([name]) =>
            ![
              'archive',
              'restore',
              'preparation',
              'weeklyPlan',
              'guardianNote',
              'subjectResource',
              'onlineSession',
            ].includes(name),
        ))
          await expect(asTeacher(action)).rejects.toMatchObject({
            code: 'academic_content.term.closed',
          });
        await asTeacher(() => useCases.archive(row.id, now));
        await expect(
          asTeacher(() => useCases.restore(row.id, now)),
        ).rejects.toMatchObject({ code: 'academic_content.term.closed' });
      } finally {
        await prisma.term.update({
          where: { id: ids.term },
          data: {
            startDate: new Date('2030-01-01'),
            endDate: new Date('2030-12-31'),
          },
        });
      }
    });
    it('preserves revision-history deletion protection', async () => {
      const row = await create();
      await prisma.academicContentRevision.create({
        data: {
          schoolId: ids.school,
          academicContentId: row.id,
          revisionNumber: 1,
          snapshotContractVersion: 1,
          academicYearId: ids.year,
          termId: ids.term,
          type: row.type,
          audience: row.audience,
          title: row.title,
          sourceStatus: Status.DRAFT,
          capturedByUserId: ids.teacher,
        },
      });
      await expect(
        asTeacher(() => useCases.delete(row.id, now)),
      ).rejects.toMatchObject({ httpStatus: 409 });
      expect(
        await prisma.academicContent.findUnique({ where: { id: row.id } }),
      ).toMatchObject({ deletedAt: null });
    });
    it('replaces one or multiple owned same-term, same-subject targets with Core fingerprints', async () => {
      const row = await create();
      for (const classIds of [[ids.c], [ids.a, ids.c]]) {
        const targets = await asTeacher(() =>
          useCases.targets(row.id, { classIds }),
        );
        expect(targets).toHaveLength(classIds.length);
        const allocations = await prisma.teacherSubjectAllocation.findMany({
          where: { id: { in: classIds } },
        });
        const expected = normalizeAcademicContentTargets(
          row.type,
          UserType.TEACHER,
          allocations.map((allocation) => ({
            scopeType: Scope.CLASSROOM,
            classroomId: allocation.classroomId,
            subjectId: allocation.subjectId,
            teacherSubjectAllocationId: allocation.id,
          })),
        );
        expect(
          targets.map((target) => target.identityFingerprint).sort(),
        ).toEqual(expected.map((target) => target.identityFingerprint).sort());
        expect(
          targets.every(
            (target) =>
              target.stageId === null &&
              target.gradeId === null &&
              target.sectionId === null,
          ),
        ).toBe(true);
      }
    });
    it('rejects malformed and incoherent requested classes without replacing current targets', async () => {
      const row = await create();
      const before = await prisma.academicContentTarget.findMany({
        where: { academicContentId: row.id },
      });
      for (const classIds of [
        [],
        [ids.a, ids.a],
        Array.from({ length: 51 }, () => randomUUID()),
        ['bad'],
        [ids.b],
        [ids.foreigna],
        [ids.crossTerm],
        [ids.a, ids.crossSubject],
      ]) {
        await expect(
          asTeacher(() => useCases.targets(row.id, { classIds })),
        ).rejects.toBeDefined();
        expect(
          await prisma.academicContentTarget.findMany({
            where: { academicContentId: row.id },
          }),
        ).toEqual(before);
      }
    });
    it('gates old plus requested classes so reassigned targets cannot be replaced away', async () => {
      const row = await create();
      await prisma.teacherSubjectAllocation.update({
        where: { id: ids.a },
        data: { teacherUserId: ids.other },
      });
      try {
        await expect(
          asTeacher(() => useCases.targets(row.id, { classIds: [ids.c] })),
        ).rejects.toMatchObject({ httpStatus: 404 });
      } finally {
        await prisma.teacherSubjectAllocation.update({
          where: { id: ids.a },
          data: { teacherUserId: ids.teacher },
        });
      }
      expect(
        (
          await prisma.academicContentTarget.findMany({
            where: { academicContentId: row.id },
          })
        ).map((target) => target.teacherSubjectAllocationId),
      ).toEqual([ids.a]);
    });
    const details = [
      {
        type: Type.TEACHER_PREPARATION,
        audience: Audience.INTERNAL_STAFF,
        write: (id: string) => useCases.preparation(id, preparation, now),
        expected: () => normalizePreparation(preparation),
      },
      {
        type: Type.WEEKLY_PLAN,
        audience: Audience.GUARDIANS,
        write: (id: string) => useCases.weeklyPlan(id, weekly, now),
        expected: () => normalizeWeeklyPlan(weekly),
      },
      {
        type: Type.GUARDIAN_WEEKLY_NOTE,
        audience: Audience.GUARDIANS,
        write: (id: string) => useCases.guardianNote(id, note, now),
        expected: () => normalizeGuardianNote(note),
      },
      {
        type: Type.SUBJECT_RESOURCE,
        audience: Audience.STUDENTS,
        write: (id: string) => useCases.subjectResource(id, resource, now),
        expected: () => normalizeSubjectResource(resource),
      },
      {
        type: Type.ONLINE_SESSION,
        audience: Audience.STUDENTS,
        write: (id: string) => useCases.onlineSession(id, session, now),
        expected: () => normalizeOnlineSession(session),
      },
    ];
    it.each(details)(
      'persists $type using Core normalizers and rejects wrong types',
      async ({ type, audience, write, expected }) => {
        const row = await create(type, audience);
        const result = await asTeacher(() => write(row.id));
        expect(result.state).toEqual(expected().state);
        const wrong = await create();
        await expect(asTeacher(() => write(wrong.id))).rejects.toMatchObject({
          httpStatus: 400,
        });
        expect(
          await prisma.auditLog.count({ where: { resourceId: row.id } }),
        ).toBe(2);
      },
    );
    it.each(details)(
      'enforces mutable state and writable term on $type details',
      async ({ type, audience, write }) => {
        const row = await create(type, audience);
        await prisma.academicContent.update({
          where: { id: row.id },
          data: { status: Status.CHANGES_REQUESTED },
        });
        await asTeacher(() => write(row.id));
        for (const status of Object.values(Status).filter(
          (status) =>
            status !== Status.DRAFT && status !== Status.CHANGES_REQUESTED,
        )) {
          await prisma.academicContent.update({
            where: { id: row.id },
            data: {
              status,
              archivedAt: status === Status.ARCHIVED ? now : null,
            },
          });
          await expect(asTeacher(() => write(row.id))).rejects.toMatchObject({
            code: 'academic_content.status.read_only',
          });
        }
        await prisma.academicContent.update({
          where: { id: row.id },
          data: { status: Status.DRAFT, archivedAt: null },
        });
        await prisma.term.update({
          where: { id: ids.term },
          data: {
            startDate: new Date('2020-01-01'),
            endDate: new Date('2020-12-31'),
          },
        });
        try {
          await expect(asTeacher(() => write(row.id))).rejects.toMatchObject({
            code: 'academic_content.term.closed',
          });
        } finally {
          await prisma.term.update({
            where: { id: ids.term },
            data: {
              startDate: new Date('2030-01-01'),
              endDate: new Date('2030-12-31'),
            },
          });
        }
      },
    );

    it('preserves curriculum, homework, assessment and timetable reference scope and target/detail compatibility', async () => {
      const row = await create(Type.SUBJECT_RESOURCE);
      await asTeacher(() =>
        useCases.subjectResource(
          row.id,
          { ...resource, curriculumId: ids.curriculum },
          now,
        ),
      );
      await expect(
        asTeacher(() =>
          useCases.targets(row.id, { classIds: [ids.crossSubject] }),
        ),
      ).rejects.toMatchObject({ httpStatus: 400 });
      const prep = await create(
        Type.TEACHER_PREPARATION,
        Audience.INTERNAL_STAFF,
      );
      await expect(
        asTeacher(() =>
          useCases.preparation(
            prep.id,
            { ...preparation, curriculumId: randomUUID() },
            now,
          ),
        ),
      ).rejects.toMatchObject({ httpStatus: 400 });
      await expect(
        asTeacher(() =>
          useCases.preparation(
            prep.id,
            { ...preparation, timetableEntryId: randomUUID() },
            now,
          ),
        ),
      ).rejects.toMatchObject({ httpStatus: 400 });
      const week = await create(Type.WEEKLY_PLAN, Audience.GUARDIANS);
      await expect(
        asTeacher(() =>
          useCases.weeklyPlan(
            week.id,
            { ...weekly, homeworkAssignmentIds: [randomUUID()] },
            now,
          ),
        ),
      ).rejects.toMatchObject({ httpStatus: 400 });
      await expect(
        asTeacher(() =>
          useCases.weeklyPlan(
            week.id,
            { ...weekly, gradeAssessmentIds: [randomUUID()] },
            now,
          ),
        ),
      ).rejects.toMatchObject({ httpStatus: 400 });
      const online = await create(Type.ONLINE_SESSION);
      await expect(
        asTeacher(() =>
          useCases.onlineSession(
            online.id,
            { ...session, timetableEntryId: randomUUID() },
            now,
          ),
        ),
      ).rejects.toMatchObject({ httpStatus: 400 });
    });
    it('preserves ordered links/tags normalization, replacement, bounds and no-op audit behavior', async () => {
      const row = await create();
      const links = [
        { label: '  B  ', url: ' https://example.test/b ' },
        { label: 'A', url: 'http://example.test/a' },
      ];
      const tags = [{ value: '  Ｗeekly   Resource  ' }, { value: 'Other' }];
      expect(
        await asTeacher(() => useCases.links(row.id, links, now)),
      ).toMatchObject([
        { label: 'B', url: 'https://example.test/b', sortOrder: 0 },
        { label: 'A', sortOrder: 1 },
      ]);
      expect(
        await asTeacher(() => useCases.tags(row.id, tags, now)),
      ).toMatchObject([
        {
          displayValue: 'Weekly Resource',
          normalizedValue: 'weekly resource',
          sortOrder: 0,
        },
        { normalizedValue: 'other', sortOrder: 1 },
      ]);
      const count = await prisma.auditLog.count({
        where: { resourceId: row.id },
      });
      await asTeacher(() => useCases.links(row.id, links, now));
      await asTeacher(() => useCases.tags(row.id, tags, now));
      expect(
        await prisma.auditLog.count({ where: { resourceId: row.id } }),
      ).toBe(count);
      await expect(
        Promise.resolve().then(() =>
          asTeacher(() =>
            useCases.links(
              row.id,
              [{ label: 'Unsafe', url: 'javascript:alert(1)' }],
              now,
            ),
          ),
        ),
      ).rejects.toMatchObject({ httpStatus: 400 });
      await expect(
        Promise.resolve().then(() =>
          asTeacher(() =>
            useCases.tags(row.id, [{ value: 'x' }, { value: 'X' }], now),
          ),
        ),
      ).rejects.toMatchObject({ httpStatus: 400 });
      for (const action of [
        () =>
          useCases.links(
            row.id,
            Array.from({ length: 101 }, () => links[0]),
            now,
          ),
        () =>
          useCases.tags(
            row.id,
            Array.from({ length: 101 }, (_, i) => ({ value: String(i) })),
            now,
          ),
      ])
        await expect(
          Promise.resolve().then(() => asTeacher(action)),
        ).rejects.toMatchObject({ httpStatus: 400 });
      expect(await asTeacher(() => useCases.links(row.id, [], now))).toEqual(
        [],
      );
      expect(await asTeacher(() => useCases.tags(row.id, [], now))).toEqual([]);
    });
    it('serves all fourteen HTTP contracts with existing Core presentation and validation', async () => {
      const url = '/api/v1/teacher/academic-content';
      const response = await request(app.getHttpServer())
        .post('/api/v1/teacher/classes/' + ids.a + '/academic-content')
        .send({
          type: Type.GENERAL_RESOURCE,
          audience: Audience.STUDENTS,
          title: 'HTTP draft',
        })
        .expect(201);
      const row = response.body as { id: string };
      expect(row.id).toBeTruthy();
      await request(app.getHttpServer())
        .patch(url + '/' + row.id)
        .send({ title: 'HTTP changed' })
        .expect(200);
      await request(app.getHttpServer())
        .put(url + '/' + row.id + '/targets')
        .send({ classIds: [ids.a, ids.c] })
        .expect(200);
      await request(app.getHttpServer())
        .put(url + '/' + row.id + '/links')
        .send({ links: [{ label: 'Link', url: 'https://example.test' }] })
        .expect(200);
      await request(app.getHttpServer())
        .put(url + '/' + row.id + '/tags')
        .send({ tags: [{ value: 'HTTP' }] })
        .expect(200);
      await request(app.getHttpServer())
        .get(url + '/' + row.id + '/readiness')
        .expect(200)
        .expect('Cache-Control', /no-store/);
      await request(app.getHttpServer())
        .post(url + '/' + row.id + '/archive')
        .expect(200);
      await request(app.getHttpServer())
        .post(url + '/' + row.id + '/restore')
        .expect(200);
      await request(app.getHttpServer())
        .delete(url + '/' + row.id)
        .expect(200, { ok: true });
      for (const [type, audience, route, command] of [
        [
          Type.TEACHER_PREPARATION,
          Audience.INTERNAL_STAFF,
          'preparation',
          preparation,
        ],
        [Type.WEEKLY_PLAN, Audience.GUARDIANS, 'weekly-plan', weekly],
        [Type.GUARDIAN_WEEKLY_NOTE, Audience.GUARDIANS, 'guardian-note', note],
        [
          Type.SUBJECT_RESOURCE,
          Audience.STUDENTS,
          'subject-resource',
          resource,
        ],
        [Type.ONLINE_SESSION, Audience.STUDENTS, 'online-session', session],
      ] as const) {
        const content = await create(type, audience);
        await request(app.getHttpServer())
          .put(url + '/' + content.id + '/details/' + route)
          .send(command)
          .expect(200);
      }
      await request(app.getHttpServer())
        .post('/api/v1/teacher/classes/' + ids.a + '/academic-content')
        .send({
          type: Type.GENERAL_RESOURCE,
          audience: Audience.STUDENTS,
          title: 'Denied',
          schoolId: ids.school,
        })
        .expect(400);
      await request(app.getHttpServer())
        .put(url + '/' + row.id + '/targets')
        .send({ targets: [{ classroomId: randomUUID() }] })
        .expect(400);
      for (const path of [
        '/api/v1/teacher/classes/' + ids.a + '/academic-content',
        url + '/' + row.id + '/archive',
      ]) {
        await request(app.getHttpServer())
          .post(path)
          .set('x-missing', 'yes')
          .send({})
          .expect(403);
        await request(app.getHttpServer())
          .post(path)
          .set('x-actor', UserType.SCHOOL_USER)
          .send({
            type: Type.GENERAL_RESOURCE,
            audience: Audience.STUDENTS,
            title: 'Denied',
          })
          .expect(403);
      }
    });

    it('returns Core readiness for current read intersections, including School-created and partial reassignment', async () => {
      const schoolCreated = await createContent('school-readiness', {
        creator: ids.manager,
      });
      const partial = await createContent('partial-readiness', {
        allocations: [ids.a, ids.c],
      });
      const single = await createContent('single-readiness');
      for (const row of [schoolCreated, partial, single]) {
        const current = await contents.findManagementDetail(row.id, ids.school);
        expect(current).not.toBeNull();
        expect(await asTeacher(() => useCases.readiness(row.id, now))).toEqual(
          await coreReadiness.evaluateAuthorizedContent(current!, now),
        );
      }
      await prisma.teacherSubjectAllocation.update({
        where: { id: ids.a },
        data: { teacherUserId: ids.other },
      });
      try {
        await expect(
          asTeacher(() => useCases.readiness(single.id, now)),
        ).rejects.toMatchObject({ httpStatus: 404 });
        expect(
          await asTeacher(() => useCases.readiness(partial.id, now)),
        ).toHaveProperty('canAdvance');
      } finally {
        await prisma.teacherSubjectAllocation.update({
          where: { id: ids.a },
          data: { teacherUserId: ids.teacher },
        });
      }
      const other = await createContent('other-readiness', {
        allocations: [ids.b],
      });
      const foreign = await createContent('foreign-readiness', {
        foreign: true,
        allocations: [ids.foreigna],
      });
      for (const row of [other, foreign])
        await expect(
          asTeacher(() => useCases.readiness(row.id, now)),
        ).rejects.toMatchObject({ httpStatus: 404 });
    });
  },
);
