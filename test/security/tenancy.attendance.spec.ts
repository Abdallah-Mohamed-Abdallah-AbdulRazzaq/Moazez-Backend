import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceExcuseStatus,
  AttendanceExcuseType,
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  DailyComputationStrategy,
  FileVisibility,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  TimetableConfigStatus,
  TimetablePeriodType,
  TimetableScopeType,
  UserType,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';

const TENANT_B_ORG_SLUG_PREFIX = 'attendance-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG_PREFIX = 'attendance-tenancy-school-b';
const ATTENDANCE_EXCUSE_ATTACHMENT_RESOURCE_TYPE = 'attendance.excuse_request';

jest.setTimeout(30000);

describe('Attendance policies tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let tenantBSchoolId: string;
  let tenantBOrganizationId: string;
  let demoYearId: string;
  let demoTermId: string;
  let demoPolicyId: string;
  let tenantBYearId: string;
  let tenantBTermId: string;
  let tenantBPolicyId: string;
  let demoStageId: string;
  let demoGradeId: string;
  let demoSectionId: string;
  let demoClassroomId: string;
  let demoStudentId: string;
  let demoEnrollmentId: string;
  let demoSessionId: string;
  let demoDraftEntryId: string;
  let demoSubmittedSessionId: string;
  let demoSubmittedEntryId: string;
  let tenantBStageId: string;
  let tenantBGradeId: string;
  let tenantBSectionId: string;
  let tenantBClassroomId: string;
  let tenantBTimetableConfigId: string;
  let tenantBTimetablePeriodId: string;
  let demoSelectedPeriodPatchPolicyId: string;
  let demoUnsafeForeignPeriodPolicyId: string;
  let tenantBStudentId: string;
  let tenantBEnrollmentId: string;
  let tenantBSessionId: string;
  let tenantBEntryId: string;
  let tenantBSubmittedSessionId: string;
  let tenantBSubmittedEntryId: string;
  let tenantBOnlyReviewSessionId: string;
  let tenantBOnlyReviewEntryId: string;
  let demoExcuseRequestId: string;
  let tenantBExcuseRequestId: string;
  let demoNoMatchingExcuseRequestId: string;
  let demoRequireAttachmentPolicyId: string;
  let demoRequireAttachmentSessionId: string;
  let demoRequireAttachmentEntryId: string;
  let demoRequireAttachmentExcuseRequestId: string;
  let demoFileId: string;
  let tenantBFileId: string;
  let demoExcuseAttachmentId: string;
  let tenantBExcuseAttachmentId: string;

  const testRunId = randomUUID().replace(/-/g, '').slice(0, 12);
  const testSuffix = `attendance-security-${testRunId}`;
  const tenantBOrgSlug = `${TENANT_B_ORG_SLUG_PREFIX}-${testRunId}`;
  const tenantBSchoolSlug = `${TENANT_B_SCHOOL_SLUG_PREFIX}-${testRunId}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const schoolAdminRole = await prisma.role.findFirst({
      where: { key: 'school_admin', schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!schoolAdminRole) {
      throw new Error(
        'school_admin system role not found - run `npm run seed` first.',
      );
    }

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo admin not found - run `npm run seed` first.');
    }

    await prisma.membership.updateMany({
      where: {
        userId: demoAdmin.id,
        schoolId: demoSchoolId,
        deletedAt: null,
      },
      data: {
        roleId: schoolAdminRole.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
      },
    });

    const orgB = await prisma.organization.create({
      data: {
        slug: tenantBOrgSlug,
        name: `Attendance Tenancy Org B ${testRunId}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    tenantBOrganizationId = orgB.id;

    const schoolB = await prisma.school.create({
      data: {
        organizationId: orgB.id,
        slug: tenantBSchoolSlug,
        name: `Attendance Tenancy School B ${testRunId}`,
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;

    const demoYear = await prisma.academicYear.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${testSuffix}-year-a-ar`,
        nameEn: `${testSuffix}-year-a`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    demoYearId = demoYear.id;

    const demoTerm = await prisma.term.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        nameAr: `${testSuffix}-term-a-ar`,
        nameEn: `${testSuffix}-term-a`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    demoTermId = demoTerm.id;

    const tenantBYear = await prisma.academicYear.create({
      data: {
        schoolId: tenantBSchoolId,
        nameAr: `${testSuffix}-year-b-ar`,
        nameEn: `${testSuffix}-year-b`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    tenantBYearId = tenantBYear.id;

    const tenantBTerm = await prisma.term.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        nameAr: `${testSuffix}-term-b-ar`,
        nameEn: `${testSuffix}-term-b`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    tenantBTermId = tenantBTerm.id;

    const demoPolicy = await prisma.attendancePolicy.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        scopeType: AttendanceScopeType.SCHOOL,
        scopeKey: 'school',
        nameAr: `${testSuffix}-policy-a-ar`,
        nameEn: `${testSuffix}-policy-a`,
        mode: AttendanceMode.DAILY,
        dailyComputationStrategy: DailyComputationStrategy.MANUAL,
      },
      select: { id: true },
    });
    demoPolicyId = demoPolicy.id;

    const tenantBPolicy = await prisma.attendancePolicy.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        scopeType: AttendanceScopeType.SCHOOL,
        scopeKey: 'school',
        nameAr: `${testSuffix}-policy-b-ar`,
        nameEn: `${testSuffix}-policy-b`,
        mode: AttendanceMode.DAILY,
        dailyComputationStrategy: DailyComputationStrategy.MANUAL,
      },
      select: { id: true },
    });
    tenantBPolicyId = tenantBPolicy.id;

    const demoStage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${testSuffix}-stage-a-ar`,
        nameEn: `${testSuffix}-stage-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoStageId = demoStage.id;

    const demoGrade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: demoStageId,
        nameAr: `${testSuffix}-grade-a-ar`,
        nameEn: `${testSuffix}-grade-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoGradeId = demoGrade.id;

    const demoSection = await prisma.section.create({
      data: {
        schoolId: demoSchoolId,
        gradeId: demoGradeId,
        nameAr: `${testSuffix}-section-a-ar`,
        nameEn: `${testSuffix}-section-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoSectionId = demoSection.id;

    const demoClassroom = await prisma.classroom.create({
      data: {
        schoolId: demoSchoolId,
        sectionId: demoSectionId,
        nameAr: `${testSuffix}-classroom-a-ar`,
        nameEn: `${testSuffix}-classroom-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoClassroomId = demoClassroom.id;

    const demoStudent = await prisma.student.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        firstName: `${testSuffix}-student-a`,
        lastName: 'RollCall',
      },
      select: { id: true },
    });
    demoStudentId = demoStudent.id;

    const demoEnrollment = await prisma.enrollment.create({
      data: {
        schoolId: demoSchoolId,
        studentId: demoStudentId,
        academicYearId: demoYearId,
        termId: demoTermId,
        classroomId: demoClassroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    demoEnrollmentId = demoEnrollment.id;

    const tenantBStage = await prisma.stage.create({
      data: {
        schoolId: tenantBSchoolId,
        nameAr: `${testSuffix}-stage-b-ar`,
        nameEn: `${testSuffix}-stage-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBStageId = tenantBStage.id;

    const tenantBGrade = await prisma.grade.create({
      data: {
        schoolId: tenantBSchoolId,
        stageId: tenantBStageId,
        nameAr: `${testSuffix}-grade-b-ar`,
        nameEn: `${testSuffix}-grade-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBGradeId = tenantBGrade.id;

    const tenantBSection = await prisma.section.create({
      data: {
        schoolId: tenantBSchoolId,
        gradeId: tenantBGradeId,
        nameAr: `${testSuffix}-section-b-ar`,
        nameEn: `${testSuffix}-section-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBSectionId = tenantBSection.id;

    const tenantBClassroom = await prisma.classroom.create({
      data: {
        schoolId: tenantBSchoolId,
        sectionId: tenantBSectionId,
        nameAr: `${testSuffix}-classroom-b-ar`,
        nameEn: `${testSuffix}-classroom-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBClassroomId = tenantBClassroom.id;

    const tenantBTimetableConfig = await prisma.timetableConfig.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        name: `${testSuffix}-timetable-b`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: `classroom:${tenantBClassroomId}`,
        gradeId: tenantBGradeId,
        sectionId: tenantBSectionId,
        classroomId: tenantBClassroomId,
        status: TimetableConfigStatus.ACTIVE,
      },
      select: { id: true },
    });
    tenantBTimetableConfigId = tenantBTimetableConfig.id;

    const tenantBTimetablePeriod = await prisma.timetablePeriod.create({
      data: {
        schoolId: tenantBSchoolId,
        timetableConfigId: tenantBTimetableConfigId,
        periodIndex: 1,
        label: `${testSuffix}-period-b`,
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    tenantBTimetablePeriodId = tenantBTimetablePeriod.id;

    const tenantBStudent = await prisma.student.create({
      data: {
        schoolId: tenantBSchoolId,
        organizationId: tenantBOrganizationId,
        firstName: `${testSuffix}-student-b`,
        lastName: 'RollCall',
      },
      select: { id: true },
    });
    tenantBStudentId = tenantBStudent.id;

    const tenantBEnrollment = await prisma.enrollment.create({
      data: {
        schoolId: tenantBSchoolId,
        studentId: tenantBStudentId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        classroomId: tenantBClassroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    tenantBEnrollmentId = tenantBEnrollment.id;

    const demoSession = await prisma.attendanceSession.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        date: new Date('2026-09-15T00:00:00.000Z'),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${demoClassroomId}`,
        stageId: demoStageId,
        gradeId: demoGradeId,
        sectionId: demoSectionId,
        classroomId: demoClassroomId,
        mode: AttendanceMode.DAILY,
        periodKey: 'daily',
        policyId: demoPolicyId,
        status: AttendanceSessionStatus.DRAFT,
      },
      select: { id: true },
    });
    demoSessionId = demoSession.id;

    const demoDraftEntry = await prisma.attendanceEntry.create({
      data: {
        schoolId: demoSchoolId,
        sessionId: demoSessionId,
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
        status: AttendanceStatus.LATE,
        lateMinutes: 5,
      },
      select: { id: true },
    });
    demoDraftEntryId = demoDraftEntry.id;

    const tenantBSession = await prisma.attendanceSession.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        date: new Date('2026-09-15T00:00:00.000Z'),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${tenantBClassroomId}`,
        stageId: tenantBStageId,
        gradeId: tenantBGradeId,
        sectionId: tenantBSectionId,
        classroomId: tenantBClassroomId,
        mode: AttendanceMode.DAILY,
        periodKey: 'daily',
        policyId: tenantBPolicyId,
        status: AttendanceSessionStatus.DRAFT,
      },
      select: { id: true },
    });
    tenantBSessionId = tenantBSession.id;

    const tenantBEntry = await prisma.attendanceEntry.create({
      data: {
        schoolId: tenantBSchoolId,
        sessionId: tenantBSessionId,
        studentId: tenantBStudentId,
        enrollmentId: tenantBEnrollmentId,
        status: AttendanceStatus.LATE,
        lateMinutes: 9,
      },
      select: { id: true },
    });
    tenantBEntryId = tenantBEntry.id;

    const demoSubmittedSession = await prisma.attendanceSession.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        date: new Date('2026-09-16T00:00:00.000Z'),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${demoClassroomId}`,
        stageId: demoStageId,
        gradeId: demoGradeId,
        sectionId: demoSectionId,
        classroomId: demoClassroomId,
        mode: AttendanceMode.DAILY,
        periodKey: 'daily',
        policyId: demoPolicyId,
        status: AttendanceSessionStatus.SUBMITTED,
        submittedAt: new Date('2026-09-16T07:20:00.000Z'),
      },
      select: { id: true },
    });
    demoSubmittedSessionId = demoSubmittedSession.id;

    const demoSubmittedEntry = await prisma.attendanceEntry.create({
      data: {
        schoolId: demoSchoolId,
        sessionId: demoSubmittedSessionId,
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
        status: AttendanceStatus.ABSENT,
      },
      select: { id: true },
    });
    demoSubmittedEntryId = demoSubmittedEntry.id;

    const tenantBSubmittedSession = await prisma.attendanceSession.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        date: new Date('2026-09-16T00:00:00.000Z'),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${tenantBClassroomId}`,
        stageId: tenantBStageId,
        gradeId: tenantBGradeId,
        sectionId: tenantBSectionId,
        classroomId: tenantBClassroomId,
        mode: AttendanceMode.DAILY,
        periodKey: 'daily',
        policyId: tenantBPolicyId,
        status: AttendanceSessionStatus.SUBMITTED,
        submittedAt: new Date('2026-09-16T07:20:00.000Z'),
      },
      select: { id: true },
    });
    tenantBSubmittedSessionId = tenantBSubmittedSession.id;

    const tenantBSubmittedEntry = await prisma.attendanceEntry.create({
      data: {
        schoolId: tenantBSchoolId,
        sessionId: tenantBSubmittedSessionId,
        studentId: tenantBStudentId,
        enrollmentId: tenantBEnrollmentId,
        status: AttendanceStatus.ABSENT,
      },
      select: { id: true },
    });
    tenantBSubmittedEntryId = tenantBSubmittedEntry.id;

    const tenantBOnlyReviewSession = await prisma.attendanceSession.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        date: new Date('2026-09-18T00:00:00.000Z'),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${tenantBClassroomId}`,
        stageId: tenantBStageId,
        gradeId: tenantBGradeId,
        sectionId: tenantBSectionId,
        classroomId: tenantBClassroomId,
        mode: AttendanceMode.DAILY,
        periodKey: `${testSuffix}-tenant-b-only`,
        policyId: tenantBPolicyId,
        status: AttendanceSessionStatus.SUBMITTED,
        submittedAt: new Date('2026-09-18T07:20:00.000Z'),
      },
      select: { id: true },
    });
    tenantBOnlyReviewSessionId = tenantBOnlyReviewSession.id;

    const tenantBOnlyReviewEntry = await prisma.attendanceEntry.create({
      data: {
        schoolId: tenantBSchoolId,
        sessionId: tenantBOnlyReviewSessionId,
        studentId: tenantBStudentId,
        enrollmentId: tenantBEnrollmentId,
        status: AttendanceStatus.ABSENT,
      },
      select: { id: true },
    });
    tenantBOnlyReviewEntryId = tenantBOnlyReviewEntry.id;

    const demoExcuseRequest = await prisma.attendanceExcuseRequest.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        studentId: demoStudentId,
        type: AttendanceExcuseType.ABSENCE,
        status: AttendanceExcuseStatus.PENDING,
        dateFrom: new Date('2026-09-17T00:00:00.000Z'),
        dateTo: new Date('2026-09-17T00:00:00.000Z'),
        reasonEn: `${testSuffix}-excuse-a`,
      },
      select: { id: true },
    });
    demoExcuseRequestId = demoExcuseRequest.id;

    const demoNoMatchingExcuseRequest =
      await prisma.attendanceExcuseRequest.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId: demoYearId,
          termId: demoTermId,
          studentId: demoStudentId,
          type: AttendanceExcuseType.ABSENCE,
          status: AttendanceExcuseStatus.PENDING,
          dateFrom: new Date('2026-09-18T00:00:00.000Z'),
          dateTo: new Date('2026-09-18T00:00:00.000Z'),
          selectedPeriodKeys: [`${testSuffix}-tenant-b-only`],
          reasonEn: `${testSuffix}-excuse-a-b-session-only`,
        },
        select: { id: true },
      });
    demoNoMatchingExcuseRequestId = demoNoMatchingExcuseRequest.id;

    const demoRequireAttachmentPolicy = await prisma.attendancePolicy.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        scopeType: AttendanceScopeType.SCHOOL,
        scopeKey: 'school',
        nameAr: `${testSuffix}-policy-a-attachment-ar`,
        nameEn: `${testSuffix}-policy-a-attachment`,
        mode: AttendanceMode.DAILY,
        dailyComputationStrategy: DailyComputationStrategy.MANUAL,
        requireExcuseAttachment: true,
      },
      select: { id: true },
    });
    demoRequireAttachmentPolicyId = demoRequireAttachmentPolicy.id;

    const demoRequireAttachmentSession = await prisma.attendanceSession.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        date: new Date('2026-09-19T00:00:00.000Z'),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${demoClassroomId}`,
        stageId: demoStageId,
        gradeId: demoGradeId,
        sectionId: demoSectionId,
        classroomId: demoClassroomId,
        mode: AttendanceMode.DAILY,
        periodKey: `${testSuffix}-requires-attachment`,
        policyId: demoRequireAttachmentPolicyId,
        status: AttendanceSessionStatus.SUBMITTED,
        submittedAt: new Date('2026-09-19T07:20:00.000Z'),
      },
      select: { id: true },
    });
    demoRequireAttachmentSessionId = demoRequireAttachmentSession.id;

    const demoRequireAttachmentEntry = await prisma.attendanceEntry.create({
      data: {
        schoolId: demoSchoolId,
        sessionId: demoRequireAttachmentSessionId,
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
        status: AttendanceStatus.ABSENT,
      },
      select: { id: true },
    });
    demoRequireAttachmentEntryId = demoRequireAttachmentEntry.id;

    const demoRequireAttachmentExcuseRequest =
      await prisma.attendanceExcuseRequest.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId: demoYearId,
          termId: demoTermId,
          studentId: demoStudentId,
          type: AttendanceExcuseType.ABSENCE,
          status: AttendanceExcuseStatus.PENDING,
          dateFrom: new Date('2026-09-19T00:00:00.000Z'),
          dateTo: new Date('2026-09-19T00:00:00.000Z'),
          selectedPeriodKeys: [`${testSuffix}-requires-attachment`],
          reasonEn: `${testSuffix}-excuse-a-requires-attachment`,
        },
        select: { id: true },
      });
    demoRequireAttachmentExcuseRequestId =
      demoRequireAttachmentExcuseRequest.id;

    const tenantBExcuseRequest = await prisma.attendanceExcuseRequest.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        studentId: tenantBStudentId,
        type: AttendanceExcuseType.ABSENCE,
        status: AttendanceExcuseStatus.PENDING,
        dateFrom: new Date('2026-09-17T00:00:00.000Z'),
        dateTo: new Date('2026-09-17T00:00:00.000Z'),
        reasonEn: `${testSuffix}-excuse-b`,
      },
      select: { id: true },
    });
    tenantBExcuseRequestId = tenantBExcuseRequest.id;

    const demoFile = await prisma.file.create({
      data: {
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        uploaderId: null,
        bucket: 'attendance-security',
        objectKey: `${testSuffix}/school-a-medical-note.pdf`,
        originalName: 'school-a-medical-note.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(4096),
        checksumSha256: null,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    demoFileId = demoFile.id;

    const tenantBFile = await prisma.file.create({
      data: {
        organizationId: tenantBOrganizationId,
        schoolId: tenantBSchoolId,
        uploaderId: null,
        bucket: 'attendance-security',
        objectKey: `${testSuffix}/school-b-medical-note.pdf`,
        originalName: 'school-b-medical-note.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(2048),
        checksumSha256: null,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    tenantBFileId = tenantBFile.id;

    const demoExcuseAttachment = await prisma.attachment.create({
      data: {
        fileId: demoFileId,
        schoolId: demoSchoolId,
        resourceType: ATTENDANCE_EXCUSE_ATTACHMENT_RESOURCE_TYPE,
        resourceId: demoExcuseRequestId,
        createdById: null,
      },
      select: { id: true },
    });
    demoExcuseAttachmentId = demoExcuseAttachment.id;

    const tenantBExcuseAttachment = await prisma.attachment.create({
      data: {
        fileId: tenantBFileId,
        schoolId: tenantBSchoolId,
        resourceType: ATTENDANCE_EXCUSE_ATTACHMENT_RESOURCE_TYPE,
        resourceId: tenantBExcuseRequestId,
        createdById: null,
      },
      select: { id: true },
    });
    tenantBExcuseAttachmentId = tenantBExcuseAttachment.id;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      try {
        await cleanupFixtureData();
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  async function cleanupFixtureData(): Promise<void> {
    await deleteAttendanceExcuseRequestSessions();
    await deleteSchoolScopedRows<Prisma.AttachmentWhereInput>(
      prisma.attachment.deleteMany.bind(prisma.attachment),
      presentIds([demoExcuseAttachmentId, tenantBExcuseAttachmentId]),
    );
    await deleteSchoolScopedRows<Prisma.FileWhereInput>(
      prisma.file.deleteMany.bind(prisma.file),
      presentIds([demoFileId, tenantBFileId]),
    );
    await deleteSchoolScopedRows<Prisma.AttendanceExcuseRequestWhereInput>(
      prisma.attendanceExcuseRequest.deleteMany.bind(
        prisma.attendanceExcuseRequest,
      ),
      presentIds([
        demoExcuseRequestId,
        tenantBExcuseRequestId,
        demoNoMatchingExcuseRequestId,
        demoRequireAttachmentExcuseRequestId,
      ]),
    );
    await deleteSchoolScopedRows<Prisma.AttendanceEntryWhereInput>(
      prisma.attendanceEntry.deleteMany.bind(prisma.attendanceEntry),
      presentIds([
        demoDraftEntryId,
        demoSubmittedEntryId,
        demoRequireAttachmentEntryId,
        tenantBEntryId,
        tenantBSubmittedEntryId,
        tenantBOnlyReviewEntryId,
      ]),
    );
    await deleteSchoolScopedRows<Prisma.AttendanceSessionWhereInput>(
      prisma.attendanceSession.deleteMany.bind(prisma.attendanceSession),
      presentIds([
        demoSessionId,
        demoSubmittedSessionId,
        demoRequireAttachmentSessionId,
        tenantBSessionId,
        tenantBSubmittedSessionId,
        tenantBOnlyReviewSessionId,
      ]),
    );
    await deleteSchoolScopedRows<Prisma.AttendancePolicyWhereInput>(
      prisma.attendancePolicy.deleteMany.bind(prisma.attendancePolicy),
      presentIds([
        demoPolicyId,
        tenantBPolicyId,
        demoRequireAttachmentPolicyId,
        demoSelectedPeriodPatchPolicyId,
        demoUnsafeForeignPeriodPolicyId,
      ]),
    );
    await deleteSchoolScopedRows<Prisma.TimetablePeriodWhereInput>(
      prisma.timetablePeriod.deleteMany.bind(prisma.timetablePeriod),
      presentIds([tenantBTimetablePeriodId]),
    );
    await deleteSchoolScopedRows<Prisma.TimetableConfigWhereInput>(
      prisma.timetableConfig.deleteMany.bind(prisma.timetableConfig),
      presentIds([tenantBTimetableConfigId]),
    );
    await deleteSchoolScopedRows<Prisma.EnrollmentWhereInput>(
      prisma.enrollment.deleteMany.bind(prisma.enrollment),
      presentIds([demoEnrollmentId, tenantBEnrollmentId]),
    );
    await deleteSchoolScopedRows<Prisma.StudentWhereInput>(
      prisma.student.deleteMany.bind(prisma.student),
      presentIds([demoStudentId, tenantBStudentId]),
    );
    await deleteSchoolScopedRows<Prisma.ClassroomWhereInput>(
      prisma.classroom.deleteMany.bind(prisma.classroom),
      presentIds([demoClassroomId, tenantBClassroomId]),
    );
    await deleteSchoolScopedRows<Prisma.SectionWhereInput>(
      prisma.section.deleteMany.bind(prisma.section),
      presentIds([demoSectionId, tenantBSectionId]),
    );
    await deleteSchoolScopedRows<Prisma.GradeWhereInput>(
      prisma.grade.deleteMany.bind(prisma.grade),
      presentIds([demoGradeId, tenantBGradeId]),
    );
    await deleteSchoolScopedRows<Prisma.StageWhereInput>(
      prisma.stage.deleteMany.bind(prisma.stage),
      presentIds([demoStageId, tenantBStageId]),
    );
    await deleteSchoolScopedRows<Prisma.TermWhereInput>(
      prisma.term.deleteMany.bind(prisma.term),
      presentIds([demoTermId, tenantBTermId]),
    );
    await deleteSchoolScopedRows<Prisma.AcademicYearWhereInput>(
      prisma.academicYear.deleteMany.bind(prisma.academicYear),
      presentIds([demoYearId, tenantBYearId]),
    );

    if (tenantBSchoolId) {
      await prisma.school.deleteMany({ where: { id: tenantBSchoolId } });
    }
    if (tenantBOrganizationId) {
      await prisma.organization.deleteMany({
        where: { id: tenantBOrganizationId },
      });
    }
  }

  async function deleteAttendanceExcuseRequestSessions(): Promise<void> {
    const filters: Prisma.AttendanceExcuseRequestSessionWhereInput[] = [];

    if (tenantBSchoolId) {
      filters.push({ schoolId: tenantBSchoolId });
    }

    const excuseRequestIds = presentIds([
      demoExcuseRequestId,
      tenantBExcuseRequestId,
      demoNoMatchingExcuseRequestId,
      demoRequireAttachmentExcuseRequestId,
    ]);
    if (excuseRequestIds.length > 0) {
      filters.push({ attendanceExcuseRequestId: { in: excuseRequestIds } });
    }

    const sessionIds = presentIds([
      demoSessionId,
      demoSubmittedSessionId,
      demoRequireAttachmentSessionId,
      tenantBSessionId,
      tenantBSubmittedSessionId,
      tenantBOnlyReviewSessionId,
    ]);
    if (sessionIds.length > 0) {
      filters.push({ attendanceSessionId: { in: sessionIds } });
    }

    if (filters.length > 0) {
      await prisma.attendanceExcuseRequestSession.deleteMany({
        where: { OR: filters },
      });
    }
  }

  async function deleteSchoolScopedRows<TWhere>(
    deleteMany: (args: { where: TWhere }) => Promise<unknown>,
    fixtureIds: string[],
  ): Promise<void> {
    const filters: Array<Record<string, unknown>> = [];

    if (tenantBSchoolId) {
      filters.push({ schoolId: tenantBSchoolId });
    }
    if (fixtureIds.length > 0) {
      filters.push({ id: { in: fixtureIds } });
    }

    if (filters.length > 0) {
      await deleteMany({ where: { OR: filters } as TWhere });
    }
  }

  function presentIds(values: Array<string | undefined>): string[] {
    return values.filter((value): value is string => Boolean(value));
  }

  function expectNoTenantLeak(payload: unknown): void {
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'deletedAt',
      'actorId',
      'raw Prisma',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  async function login(): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  it('lists only policies from the active school scope', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoPolicyId);
    expect(ids).not.toContain(tenantBPolicyId);
  });

  it('returns 404 when school A resolves effective policy for school B context', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/policies/effective`)
      .query({
        yearId: tenantBYearId,
        termId: tenantBTermId,
        scopeType: AttendanceScopeType.SCHOOL,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A updates a school B attendance policy', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/attendance/policies/${tenantBPolicyId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A deletes a school B attendance policy', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/attendance/policies/${tenantBPolicyId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it("rejects school B timetable period ids in school A policy selectedPeriodIds", async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/attendance/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        nameAr: `${testSuffix}-foreign-period-policy-ar`,
        nameEn: `${testSuffix}-foreign-period-policy`,
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: demoClassroomId,
        mode: AttendanceMode.PERIOD,
        dailyComputationStrategy: DailyComputationStrategy.MANUAL,
        selectedPeriodIds: [tenantBTimetablePeriodId],
        isActive: true,
      })
      .expect(400);

    expect(response.body?.error?.code).toBe('validation.failed');
    expect(response.body?.error?.details).toEqual(
      expect.objectContaining({
        field: 'selectedPeriodIds',
        invalidPeriodIds: [tenantBTimetablePeriodId],
        reason: 'not_found_or_outside_context',
      }),
    );
    expectNoTenantLeak(response.body);
  });

  it("rejects school B timetable period ids when patching school A policy selectedPeriodIds", async () => {
    const { accessToken } = await login();
    const patchPolicy = await prisma.attendancePolicy.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${demoClassroomId}`,
        stageId: demoStageId,
        gradeId: demoGradeId,
        sectionId: demoSectionId,
        classroomId: demoClassroomId,
        nameAr: `${testSuffix}-selected-period-patch-policy-ar`,
        nameEn: `${testSuffix}-selected-period-patch-policy`,
        mode: AttendanceMode.PERIOD,
        dailyComputationStrategy: DailyComputationStrategy.MANUAL,
        isActive: false,
      },
      select: { id: true },
    });
    demoSelectedPeriodPatchPolicyId = patchPolicy.id;

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/attendance/policies/${patchPolicy.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: demoClassroomId,
        selectedPeriodIds: [tenantBTimetablePeriodId],
      })
      .expect(400);

    expect(response.body?.error?.code).toBe('validation.failed');
    expect(response.body?.error?.details).toEqual(
      expect.objectContaining({
        field: 'selectedPeriodIds',
        invalidPeriodIds: [tenantBTimetablePeriodId],
        reason: 'not_found_or_outside_context',
      }),
    );
    expectNoTenantLeak(response.body);
  });

  it('rejects a manually seeded foreign timetable period id during school A roll-call resolution', async () => {
    const { accessToken } = await login();
    const periodKey = `${testSuffix}-foreign-period-roll-call`;

    const unsafePolicy = await prisma.attendancePolicy.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${demoClassroomId}`,
        stageId: demoStageId,
        gradeId: demoGradeId,
        sectionId: demoSectionId,
        classroomId: demoClassroomId,
        nameAr: `${testSuffix}-unsafe-foreign-period-policy-ar`,
        nameEn: `${testSuffix}-unsafe-foreign-period-policy`,
        mode: AttendanceMode.PERIOD,
        dailyComputationStrategy: DailyComputationStrategy.MANUAL,
        selectedPeriodIds: [tenantBTimetablePeriodId],
        isActive: true,
      },
      select: { id: true },
    });
    demoUnsafeForeignPeriodPolicyId = unsafePolicy.id;

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/attendance/roll-call/session/resolve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        date: '2026-09-19',
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: demoClassroomId,
        mode: AttendanceMode.PERIOD,
        periodKey,
        periodId: tenantBTimetablePeriodId,
      })
      .expect(400);

    expect(response.body?.error?.code).toBe('validation.failed');
    expect(response.body?.error?.details).toEqual(
      expect.objectContaining({
        field: 'periodId',
        mode: AttendanceMode.PERIOD,
        periodId: tenantBTimetablePeriodId,
        reason: 'not_found_or_outside_context',
      }),
    );
    expectNoTenantLeak(response.body);

    const sessionCount = await prisma.attendanceSession.count({
      where: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${demoClassroomId}`,
        mode: AttendanceMode.PERIOD,
        periodKey,
      },
    });
    expect(sessionCount).toBe(0);
  });

  it('lists only roll-call sessions from the active school scope', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/roll-call/sessions`)
      .query({ date: '2026-09-15' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoSessionId);
    expect(ids).not.toContain(tenantBSessionId);
  });

  it('returns 404 when school A reads school B roll-call session detail', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/roll-call/sessions/${tenantBSessionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A submits a school B roll-call session', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${tenantBSessionId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A unsubmits a school B roll-call session', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${tenantBSessionId}/unsubmit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A updates entries in school B roll-call session', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${tenantBSessionId}/entries`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        entries: [
          {
            studentId: tenantBStudentId,
            status: AttendanceStatus.PRESENT,
          },
        ],
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A updates a targeted entry in school B roll-call session', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${tenantBSessionId}/entries/${tenantBStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.PRESENT,
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A corrects a school B submitted session entry', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${tenantBSubmittedSessionId}/entries/${tenantBStudentId}/correct`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.PRESENT,
        correctionReason: `${testSuffix}-cross-school-correction`,
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A corrects using a school B student id in a school A session', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${demoSubmittedSessionId}/entries/${tenantBStudentId}/correct`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.PRESENT,
        correctionReason: `${testSuffix}-cross-school-student-correction`,
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A guesses school B entry ownership through correction ids', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${tenantBSubmittedSessionId}/entries/${demoStudentId}/correct`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.PRESENT,
        correctionReason: `${testSuffix}-cross-school-entry-correction`,
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('keeps regular bulk roll-call entry mutation locked for submitted sessions', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${demoSubmittedSessionId}/entries`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        entries: [
          {
            studentId: demoStudentId,
            status: AttendanceStatus.PRESENT,
          },
        ],
      })
      .expect(409);

    expect(response.body?.error?.code).toBe(
      'attendance.session.already_submitted',
    );
  });

  it('keeps regular targeted roll-call entry mutation locked for submitted sessions', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${demoSubmittedSessionId}/entries/${demoStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.PRESENT,
      })
      .expect(409);

    expect(response.body?.error?.code).toBe(
      'attendance.session.already_submitted',
    );
  });

  it('does not leak school B students through school A roster', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/roll-call/roster`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        date: '2026-09-15',
        scopeType: AttendanceScopeType.SCHOOL,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const studentIds = response.body.items.map(
      (item: { studentId: string }) => item.studentId,
    );
    expect(studentIds).toContain(demoStudentId);
    expect(studentIds).not.toContain(tenantBStudentId);
  });

  it('lists only excuse requests from the active school scope', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/excuse-requests`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoExcuseRequestId);
    expect(ids).not.toContain(tenantBExcuseRequestId);
  });

  it('returns 404 when school A reads a school B excuse request', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${tenantBExcuseRequestId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A updates a school B excuse request', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${tenantBExcuseRequestId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reasonEn: `${testSuffix}-updated` })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A deletes a school B excuse request', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${tenantBExcuseRequestId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A approves a school B excuse request', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${tenantBExcuseRequestId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ decisionNote: `${testSuffix}-approve-cross-school` })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A rejects a school B excuse request', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${tenantBExcuseRequestId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ decisionNote: `${testSuffix}-reject-cross-school` })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('does not allow school B submitted sessions to satisfy a school A approval', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${demoNoMatchingExcuseRequestId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ decisionNote: `${testSuffix}-school-b-session-only` })
      .expect(400);

    expect(response.body?.error?.code).toBe('validation.failed');

    const tenantBEntry = await prisma.attendanceEntry.findUnique({
      where: { id: tenantBOnlyReviewEntryId },
      select: { status: true },
    });
    expect(tenantBEntry?.status).toBe(AttendanceStatus.ABSENT);
  });

  it('does not allow school B attachments to satisfy school A attachment policy requirements', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${demoRequireAttachmentExcuseRequestId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ decisionNote: `${testSuffix}-requires-school-a-attachment` })
      .expect(422);

    expect(response.body?.error?.code).toBe(
      'attendance.entry.requires_excuse_attachment',
    );

    const demoEntry = await prisma.attendanceEntry.findUnique({
      where: { id: demoRequireAttachmentEntryId },
      select: { status: true },
    });
    expect(demoEntry?.status).toBe(AttendanceStatus.ABSENT);
  });

  it('returns 404 when school A creates an excuse for a school B student', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/attendance/excuse-requests`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        studentId: tenantBStudentId,
        type: AttendanceExcuseType.ABSENCE,
        dateFrom: '2026-09-17',
        dateTo: '2026-09-17',
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A links a school B file to a school A excuse request', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${demoExcuseRequestId}/attachments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fileIds: [tenantBFileId] })
      .expect(404);

    expect(response.body?.error?.code).toBe('files.not_found');
  });

  it('returns 404 when school A lists attachments for a school B excuse request', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${tenantBExcuseRequestId}/attachments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A deletes an attachment from a school B excuse request', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${tenantBExcuseRequestId}/attachments/${tenantBExcuseAttachmentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A deletes a school B attachment through a school A excuse request', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${demoExcuseRequestId}/attachments/${tenantBExcuseAttachmentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('lists school A absence incidents without leaking school B or draft incidents', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/absences`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        dateFrom: '2026-09-15',
        dateTo: '2026-09-16',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoSubmittedEntryId);
    expect(ids).not.toContain(demoDraftEntryId);
    expect(ids).not.toContain(tenantBEntryId);
    expect(ids).not.toContain(tenantBSubmittedEntryId);
  });

  it('returns 404 when school A marks a school B absence incident as excused', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/attendance/absences/${tenantBSubmittedEntryId}/excuse`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        excuseReason: `${testSuffix}-cross-school-absence-excuse`,
        correctionReason: `${testSuffix}-cross-school-absence-excuse`,
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A marks a school B absence incident as early leave', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/attendance/absences/${tenantBSubmittedEntryId}/early-leave`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        earlyLeaveMinutes: 11,
        correctionReason: `${testSuffix}-cross-school-absence-early-leave`,
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A guesses a school B entry id through absence corrections', async () => {
    const { accessToken } = await login();

    const excuseResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/attendance/absences/${tenantBEntryId}/excuse`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        excuseReason: `${testSuffix}-guessed-school-b-entry`,
        correctionReason: `${testSuffix}-guessed-school-b-entry`,
      })
      .expect(404);

    expect(excuseResponse.body?.error?.code).toBe('not_found');

    const earlyLeaveResponse = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/attendance/absences/${tenantBEntryId}/early-leave`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        earlyLeaveMinutes: 13,
        correctionReason: `${testSuffix}-guessed-school-b-entry`,
      })
      .expect(404);

    expect(earlyLeaveResponse.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A corrects a draft-session absence incident from the absence routes', async () => {
    const { accessToken } = await login();

    const excuseResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/attendance/absences/${demoDraftEntryId}/excuse`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        excuseReason: `${testSuffix}-draft-session-excuse`,
        correctionReason: `${testSuffix}-draft-session-excuse`,
      })
      .expect(404);

    expect(excuseResponse.body?.error?.code).toBe('not_found');

    const earlyLeaveResponse = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/attendance/absences/${demoDraftEntryId}/early-leave`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        earlyLeaveMinutes: 17,
        correctionReason: `${testSuffix}-draft-session-early-leave`,
      })
      .expect(404);

    expect(earlyLeaveResponse.body?.error?.code).toBe('not_found');
  });

  it('summarizes school A absence incidents without leaking school B or draft incidents', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/absences/summary`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        dateFrom: '2026-09-15',
        dateTo: '2026-09-16',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      totalIncidents: 1,
      absentCount: 1,
      lateCount: 0,
      earlyLeaveCount: 0,
      excusedCount: 0,
      affectedStudentsCount: 1,
    });
  });

  it('reports school A summary without leaking school B or draft sessions', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/summary`)
      .query({
        academicYearId: demoYearId,
        termId: demoTermId,
        dateFrom: '2026-09-15',
        dateTo: '2026-09-16',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      totalSessions: 1,
      totalEntries: 1,
      presentCount: 0,
      absentCount: 1,
      lateCount: 0,
      earlyLeaveCount: 0,
      excusedCount: 0,
      unmarkedCount: 0,
      incidentCount: 1,
      affectedStudentsCount: 1,
    });
  });

  it('reports school A daily trend without leaking school B or draft sessions', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/daily-trend`)
      .query({
        academicYearId: demoYearId,
        termId: demoTermId,
        dateFrom: '2026-09-15',
        dateTo: '2026-09-16',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.items).toEqual([
      expect.objectContaining({
        date: '2026-09-16',
        totalEntries: 1,
        absentCount: 1,
        incidentCount: 1,
      }),
    ]);
  });

  it('reports school A scope breakdown without leaking school B or draft sessions', async () => {
    const { accessToken } = await login();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/scope-breakdown`)
      .query({
        academicYearId: demoYearId,
        termId: demoTermId,
        dateFrom: '2026-09-15',
        dateTo: '2026-09-16',
        groupBy: 'classroom',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const scopeIds = response.body.items.map(
      (item: { scopeId: string }) => item.scopeId,
    );
    expect(scopeIds).toContain(demoClassroomId);
    expect(scopeIds).not.toContain(tenantBClassroomId);
    expect(response.body.items).toEqual([
      expect.objectContaining({
        scopeId: demoClassroomId,
        totalEntries: 1,
        absentCount: 1,
        incidentCount: 1,
      }),
    ]);
  });
});
