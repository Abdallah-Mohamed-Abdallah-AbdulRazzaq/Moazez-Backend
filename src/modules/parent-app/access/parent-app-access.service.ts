import { Injectable } from '@nestjs/common';
import { getRequestContext } from '../../../common/context/request-context';
import {
  assertParentAppGuardians,
  assertParentAppOwnsChildEnrollmentRecord,
  assertParentAppOwnsClassroomEnrollmentRecord,
  assertParentAppOwnsEnrollmentRecord,
  buildParentAppBaseContextFromRequestContext,
  buildParentAppContext,
} from '../shared/parent-app-domain';
import type {
  ParentAppAccessibleChild,
  ParentAppClassroomId,
  ParentAppContext,
  ParentAppEnrollmentId,
  ParentAppStudentId,
} from '../shared/parent-app.types';
import { ParentAppGuardianReadAdapter } from './parent-app-guardian-read.adapter';

@Injectable()
export class ParentAppAccessService {
  constructor(
    private readonly guardianReadAdapter: ParentAppGuardianReadAdapter,
  ) {}

  async getParentAppContext(): Promise<ParentAppContext> {
    const baseContext =
      buildParentAppBaseContextFromRequestContext(getRequestContext());

    const guardians = assertParentAppGuardians({
      context: baseContext,
      guardians:
        await this.guardianReadAdapter.listCurrentSchoolGuardiansByUserId(
          baseContext.parentUserId,
        ),
    });
    const guardianIds = guardians.map((guardian) => guardian.id);
    const links =
      await this.guardianReadAdapter.listLinkedStudentsForGuardians(
        guardianIds,
      );
    const enrollments =
      await this.guardianReadAdapter.listActiveEnrollmentsForLinkedStudents({
        guardianIds,
        studentIds: [...new Set(links.map((link) => link.studentId))],
      });

    return buildParentAppContext({
      baseContext,
      guardians,
      links,
      enrollments,
    });
  }

  assertCurrentParent(): Promise<ParentAppContext> {
    return this.getParentAppContext();
  }

  async listAccessibleChildren(): Promise<ParentAppAccessibleChild[]> {
    const context = await this.getParentAppContext();

    return context.children;
  }

  getAccessibleChild(
    childStudentId: ParentAppStudentId,
  ): Promise<ParentAppAccessibleChild> {
    return this.assertParentOwnsStudent(childStudentId);
  }

  async assertParentOwnsStudent(
    studentId: ParentAppStudentId,
  ): Promise<ParentAppAccessibleChild> {
    const context = await this.getParentAppContext();

    return assertParentAppOwnsChildEnrollmentRecord({
      context,
      studentId,
      enrollment:
        await this.guardianReadAdapter.findOwnedActiveEnrollmentForStudent({
          studentId,
          guardianIds: context.guardianIds,
        }),
    });
  }

  async assertParentOwnsEnrollment(
    enrollmentId: ParentAppEnrollmentId,
  ): Promise<ParentAppAccessibleChild> {
    const context = await this.getParentAppContext();

    return assertParentAppOwnsEnrollmentRecord({
      context,
      enrollmentId,
      enrollment: await this.guardianReadAdapter.findOwnedEnrollmentById({
        enrollmentId,
        guardianIds: context.guardianIds,
      }),
    });
  }

  async assertParentOwnsClassroom(
    classroomId: ParentAppClassroomId,
  ): Promise<ParentAppAccessibleChild> {
    const context = await this.getParentAppContext();

    return assertParentAppOwnsClassroomEnrollmentRecord({
      context,
      classroomId,
      enrollment: await this.guardianReadAdapter.findOwnedClassroomEnrollment({
        classroomId,
        guardianIds: context.guardianIds,
      }),
    });
  }

  async listAccessibleStudentIds(): Promise<ParentAppStudentId[]> {
    const context = await this.getParentAppContext();

    return context.children.map((child) => child.studentId);
  }

  async listAccessibleEnrollmentIds(): Promise<ParentAppEnrollmentId[]> {
    const context = await this.getParentAppContext();

    return context.children.map((child) => child.enrollmentId);
  }
}
