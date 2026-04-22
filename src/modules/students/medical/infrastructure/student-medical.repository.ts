import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const STUDENT_MEDICAL_PROFILE_ARGS =
  Prisma.validator<Prisma.StudentMedicalProfileDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      bloodType: true,
      allergies: true,
      conditions: true,
      medications: true,
      emergencyNotes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export type StudentMedicalProfileRecord =
  Prisma.StudentMedicalProfileGetPayload<typeof STUDENT_MEDICAL_PROFILE_ARGS>;

@Injectable()
export class StudentMedicalRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  findStudentMedicalProfileByStudentId(
    studentId: string,
  ): Promise<StudentMedicalProfileRecord | null> {
    return this.scopedPrisma.studentMedicalProfile.findFirst({
      where: { studentId },
      ...STUDENT_MEDICAL_PROFILE_ARGS,
    });
  }

  createStudentMedicalProfile(
    data: Prisma.StudentMedicalProfileUncheckedCreateInput,
  ): Promise<StudentMedicalProfileRecord> {
    return this.prisma.studentMedicalProfile.create({
      data,
      ...STUDENT_MEDICAL_PROFILE_ARGS,
    });
  }

  async updateStudentMedicalProfile(
    profileId: string,
    data: Prisma.StudentMedicalProfileUncheckedUpdateInput,
  ): Promise<StudentMedicalProfileRecord | null> {
    const result = await this.scopedPrisma.studentMedicalProfile.updateMany({
      where: { id: profileId },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.scopedPrisma.studentMedicalProfile.findFirst({
      where: { id: profileId },
      ...STUDENT_MEDICAL_PROFILE_ARGS,
    });
  }
}
