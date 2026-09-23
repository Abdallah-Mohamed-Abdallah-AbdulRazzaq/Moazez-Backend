import {
  AcademicContentAudienceType as Audience,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as ContentType,
  UserType,
} from '@prisma/client';
import { assertAcademicContentAudience } from '../domain/academic-content-audience.policy';
import {
  academicContentTargetFingerprint,
  normalizeAcademicContentTargets,
} from '../domain/academic-content-target.policy';

const classroomId = '00000000-0000-4000-8000-000000000001';
const subjectId = '00000000-0000-4000-8000-000000000002';
const allocationId = '00000000-0000-4000-8000-000000000003';

describe('ACC-2 pure targeting policy', () => {
  it('enforces the exact type/audience matrix', () => {
    const allowed: Record<ContentType, Audience[]> = {
      [ContentType.TEACHER_PREPARATION]: [Audience.INTERNAL_STAFF],
      [ContentType.WEEKLY_PLAN]: [
        Audience.STUDENTS,
        Audience.GUARDIANS,
        Audience.STUDENTS_AND_GUARDIANS,
      ],
      [ContentType.GUARDIAN_WEEKLY_NOTE]: [Audience.GUARDIANS],
      [ContentType.SUBJECT_RESOURCE]: [
        Audience.STUDENTS,
        Audience.GUARDIANS,
        Audience.STUDENTS_AND_GUARDIANS,
      ],
      [ContentType.ONLINE_SESSION]: [
        Audience.STUDENTS,
        Audience.STUDENTS_AND_GUARDIANS,
      ],
      [ContentType.GENERAL_RESOURCE]: Object.values(Audience),
    };
    for (const type of Object.values(ContentType)) {
      for (const audience of Object.values(Audience)) {
        if (allowed[type].includes(audience)) {
          expect(() =>
            assertAcademicContentAudience(type, audience),
          ).not.toThrow();
        } else {
          expect(() => assertAcademicContentAudience(type, audience)).toThrow();
        }
      }
    }
  });

  it('normalizes absent IDs and produces a stable structured fingerprint', () => {
    const [target] = normalizeAcademicContentTargets(
      ContentType.SUBJECT_RESOURCE,
      UserType.TEACHER,
      [
        {
          scopeType: Scope.CLASSROOM,
          classroomId,
          subjectId,
          teacherSubjectAllocationId: allocationId,
        },
      ],
    );
    expect(target.stageId).toBeNull();
    expect(target.gradeId).toBeNull();
    expect(target.identityFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(academicContentTargetFingerprint(target)).toBe(
      target.identityFingerprint,
    );
    expect(
      academicContentTargetFingerprint({ ...target, subjectId: null }),
    ).not.toBe(target.identityFingerprint);
  });

  it('rejects impossible shapes, missing subjects, unowned teacher shapes and exact duplicates', () => {
    expect(() =>
      normalizeAcademicContentTargets(
        ContentType.GENERAL_RESOURCE,
        UserType.TEACHER,
        [],
      ),
    ).toThrow();
    expect(() =>
      normalizeAcademicContentTargets(
        ContentType.GENERAL_RESOURCE,
        UserType.SCHOOL_USER,
        [{ scopeType: Scope.SCHOOL, gradeId: classroomId }],
      ),
    ).toThrow();
    expect(() =>
      normalizeAcademicContentTargets(
        ContentType.WEEKLY_PLAN,
        UserType.SCHOOL_USER,
        [{ scopeType: Scope.CLASSROOM, classroomId }],
      ),
    ).toThrow();
    expect(() =>
      normalizeAcademicContentTargets(
        ContentType.GENERAL_RESOURCE,
        UserType.TEACHER,
        [{ scopeType: Scope.SCHOOL }],
      ),
    ).toThrow();
    expect(() =>
      normalizeAcademicContentTargets(
        ContentType.GENERAL_RESOURCE,
        UserType.SCHOOL_USER,
        [{ scopeType: Scope.SCHOOL }, { scopeType: Scope.SCHOOL }],
      ),
    ).toThrow();
  });

  it('enforces subjects on every required type and permits them to be absent on optional types', () => {
    for (const type of Object.values(ContentType)) {
      const action = () =>
        normalizeAcademicContentTargets(type, UserType.SCHOOL_USER, [
          { scopeType: Scope.SCHOOL },
        ]);
      if (
        [
          ContentType.GENERAL_RESOURCE,
          ContentType.GUARDIAN_WEEKLY_NOTE,
        ].includes(type)
      ) {
        expect(action).not.toThrow();
      } else {
        expect(action).toThrow();
      }
    }
  });

  it('accepts each exact hierarchy scope and keeps overlap distinct from duplicate identity', () => {
    const targets = normalizeAcademicContentTargets(
      ContentType.GENERAL_RESOURCE,
      UserType.SCHOOL_USER,
      [
        { scopeType: Scope.SCHOOL },
        { scopeType: Scope.STAGE, stageId: classroomId },
        { scopeType: Scope.GRADE, gradeId: classroomId },
        { scopeType: Scope.SECTION, sectionId: classroomId },
        { scopeType: Scope.CLASSROOM, classroomId },
      ],
    );
    expect(targets).toHaveLength(5);
    expect(
      new Set(targets.map((target) => target.identityFingerprint)).size,
    ).toBe(5);
  });
});
