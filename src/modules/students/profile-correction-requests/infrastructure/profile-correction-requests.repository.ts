import { Injectable } from '@nestjs/common';
import {
  Prisma,
  StudentProfileCorrectionRequestStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../../student-app/shared/student-app.types';
import {
  buildStudentUpdateDataFromCorrectionChanges,
  type NormalizedProfileCorrectionChanges,
} from '../domain/profile-correction-request.fields';

const PROFILE_CORRECTION_STUDENT_ARGS =
  Prisma.validator<Prisma.StudentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      organizationId: true,
      userId: true,
      firstName: true,
      fatherNameEn: true,
      grandfatherNameEn: true,
      lastName: true,
      firstNameAr: true,
      fatherNameAr: true,
      grandfatherNameAr: true,
      familyNameAr: true,
      birthDate: true,
      gender: true,
      nationality: true,
      addressLine: true,
      city: true,
      district: true,
      studentPhone: true,
      studentEmail: true,
      status: true,
      deletedAt: true,
    },
  });

const PROFILE_CORRECTION_REQUEST_ARGS =
  Prisma.validator<Prisma.StudentProfileCorrectionRequestDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      organizationId: true,
      studentId: true,
      status: true,
      requestedChanges: true,
      currentSnapshot: true,
      reason: true,
      reviewerNote: true,
      approvedAt: true,
      rejectedAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
    },
  });

export type ProfileCorrectionStudentRecord = Prisma.StudentGetPayload<
  typeof PROFILE_CORRECTION_STUDENT_ARGS
>;

export type ProfileCorrectionRequestRecord =
  Prisma.StudentProfileCorrectionRequestGetPayload<
    typeof PROFILE_CORRECTION_REQUEST_ARGS
  >;

type NonPendingProfileCorrectionStatus = Exclude<
  StudentProfileCorrectionRequestStatus,
  'PENDING'
>;

export type CorrectionRequestMutationResult =
  | { status: 'updated'; request: ProfileCorrectionRequestRecord }
  | { status: 'not_found' }
  | {
      status: 'not_pending';
      currentStatus: NonPendingProfileCorrectionStatus;
      request: ProfileCorrectionRequestRecord;
    };

export type CorrectionRequestApprovalResult =
  | { status: 'approved'; request: ProfileCorrectionRequestRecord }
  | { status: 'not_found' }
  | { status: 'student_not_found' }
  | {
      status: 'not_pending';
      currentStatus: NonPendingProfileCorrectionStatus;
      request: ProfileCorrectionRequestRecord;
    };

@Injectable()
export class ProfileCorrectionRequestsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  findCurrentStudentForCorrection(
    context: StudentAppContext,
  ): Promise<ProfileCorrectionStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: {
        id: context.studentId,
        userId: context.studentUserId,
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      ...PROFILE_CORRECTION_STUDENT_ARGS,
    });
  }

  createStudentRequest(params: {
    context: StudentAppContext;
    changes: NormalizedProfileCorrectionChanges;
    currentSnapshot: Record<string, unknown>;
    reason: string | null;
  }): Promise<ProfileCorrectionRequestRecord> {
    return this.prisma.studentProfileCorrectionRequest.create({
      data: {
        organizationId: params.context.organizationId,
        schoolId: params.context.schoolId,
        studentId: params.context.studentId,
        requestedByUserId: params.context.studentUserId,
        requestedByType: 'STUDENT',
        status: StudentProfileCorrectionRequestStatus.PENDING,
        requestedChanges: params.changes as Prisma.InputJsonValue,
        currentSnapshot: params.currentSnapshot as Prisma.InputJsonValue,
        reason: params.reason,
      },
      ...PROFILE_CORRECTION_REQUEST_ARGS,
    });
  }

  listStudentRequests(
    context: StudentAppContext,
  ): Promise<ProfileCorrectionRequestRecord[]> {
    return this.scopedPrisma.studentProfileCorrectionRequest.findMany({
      where: {
        studentId: context.studentId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
      ...PROFILE_CORRECTION_REQUEST_ARGS,
    });
  }

  findStudentRequest(params: {
    context: StudentAppContext;
    requestId: string;
  }): Promise<ProfileCorrectionRequestRecord | null> {
    return this.scopedPrisma.studentProfileCorrectionRequest.findFirst({
      where: {
        id: params.requestId,
        studentId: params.context.studentId,
        deletedAt: null,
      },
      ...PROFILE_CORRECTION_REQUEST_ARGS,
    });
  }

  async cancelStudentRequest(params: {
    context: StudentAppContext;
    requestId: string;
  }): Promise<CorrectionRequestMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.studentProfileCorrectionRequest.findFirst({
        where: {
          id: params.requestId,
          schoolId: params.context.schoolId,
          studentId: params.context.studentId,
          deletedAt: null,
        },
        ...PROFILE_CORRECTION_REQUEST_ARGS,
      });

      if (!existing) {
        return { status: 'not_found' };
      }

      if (existing.status !== StudentProfileCorrectionRequestStatus.PENDING) {
        return {
          status: 'not_pending',
          currentStatus: existing.status,
          request: existing,
        };
      }

      const request = await tx.studentProfileCorrectionRequest.update({
        where: { id: existing.id },
        data: {
          status: StudentProfileCorrectionRequestStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: params.context.studentUserId,
        },
        ...PROFILE_CORRECTION_REQUEST_ARGS,
      });

      return { status: 'updated', request };
    });
  }

  listStaffRequests(params: {
    schoolId: string;
    status?: StudentProfileCorrectionRequestStatus;
    studentId?: string;
  }): Promise<ProfileCorrectionRequestRecord[]> {
    return this.scopedPrisma.studentProfileCorrectionRequest.findMany({
      where: {
        schoolId: params.schoolId,
        deletedAt: null,
        ...(params.status ? { status: params.status } : {}),
        ...(params.studentId ? { studentId: params.studentId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      ...PROFILE_CORRECTION_REQUEST_ARGS,
    });
  }

  findStaffRequest(params: {
    schoolId: string;
    requestId: string;
  }): Promise<ProfileCorrectionRequestRecord | null> {
    return this.scopedPrisma.studentProfileCorrectionRequest.findFirst({
      where: {
        id: params.requestId,
        schoolId: params.schoolId,
        deletedAt: null,
      },
      ...PROFILE_CORRECTION_REQUEST_ARGS,
    });
  }

  async approveStaffRequest(params: {
    schoolId: string;
    actorId: string;
    requestId: string;
    reviewerNote: string | null;
  }): Promise<CorrectionRequestApprovalResult> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.studentProfileCorrectionRequest.findFirst({
        where: {
          id: params.requestId,
          schoolId: params.schoolId,
          deletedAt: null,
        },
        ...PROFILE_CORRECTION_REQUEST_ARGS,
      });

      if (!existing) {
        return { status: 'not_found' };
      }

      if (existing.status !== StudentProfileCorrectionRequestStatus.PENDING) {
        return {
          status: 'not_pending',
          currentStatus: existing.status,
          request: existing,
        };
      }

      const studentUpdate = await tx.student.updateMany({
        where: {
          id: existing.studentId,
          schoolId: params.schoolId,
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
        data: buildStudentUpdateDataFromCorrectionChanges(
          existing.requestedChanges,
        ),
      });

      if (studentUpdate.count === 0) {
        return { status: 'student_not_found' };
      }

      const request = await tx.studentProfileCorrectionRequest.update({
        where: { id: existing.id },
        data: {
          status: StudentProfileCorrectionRequestStatus.APPROVED,
          approvedAt: new Date(),
          approvedBy: params.actorId,
          reviewerNote: params.reviewerNote,
        },
        ...PROFILE_CORRECTION_REQUEST_ARGS,
      });

      return { status: 'approved', request };
    });
  }

  async rejectStaffRequest(params: {
    schoolId: string;
    actorId: string;
    requestId: string;
    reviewerNote: string | null;
  }): Promise<CorrectionRequestMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.studentProfileCorrectionRequest.findFirst({
        where: {
          id: params.requestId,
          schoolId: params.schoolId,
          deletedAt: null,
        },
        ...PROFILE_CORRECTION_REQUEST_ARGS,
      });

      if (!existing) {
        return { status: 'not_found' };
      }

      if (existing.status !== StudentProfileCorrectionRequestStatus.PENDING) {
        return {
          status: 'not_pending',
          currentStatus: existing.status,
          request: existing,
        };
      }

      const request = await tx.studentProfileCorrectionRequest.update({
        where: { id: existing.id },
        data: {
          status: StudentProfileCorrectionRequestStatus.REJECTED,
          rejectedAt: new Date(),
          rejectedBy: params.actorId,
          reviewerNote: params.reviewerNote,
        },
        ...PROFILE_CORRECTION_REQUEST_ARGS,
      });

      return { status: 'updated', request };
    });
  }
}
