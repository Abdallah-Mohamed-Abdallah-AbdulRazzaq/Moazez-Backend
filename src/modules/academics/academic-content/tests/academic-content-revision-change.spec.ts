import { createHash, randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentType as Type,
  UserType,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../../../common/context/request-context';
import { StartAcademicContentRevisionUseCase } from '../application/academic-content-publication.use-cases';
import {
  AcademicContentRevisionSemantics,
  classifyAcademicContentRevisionChange as classify,
} from '../domain/academic-content-revision-change.policy';
import {
  academicContentPublicationRequestFingerprint as fingerprint,
  assertAcademicContentPublicationCommand,
} from '../domain/academic-content-publication.policy';
import { academicContentPublicationNotificationEvent as event } from '../domain/academic-content-publication-notification.policy';
import { CreateAcademicContentPublicationDto } from '../dto/academic-content-publication.dto';

const revision = (): AcademicContentRevisionSemantics => ({
  revisionNumber: 1,
  type: Type.GENERAL_RESOURCE,
  audience: Audience.STUDENTS_AND_GUARDIANS,
  academicYearId: randomUUID(),
  termId: randomUUID(),
  title: 'Title',
  description: 'Description',
  typeSpecificSnapshot: null,
  targets: [{ identityFingerprint: 'a' }, { identityFingerprint: 'b' }],
  assets: [
    { fileId: 'a', sortOrder: 0 },
    { fileId: 'b', sortOrder: 1 },
  ],
  links: [
    { url: 'https://a.test', label: 'A', sortOrder: 0 },
    { url: 'https://b.test', label: 'B', sortOrder: 1 },
  ],
  tags: [
    { displayValue: 'One', normalizedValue: 'one', sortOrder: 0 },
    { displayValue: 'Two', normalizedValue: 'two', sortOrder: 1 },
  ],
});

describe('ACC-8C immutable semantic classifier', () => {
  it('ignores revision mechanics, relation IDs and database result ordering', () => {
    const old = revision();
    const next = {
      ...structuredClone(old),
      revisionNumber: 99,
      id: randomUUID(),
      capturedByUserId: randomUUID(),
      capturedAt: new Date(),
      createdAt: new Date(),
    };
    next.targets.reverse();
    next.assets.reverse();
    next.links.reverse();
    next.tags.reverse();
    expect(classify(old, next)).toBeNull();
  });
  it('compares canonical JSON object keys recursively and preserves semantic array ordering', () => {
    const old = revision(),
      next = structuredClone(old);
    old.typeSpecificSnapshot = {
      state: { a: 1, b: { c: 2, d: [1, 2] } },
      type: 'ONLINE_SESSION',
    };
    next.typeSpecificSnapshot = {
      type: 'ONLINE_SESSION',
      state: { b: { d: [1, 2], c: 2 }, a: 1 },
    };
    expect(classify(old, next)).toBeNull();
    next.typeSpecificSnapshot = {
      state: { a: 1, b: { c: 2, d: [2, 1] } },
      type: 'ONLINE_SESSION',
    };
    expect(classify(old, next)).toBe('SIGNIFICANT');
  });
  it.each([
    'title',
    'description',
    'tag-add',
    'tag-remove',
    'tag-display',
    'tag-order',
    'link-label',
    'link-order',
    'asset-order',
  ])('%s is MINOR', (field) => {
    const old = revision(),
      next = structuredClone(old);
    switch (field) {
      case 'title':
        next.title += ' edited';
        break;
      case 'description':
        next.description = 'Edited';
        break;
      case 'tag-add':
        next.tags.push({
          displayValue: 'Three',
          normalizedValue: 'three',
          sortOrder: 2,
        });
        break;
      case 'tag-remove':
        next.tags.pop();
        break;
      case 'tag-display':
        next.tags[0].displayValue = 'ONE';
        break;
      case 'tag-order':
        next.tags[0].sortOrder = 2;
        break;
      case 'link-label':
        next.links[0].label = 'Edited';
        break;
      case 'link-order':
        next.links[0].sortOrder = 2;
        break;
      case 'asset-order':
        next.assets[0].sortOrder = 2;
        break;
    }
    expect(classify(old, next)).toBe('MINOR');
  });
  it.each([
    'type',
    'audience',
    'year',
    'term',
    'target-add',
    'target-remove',
    'target-classroom',
    'target-subject',
    'target-allocation',
    'asset-add',
    'asset-remove',
    'link-add',
    'link-remove',
    'link-url',
  ])('%s is SIGNIFICANT', (field) => {
    const old = revision(),
      next = structuredClone(old);
    switch (field) {
      case 'type':
        next.type = Type.ONLINE_SESSION;
        break;
      case 'audience':
        next.audience = Audience.STUDENTS;
        break;
      case 'year':
        next.academicYearId = randomUUID();
        break;
      case 'term':
        next.termId = randomUUID();
        break;
      case 'target-add':
        next.targets.push({ identityFingerprint: 'new' });
        break;
      case 'target-remove':
        next.targets.pop();
        break;
      case 'target-classroom':
      case 'target-subject':
      case 'target-allocation':
        next.targets[0].identityFingerprint = field;
        break;
      case 'asset-add':
        next.assets.push({ fileId: 'c', sortOrder: 2 });
        break;
      case 'asset-remove':
        next.assets.pop();
        break;
      case 'link-add':
        next.links.push({ url: 'https://c.test', label: 'C', sortOrder: 2 });
        break;
      case 'link-remove':
        next.links.pop();
        break;
      case 'link-url':
        next.links[0].url = 'https://changed.test';
        break;
    }
    expect(classify(old, next)).toBe('SIGNIFICANT');
  });
  it.each([
    [
      Type.WEEKLY_PLAN,
      [
        'weekStartDate',
        'weekEndDate',
        'objectives',
        'topics',
        'expectedHomework',
        'upcomingAssessments',
        'notes',
        'homeworkAssignmentIds',
        'gradeAssessmentIds',
      ],
    ],
    [
      Type.GUARDIAN_WEEKLY_NOTE,
      ['body', 'priority', 'requiresAcknowledgement'],
    ],
    [
      Type.SUBJECT_RESOURCE,
      [
        'resourceCategory',
        'curriculumId',
        'curriculumUnitId',
        'curriculumLessonId',
      ],
    ],
    [
      Type.ONLINE_SESSION,
      [
        'platform',
        'providerName',
        'startAt',
        'endAt',
        'joinUrl',
        'accessCode',
        'instructions',
        'timezone',
        'timetableEntryId',
      ],
    ],
  ] as const)('all frozen %s details are significant', (type, fields) => {
    for (const field of fields) {
      const old = revision(),
        next = structuredClone(old);
      old.type = next.type = type;
      old.typeSpecificSnapshot = { type, state: { [field]: 'old' } };
      next.typeSpecificSnapshot = { type, state: { [field]: 'changed' } };
      expect(classify(old, next)).toBe('SIGNIFICANT');
    }
  });
});

describe('ACC-8C strict additive command and persisted event decision', () => {
  it('preserves the exact historical V1 fingerprint when the override is omitted', () => {
    const id = randomUUID(),
      visibleUntil = new Date('2027-01-01T00:00:00Z');
    const historical = createHash('sha256')
      .update(
        JSON.stringify({
          contractVersion: 1,
          academicContentId: id.toLowerCase(),
          publishAt: ['OMITTED'],
          visibleFrom: ['OMITTED'],
          visibleUntil: ['EXPLICIT_ISO', visibleUntil.toISOString()],
        }),
      )
      .digest('hex');
    expect(fingerprint(id, { visibleUntil })).toBe(historical);
    expect(
      fingerprint(id, { visibleUntil, notifyMinorUpdate: false }),
    ).not.toBe(historical);
    expect(fingerprint(id, { notifyMinorUpdate: false })).not.toBe(
      fingerprint(id, { notifyMinorUpdate: true }),
    );
  });
  it.each([null, 0, 1, 'true', 'false', {}, []])(
    'rejects non-Boolean override %j without coercion',
    (value) => {
      const dto = plainToInstance(CreateAcademicContentPublicationDto, {
        clientRequestId: randomUUID(),
        notifyMinorUpdate: value,
      });
      expect(
        validateSync(dto).some(
          (error) => error.property === 'notifyMinorUpdate',
        ),
      ).toBe(true);
      expect(() =>
        assertAcademicContentPublicationCommand(randomUUID(), {
          clientRequestId: randomUUID(),
          notifyMinorUpdate: value,
        } as never),
      ).toThrow();
    },
  );
  it.each([undefined, false, true])(
    'accepts strict optional override %j',
    (value) => {
      expect(
        validateSync(
          plainToInstance(CreateAcademicContentPublicationDto, {
            clientRequestId: randomUUID(),
            notifyMinorUpdate: value,
          }),
        ),
      ).toEqual([]);
    },
  );
  it.each([
    [null, null, false, 'academic_content_published'],
    ['old', 'SIGNIFICANT', false, 'academic_content_updated'],
    ['old', 'SIGNIFICANT', true, 'academic_content_updated'],
    ['old', 'MINOR', true, 'academic_content_updated'],
    ['old', 'MINOR', false, null],
    [null, null, true, null],
    [null, 'MINOR', false, null],
    ['old', null, false, null],
  ])(
    'decision is persisted lineage %j / %j / %j',
    (
      supersedesPublicationId,
      changeSignificance,
      notifyMinorUpdate,
      expected,
    ) => {
      expect(
        event({
          supersedesPublicationId,
          changeSignificance,
          notifyMinorUpdate,
        } as never),
      ).toBe(expected);
    },
  );
});

describe('ACC-8C internal revision-start permission boundary', () => {
  const startRevision = jest.fn(),
    useCase = new StartAcademicContentRevisionUseCase({
      startRevision,
    } as never);
  const manage = 'academics.academic_content.manage',
    publish = 'academics.academic_content.publish';
  const invoke = (
    permissions: string[],
    userType: UserType,
    schoolId: string | undefined = randomUUID(),
  ) =>
    runWithRequestContext(createRequestContext(), () => {
      setActor({ id: randomUUID(), userType });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId,
        organizationId: randomUUID(),
        roleId: randomUUID(),
        permissions,
      });
      return useCase.execute(randomUUID(), randomUUID());
    });
  beforeEach(() => startRevision.mockClear());
  it.each([UserType.SCHOOL_USER, UserType.ORGANIZATION_USER])(
    'allows scoped %s with both permissions',
    async (type) => {
      await invoke([manage, publish], type);
      expect(startRevision).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    [],
    [manage],
    [publish],
    ['academics.academic_content.view'],
    ['academics.academic_content.approve'],
  ])('requires both permissions %j', (...permissions) => {
    expect(() => invoke(permissions, UserType.SCHOOL_USER)).toThrow();
    expect(startRevision).not.toHaveBeenCalled();
  });
  it.each([
    UserType.TEACHER,
    UserType.STUDENT,
    UserType.PARENT,
    UserType.APPLICANT,
    UserType.SERVICE_ACCOUNT,
  ])('denies app/service actor %s even with both permissions', (type) => {
    expect(() => invoke([manage, publish], type)).toThrow();
    expect(startRevision).not.toHaveBeenCalled();
  });
  it('requires active School scope', () => {
    expect(() =>
      invoke([manage, publish], UserType.ORGANIZATION_USER, ''),
    ).toThrow();
    expect(startRevision).not.toHaveBeenCalled();
  });
});
