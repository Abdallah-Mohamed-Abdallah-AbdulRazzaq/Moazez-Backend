import {
  AcademicContentRecipientDetail,
  ParentAcademicContentType,
} from '../../../academics/academic-content/domain/academic-content-recipient.query';
import { AcademicContentType, Prisma } from '@prisma/client';

export function parentContentFixture(
  type: ParentAcademicContentType = 'GENERAL_RESOURCE',
): AcademicContentRecipientDetail<ParentAcademicContentType> {
  const states: Partial<Record<AcademicContentType, Prisma.JsonObject>> = {
    WEEKLY_PLAN: {
      weekStartDate: '2026-10-05',
      weekEndDate: '2026-10-09',
      objectives: ['Learn'],
      topics: ['Topic'],
      expectedHomework: 'Work',
      upcomingAssessments: null,
      notes: 'Note',
      homeworkAssignmentIds: [],
      gradeAssessmentIds: [],
    },
    GUARDIAN_WEEKLY_NOTE: {
      body: 'Frozen guardian body',
      priority: 'NORMAL',
      requiresAcknowledgement: true,
    },
    SUBJECT_RESOURCE: {
      resourceCategory: 'WORKSHEET',
      curriculumId: null,
      curriculumUnitId: null,
      curriculumLessonId: null,
    },
    ONLINE_SESSION: {
      platform: 'GOOGLE_MEET',
      providerName: null,
      joinUrl: 'https://meet.example.test/private',
      accessCode: 'private-code',
      instructions: 'Instructions',
      startAt: '2026-10-07T10:00:00.000Z',
      endAt: '2026-10-07T11:00:00.000Z',
      timezone: 'Africa/Cairo',
      timetableEntryId: null,
    },
  };
  const state = states[type] ?? null;
  return {
    contentId: '11111111-1111-4111-8111-111111111111',
    publicationId: '22222222-2222-4222-8222-222222222222',
    revisionId: '33333333-3333-4333-8333-333333333333',
    type,
    audience: 'GUARDIANS',
    title: 'Published title',
    description: 'Published description',
    publishedAt: new Date('2026-10-07T08:00:00.000Z'),
    visibleFrom: new Date('2026-10-07T09:00:00.000Z'),
    visibleUntil: null,
    summary: state,
    typeSpecificSnapshot: state ? { type, state } : null,
    assets: [
      {
        fileId: '44444444-4444-4444-8444-444444444444',
        originalName: 'published.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '12',
        sortOrder: 0,
      },
    ],
    links: [
      {
        revisionLinkId: '55555555-5555-4555-8555-555555555555',
        label: 'Published link',
        url: 'https://example.test/published',
        sortOrder: 0,
      },
    ],
    tags: [{ displayValue: 'Published Tag', sortOrder: 0 }],
  };
}
