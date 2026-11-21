import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type {
  FrozenResultDefinitionInput,
  MaterializeResultSheetInput,
  ReportingPeriodInput,
  ResultGroupInput,
} from '../../application/result-foundation.types';
import { OfficialResultsError } from '../../domain/official-results.error';
import {
  assertReportingDates,
  parseReportingDate,
} from '../../domain/reporting-dates';
import { resultContentDigest } from '../../domain/result-content-digest';
import { ResultRosterRepository } from './result-roster.repository';

const datesSelect = { startDate: true, endDate: true };
const sheetSelect = {
  id: true,
  reportingPeriodId: true,
  classroomId: true,
  groupId: true,
  draftDefinitionVersionId: true,
  lastAcceptedDefinitionVersionId: true,
  sheetRevision: true,
  dataGeneration: true,
  rosterGeneration: true,
  rosterAsOf: true,
} satisfies Prisma.ResultSheetSelect;

function currentSchoolContext() {
  const context = getRequestContext();
  const schoolId = context?.activeMembership?.schoolId;
  const actorId = context?.actor?.id;
  if (!schoolId || !actorId || context.bypass.bypassSchoolScope) {
    throw new NotFoundDomainException();
  }
  return { schoolId, actorId };
}

function isDatabaseError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

/**
 * Infrastructure for already authorized commands. Each call derives the school
 * from trusted request/worker context. The application owns effective rights.
 */
@Injectable()
export class ResultFoundationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roster: ResultRosterRepository,
  ) {}

  private get scoped(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async createReportingPeriod(
    input: ReportingPeriodInput,
    transaction?: Prisma.TransactionClient,
  ) {
    const { schoolId } = currentSchoolContext();
    const startsOn = parseReportingDate(input.startsOn);
    const endsOn = parseReportingDate(input.endsOn);
    if ((input.kind === 'YEAR') !== (input.termId === undefined)) {
      throw new OfficialResultsError('period.invalid_dates');
    }

    try {
      const execute = async (client: Prisma.TransactionClient) => {
        const year = await client.academicYear.findFirst({
          where: { id: input.academicYearId, schoolId, deletedAt: null },
          select: datesSelect,
        });
        if (!year) throw new NotFoundDomainException();
        assertReportingDates(startsOn, endsOn, year);
        if (input.termId) {
          const term = await client.term.findFirst({
            where: {
              id: input.termId,
              schoolId,
              academicYearId: input.academicYearId,
              deletedAt: null,
            },
            select: datesSelect,
          });
          if (!term) throw new NotFoundDomainException();
          assertReportingDates(startsOn, endsOn, term);
        }
        return client.resultReportingPeriod.create({
          data: {
            schoolId,
            academicYearId: input.academicYearId,
            termId: input.termId,
            kind: input.kind,
            code: input.code,
            nameAr: input.name.ar,
            nameEn: input.name.en,
            startsOn,
            endsOn,
            classification: input.classification,
          },
        });
      };
      return transaction
        ? await execute(transaction)
        : await this.scoped.$transaction(execute, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          });
    } catch (error) {
      if (isDatabaseError(error, 'P2002')) {
        throw new OfficialResultsError('period.duplicate_code');
      }
      throw error;
    }
  }

  async createGroup(
    input: ResultGroupInput,
    transaction?: Prisma.TransactionClient,
  ) {
    const { schoolId } = currentSchoolContext();
    if ((input.kind === 'SUBJECT') !== (input.subjectId !== undefined)) {
      throw new OfficialResultsError('group.invalid_subject');
    }

    try {
      const execute = async (client: Prisma.TransactionClient) => {
        if (input.subjectId) {
          const subject = await client.subject.findFirst({
            where: {
              id: input.subjectId,
              schoolId,
              isActive: true,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!subject) throw new NotFoundDomainException();
        }
        return client.resultGroup.create({
          data: {
            schoolId,
            subjectId: input.subjectId,
            kind: input.kind,
            code: input.code,
            labelAr: input.label.ar,
            labelEn: input.label.en,
            description: input.description,
          },
        });
      };
      return transaction
        ? await execute(transaction)
        : await this.scoped.$transaction(execute, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          });
    } catch (error) {
      if (isDatabaseError(error, 'P2002')) {
        throw new OfficialResultsError('group.duplicate');
      }
      throw error;
    }
  }

  async materialize(input: MaterializeResultSheetInput) {
    const contentDigest = resultContentDigest(input.definition);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.materializeWithinTransaction(input, contentDigest);
      } catch (error) {
        if (
          (!isDatabaseError(error, 'P2034') &&
            !isDatabaseError(error, 'P2002')) ||
          attempt >= 2
        ) {
          throw error;
        }
      }
    }
  }

  private materializeWithinTransaction(
    input: MaterializeResultSheetInput,
    contentDigest: string,
  ) {
    const { schoolId, actorId } = currentSchoolContext();
    return this.scoped.$transaction(
      async (client) => {
        const target = await this.roster.resolveTarget(client, schoolId, input);
        const naturalKey = {
          schoolId,
          reportingPeriodId: target.period.id,
          groupId: target.group.id,
          classroomId: target.classroom.id,
        };
        const existing = await client.resultSheet.findFirst({
          where: naturalKey,
          select: sheetSelect,
        });
        if (existing) return { sheet: existing, created: false };
        if (target.period.status !== 'OPEN') {
          throw new OfficialResultsError('period.closed');
        }

        const enrollments = await this.roster.findRoster(
          client,
          target,
          input.rosterAsOf,
        );
        const placed = await client.resultSlot.count({
          where: {
            schoolId,
            reportingPeriodId: target.period.id,
            groupId: target.group.id,
            studentId: { in: enrollments.map(({ studentId }) => studentId) },
          },
        });
        if (placed) throw new OfficialResultsError('roster.changed');

        const sheet = await client.resultSheet.create({
          data: { ...naturalKey, rosterAsOf: input.rosterAsOf },
          select: { id: true },
        });
        const definitionId = await this.freezeDefinition(
          client,
          schoolId,
          actorId,
          sheet.id,
          input.definition,
          contentDigest,
        );
        await client.resultSlot.createMany({
          data: enrollments.map((enrollment) => ({
            schoolId,
            sheetId: sheet.id,
            reportingPeriodId: target.period.id,
            groupId: target.group.id,
            studentId: enrollment.studentId,
            enrollmentId: enrollment.id,
          })),
        });
        const initialized = await client.resultSheet.update({
          where: { id_schoolId: { id: sheet.id, schoolId } },
          data: {
            draftDefinitionVersionId: definitionId,
            lastAcceptedDefinitionVersionId: input.acceptsDefinition
              ? definitionId
              : null,
          },
          select: sheetSelect,
        });
        return { sheet: initialized, created: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async freezeDefinition(
    client: Prisma.TransactionClient,
    schoolId: string,
    actorId: string,
    sheetId: string,
    seed: FrozenResultDefinitionInput,
    contentDigest: string,
  ): Promise<string> {
    await client.resultFieldIdentity.createMany({
      data: seed.fields.flatMap((field) =>
        field.newSemanticPurpose === undefined
          ? []
          : [
              {
                id: field.fieldId,
                schoolId,
                kind: field.kind,
                semanticPurpose: field.newSemanticPurpose,
              },
            ],
      ),
    });
    const definition = await client.resultSheetDefinitionVersion.create({
      data: {
        schoolId,
        sheetId,
        version: 1,
        contentDigest,
        labelAr: seed.label.ar,
        labelEn: seed.label.en,
        configuration: seed.configuration,
        createdById: actorId,
      },
      select: { id: true },
    });
    await client.resultReleaseUnitDefinition.createMany({
      data: seed.releaseUnits.map((unit) => ({
        ...unit,
        schoolId,
        definitionVersionId: definition.id,
      })),
    });
    await client.resultFieldDefinition.createMany({
      data: seed.fields.map(({ newSemanticPurpose: _, ...field }) => ({
        ...field,
        schoolId,
        definitionVersionId: definition.id,
      })),
    });
    return definition.id;
  }
}
