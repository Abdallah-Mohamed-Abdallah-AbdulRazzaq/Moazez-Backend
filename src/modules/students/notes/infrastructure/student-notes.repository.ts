import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const STUDENT_NOTE_RECORD_ARGS =
  Prisma.validator<Prisma.StudentNoteDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      note: true,
      category: true,
      authorUserId: true,
      createdAt: true,
      updatedAt: true,
      authorUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

export type StudentNoteRecord = Prisma.StudentNoteGetPayload<
  typeof STUDENT_NOTE_RECORD_ARGS
>;

@Injectable()
export class StudentNotesRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  listStudentNotes(studentId: string): Promise<StudentNoteRecord[]> {
    return this.scopedPrisma.studentNote.findMany({
      where: { studentId },
      orderBy: [{ createdAt: 'desc' }],
      ...STUDENT_NOTE_RECORD_ARGS,
    });
  }

  findStudentNoteById(noteId: string): Promise<StudentNoteRecord | null> {
    return this.scopedPrisma.studentNote.findFirst({
      where: { id: noteId },
      ...STUDENT_NOTE_RECORD_ARGS,
    });
  }

  createStudentNote(
    data: Prisma.StudentNoteUncheckedCreateInput,
  ): Promise<StudentNoteRecord> {
    return this.prisma.studentNote.create({
      data,
      ...STUDENT_NOTE_RECORD_ARGS,
    });
  }

  async updateStudentNote(
    noteId: string,
    data: Prisma.StudentNoteUncheckedUpdateInput,
  ): Promise<StudentNoteRecord | null> {
    const result = await this.scopedPrisma.studentNote.updateMany({
      where: { id: noteId },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.findStudentNoteById(noteId);
  }
}
