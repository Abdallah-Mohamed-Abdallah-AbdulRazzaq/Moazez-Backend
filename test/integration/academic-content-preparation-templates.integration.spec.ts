import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType,
  AcademicContentType,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentPreparationTemplateRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-preparation-template.repository';
import { normalizePreparationTemplate } from '../../src/modules/academics/academic-content/domain/academic-content-preparation-template.policy';
import { normalizePreparation } from '../../src/modules/academics/academic-content/domain/academic-content-type-detail.policy';
import { AcademicContentTypeDetailRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-type-detail.repository';

const url = process.env.DATABASE_URL;
const describeDatabase = url ? describe : describe.skip;

describeDatabase('ACC-6D Preparation template PostgreSQL contract', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService({
    datasources: {
      db: { url: url ?? 'postgresql://unused:unused@127.0.0.1:1/unused' },
    },
  });
  const repository = new AcademicContentPreparationTemplateRepository(prisma);
  const id: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 8);
  const scope = (schoolId: string) => ({
    schoolId,
    organizationId: id.organization,
    actorId: id.user,
  });
  const preset = (name: string) =>
    normalizePreparationTemplate({
      name,
      topic: '  Fractions  ',
      objectives: [' Solve   examples '],
    });

  beforeAll(async () => {
    await prisma.$connect();
    id.organization = (
      await prisma.organization.create({
        data: { name: `ACC6D ${suffix}`, slug: `acc6d-${suffix}` },
      })
    ).id;
    id.user = (
      await prisma.user.create({
        data: {
          email: `acc6d-${suffix}@example.test`,
          firstName: 'Template',
          lastName: 'Manager',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    for (const key of ['A', 'B']) {
      const schoolId = (
        await prisma.school.create({
          data: {
            organizationId: id.organization,
            name: `ACC6D ${key} ${suffix}`,
            slug: `acc6d-${key.toLowerCase()}-${suffix}`,
          },
        })
      ).id;
      id[`school${key}`] = schoolId;
      id[`stage${key}`] = (
        await prisma.stage.create({
          data: {
            schoolId,
            nameAr: `مرحلة ${key} ${suffix}`,
            nameEn: `Stage ${key} ${suffix}`,
          },
        })
      ).id;
      id[`subject${key}`] = (
        await prisma.subject.create({
          data: {
            schoolId,
            nameAr: `مادة ${key} ${suffix}`,
            nameEn: `Subject ${key} ${suffix}`,
          },
        })
      ).id;
    }
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { schoolId: { in: [id.schoolA, id.schoolB] } },
    });
    await prisma.academicContentPreparationTemplate.deleteMany({
      where: { schoolId: { in: [id.schoolA, id.schoolB] } },
    });
    await prisma.subject.deleteMany({
      where: { schoolId: { in: [id.schoolA, id.schoolB] } },
    });
    await prisma.stage.deleteMany({
      where: { schoolId: { in: [id.schoolA, id.schoolB] } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [id.schoolA, id.schoolB] } },
    });
    await prisma.user.delete({ where: { id: id.user } });
    await prisma.organization.delete({ where: { id: id.organization } });
    await prisma.$disconnect();
  });

  it('creates all four scope shapes without allocations, filters exactly, and hides foreign rows', async () => {
    const s = scope(id.schoolA);
    const school = await repository.create(s, preset(`School ${suffix}`));
    const stage = await repository.create(s, {
      ...preset(`Stage ${suffix}`),
      stageId: id.stageA,
    });
    const subject = await repository.create(s, {
      ...preset(`Subject ${suffix}`),
      subjectId: id.subjectA,
    });
    const both = await repository.create(s, {
      ...preset(`Both ${suffix}`),
      stageId: id.stageA,
      subjectId: id.subjectA,
    });
    expect(school).toMatchObject({ stageId: null, subjectId: null });
    expect(stage).toMatchObject({ stageId: id.stageA, subjectId: null });
    expect(subject).toMatchObject({ stageId: null, subjectId: id.subjectA });
    expect(both).toMatchObject({ stageId: id.stageA, subjectId: id.subjectA });
    const list = (filters = {}) =>
      repository.list(id.schoolA, { page: 1, limit: 50, ...filters });
    expect(
      (await list({ stageId: id.stageA })).items.map((i) => i.id).sort(),
    ).toEqual([stage.id, both.id].sort());
    expect(
      (await list({ subjectId: id.subjectA })).items.map((i) => i.id).sort(),
    ).toEqual([subject.id, both.id].sort());
    expect(
      (await list({ stageId: id.stageA, subjectId: id.subjectA })).items.map(
        (i) => i.id,
      ),
    ).toEqual([both.id]);
    expect((await list({ stageId: id.stageB })).total).toBe(0);
    expect((await list({ subjectId: id.subjectB })).total).toBe(0);
    expect((await list({ search: 'FRACTIONS' })).total).toBe(0);
    expect((await list({ search: '%' })).total).toBe(0);
    expect((await list({ search: `stage ${suffix}` })).total).toBe(1);
    expect((await list()).items[0]).not.toHaveProperty('objectives');
    expect((await list()).items[0]).not.toHaveProperty('normalizedName');
    expect((await list()).items.map((i) => i.name)).toEqual([
      `Both ${suffix}`,
      `School ${suffix}`,
      `Stage ${suffix}`,
      `Subject ${suffix}`,
    ]);
    await expect(
      repository.detail(id.schoolB, school.id),
    ).rejects.toMatchObject({
      code: 'academic_content.preparation_template.not_found',
      httpStatus: 404,
    });
    expect(await repository.detail(id.schoolA, school.id)).not.toHaveProperty(
      'schoolId',
    );
  });

  it('enforces same-School scope in the application and through compound foreign keys', async () => {
    const s = scope(id.schoolA);
    for (const fields of [{ stageId: id.stageB }, { subjectId: id.subjectB }]) {
      await expect(
        repository.create(s, {
          ...preset(`Foreign ${randomUUID()}`),
          ...fields,
        }),
      ).rejects.toMatchObject({
        code: 'academic_content.preparation_template.scope_not_found',
        httpStatus: 404,
      });
      await expect(
        prisma.academicContentPreparationTemplate.create({
          data: {
            ...preset(`Direct ${randomUUID()}`),
            ...fields,
            schoolId: id.schoolA,
            createdByUserId: id.user,
          },
        }),
      ).rejects.toThrow();
    }
    await prisma.stage.update({
      where: { id: id.stageA },
      data: { deletedAt: new Date() },
    });
    await expect(
      repository.create(s, { ...preset('Deleted stage'), stageId: id.stageA }),
    ).rejects.toMatchObject({
      code: 'academic_content.preparation_template.scope_not_found',
    });
    await prisma.stage.update({
      where: { id: id.stageA },
      data: { deletedAt: null },
    });
    await prisma.subject.update({
      where: { id: id.subjectA },
      data: { deletedAt: new Date() },
    });
    await expect(
      repository.create(s, {
        ...preset('Deleted subject'),
        subjectId: id.subjectA,
      }),
    ).rejects.toMatchObject({
      code: 'academic_content.preparation_template.scope_not_found',
    });
    await prisma.subject.update({
      where: { id: id.subjectA },
      data: { deletedAt: null },
    });
  });

  it('enforces active names, supports no-op, and frees names on soft delete', async () => {
    const s = scope(id.schoolA);
    const created = await repository.create(
      s,
      preset(`  Ｗｅｅｋｌｙ   ${suffix} `),
    );
    const rowBefore =
      await prisma.academicContentPreparationTemplate.findUniqueOrThrow({
        where: { id: created.id },
      });
    const auditBefore = await prisma.auditLog.count({
      where: { resourceId: created.id },
    });
    expect(
      await repository.update(s, created.id, { name: ` Weekly ${suffix} ` }),
    ).toMatchObject({ id: created.id });
    const rowAfter =
      await prisma.academicContentPreparationTemplate.findUniqueOrThrow({
        where: { id: created.id },
      });
    expect(rowAfter.updatedAt).toEqual(rowBefore.updatedAt);
    expect(
      await prisma.auditLog.count({ where: { resourceId: created.id } }),
    ).toBe(auditBefore);
    await expect(
      repository.create(s, preset(`weekly ${suffix}`)),
    ).rejects.toMatchObject({
      code: 'academic_content.preparation_template.duplicate_name',
      httpStatus: 409,
    });
    await expect(
      prisma.academicContentPreparationTemplate.create({
        data: {
          ...preset(`Duplicate ${suffix}`),
          normalizedName: created.name.toLowerCase(),
          schoolId: id.schoolA,
          createdByUserId: id.user,
        },
      }),
    ).rejects.toThrow();
    await repository.create(scope(id.schoolB), preset(`weekly ${suffix}`));
    expect(await repository.delete(s, created.id)).toEqual({ ok: true });
    await expect(
      repository.detail(id.schoolA, created.id),
    ).rejects.toMatchObject({
      code: 'academic_content.preparation_template.not_found',
    });
    await expect(
      repository.update(s, created.id, { topic: 'Changed' }),
    ).rejects.toMatchObject({
      code: 'academic_content.preparation_template.not_found',
    });
    await expect(repository.delete(s, created.id)).rejects.toMatchObject({
      code: 'academic_content.preparation_template.not_found',
    });
    await repository.create(s, preset(`weekly ${suffix}`));
  });

  it('rejects JSON objects through each named check', async () => {
    const names = [
      ['objectives', 'acc_preparation_template_objectives_array_check'],
      ['learningOutcomes', 'acc_preparation_template_outcomes_array_check'],
      ['teachingStrategies', 'acc_preparation_template_strategies_array_check'],
      ['activities', 'acc_preparation_template_activities_array_check'],
    ] as const;
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint WHERE conname LIKE 'acc_preparation_template_%_array_check'`;
    expect(constraints.map((c) => c.conname).sort()).toEqual(
      names.map((n) => n[1]).sort(),
    );
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE indexname = 'acc_preparation_templates_active_name_key'`;
    expect(indexes).toHaveLength(1);
    for (const [field] of names)
      await expect(
        prisma.academicContentPreparationTemplate.create({
          data: {
            ...preset(`Bad JSON ${randomUUID()}`),
            [field]: {},
            schoolId: id.schoolA,
            createdByUserId: id.user,
          },
        }),
      ).rejects.toThrow();
  });

  it('serializes concurrent duplicate creates and leaves one successful audit', async () => {
    const name = `Concurrent ${randomUUID()}`;
    const results = await Promise.allSettled([
      repository.create(scope(id.schoolA), preset(name)),
      repository.create(scope(id.schoolA), preset(name.toUpperCase())),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const rows = await prisma.academicContentPreparationTemplate.findMany({
      where: {
        schoolId: id.schoolA,
        normalizedName: name.toLowerCase(),
        deletedAt: null,
      },
    });
    expect(rows).toHaveLength(1);
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: rows[0].id,
          action: 'academics.academic_content.preparation_template.create',
        },
      }),
    ).toBe(1);
  });

  it('serializes delete against update without reviving a deleted template', async () => {
    const s = scope(id.schoolA);
    const row = await repository.create(
      s,
      preset(`Delete race ${randomUUID()}`),
    );
    const results = await Promise.allSettled([
      repository.update(s, row.id, { topic: 'Race update' }),
      repository.delete(s, row.id),
    ]);
    expect(
      results.some(
        (r) => r.status === 'fulfilled' && 'value' in r && 'ok' in r.value,
      ),
    ).toBe(true);
    for (const result of results)
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({
          code: 'academic_content.preparation_template.not_found',
        });
    expect(
      (
        await prisma.academicContentPreparationTemplate.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).deletedAt,
    ).not.toBeNull();
    await expect(repository.detail(id.schoolA, row.id)).rejects.toMatchObject({
      code: 'academic_content.preparation_template.not_found',
    });
    const auditCount = await prisma.auditLog.count({
      where: { resourceId: row.id },
    });
    expect(auditCount).toBe(
      1 + results.filter((r) => r.status === 'fulfilled').length,
    );
  });

  it('supports partial replacement and rejects colliding rename', async () => {
    const s = scope(id.schoolA);
    const first = await repository.create(s, preset(`Patch A ${suffix}`));
    const second = await repository.create(s, preset(`Patch B ${suffix}`));
    const changed = await repository.update(s, first.id, {
      description: '  Searchable description  ',
      stageId: id.stageA,
      subjectId: id.subjectA,
      objectives: [],
      teacherNotes: '  Note  ',
    });
    expect(changed).toMatchObject({
      description: 'Searchable description',
      stageId: id.stageA,
      subjectId: id.subjectA,
      objectives: [],
      teacherNotes: 'Note',
      topic: 'Fractions',
    });
    expect(
      (
        await repository.list(id.schoolA, {
          page: 1,
          limit: 50,
          search: 'SEARCHABLE',
        })
      ).items.map((i) => i.id),
    ).toContain(first.id);
    expect(
      await repository.update(s, first.id, {
        description: null,
        stageId: null,
        subjectId: null,
        teacherNotes: null,
      }),
    ).toMatchObject({
      description: null,
      stageId: null,
      subjectId: null,
      teacherNotes: null,
    });
    await expect(
      repository.update(s, first.id, { name: second.name.toUpperCase() }),
    ).rejects.toMatchObject({
      code: 'academic_content.preparation_template.duplicate_name',
      httpStatus: 409,
    });
  });

  it('rolls back create, update, and delete if their audit write fails', async () => {
    const s = scope(id.schoolA);
    const row = await repository.create(s, preset(`Rollback ${suffix}`));
    const old =
      await prisma.academicContentPreparationTemplate.findUniqueOrThrow({
        where: { id: row.id },
      });
    const original = prisma.$transaction.bind(
      prisma,
    ) as typeof prisma.$transaction;
    const client = prisma as unknown as {
      $transaction: typeof prisma.$transaction;
    };
    const saved = client.$transaction;
    // Fault injection stays in the test; business writes still execute in a real DB transaction.
    client.$transaction = ((
      work: (tx: unknown) => Promise<unknown>,
      options: unknown,
    ) =>
      original(
        async (tx) =>
          work(
            new Proxy(tx, {
              get(target, key) {
                if (key === 'auditLog')
                  return {
                    create: () =>
                      Promise.reject(new Error('audit unavailable')),
                  };
                return Reflect.get(target, key) as unknown;
              },
            }),
          ),
        options as never,
      )) as typeof prisma.$transaction;
    try {
      await expect(
        repository.create(s, preset(`Rollback create ${suffix}`)),
      ).rejects.toThrow('audit unavailable');
      await expect(
        repository.update(s, row.id, { topic: 'changed' }),
      ).rejects.toThrow('audit unavailable');
      await expect(repository.delete(s, row.id)).rejects.toThrow(
        'audit unavailable',
      );
    } finally {
      client.$transaction = saved;
    }
    expect(
      await prisma.academicContentPreparationTemplate.count({
        where: {
          schoolId: id.schoolA,
          normalizedName: `rollback create ${suffix}`,
          deletedAt: null,
        },
      }),
    ).toBe(0);
    const current =
      await prisma.academicContentPreparationTemplate.findUniqueOrThrow({
        where: { id: row.id },
      });
    expect(current.topic).toBe(old.topic);
    expect(current.updatedAt).toEqual(old.updatedAt);
    expect(current.updatedByUserId).toBe(old.updatedByUserId);
    expect(current.deletedAt).toBeNull();
  });

  it('keeps a persisted Teacher Preparation independent after template update and deletion', async () => {
    const s = scope(id.schoolA);
    const template = await repository.create(
      s,
      preset(`Independent ${suffix}`),
    );
    const detail = await repository.detail(id.schoolA, template.id);
    const year = await prisma.academicYear.create({
      data: {
        schoolId: id.schoolA,
        nameAr: `سنة ${suffix}`,
        nameEn: `Year ${suffix}`,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2030-12-31'),
        isActive: true,
      },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: id.schoolA,
        academicYearId: year.id,
        nameAr: `فصل ${suffix}`,
        nameEn: `Term ${suffix}`,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2030-12-31'),
        isActive: true,
      },
    });
    const content = await prisma.academicContent.create({
      data: {
        schoolId: id.schoolA,
        academicYearId: year.id,
        termId: term.id,
        type: AcademicContentType.TEACHER_PREPARATION,
        audience: AcademicContentAudienceType.INTERNAL_STAFF,
        title: 'Independent Preparation',
        createdByUserId: id.user,
      },
    });
    try {
      const writer = new AcademicContentTypeDetailRepository(prisma);
      const result = await writer.mutate({
        contentId: content.id,
        schoolId: id.schoolA,
        organizationId: id.organization,
        actorId: id.user,
        now: new Date(),
        detail: normalizePreparation({
          topic: detail.topic,
          objectives: detail.objectives,
          learningOutcomes: detail.learningOutcomes,
          teachingStrategies: detail.teachingStrategies,
          activities: detail.activities,
          resourceNotes: detail.resourceNotes,
          assessmentNotes: detail.assessmentNotes,
          teacherNotes: detail.teacherNotes,
        }),
      });
      expect(result.changed).toBe(true);
      const read = () =>
        prisma.academicContentPreparationDetail.findFirstOrThrow({
          where: { schoolId: id.schoolA, academicContentId: content.id },
        });
      const before = await read();
      await repository.update(s, template.id, {
        topic: 'Template changed',
        objectives: ['Changed'],
      });
      expect(await read()).toEqual(before);
      await repository.delete(s, template.id);
      expect(await read()).toEqual(before);
    } finally {
      await prisma.auditLog.deleteMany({ where: { resourceId: content.id } });
      await prisma.academicContent.delete({ where: { id: content.id } });
      await prisma.term.delete({ where: { id: term.id } });
      await prisma.academicYear.delete({ where: { id: year.id } });
    }
  });
});
