import { AcademicContentWorkflowPublicationCapabilities } from '../../../academics/academic-content/application/academic-content-workflow-publication-capabilities';
import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ScopeMissingException } from '../../../iam/auth/domain/auth.exceptions';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import type { TeacherAppContext } from '../../shared/teacher-app-context';
import { TeacherAcademicContentReadAdapter } from '../infrastructure/teacher-academic-content-read.adapter';
import type { ListTeacherAcademicContentQueryDto } from '../dto/teacher-academic-content.dto';
import { presentAcademicContentList } from '../../../academics/academic-content/presenters/academic-content.presenter';
import {
  presentTeacherAcademicContentDetail,
  presentTeacherAcademicContentSettings,
} from '../presenters/teacher-academic-content.presenter';
import type { AcademicContentLibraryQuery } from '../../../academics/academic-content/domain/academic-content-library.query';

function assertView(teacher: TeacherAppContext): void {
  if (!teacher.permissions.includes('academics.academic_content.view'))
    throw new ScopeMissingException({
      missingPermissions: ['academics.academic_content.view'],
    });
}

@Injectable()
export class ListTeacherAcademicContentUseCase {
  constructor(
    private readonly access: TeacherAppAccessService,
    private readonly read: TeacherAcademicContentReadAdapter,
  ) {}

  async execute(query: ListTeacherAcademicContentQueryDto) {
    const teacher = this.access.assertCurrentTeacher();
    assertView(teacher);
    // Explicit projection also protects direct application calls from extra filters.
    const safe: AcademicContentLibraryQuery = {
      type: query.type,
      status: query.status,
      audience: query.audience,
      search: query.search,
      tag: query.tag,
      weeklyDateFrom: query.weeklyDateFrom,
      weeklyDateTo: query.weeklyDateTo,
      sessionStartAtFrom: query.sessionStartAtFrom,
      sessionStartAtTo: query.sessionStartAtTo,
      sessionPlatform: query.sessionPlatform,
      guardianPriority: query.guardianPriority,
      page: query.page,
      limit: query.limit,
    };
    if (query.classId) {
      const allocation = await this.access.assertTeacherOwnsAllocation(
        query.classId,
      );
      if (!allocation.term)
        throw new NotFoundDomainException('Teacher allocation not found');
      Object.assign(safe, {
        academicYearId: allocation.term.academicYearId,
        termId: allocation.termId,
        subjectId: allocation.subjectId,
        classroomId: allocation.classroomId,
      });
    }
    return presentAcademicContentList(
      await this.read.list(
        teacher.schoolId,
        {
          teacherUserId: teacher.teacherUserId,
          allocationId: query.classId,
        },
        safe,
      ),
    );
  }
}

@Injectable()
export class GetTeacherAcademicContentUseCase {
  constructor(
    private readonly access: TeacherAppAccessService,
    private readonly read: TeacherAcademicContentReadAdapter,
    private readonly actions: AcademicContentWorkflowPublicationCapabilities,
  ) {}

  async execute(contentId: string, now = new Date()) {
    const teacher = this.access.assertCurrentTeacher();
    assertView(teacher);
    const content = await this.read.detail(
      contentId,
      teacher.schoolId,
      teacher.teacherUserId,
    );
    if (!content)
      throw new NotFoundDomainException('Academic content not found');
    const workflow = await this.read.workflow(teacher.schoolId);
    const verifiedActions = await this.actions.evaluateAuthorizedContent(
      content,
      workflow,
      now,
    );
    return presentTeacherAcademicContentDetail(
      content,
      teacher,
      workflow,
      now,
      verifiedActions,
    );
  }
}

@Injectable()
export class GetTeacherAcademicContentCapabilitiesUseCase {
  constructor(
    private readonly access: TeacherAppAccessService,
    private readonly read: TeacherAcademicContentReadAdapter,
  ) {}

  async execute() {
    const teacher = this.access.assertCurrentTeacher();
    assertView(teacher);
    return presentTeacherAcademicContentSettings(
      await this.read.settings(teacher.schoolId),
    );
  }
}
