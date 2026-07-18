import { Injectable } from '@nestjs/common';
import { Prisma, TeacherEmploymentStatus } from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const TEACHER_PROFILE_RECORD_ARGS =
  Prisma.validator<Prisma.TeacherProfileDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      userId: true,
      teacherCode: true,
      firstNameAr: true,
      lastNameAr: true,
      firstNameEn: true,
      lastNameEn: true,
      gender: true,
      employmentStatus: true,
      department: true,
      specialization: true,
      employmentType: true,
      experienceYears: true,
      hireDate: true,
      workingDays: true,
      workStartTime: true,
      workEndTime: true,
      notesAr: true,
      notesEn: true,
      avatarFileId: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });

export type TeacherProfileRecord = Prisma.TeacherProfileGetPayload<
  typeof TEACHER_PROFILE_RECORD_ARGS
>;

export interface IncompleteBackfillProfileInput {
  schoolId: string;
  userId: string;
}

@Injectable()
export class TeacherProfileRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  findLiveByCurrentSchoolProfileId(
    profileId: string,
  ): Promise<TeacherProfileRecord | null> {
    return this.scopedPrisma.teacherProfile.findFirst({
      where: { id: profileId },
      ...TEACHER_PROFILE_RECORD_ARGS,
    });
  }

  findLiveByCurrentSchoolUserId(
    userId: string,
  ): Promise<TeacherProfileRecord | null> {
    return this.scopedPrisma.teacherProfile.findFirst({
      where: { userId },
      ...TEACHER_PROFILE_RECORD_ARGS,
    });
  }

  findCurrentSchoolByUserIdIncludingArchived(
    userId: string,
  ): Promise<TeacherProfileRecord | null> {
    return withSoftDeleted(() =>
      this.scopedPrisma.teacherProfile.findFirst({
        where: { userId },
        ...TEACHER_PROFILE_RECORD_ARGS,
      }),
    );
  }

  /**
   * Global integrity helper for the partial uniqueness invariant. It is not
   * exported through a controller and deliberately avoids request-scope bypass.
   */
  countLiveProfilesForUserGloballyForIntegrity(
    userId: string,
  ): Promise<number> {
    return this.prisma.teacherProfile.count({
      where: { userId, deletedAt: null },
    });
  }

  createIncompleteBackfillProfile(
    input: IncompleteBackfillProfileInput,
  ): Promise<TeacherProfileRecord> {
    return this.prisma.teacherProfile.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        employmentStatus: TeacherEmploymentStatus.INACTIVE,
        workingDays: [],
      },
      ...TEACHER_PROFILE_RECORD_ARGS,
    });
  }
}
