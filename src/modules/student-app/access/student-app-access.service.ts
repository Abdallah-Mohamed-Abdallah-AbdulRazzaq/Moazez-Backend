import { Injectable } from '@nestjs/common';
import { getRequestContext } from '../../../common/context/request-context';
import {
  assertStudentAppActiveEnrollment,
  assertStudentAppLinkedStudent,
  assertStudentAppOwnsClassroomEnrollmentRecord,
  assertStudentAppOwnsEnrollmentRecord,
  assertStudentAppOwnsStudentRecord,
  buildStudentAppBaseContextFromRequestContext,
  buildStudentAppContext,
} from '../shared/student-app-domain';
import type {
  StudentAppClassroomId,
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
  StudentAppEnrollmentId,
  StudentAppEnrollmentRecord,
  StudentAppStudentId,
  StudentAppStudentRecord,
} from '../shared/student-app.types';
import { StudentAppStudentReadAdapter } from './student-app-student-read.adapter';

@Injectable()
export class StudentAppAccessService {
  constructor(
    private readonly studentReadAdapter: StudentAppStudentReadAdapter,
  ) {}

  async getStudentAppContext(): Promise<StudentAppContext> {
    const { context } = await this.getCurrentStudentWithEnrollment();

    return context;
  }

  assertCurrentStudent(): Promise<StudentAppContext> {
    return this.getStudentAppContext();
  }

  async getCurrentStudentWithEnrollment(): Promise<StudentAppCurrentStudentWithEnrollment> {
    const baseContext = buildStudentAppBaseContextFromRequestContext(
      getRequestContext(),
    );

    const linkedStudent = assertStudentAppLinkedStudent({
      context: baseContext,
      student: await this.studentReadAdapter.findLinkedStudentByUserId(
        baseContext.studentUserId,
      ),
    });

    const activeEnrollment = assertStudentAppActiveEnrollment({
      context: baseContext,
      student: linkedStudent,
      enrollment: await this.studentReadAdapter.findActiveEnrollmentForStudent({
        studentId: linkedStudent.id,
        studentUserId: baseContext.studentUserId,
        academicYearId: baseContext.requestedAcademicYearId,
        termId: baseContext.requestedTermId,
      }),
    });

    return {
      context: buildStudentAppContext({
        baseContext,
        student: linkedStudent,
        enrollment: activeEnrollment,
      }),
      student: linkedStudent,
      enrollment: activeEnrollment,
    };
  }

  async getCurrentStudentId(): Promise<StudentAppStudentId> {
    const context = await this.getStudentAppContext();

    return context.studentId;
  }

  async assertStudentOwnsStudent(
    studentId: StudentAppStudentId,
  ): Promise<StudentAppStudentRecord> {
    const { context } = await this.getCurrentStudentWithEnrollment();

    return assertStudentAppOwnsStudentRecord({
      context,
      student: await this.studentReadAdapter.findOwnedStudentById({
        studentId,
        studentUserId: context.studentUserId,
      }),
      studentId,
    });
  }

  async assertStudentOwnsEnrollment(
    enrollmentId: StudentAppEnrollmentId,
  ): Promise<StudentAppEnrollmentRecord> {
    const { context } = await this.getCurrentStudentWithEnrollment();

    return assertStudentAppOwnsEnrollmentRecord({
      context,
      enrollment: await this.studentReadAdapter.findOwnedEnrollmentById({
        enrollmentId,
        studentId: context.studentId,
        studentUserId: context.studentUserId,
      }),
      enrollmentId,
    });
  }

  async assertStudentOwnsClassroom(
    classroomId: StudentAppClassroomId,
  ): Promise<StudentAppEnrollmentRecord> {
    const { context } = await this.getCurrentStudentWithEnrollment();

    return assertStudentAppOwnsClassroomEnrollmentRecord({
      context,
      enrollment: await this.studentReadAdapter.findOwnedClassroomEnrollment({
        classroomId,
        studentId: context.studentId,
        studentUserId: context.studentUserId,
      }),
      classroomId,
    });
  }
}
