import { AcademicContentWorkflowPublicationCapabilities } from '../../src/modules/academics/academic-content/application/academic-content-workflow-publication-capabilities';
import { AcademicContentPublicationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import { AcademicContentValidationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-validation.repository';
import { GetAcademicContentReadinessUseCase } from '../../src/modules/academics/academic-content/application/academic-content-readiness.use-case';
import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentStatus as Status,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as Type,
  AcademicGuardianNotePriority as Priority,
  AcademicOnlineSessionPlatform as Platform,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';
import { AcademicContentWorkflowPolicyRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-workflow-policy.repository';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import { AcademicContentFilePolicyResolver } from '../../src/modules/academics/academic-content/files/application/academic-content-file-policy.resolver';
import { TeacherAppAccessService } from '../../src/modules/teacher-app/access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../../src/modules/teacher-app/access/teacher-app-allocation-read.adapter';
import { TeacherAcademicContentReadAdapter } from '../../src/modules/teacher-app/academic-content/infrastructure/teacher-academic-content-read.adapter';
import {
  GetTeacherAcademicContentUseCase,
  GetTeacherAcademicContentCapabilitiesUseCase,
  ListTeacherAcademicContentUseCase,
} from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-read.use-cases';
import type { AcademicContentListResponseDto } from '../../src/modules/academics/academic-content/dto/academic-content-response.dto';

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeDatabase(
  'ACC-9A PostgreSQL Teacher Academic Content ownership intersection',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService();
    const read = new TeacherAcademicContentReadAdapter(
      new AcademicContentRepository(prisma),
      new AcademicContentWorkflowPolicyRepository(prisma),
      new AcademicContentFilePolicyResolver(
        new AcademicContentFileRepository(prisma),
      ),
    );
    const access = new TeacherAppAccessService(
      new TeacherAppAllocationReadAdapter(prisma),
    );
    const list = new ListTeacherAcademicContentUseCase(access, read);
    const detail = new GetTeacherAcademicContentUseCase(
      access,
      read,
      new AcademicContentWorkflowPublicationCapabilities(
        new GetAcademicContentReadinessUseCase(
          new AcademicContentRepository(prisma),
          new AcademicContentValidationRepository(prisma),
        ),
        new AcademicContentPublicationRepository(
          prisma,
          new AcademicContentRevisionRepository(prisma),
        ),
      ),
    );
    const capabilities = new GetTeacherAcademicContentCapabilitiesUseCase(
      access,
      read,
    );
    const suffix = randomUUID();
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
          title: 'acc9a-' + name,
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
              firstName: 'ACC9A',
              lastName: key,
              userType,
            },
          })
        ).id;
      for (const prefix of ['', 'foreign']) {
        ids[prefix + 'org'] = (
          await prisma.organization.create({
            data: {
              name: 'ACC9A ' + prefix + suffix,
              slug: 'acc9a-org-' + prefix + suffix,
            },
          })
        ).id;
        ids[prefix + 'school'] = (
          await prisma.school.create({
            data: {
              organizationId: ids[prefix + 'org'],
              name: 'ACC9A ' + prefix + suffix,
              slug: 'acc9a-school-' + prefix + suffix,
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
      await createContent('owned');
      await createContent('school-created', { creator: ids.manager });
      await createContent('mixed', { allocations: [ids.a, ids.b] });
      await createContent('other', { allocations: [ids.b] });
      await createContent('untargeted', { allocations: [] });
      await createContent('deleted', { deleted: true });
      await createContent('foreign', {
        foreign: true,
        allocations: [ids.foreigna],
      });
      await createContent('other-class', { allocations: [ids.c] });
      const weekly = await createContent('weekly', {
        type: Type.WEEKLY_PLAN,
        status: Status.ARCHIVED,
        audience: Audience.GUARDIANS,
      });
      await prisma.academicContentWeeklyPlanDetail.create({
        data: {
          schoolId: ids.school,
          academicContentId: weekly.id,
          weekStartDate: new Date('2030-06-03'),
          weekEndDate: new Date('2030-06-09'),
        },
      });
      const session = await createContent('session', {
        type: Type.ONLINE_SESSION,
      });
      await prisma.academicContentOnlineSessionDetail.create({
        data: {
          schoolId: ids.school,
          academicContentId: session.id,
          platform: Platform.ZOOM,
          joinUrl: 'https://example.test/meeting',
          startAt: new Date('2030-06-05T10:00:00Z'),
          endAt: new Date('2030-06-05T11:00:00Z'),
          timezone: 'Africa/Cairo',
        },
      });
      const guardian = await createContent('guardian', {
        type: Type.GUARDIAN_WEEKLY_NOTE,
        audience: Audience.GUARDIANS,
      });
      await prisma.academicContentGuardianNoteDetail.create({
        data: {
          schoolId: ids.school,
          academicContentId: guardian.id,
          body: 'Reminder',
          priority: Priority.IMPORTANT,
          requiresAcknowledgement: false,
        },
      });
      await prisma.academicContentTag.create({
        data: {
          schoolId: ids.school,
          academicContentId: rows.owned,
          displayValue: 'Weekly Resource',
          normalizedValue: 'weekly resource',
          sortOrder: 0,
          createdByUserId: ids.teacher,
        },
      });
    });

    afterAll(async () => {
      if (ids.school && ids.foreignschool) {
        const schoolId = { in: [ids.school, ids.foreignschool] };
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

    it('reauthorizes actor and view permission in every application use case', async () => {
      for (const execute of [
        () => list.execute({}),
        () => detail.execute(rows.owned, now),
        () => capabilities.execute(),
      ]) {
        await expect(asTeacher(execute, ids.teacher, [])).rejects.toMatchObject(
          { httpStatus: 403 },
        );
        await expect(
          asTeacher(execute, ids.manager, grants, UserType.SCHOOL_USER),
        ).rejects.toMatchObject({ httpStatus: 403 });
      }
    });

    it('reads own, School-created and mixed targets, hiding other Teachers, School and absent/deleted targets', async () => {
      const result = await asTeacher(() => list.execute({ search: 'acc9a-' }));
      const visible = result.items.map((row) => row.id);
      for (const key of ['owned', 'school-created', 'mixed']) {
        expect(visible).toContain(rows[key]);
        const row = await asTeacher(() => detail.execute(rows[key], now));
        expect(row.id).toBe(rows[key]);
        expect(row.capabilities.canEdit).toBe(key === 'owned');
        expect(row).not.toHaveProperty('createdByUserId');
        expect(row.targets[0]).not.toHaveProperty('teacherSubjectAllocation');
        expect(JSON.stringify(row)).not.toMatch(/bucket|objectKey/);
      }
      for (const key of ['other', 'foreign', 'untargeted', 'deleted']) {
        expect(visible).not.toContain(rows[key]);
        await expect(
          asTeacher(() => detail.execute(rows[key], now)),
        ).rejects.toMatchObject({ httpStatus: 404 });
      }
    });

    it('proves classId current ownership, derives core scope and strips direct-call actor filters', async () => {
      const result = await asTeacher(() => list.execute({ classId: ids.a }));
      expect(result.items.map((row) => row.id)).toContain(rows.owned);
      expect(result.items.map((row) => row.id)).not.toContain(
        rows['other-class'],
      );
      for (const classId of [ids.b, ids.foreigna])
        await expect(
          asTeacher(() => list.execute({ classId })),
        ).rejects.toMatchObject({ httpStatus: 404 });
      const query = {
        teacherUserId: ids.other,
        schoolId: ids.foreignschool,
        termId: ids.foreignterm,
        search: 'acc9a-owned',
      };
      expect(
        (await asTeacher(() => list.execute(query))).items.map((row) => row.id),
      ).toEqual([rows.owned]);
    });

    it.each([
      [{ type: Type.WEEKLY_PLAN }, 'weekly'],
      [{ status: Status.ARCHIVED }, 'weekly'],
      [
        { audience: Audience.GUARDIANS, type: Type.GUARDIAN_WEEKLY_NOTE },
        'guardian',
      ],
      [{ search: 'ACC9A-OWNED' }, 'owned'],
      [{ tag: '  WEEKLY   Resource ' }, 'owned'],
      [{ weeklyDateFrom: '2030-06-08', weeklyDateTo: '2030-06-15' }, 'weekly'],
      [
        {
          sessionStartAtFrom: '2030-06-05T09:00:00Z',
          sessionStartAtTo: '2030-06-05T10:30:00Z',
          sessionPlatform: Platform.ZOOM,
        },
        'session',
      ],
      [{ guardianPriority: Priority.IMPORTANT }, 'guardian'],
    ] as const)('reuses core filtering %j', async (query, key) => {
      expect(
        (await asTeacher(() => list.execute(query))).items.map((row) => row.id),
      ).toEqual([rows[key]]);
    });

    it.each([
      { weeklyDateFrom: '2030-06-10' },
      { sessionStartAtTo: '2030-06-05T09:59:59Z' },
      { sessionPlatform: Platform.MICROSOFT_TEAMS },
    ])('returns no out-of-range/type matches %j', async (query) => {
      expect((await asTeacher(() => list.execute(query))).total).toBe(0);
    });

    it.each([
      { page: 0 },
      { limit: 0 },
      { limit: 101 },
      { weeklyDateFrom: '2030-07-01', weeklyDateTo: '2030-06-01' },
      {
        sessionStartAtFrom: '2030-06-02T00:00:00Z',
        sessionStartAtTo: '2030-06-01T00:00:00Z',
      },
    ])('rejects invalid pagination or ranges %j', async (query) => {
      await expect(asTeacher(() => list.execute(query))).rejects.toMatchObject({
        httpStatus: 400,
      });
    });

    it('pages in stable core order without duplicate mixed-target content', async () => {
      const all = await asTeacher(() =>
        list.execute({ search: 'acc9a-', limit: 100 }),
      );
      const pages: AcademicContentListResponseDto[] = [];
      for (let page = 1; page <= all.total + 1; page++)
        pages.push(
          await asTeacher(() =>
            list.execute({ search: 'acc9a-', page, limit: 1 }),
          ),
        );
      expect(pages.flatMap((page) => page.items.map((row) => row.id))).toEqual(
        all.items.map((row) => row.id),
      );
      expect(new Set(all.items.map((row) => row.id)).size).toBe(all.total);
      expect(pages.every((page) => page.total === all.total)).toBe(true);
    });

    it('rechecks reassignment immediately and preserves historical revision truth', async () => {
      const revision = await prisma.academicContentRevision.create({
        data: {
          schoolId: ids.school,
          academicContentId: rows.owned,
          revisionNumber: 1,
          snapshotContractVersion: 1,
          academicYearId: ids.year,
          termId: ids.term,
          type: Type.GENERAL_RESOURCE,
          audience: Audience.STUDENTS,
          title: 'historic',
          sourceStatus: Status.DRAFT,
          capturedByUserId: ids.teacher,
        },
      });
      await prisma.teacherSubjectAllocation.update({
        where: { id: ids.a },
        data: { teacherUserId: ids.other },
      });
      try {
        await expect(
          asTeacher(() => detail.execute(rows.owned, now)),
        ).rejects.toMatchObject({ httpStatus: 404 });
        await expect(
          asTeacher(() => list.execute({ classId: ids.a })),
        ).rejects.toMatchObject({ httpStatus: 404 });
        expect(
          (await asTeacher(() => list.execute({ search: 'acc9a-owned' })))
            .total,
        ).toBe(0);
        const newOwner = await asTeacher(
          () => detail.execute(rows.owned, now),
          ids.other,
        );
        expect(newOwner.capabilities.canEdit).toBe(false);
        expect(
          await prisma.academicContentRevision.findUnique({
            where: { id: revision.id },
          }),
        ).toEqual(revision);
      } finally {
        await prisma.teacherSubjectAllocation.update({
          where: { id: ids.a },
          data: { teacherUserId: ids.teacher },
        });
        await prisma.academicContentRevision.delete({
          where: { id: revision.id },
        });
      }
    });

    it('retains read through another currently owned target after partial reassignment', async () => {
      const row = await createContent('partial', {
        allocations: [ids.a, ids.c],
      });
      await prisma.teacherSubjectAllocation.update({
        where: { id: ids.a },
        data: { teacherUserId: ids.other },
      });
      try {
        const result = await asTeacher(() => detail.execute(row.id, now));
        expect(result.capabilities.canEdit).toBe(false);
        expect(
          (
            await asTeacher(() => list.execute({ search: row.title }))
          ).items.map((item) => item.id),
        ).toEqual([row.id]);
      } finally {
        await prisma.teacherSubjectAllocation.update({
          where: { id: ids.a },
          data: { teacherUserId: ids.teacher },
        });
      }
    });
  },
);
