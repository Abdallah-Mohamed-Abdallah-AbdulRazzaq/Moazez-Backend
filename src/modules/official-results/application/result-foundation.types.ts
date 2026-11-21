import type {
  Prisma,
  ResultGroupKind,
  ResultReportingPeriodClass,
  ResultReportingPeriodKind,
} from '@prisma/client';

export interface ResultLabel {
  ar: string;
  en: string;
}

export interface ReportingPeriodInput {
  academicYearId: string;
  termId?: string;
  kind: ResultReportingPeriodKind;
  code: string;
  name: ResultLabel;
  startsOn: string;
  endsOn: string;
  classification?: ResultReportingPeriodClass;
}

export interface ResultGroupInput {
  kind: ResultGroupKind;
  subjectId?: string;
  code: string;
  label: ResultLabel;
  description?: string;
}

export interface ResultSheetTarget {
  reportingPeriodId: string;
  classroomId: string;
  groupId: string;
}

export interface FrozenResultDefinitionInput {
  label: ResultLabel;
  configuration: Prisma.InputJsonObject;
  releaseUnits: Omit<
    Prisma.ResultReleaseUnitDefinitionCreateManyInput,
    'id' | 'schoolId' | 'definitionVersionId' | 'createdAt' | 'updatedAt'
  >[];
  fields: (Omit<
    Prisma.ResultFieldDefinitionCreateManyInput,
    'id' | 'schoolId' | 'definitionVersionId' | 'createdAt' | 'updatedAt'
  > & { newSemanticPurpose?: string })[];
}

export interface MaterializeResultSheetInput extends ResultSheetTarget {
  rosterAsOf: Date;
  definition: FrozenResultDefinitionInput;
  acceptsDefinition: boolean;
  deferExistingPlacements?: boolean;
}
