import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { ReassignTeacherAllocationDto } from '../dto/teacher-allocation.dto';
import { TeacherAllocationReassignmentResponseDto } from '../dto/teacher-allocation-response.dto';
import {
  isTeacherAllocationReassignmentConcurrencyError,
  TeacherAllocationReassignmentBlockedException,
  TeacherAllocationReassignmentConcurrentChangeException,
  TeacherAllocationReassignmentStalePreviewException,
  TeacherAllocationReassignmentTargetIneligibleException,
  TeacherAllocationReassignmentTargetNotFoundException,
} from '../domain/teacher-allocation.exceptions';
import { computeTeacherAllocationReassignmentFingerprint } from '../domain/teacher-allocation-reassignment-fingerprint';
import { evaluateReassignmentTargetEligibility } from '../domain/teacher-allocation-reassignment.policy';
import { TeacherAllocationReassignmentImpactService } from './teacher-allocation-reassignment-impact.service';
import { TeacherAllocationReassignmentUnitOfWork } from './teacher-allocation-reassignment.unit-of-work';
import { assertTermWritable } from './teacher-allocation-use-case.helpers';

@Injectable()
export class ReassignTeacherAllocationUseCase {
  constructor(
    private readonly unitOfWork: TeacherAllocationReassignmentUnitOfWork,
    private readonly impactService: TeacherAllocationReassignmentImpactService,
  ) {}

  async execute(
    allocationId: string,
    dto: ReassignTeacherAllocationDto,
  ): Promise<TeacherAllocationReassignmentResponseDto> {
    const scope = requireAcademicsScope();

    try {
      return await this.unitOfWork.execute(async (transaction) => {
        const locked = await transaction.allocation.lock({
          schoolId: scope.schoolId,
          allocationId,
        });
        if (!locked) {
          throw new NotFoundDomainException('Teacher allocation not found');
        }

        const snapshot = await transaction.snapshot.load({
          schoolId: scope.schoolId,
          allocationId,
          newTeacherUserId: dto.newTeacherUserId,
        });
        if (!snapshot) {
          throw new NotFoundDomainException('Teacher allocation not found');
        }

        assertTermWritable(
          snapshot.allocation.term,
          snapshot.allocation.termId,
        );

        if (!snapshot.target) {
          throw new TeacherAllocationReassignmentTargetNotFoundException();
        }

        const eligibility = evaluateReassignmentTargetEligibility({
          schoolId: scope.schoolId,
          target: snapshot.target,
        });
        const analysis = this.impactService.analyze(snapshot);
        const currentFingerprint =
          computeTeacherAllocationReassignmentFingerprint(
            analysis.fingerprintMaterial,
          );

        if (currentFingerprint !== dto.impactFingerprint) {
          throw new TeacherAllocationReassignmentStalePreviewException();
        }
        if (!eligibility.eligible) {
          throw new TeacherAllocationReassignmentTargetIneligibleException(
            eligibility.reasonCode,
          );
        }
        if (!analysis.canReassign) {
          throw new TeacherAllocationReassignmentBlockedException(
            analysis.blockers,
          );
        }

        const expected = {
          timetableEntries:
            analysis.impact.timetable.draft + analysis.impact.timetable.active,
          lessonPlans:
            analysis.impact.lessonPlans.draft +
            analysis.impact.lessonPlans.active,
          homeworkAssignments:
            analysis.impact.homework.draft +
            analysis.impact.homework.published +
            analysis.impact.homework.closed,
        };
        const handoff = {
          schoolId: scope.schoolId,
          allocationId,
          previousTeacherUserId: snapshot.allocation.teacherUserId,
          newTeacherUserId: snapshot.target.id,
        };

        const timetableCount = await transaction.timetable.handoff(handoff);
        assertMutationCount(timetableCount, expected.timetableEntries);
        const lessonPlanCount = await transaction.lessonPlans.handoff(handoff);
        assertMutationCount(lessonPlanCount, expected.lessonPlans);
        const homeworkCount = await transaction.homework.handoff(handoff);
        assertMutationCount(homeworkCount, expected.homeworkAssignments);
        const allocationCount = await transaction.allocation.handoff(handoff);
        assertMutationCount(allocationCount, 1);

        await transaction.audit.writeSuccessful({
          actorId: scope.actorId,
          userType: scope.userType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          allocationId,
          previousTeacherUserId: snapshot.allocation.teacherUserId,
          newTeacherUserId: snapshot.target.id,
          ...(dto.reasonCode ? { reasonCode: dto.reasonCode } : {}),
          transferred: expected,
        });

        return {
          allocation: {
            id: allocationId,
            teacherUserId: snapshot.target.id,
          },
          previousTeacherUserId: snapshot.allocation.teacherUserId,
          newTeacherUserId: snapshot.target.id,
          transferred: expected,
          preservedHistorical: {
            cancelledTimetableEntries: analysis.impact.timetable.cancelled,
            archivedLessonPlans: analysis.impact.lessonPlans.archived,
            cancelledOrArchivedHomeworkAssignments:
              analysis.impact.homework.cancelled +
              analysis.impact.homework.archived,
            completedOrCancelledReinforcementTasks:
              analysis.impact.reinforcement.completed +
              analysis.impact.reinforcement.cancelled,
            publishedArchivedOrCancelledAnnouncements:
              analysis.impact.announcements.published +
              analysis.impact.announcements.archived +
              analysis.impact.announcements.cancelled,
          },
        };
      });
    } catch (error) {
      if (isTeacherAllocationReassignmentConcurrencyError(error)) {
        throw new TeacherAllocationReassignmentConcurrentChangeException();
      }
      throw error;
    }
  }
}

function assertMutationCount(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new TeacherAllocationReassignmentConcurrentChangeException();
  }
}
