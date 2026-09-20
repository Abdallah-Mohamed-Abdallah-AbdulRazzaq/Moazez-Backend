import {
  CommunicationAnnouncementStatus,
  HomeworkAssignmentStatus,
  LessonPlanStatus,
  MembershipStatus,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  TeacherEmploymentStatus,
  TeacherGender,
  TimetableEntryStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { buildTeacherAnnouncementMetadata } from '../../../communication/domain/teacher-app-announcement-metadata';
import { TeacherAllocationReassignmentImpactService } from '../application/teacher-allocation-reassignment-impact.service';
import {
  canonicalStringify,
  computeTeacherAllocationReassignmentFingerprint,
} from '../domain/teacher-allocation-reassignment-fingerprint';
import { evaluateReassignmentTargetEligibility } from '../domain/teacher-allocation-reassignment.policy';
import type {
  ReassignmentTargetRecord,
  TeacherAllocationReassignmentSnapshot,
} from '../infrastructure/teacher-allocation-reassignment-read.repository';

const schoolId = '10000000-0000-4000-8000-000000000001';
const allocationId = '10000000-0000-4000-8000-000000000002';
const currentTeacherId = '10000000-0000-4000-8000-000000000003';
const targetTeacherId = '10000000-0000-4000-8000-000000000004';
const subjectId = '10000000-0000-4000-8000-000000000005';
const classroomId = '10000000-0000-4000-8000-000000000006';
const termId = '10000000-0000-4000-8000-000000000007';
const academicYearId = '10000000-0000-4000-8000-000000000008';
const now = new Date('2026-09-20T00:00:00.000Z');

describe('teacher allocation reassignment', () => {
  describe('fingerprint', () => {
    it('is deterministic across object and query ordering', () => {
      const left = {
        target: { status: 'ACTIVE', id: targetTeacherId },
        rows: [
          { id: 'b', status: 'ACTIVE' },
          { id: 'a', status: 'DRAFT' },
        ],
      };
      const right = {
        rows: [
          { status: 'DRAFT', id: 'a' },
          { status: 'ACTIVE', id: 'b' },
        ],
        target: { id: targetTeacherId, status: 'ACTIVE' },
      };

      expect(canonicalStringify(left)).toBe(canonicalStringify(right));
      expect(computeTeacherAllocationReassignmentFingerprint(left)).toBe(
        computeTeacherAllocationReassignmentFingerprint(right),
      );
      expect(computeTeacherAllocationReassignmentFingerprint(left)).toMatch(
        /^[a-f0-9]{64}$/u,
      );
    });

    it('changes when material state changes', () => {
      expect(
        computeTeacherAllocationReassignmentFingerprint({ status: 'DRAFT' }),
      ).not.toBe(
        computeTeacherAllocationReassignmentFingerprint({ status: 'ACTIVE' }),
      );
    });
  });

  describe('target eligibility', () => {
    it('accepts an invited, operational teacher with a complete active profile', () => {
      expect(
        evaluateReassignmentTargetEligibility({
          schoolId,
          target: buildEligibleTarget(),
        }),
      ).toEqual({ eligible: true });
    });

    it('selects the operational membership when historical memberships also exist', () => {
      const target = buildEligibleTarget();
      target.memberships.unshift({
        ...target.memberships[0],
        id: '20000000-0000-4000-8000-000000000099',
        status: MembershipStatus.INACTIVE,
        endedAt: now,
      });

      expect(
        evaluateReassignmentTargetEligibility({ schoolId, target }),
      ).toEqual({ eligible: true });
    });

    it('rejects an operational membership from another school', () => {
      const target = buildEligibleTarget();
      target.memberships = target.memberships.map((membership) => ({
        ...membership,
        schoolId: '20000000-0000-4000-8000-000000000098',
      }));

      expect(
        evaluateReassignmentTargetEligibility({ schoolId, target }),
      ).toEqual({
        eligible: false,
        reasonCode: 'membership_ineligible',
      });
    });

    it('rejects a same-school membership with a non-Teacher role', () => {
      const target = buildEligibleTarget();
      target.memberships = target.memberships.map((membership) => ({
        ...membership,
        role: { ...membership.role, key: 'school_admin' },
      }));

      expect(
        evaluateReassignmentTargetEligibility({ schoolId, target }),
      ).toEqual({
        eligible: false,
        reasonCode: 'membership_ineligible',
      });
    });

    it('rejects a same-school membership with a deleted Teacher role', () => {
      const target = buildEligibleTarget();
      target.memberships = target.memberships.map((membership) => ({
        ...membership,
        role: { ...membership.role, deletedAt: now },
      }));

      expect(
        evaluateReassignmentTargetEligibility({ schoolId, target }),
      ).toEqual({
        eligible: false,
        reasonCode: 'membership_ineligible',
      });
    });

    it.each([
      [
        'account_status_ineligible',
        (target: ReassignmentTargetRecord) => ({
          ...target,
          status: UserStatus.SUSPENDED,
        }),
      ],
      [
        'membership_ineligible',
        (target: ReassignmentTargetRecord) => ({
          ...target,
          memberships: target.memberships.map((membership) => ({
            ...membership,
            status: MembershipStatus.SUSPENDED,
          })),
        }),
      ],
      [
        'profile_missing',
        (target: ReassignmentTargetRecord) => ({
          ...target,
          teacherProfiles: [],
        }),
      ],
      [
        'employment_inactive',
        (target: ReassignmentTargetRecord) => ({
          ...target,
          teacherProfiles: target.teacherProfiles.map((profile) => ({
            ...profile,
            employmentStatus: TeacherEmploymentStatus.INACTIVE,
          })),
        }),
      ],
      [
        'profile_incomplete',
        (target: ReassignmentTargetRecord) => ({
          ...target,
          teacherProfiles: target.teacherProfiles.map((profile) => ({
            ...profile,
            teacherCode: null,
          })),
        }),
      ],
    ])('returns the safe %s reason', (reasonCode, mutate) => {
      expect(
        evaluateReassignmentTargetEligibility({
          schoolId,
          target: mutate(buildEligibleTarget()) as ReassignmentTargetRecord,
        }),
      ).toEqual({ eligible: false, reasonCode });
    });
  });

  describe('impact analysis', () => {
    it('classifies lifecycle states, simulates target conflicts, and blocks mutable work', () => {
      const analysis = new TeacherAllocationReassignmentImpactService().analyze(
        buildSnapshot(),
      );

      expect(analysis.decision).toBe('blocked');
      expect(analysis.canReassign).toBe(false);
      expect(analysis.impact).toMatchObject({
        timetable: {
          draft: 1,
          active: 1,
          cancelled: 1,
          targetTeacherConflicts: 1,
        },
        lessonPlans: { draft: 1, active: 1, archived: 1 },
        homework: {
          draft: 1,
          published: 1,
          closed: 1,
          cancelled: 1,
          archived: 1,
        },
        reinforcement: {
          notCompleted: 1,
          inProgress: 1,
          underReview: 1,
          completed: 1,
          cancelled: 1,
        },
        announcements: {
          draft: 1,
          scheduled: 1,
          published: 1,
          archived: 1,
          cancelled: 1,
        },
      });
      expect(analysis.blockers.map((blocker) => blocker.code)).toEqual([
        'target_teacher_conflict',
        'active_reinforcement_tasks',
        'mutable_teacher_announcements',
      ]);
      expect(analysis.automaticActions).toEqual([
        {
          domain: 'timetable',
          action: 'handoff_current_responsibility',
          count: 2,
        },
        {
          domain: 'lesson_plans',
          action: 'handoff_current_responsibility',
          count: 2,
        },
        {
          domain: 'homework',
          action: 'handoff_current_responsibility',
          count: 3,
        },
      ]);
      expect(analysis.historicalRecords).toHaveLength(5);
    });

    it('blocks selecting the allocation current Teacher', () => {
      const snapshot = buildSnapshot();
      snapshot.target = {
        ...buildEligibleTarget(),
        id: currentTeacherId,
      };

      const analysis = new TeacherAllocationReassignmentImpactService().analyze(
        snapshot,
      );

      expect(analysis.blockers).toContainEqual({
        domain: 'allocation',
        code: 'target_is_current_teacher',
        count: 1,
      });
      expect(analysis.decision).toBe('blocked');
      expect(analysis.canReassign).toBe(false);
    });

    it('blocks an exact allocation already owned by the target Teacher', () => {
      const snapshot = buildSnapshot();
      snapshot.duplicateTargetAllocationId =
        '30000000-0000-4000-8000-000000000097';

      const analysis = new TeacherAllocationReassignmentImpactService().analyze(
        snapshot,
      );

      expect(analysis.blockers).toContainEqual({
        domain: 'allocation',
        code: 'target_already_allocated',
        count: 1,
      });
    });

    it('does not block co-teaching by a Teacher other than the requested target', () => {
      const snapshot = buildSnapshot();
      snapshot.timetableEntries.push(
        timetableEntry({
          id: '30000000-0000-4000-8000-000000000096',
          allocationId: '30000000-0000-4000-8000-000000000095',
          teacherUserId: '30000000-0000-4000-8000-000000000094',
          classroomId,
          status: TimetableEntryStatus.ACTIVE,
          startTime: '13:00',
          endTime: '14:00',
        }),
      );

      const analysis = new TeacherAllocationReassignmentImpactService().analyze(
        snapshot,
      );

      expect(
        analysis.blockers.some(
          (blocker) => blocker.code === 'target_already_allocated',
        ),
      ).toBe(false);
    });

    it('blocks a multi-scope active reinforcement task when one assignment intersects', () => {
      const snapshot = buildSnapshot();
      const task = snapshot.reinforcementTasks.find(
        (item) => item.status === ReinforcementTaskStatus.NOT_COMPLETED,
      );
      expect(task).toBeDefined();
      if (!task) throw new Error('Expected active reinforcement fixture');
      const matchingAssignment = task.assignments[0];
      task.assignments = [
        {
          ...matchingAssignment,
          id: '41000000-0000-4000-8000-000000000099',
          enrollment: {
            ...matchingAssignment.enrollment,
            classroomId: '41000000-0000-4000-8000-000000000098',
          },
        },
        matchingAssignment,
      ];
      snapshot.reinforcementTasks = [task];

      const analysis = new TeacherAllocationReassignmentImpactService().analyze(
        snapshot,
      );

      expect(analysis.blockers).toContainEqual({
        domain: 'reinforcement',
        code: 'active_reinforcement_tasks',
        count: 1,
        statuses: { NOT_COMPLETED: 1 },
      });
    });
  });
});

function buildEligibleTarget(): ReassignmentTargetRecord {
  return {
    id: targetTeacherId,
    firstName: 'Target',
    lastName: 'Teacher',
    userType: UserType.TEACHER,
    status: UserStatus.INVITED,
    deletedAt: null,
    updatedAt: now,
    memberships: [
      {
        id: '20000000-0000-4000-8000-000000000001',
        userId: targetTeacherId,
        organizationId: '20000000-0000-4000-8000-000000000002',
        schoolId,
        roleId: '20000000-0000-4000-8000-000000000003',
        userType: UserType.TEACHER,
        status: MembershipStatus.ACTIVE,
        startedAt: now,
        endedAt: null,
        deletedAt: null,
        updatedAt: now,
        role: {
          id: '20000000-0000-4000-8000-000000000003',
          key: 'teacher',
          schoolId: null,
          deletedAt: null,
        },
      },
    ],
    teacherProfiles: [
      {
        id: '20000000-0000-4000-8000-000000000004',
        schoolId,
        userId: targetTeacherId,
        teacherCode: 'T-002',
        firstNameAr: 'معلم',
        lastNameAr: 'مستهدف',
        firstNameEn: 'Target',
        lastNameEn: 'Teacher',
        gender: TeacherGender.MALE,
        employmentStatus: TeacherEmploymentStatus.ACTIVE,
        deletedAt: null,
        updatedAt: now,
      },
    ],
  };
}

function buildSnapshot(): TeacherAllocationReassignmentSnapshot {
  const timetableEntries = [
    timetableEntry({
      id: '30000000-0000-4000-8000-000000000001',
      allocationId,
      teacherUserId: currentTeacherId,
      classroomId,
      status: TimetableEntryStatus.DRAFT,
      startTime: '09:00',
      endTime: '10:00',
    }),
    timetableEntry({
      id: '30000000-0000-4000-8000-000000000004',
      allocationId,
      teacherUserId: currentTeacherId,
      classroomId,
      status: TimetableEntryStatus.ACTIVE,
      startTime: '11:00',
      endTime: '12:00',
    }),
    timetableEntry({
      id: '30000000-0000-4000-8000-000000000002',
      allocationId,
      teacherUserId: currentTeacherId,
      classroomId,
      status: TimetableEntryStatus.CANCELLED,
      startTime: '09:00',
      endTime: '10:00',
    }),
    timetableEntry({
      id: '30000000-0000-4000-8000-000000000003',
      allocationId: '30000000-0000-4000-8000-000000000099',
      teacherUserId: targetTeacherId,
      classroomId: '30000000-0000-4000-8000-000000000098',
      status: TimetableEntryStatus.ACTIVE,
      startTime: '09:30',
      endTime: '10:30',
    }),
  ];
  const reinforcementTasks = Object.values(ReinforcementTaskStatus).map(
    (status, index) => ({
      id: `40000000-0000-4000-8000-00000000000${index}`,
      academicYearId,
      termId,
      subjectId,
      assignedById: currentTeacherId,
      createdById: currentTeacherId,
      status,
      updatedAt: now,
      assignments: [
        {
          id: `41000000-0000-4000-8000-00000000000${index}`,
          status,
          updatedAt: now,
          enrollment: {
            academicYearId,
            termId,
            classroomId,
            status: StudentEnrollmentStatus.ACTIVE,
            deletedAt: null,
            updatedAt: now,
            student: {
              status: StudentStatus.ACTIVE,
              deletedAt: null,
              updatedAt: now,
            },
          },
        },
      ],
    }),
  );
  const announcementStatuses = Object.values(CommunicationAnnouncementStatus);
  const announcements = announcementStatuses.map((status, index) => ({
    id: `50000000-0000-4000-8000-00000000000${index}`,
    status,
    createdById: currentTeacherId,
    metadata: buildTeacherAnnouncementMetadata({
      target: {
        type: 'classroom',
        classId: allocationId,
        classroomId,
        label: 'Class A',
      },
      audience: 'students',
    }),
    updatedAt: now,
  }));

  return {
    allocation: {
      id: allocationId,
      schoolId,
      teacherUserId: currentTeacherId,
      subjectId,
      classroomId,
      termId,
      createdAt: now,
      updatedAt: now,
      teacherUser: {
        id: currentTeacherId,
        firstName: 'Current',
        lastName: 'Teacher',
      },
      term: {
        id: termId,
        schoolId,
        nameAr: 'الفصل',
        nameEn: 'Term',
        startDate: now,
        endDate: now,
        isActive: true,
        deletedAt: null,
        academicYearId,
        academicYear: { isActive: true, deletedAt: null },
      },
    },
    target: buildEligibleTarget(),
    duplicateTargetAllocationId: null,
    timetableEntries,
    lessonPlans: Object.values(LessonPlanStatus).map((status, index) => ({
      id: `60000000-0000-4000-8000-00000000000${index}`,
      status,
      teacherUserId: currentTeacherId,
      createdByUserId: currentTeacherId,
      updatedByUserId: null,
      updatedAt: now,
    })),
    homeworkAssignments: Object.values(HomeworkAssignmentStatus).map(
      (status, index) => ({
        id: `70000000-0000-4000-8000-00000000000${index}`,
        status,
        teacherUserId: currentTeacherId,
        createdByUserId: currentTeacherId,
        publishedByUserId: null,
        updatedAt: now,
      }),
    ),
    reinforcementTasks,
    announcements,
  } as TeacherAllocationReassignmentSnapshot;
}

function timetableEntry(input: {
  id: string;
  allocationId: string;
  teacherUserId: string;
  classroomId: string;
  status: TimetableEntryStatus;
  startTime: string;
  endTime: string;
}) {
  return {
    id: input.id,
    schoolId,
    termId,
    timetableConfigId: '80000000-0000-4000-8000-000000000001',
    teacherSubjectAllocationId: input.allocationId,
    classroomId: input.classroomId,
    teacherUserId: input.teacherUserId,
    roomId: null,
    dayOfWeek: 1,
    periodId: input.id,
    status: input.status,
    updatedAt: now,
    period: {
      startTime: input.startTime,
      endTime: input.endTime,
      updatedAt: now,
    },
    timetableConfig: {
      status: 'DRAFT' as const,
      updatedAt: now,
      publications: [],
    },
  };
}
