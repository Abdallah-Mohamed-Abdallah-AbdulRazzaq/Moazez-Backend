import { createHash } from 'node:crypto';
import {
  AcademicContentTargetScopeType as ScopeType,
  AcademicContentType as ContentType,
  UserType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { requiresAcademicContentSubject } from './academic-content-audience.policy';

export interface AcademicContentTargetInput {
  scopeType: ScopeType;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  subjectId?: string | null;
  teacherSubjectAllocationId?: string | null;
}

export interface NormalizedAcademicContentTarget {
  scopeType: ScopeType;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
  subjectId: string | null;
  teacherSubjectAllocationId: string | null;
  identityFingerprint: string;
}

const ANCHOR_BY_SCOPE: Readonly<
  Record<ScopeType, keyof AcademicContentTargetInput | null>
> = {
  [ScopeType.SCHOOL]: null,
  [ScopeType.STAGE]: 'stageId',
  [ScopeType.GRADE]: 'gradeId',
  [ScopeType.SECTION]: 'sectionId',
  [ScopeType.CLASSROOM]: 'classroomId',
};
const ANCHORS = ['stageId', 'gradeId', 'sectionId', 'classroomId'] as const;
const TARGET_IDS = [
  'stageId',
  'gradeId',
  'sectionId',
  'classroomId',
  'subjectId',
  'teacherSubjectAllocationId',
] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeAcademicContentTargets(
  type: ContentType,
  actorType: UserType,
  input: readonly AcademicContentTargetInput[],
): NormalizedAcademicContentTarget[] {
  // An empty Teacher replacement would erase arbitrary targets without proving
  // ownership of even one allocation. Management may deliberately clear a set.
  if (actorType === UserType.TEACHER && input.length === 0) {
    throw new ValidationDomainException(
      'Teacher target replacement requires an owned allocation',
    );
  }
  const fingerprints = new Set<string>();
  const normalized = input.map((target) => {
    const anchor = ANCHOR_BY_SCOPE[target.scopeType];
    if (anchor === undefined) {
      throw new ValidationDomainException(
        'Academic content target scope is invalid',
      );
    }
    const candidate = {
      scopeType: target.scopeType,
      stageId: target.stageId ?? null,
      gradeId: target.gradeId ?? null,
      sectionId: target.sectionId ?? null,
      classroomId: target.classroomId ?? null,
      subjectId: target.subjectId ?? null,
      teacherSubjectAllocationId: target.teacherSubjectAllocationId ?? null,
    };
    if (
      TARGET_IDS.some(
        (field) =>
          candidate[field] !== null && !UUID_PATTERN.test(candidate[field]),
      )
    ) {
      throw new ValidationDomainException(
        'Academic content target identifier is invalid',
      );
    }
    if (
      ANCHORS.some(
        (field) => (field === anchor) !== (candidate[field] !== null),
      )
    ) {
      throw new ValidationDomainException(
        'Academic content target hierarchy shape is invalid',
      );
    }
    if (requiresAcademicContentSubject(type) && !candidate.subjectId) {
      throw new ValidationDomainException(
        'Academic content target requires a subject',
      );
    }
    if (
      candidate.teacherSubjectAllocationId &&
      (candidate.scopeType !== ScopeType.CLASSROOM || !candidate.subjectId)
    ) {
      throw new ValidationDomainException(
        'Teacher allocation requires a classroom and subject',
      );
    }
    if (
      actorType === UserType.TEACHER &&
      (candidate.scopeType !== ScopeType.CLASSROOM ||
        !candidate.subjectId ||
        !candidate.teacherSubjectAllocationId)
    ) {
      throw new ValidationDomainException(
        'Teacher targets require an owned classroom allocation',
      );
    }
    const identityFingerprint = academicContentTargetFingerprint(candidate);
    if (fingerprints.has(identityFingerprint)) {
      throw new ValidationDomainException('Duplicate academic content target');
    }
    fingerprints.add(identityFingerprint);
    return { ...candidate, identityFingerprint };
  });
  return normalized.sort((a, b) =>
    a.identityFingerprint.localeCompare(b.identityFingerprint),
  );
}

export function academicContentTargetFingerprint(
  target: Omit<NormalizedAcademicContentTarget, 'identityFingerprint'>,
): string {
  const identity = [
    target.scopeType,
    target.stageId,
    target.gradeId,
    target.sectionId,
    target.classroomId,
    target.subjectId,
    target.teacherSubjectAllocationId,
  ];
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}
