import { Injectable } from '@nestjs/common';
import { getRequestContext } from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { PreviewTeacherAllocationReassignmentDto } from '../dto/teacher-allocation.dto';
import { TeacherAllocationReassignmentPreviewResponseDto } from '../dto/teacher-allocation-response.dto';
import {
  TeacherAllocationReassignmentTargetIneligibleException,
  TeacherAllocationReassignmentTargetNotFoundException,
} from '../domain/teacher-allocation.exceptions';
import { computeTeacherAllocationReassignmentFingerprint } from '../domain/teacher-allocation-reassignment-fingerprint';
import { evaluateReassignmentTargetEligibility } from '../domain/teacher-allocation-reassignment.policy';
import { TeacherAllocationReassignmentReadRepository } from '../infrastructure/teacher-allocation-reassignment-read.repository';
import { TeacherAllocationReassignmentImpactService } from './teacher-allocation-reassignment-impact.service';
import { assertTermWritable } from './teacher-allocation-use-case.helpers';

@Injectable()
export class PreviewTeacherAllocationReassignmentUseCase {
  constructor(
    private readonly repository: TeacherAllocationReassignmentReadRepository,
    private readonly impactService: TeacherAllocationReassignmentImpactService,
  ) {}

  async execute(
    allocationId: string,
    dto: PreviewTeacherAllocationReassignmentDto,
  ): Promise<TeacherAllocationReassignmentPreviewResponseDto> {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error(
        'Teacher allocation reassignment preview requires an active school membership',
      );
    }

    const snapshot = await this.repository.loadSnapshot({
      schoolId,
      allocationId,
      newTeacherUserId: dto.newTeacherUserId,
    });
    if (!snapshot) {
      throw new NotFoundDomainException('Teacher allocation not found');
    }

    assertTermWritable(snapshot.allocation.term, snapshot.allocation.termId);

    if (!snapshot.target) {
      throw new TeacherAllocationReassignmentTargetNotFoundException();
    }
    const eligibility = evaluateReassignmentTargetEligibility({
      schoolId,
      target: snapshot.target,
    });
    if (!eligibility.eligible) {
      throw new TeacherAllocationReassignmentTargetIneligibleException(
        eligibility.reasonCode,
      );
    }

    const analysis = this.impactService.analyze(snapshot);

    return {
      allocation: {
        id: snapshot.allocation.id,
        subjectId: snapshot.allocation.subjectId,
        classroomId: snapshot.allocation.classroomId,
        termId: snapshot.allocation.termId,
      },
      currentTeacher: {
        userId: snapshot.allocation.teacherUser.id,
        fullName: fullName(snapshot.allocation.teacherUser),
      },
      targetTeacher: {
        userId: snapshot.target.id,
        fullName: fullName(snapshot.target),
      },
      decision: analysis.decision,
      canReassign: analysis.canReassign,
      impactFingerprint: computeTeacherAllocationReassignmentFingerprint(
        analysis.fingerprintMaterial,
      ),
      impact: analysis.impact,
      blockers: analysis.blockers,
      automaticActions: analysis.automaticActions,
      historicalRecords: analysis.historicalRecords,
    };
  }
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}
