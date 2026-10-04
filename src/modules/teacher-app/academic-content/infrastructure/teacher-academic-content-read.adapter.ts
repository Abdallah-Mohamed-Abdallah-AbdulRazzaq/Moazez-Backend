import { Injectable } from '@nestjs/common';
import {
  AcademicContentRepository,
  type AcademicContentAllocationReader,
} from '../../../academics/academic-content/infrastructure/academic-content.repository';
import type { AcademicContentLibraryQuery } from '../../../academics/academic-content/domain/academic-content-library.query';
import { normalizeAcademicContentLibraryQuery } from '../../../academics/academic-content/domain/academic-content-library-normalization.policy';
import { AcademicContentWorkflowPolicyRepository } from '../../../academics/academic-content/infrastructure/academic-content-workflow-policy.repository';
import { AcademicContentFilePolicyResolver } from '../../../academics/academic-content/files/application/academic-content-file-policy.resolver';
import { effectiveAcademicContentWorkflowPolicy } from '../../../academics/academic-content/domain/academic-content-workflow.policy';

@Injectable()
export class TeacherAcademicContentReadAdapter {
  constructor(
    private readonly contents: AcademicContentRepository,
    private readonly workflowPolicies: AcademicContentWorkflowPolicyRepository,
    private readonly filePolicies: AcademicContentFilePolicyResolver,
  ) {}

  list(
    schoolId: string,
    reader: AcademicContentAllocationReader,
    query: AcademicContentLibraryQuery,
  ) {
    const normalized = normalizeAcademicContentLibraryQuery(query);
    return this.contents.listLibrary(
      schoolId,
      normalized.page,
      normalized.limit,
      normalized,
      reader,
    );
  }

  detail(contentId: string, schoolId: string, teacherUserId: string) {
    return this.contents.findAllocationReaderDetail(contentId, schoolId, {
      teacherUserId,
    });
  }

  async workflow(schoolId: string) {
    return effectiveAcademicContentWorkflowPolicy(
      await this.workflowPolicies.findPolicy(schoolId),
    );
  }

  async settings(schoolId: string) {
    const [workflow, files] = await Promise.all([
      this.workflow(schoolId),
      this.filePolicies.resolve(schoolId),
    ]);
    return { workflow, files };
  }
}
