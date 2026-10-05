import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { ScopeMissingException } from '../../../iam/auth/domain/auth.exceptions';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAcademicContentReadAdapter } from '../infrastructure/teacher-academic-content-read.adapter';
import {
  AcademicContentAuthoringOperations,
  CreateAcademicContentForClassCommand,
} from '../../../academics/academic-content/application/academic-content-authoring.operations';
import { GetAcademicContentReadinessUseCase } from '../../../academics/academic-content/application/academic-content-readiness.use-case';
import type { UpdateAcademicContentCommand } from '../../../academics/academic-content/application/academic-content-lifecycle.use-cases';
import type { AcademicContentTeacherWriteScope } from '../../../academics/academic-content/infrastructure/academic-content-teacher-write.authorization';
import type {
  GuardianNoteCommand,
  OnlineSessionCommand,
  PreparationCommand,
  SubjectResourceCommand,
  WeeklyPlanCommand,
} from '../../../academics/academic-content/domain/academic-content-type-detail.policy';
import type {
  AcademicContentLinkInput,
  AcademicContentTagInput,
} from '../../../academics/academic-content/domain/academic-content-links-tags.policy';

@Injectable()
export class TeacherAcademicContentAuthoringUseCases {
  constructor(
    private readonly access: TeacherAppAccessService,
    private readonly authoring: AcademicContentAuthoringOperations,
    private readonly read: TeacherAcademicContentReadAdapter,
    private readonly coreReadiness: GetAcademicContentReadinessUseCase,
  ) {}

  private mutationScope(): AcademicContentTeacherWriteScope {
    const teacher = this.access.assertCurrentTeacher();
    if (!teacher.permissions.includes('academics.academic_content.manage'))
      throw new ScopeMissingException({
        missingPermissions: ['academics.academic_content.manage'],
      });
    return {
      schoolId: teacher.schoolId,
      organizationId: teacher.organizationId,
      actorId: teacher.teacherUserId,
      teacherUserId: teacher.teacherUserId,
    };
  }

  create(
    classId: string,
    command: CreateAcademicContentForClassCommand,
    now = new Date(),
  ) {
    return this.authoring.create(this.mutationScope(), classId, command, now);
  }
  update(
    contentId: string,
    command: UpdateAcademicContentCommand,
    now = new Date(),
  ) {
    return this.authoring.update(this.mutationScope(), contentId, command, now);
  }
  archive(contentId: string, now = new Date()) {
    return this.authoring.lifecycle(
      this.mutationScope(),
      contentId,
      'archive',
      now,
    );
  }
  restore(contentId: string, now = new Date()) {
    return this.authoring.lifecycle(
      this.mutationScope(),
      contentId,
      'restore',
      now,
    );
  }
  delete(contentId: string, now = new Date()) {
    return this.authoring.lifecycle(
      this.mutationScope(),
      contentId,
      'delete',
      now,
    );
  }
  targets(contentId: string, command: { classIds: string[] }) {
    const scope = this.mutationScope();
    if (!command || Object.keys(command).some((key) => key !== 'classIds'))
      throw new ValidationDomainException(
        'Only Teacher classIds may be supplied',
      );
    return this.authoring.replaceTargets(scope, contentId, command.classIds);
  }
  preparation(
    contentId: string,
    command: PreparationCommand,
    now = new Date(),
  ) {
    return this.authoring.preparation(
      this.mutationScope(),
      contentId,
      command,
      now,
    );
  }
  weeklyPlan(contentId: string, command: WeeklyPlanCommand, now = new Date()) {
    return this.authoring.weeklyPlan(
      this.mutationScope(),
      contentId,
      command,
      now,
    );
  }
  guardianNote(
    contentId: string,
    command: GuardianNoteCommand,
    now = new Date(),
  ) {
    return this.authoring.guardianNote(
      this.mutationScope(),
      contentId,
      command,
      now,
    );
  }
  subjectResource(
    contentId: string,
    command: SubjectResourceCommand,
    now = new Date(),
  ) {
    return this.authoring.subjectResource(
      this.mutationScope(),
      contentId,
      command,
      now,
    );
  }
  onlineSession(
    contentId: string,
    command: OnlineSessionCommand,
    now = new Date(),
  ) {
    return this.authoring.onlineSession(
      this.mutationScope(),
      contentId,
      command,
      now,
    );
  }
  links(
    contentId: string,
    input: readonly AcademicContentLinkInput[],
    now = new Date(),
  ) {
    return this.authoring.links(this.mutationScope(), contentId, input, now);
  }
  tags(
    contentId: string,
    input: readonly AcademicContentTagInput[],
    now = new Date(),
  ) {
    return this.authoring.tags(this.mutationScope(), contentId, input, now);
  }
  async readiness(contentId: string, now = new Date()) {
    const teacher = this.access.assertCurrentTeacher();
    if (!teacher.permissions.includes('academics.academic_content.view'))
      throw new ScopeMissingException({
        missingPermissions: ['academics.academic_content.view'],
      });
    const content = await this.read.detail(
      contentId,
      teacher.schoolId,
      teacher.teacherUserId,
    );
    if (!content)
      throw new NotFoundDomainException('Academic content not found');
    return this.coreReadiness.evaluateAuthorizedContent(content, now);
  }
}
