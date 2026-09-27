import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  normalizePreparation,
  optionalId,
  optionalText,
  type PreparationCommand,
} from './academic-content-type-detail.policy';

export type PreparationTemplateFields = {
  name: string;
  normalizedName: string;
  description: string | null;
  stageId: string | null;
  subjectId: string | null;
  topic: string | null;
  objectives: string[];
  learningOutcomes: string[];
  teachingStrategies: string[];
  activities: string[];
  resourceNotes: string | null;
  assessmentNotes: string | null;
  teacherNotes: string | null;
};

export type PreparationTemplateInput = Partial<
  Omit<PreparationTemplateFields, 'normalizedName'>
>;

export function normalizeTemplateName(value: unknown): {
  name: string;
  normalizedName: string;
} {
  if (typeof value !== 'string')
    throw new ValidationDomainException('Invalid template name');
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const normalizedName = name.toLowerCase();
  if (!name || name.length > 180 || normalizedName.length > 180)
    throw new ValidationDomainException('Invalid template name');
  return { name, normalizedName };
}

export function normalizePreparationTemplate(
  input: PreparationTemplateInput,
): PreparationTemplateFields {
  if (!input || typeof input !== 'object')
    throw new ValidationDomainException('Invalid preparation template');
  const name = normalizeTemplateName(input.name);
  const preparation = normalizePreparation({
    topic: input.topic,
    objectives: input.objectives === undefined ? [] : input.objectives,
    learningOutcomes:
      input.learningOutcomes === undefined ? [] : input.learningOutcomes,
    teachingStrategies:
      input.teachingStrategies === undefined ? [] : input.teachingStrategies,
    activities: input.activities === undefined ? [] : input.activities,
    resourceNotes: input.resourceNotes,
    assessmentNotes: input.assessmentNotes,
    teacherNotes: input.teacherNotes,
    curriculumId: null,
    curriculumUnitId: null,
    curriculumLessonId: null,
    lessonPlanId: null,
    lessonPlanItemId: null,
    timetableEntryId: null,
  } satisfies PreparationCommand).state;
  return {
    ...name,
    description: optionalText(input.description, 'description', 1000),
    stageId: optionalId(input.stageId, 'stageId'),
    subjectId: optionalId(input.subjectId, 'subjectId'),
    topic: preparation.topic,
    objectives: preparation.objectives,
    learningOutcomes: preparation.learningOutcomes,
    teachingStrategies: preparation.teachingStrategies,
    activities: preparation.activities,
    resourceNotes: preparation.resourceNotes,
    assessmentNotes: preparation.assessmentNotes,
    teacherNotes: preparation.teacherNotes,
  };
}

export function normalizeTemplateSearch(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string')
    throw new ValidationDomainException('Invalid template search');
  const search = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (search.length > 120)
    throw new ValidationDomainException('Invalid template search');
  return search || undefined;
}

export function templateSummary(fields: PreparationTemplateFields) {
  return {
    name: fields.name,
    stageId: fields.stageId,
    subjectId: fields.subjectId,
    descriptionPresent: fields.description !== null,
    topicPresent: fields.topic !== null,
    objectivesCount: fields.objectives.length,
    learningOutcomesCount: fields.learningOutcomes.length,
    teachingStrategiesCount: fields.teachingStrategies.length,
    activitiesCount: fields.activities.length,
    resourceNotesPresent: fields.resourceNotes !== null,
    assessmentNotesPresent: fields.assessmentNotes !== null,
    teacherNotesPresent: fields.teacherNotes !== null,
  };
}
