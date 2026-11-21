import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import type { FrozenResultDefinitionInput } from '../../src/modules/official-results/application/result-foundation.types';
import { ResultFoundationRepository } from '../../src/modules/official-results/infrastructure/repositories/result-foundation.repository';
import { ResultRosterRepository } from '../../src/modules/official-results/infrastructure/repositories/result-roster.repository';
import {
  assertResultsTestDatabase,
  createResultsSchool,
} from '../fixtures/official-results.fixture';

type SchoolFixture = Awaited<ReturnType<typeof createResultsSchool>>;
const rosterDate = new Date('2026-11-21T10:00:00.000Z');

function definition(label: string): FrozenResultDefinitionInput {
  return {
    label: { ar: 'كشف النتائج', en: label },
    configuration: {},
    releaseUnits: [],
    fields: [
      ['Homework', 'TEXT'],
      ['Behavior', 'BOOLEAN'],
      ['Tests', 'SCORE'],
    ].map(([name, kind], sortOrder) => ({
      fieldId: randomUUID(),
      code: name.toLowerCase(),
      kind: kind as 'TEXT' | 'BOOLEAN' | 'SCORE',
      labelAr: name,
      labelEn: name,
      newSemanticPurpose: name,
      sortOrder,
      audiences: [],
      constraints: {},
    })),
  };
}

describe('Official Results persistence on PostgreSQL', () => {
  const prisma = new PrismaService();
  const repository = new ResultFoundationRepository(
    prisma,
    new ResultRosterRepository(),
  );
  let first: SchoolFixture;
  let second: SchoolFixture;

  beforeAll(async () => {
    assertResultsTestDatabase();
    [first, second] = await Promise.all([
      createResultsSchool(prisma),
      createResultsSchool(prisma),
    ]);
  }, 30_000);

  afterAll(() => prisma.$disconnect());

  function createPeriod(school: SchoolFixture, code: string) {
    return school.run(() =>
      repository.createReportingPeriod({
        kind: 'TERM',
        code,
        academicYearId: school.year.id,
        termId: school.term.id,
        startsOn: '2026-09-01',
        endsOn: '2026-12-31',
        name: { ar: 'الفترة الأولى', en: 'First reporting period' },
      }),
    );
  }

  function createGroup(school: SchoolFixture, code: string) {
    return school.run(() =>
      repository.createGroup({
        kind: 'CUSTOM',
        code,
        label: { ar: 'مجموعة النتائج', en: 'Results Group' },
      }),
    );
  }

  async function enroll(
    school: SchoolFixture,
    studentId: string,
    options: { termId?: string; classroomId?: string; endedAt?: Date } = {},
  ) {
    return prisma.enrollment.create({
      data: {
        schoolId: school.school.id,
        academicYearId: school.year.id,
        classroomId: options.classroomId ?? school.classroom.id,
        studentId,
        termId: options.termId,
        enrolledAt: new Date('2026-09-01T09:00:00Z'),
        endedAt: options.endedAt,
        status: options.endedAt ? 'COMPLETED' : 'ACTIVE',
      },
      select: { id: true },
    });
  }

  async function workspace(school: SchoolFixture, code: string) {
    const period = await createPeriod(school, code);
    const group = await createGroup(school, code);
    const input = {
      reportingPeriodId: period.id,
      classroomId: school.classroom.id,
      groupId: group.id,
      rosterAsOf: rosterDate,
      definition: definition(code),
      acceptsDefinition: false,
    };
    return { period, group, input };
  }

  it('persists independent typed drafts named Homework, Behavior and Tests', async () => {
    const student = await first.addStudent('Typed grades');
    await enroll(first, student.id);
    const { input } = await workspace(first, 'T001-typed');
    const { sheet } = await first.run(() => repository.materialize(input));
    const slot = await prisma.resultSlot.findFirstOrThrow({
      where: {
        schoolId: first.school.id,
        sheetId: sheet.id,
        studentId: student.id,
      },
      select: { id: true },
    });
    const fields = await prisma.resultFieldDefinition.findMany({
      where: {
        schoolId: first.school.id,
        definitionVersionId: sheet.draftDefinitionVersionId!,
      },
      orderBy: { sortOrder: 'asc' },
      select: { fieldId: true, kind: true },
    });

    await prisma.resultCell.createMany({
      data: fields.map(({ fieldId, kind }) => ({
        schoolId: first.school.id,
        slotId: slot.id,
        definitionVersionId: sheet.draftDefinitionVersionId!,
        fieldId,
        fieldKind: kind,
        status: 'RECORDED',
        textValue: kind === 'TEXT' ? '0' : undefined,
        booleanValue: kind === 'BOOLEAN' ? false : undefined,
        numericValue: kind === 'SCORE' ? '0.00' : undefined,
        updatedById: first.actor.id,
      })),
    });
    const cells = await prisma.resultCell.findMany({
      where: { schoolId: first.school.id, slotId: slot.id },
      select: {
        fieldKind: true,
        status: true,
        numericValue: true,
        booleanValue: true,
        textValue: true,
      },
    });
    expect(cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKind: 'SCORE',
          status: 'RECORDED',
          numericValue: expect.anything(),
        }),
        expect.objectContaining({
          fieldKind: 'BOOLEAN',
          status: 'RECORDED',
          booleanValue: false,
        }),
        expect.objectContaining({
          fieldKind: 'TEXT',
          status: 'RECORDED',
          textValue: '0',
        }),
      ]),
    );
    expect(
      cells
        .find(({ fieldKind }) => fieldKind === 'SCORE')
        ?.numericValue?.toString(),
    ).toBe('0');

    const schoolId = first.school.id;
    expect(
      await Promise.all([
        prisma.gradeItem.count({ where: { schoolId, studentId: student.id } }),
        prisma.homeworkAssignment.count({ where: { schoolId } }),
        prisma.behaviorRecord.count({
          where: { schoolId, studentId: student.id },
        }),
        prisma.reinforcementAssignment.count({
          where: { schoolId, studentId: student.id },
        }),
      ]),
    ).toEqual([0, 0, 0, 0]);

    await expect(
      prisma.resultCell.updateMany({
        where: { schoolId, slotId: slot.id, fieldKind: 'SCORE' },
        data: { status: 'MISSING' },
      }),
    ).rejects.toThrow(/result_cell_typed_value_check/u);
    await expect(
      prisma.resultFieldDefinition.updateMany({
        where: {
          schoolId,
          definitionVersionId: sheet.draftDefinitionVersionId!,
        },
        data: { labelEn: 'Retrospectively changed' },
      }),
    ).rejects.toThrow(/immutable/u);
  });

  it('T002 reuses the canonical sheet under concurrent calls and protects slots across placements', async () => {
    const student = await first.addStudent('Canonical slot');
    const enrollment = await enroll(first, student.id);
    const { input } = await workspace(first, 'T002-canonical');
    const [classView, secondView] = await Promise.all([
      first.run(() => repository.materialize(input)),
      first.run(() =>
        repository.materialize({
          ...input,
          definition: definition('Different view'),
        }),
      ),
    ]);
    expect(classView.sheet.id).toBe(secondView.sheet.id);
    expect(classView.created).not.toBe(secondView.created);
    expect(
      await prisma.resultSlot.count({
        where: {
          schoolId: first.school.id,
          studentId: student.id,
          reportingPeriodId: input.reportingPeriodId,
          groupId: input.groupId,
        },
      }),
    ).toBe(1);

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: 'COMPLETED', endedAt: rosterDate },
    });
    await prisma.enrollment.create({
      data: {
        schoolId: first.school.id,
        academicYearId: first.year.id,
        classroomId: first.otherClassroom.id,
        studentId: student.id,
        enrolledAt: rosterDate,
      },
    });
    await expect(
      first.run(() =>
        repository.materialize({
          ...input,
          classroomId: first.otherClassroom.id,
          rosterAsOf: new Date(rosterDate.valueOf() + 1000),
        }),
      ),
    ).rejects.toMatchObject({ code: 'official_results.roster.changed' });
    expect(
      await prisma.resultSheet.count({
        where: { schoolId: first.school.id, groupId: input.groupId },
      }),
    ).toBe(1);
  });

  it('T003 rejects direct foreign-school relationships and excludes foreign scoped reads', async () => {
    const firstStudent = await first.addStudent('First school');
    const secondStudent = await second.addStudent('Second school');
    await enroll(first, firstStudent.id);
    const secondEnrollment = await enroll(second, secondStudent.id);
    const firstWorkspace = await workspace(first, 'T003-first');
    const secondWorkspace = await workspace(second, 'T003-second');
    const firstSheet = await first.run(() =>
      repository.materialize(firstWorkspace.input),
    );
    const secondSheet = await second.run(() =>
      repository.materialize(secondWorkspace.input),
    );
    const firstSlot = await prisma.resultSlot.findFirstOrThrow({
      where: {
        schoolId: first.school.id,
        sheetId: firstSheet.sheet.id,
        studentId: firstStudent.id,
      },
      select: { id: true },
    });
    const foreignField = secondWorkspace.input.definition.fields[0];

    await expect(
      first.run(() => repository.materialize(secondWorkspace.input)),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(
      await first.run(
        async () =>
          await prisma.scoped.resultSheet.findFirst({
            where: { id: secondSheet.sheet.id },
            select: { id: true },
          }),
      ),
    ).toBeNull();

    const additionalStudent = await first.addStudent(
      'Unmaterialized enrollment',
    );
    const additionalEnrollment = await enroll(first, additionalStudent.id);
    const ownSlotData = {
      schoolId: first.school.id,
      sheetId: firstSheet.sheet.id,
      reportingPeriodId: firstWorkspace.period.id,
      groupId: firstWorkspace.group.id,
      studentId: additionalStudent.id,
      enrollmentId: additionalEnrollment.id,
    };
    for (const foreign of [
      { studentId: secondStudent.id, enrollmentId: secondEnrollment.id },
      { enrollmentId: secondEnrollment.id },
      { groupId: secondWorkspace.group.id },
      { sheetId: secondSheet.sheet.id },
    ]) {
      await expect(
        prisma.resultSlot.create({ data: { ...ownSlotData, ...foreign } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    }
    await expect(
      prisma.resultCell.create({
        data: {
          schoolId: first.school.id,
          slotId: firstSlot.id,
          definitionVersionId: secondSheet.sheet.draftDefinitionVersionId!,
          fieldId: foreignField.fieldId,
          fieldKind: foreignField.kind,
          status: 'MISSING',
          updatedById: first.actor.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(
      await prisma.resultCell.count({ where: { slotId: firstSlot.id } }),
    ).toBe(0);
  });

  it('T004 selects a historical year-level enrollment for a term and excludes a different explicit term', async () => {
    const yearStudent = await second.addStudent('Year-level placement');
    const wrongTermStudent = await second.addStudent(
      'Different term placement',
    );
    const completed = await enroll(second, yearStudent.id, {
      endedAt: new Date('2026-12-01T09:00:00Z'),
    });
    await enroll(second, wrongTermStudent.id, { termId: second.nextTerm.id });
    const period = await createPeriod(second, 'T004-window');
    const group = await second.run(() =>
      repository.createGroup({
        kind: 'SUBJECT',
        subjectId: second.subject.id,
        code: 'T004-math',
        label: { ar: 'رياضيات', en: 'Math' },
      }),
    );
    const { sheet } = await second.run(() =>
      repository.materialize({
        reportingPeriodId: period.id,
        groupId: group.id,
        classroomId: second.classroom.id,
        rosterAsOf: rosterDate,
        definition: definition('T004'),
        acceptsDefinition: false,
      }),
    );
    const attributed = await prisma.resultSlot.findMany({
      where: {
        schoolId: second.school.id,
        sheetId: sheet.id,
        studentId: { in: [yearStudent.id, wrongTermStudent.id] },
      },
      select: { studentId: true, enrollmentId: true },
    });
    expect(attributed).toEqual([
      { studentId: yearStudent.id, enrollmentId: completed.id },
    ]);
  });

  it('T005 blocks ambiguous attributed enrollment without writing a sheet', async () => {
    const student = await second.addStudent('Ambiguous placement');
    const endedAt = new Date('2026-12-01T09:00:00Z');
    await enroll(second, student.id, { endedAt });
    await enroll(second, student.id, {
      termId: second.term.id,
      classroomId: second.otherClassroom.id,
      endedAt,
    });
    const { input } = await workspace(second, 'T005-ambiguous');
    await expect(
      second.run(() => repository.materialize(input)),
    ).rejects.toMatchObject({ code: 'official_results.roster.ambiguous' });
    expect(
      await prisma.resultSheet.count({ where: { groupId: input.groupId } }),
    ).toBe(0);
    expect(
      await prisma.resultSlot.count({ where: { groupId: input.groupId } }),
    ).toBe(0);
  });
});
