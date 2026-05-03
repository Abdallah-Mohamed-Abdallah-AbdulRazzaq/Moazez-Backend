import { Injectable } from '@nestjs/common';
import { getRequestContext } from '../../../common/context/request-context';
import { TeacherAppContext } from '../shared/teacher-app-context';
import { TeacherAppAllocationNotFoundException } from '../shared/teacher-app.errors';
import type {
  TeacherAppAllocationRecord,
  TeacherAppClassId,
} from '../shared/teacher-app.types';
import {
  assertTeacherOwnsAllocationRecord,
  buildTeacherAppContextFromRequestContext,
} from './teacher-app-access.domain';
import { TeacherAppAllocationReadAdapter } from './teacher-app-allocation-read.adapter';

@Injectable()
export class TeacherAppAccessService {
  constructor(
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
  ) {}

  getTeacherAppContext(): TeacherAppContext {
    return buildTeacherAppContextFromRequestContext(getRequestContext());
  }

  assertCurrentTeacher(): TeacherAppContext {
    return this.getTeacherAppContext();
  }

  async assertTeacherOwnsAllocation(
    classId: TeacherAppClassId,
  ): Promise<TeacherAppAllocationRecord> {
    const allocation = await this.findOwnedTeacherAllocation(classId);

    if (!allocation) {
      throw new TeacherAppAllocationNotFoundException({ classId });
    }

    return allocation;
  }

  async findOwnedTeacherAllocation(
    classId: TeacherAppClassId,
  ): Promise<TeacherAppAllocationRecord | null> {
    const teacherContext = this.getTeacherAppContext();
    const allocation =
      await this.allocationReadAdapter.findOwnedAllocationById({
        allocationId: classId,
        teacherUserId: teacherContext.teacherUserId,
      });

    if (!allocation) {
      return null;
    }

    assertTeacherOwnsAllocationRecord({
      context: teacherContext,
      allocation,
      classId,
    });

    return allocation;
  }

  async listOwnedTeacherAllocationIds(): Promise<TeacherAppClassId[]> {
    const teacherContext = this.getTeacherAppContext();

    return this.allocationReadAdapter.listOwnedAllocationIds(
      teacherContext.teacherUserId,
    );
  }
}
