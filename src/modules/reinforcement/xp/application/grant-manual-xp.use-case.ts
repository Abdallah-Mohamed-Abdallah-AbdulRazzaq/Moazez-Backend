import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { XpSourceType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import {
  assertManualBonusPayload,
  buildXpLedgerPayload,
  isUniqueConstraintError,
  normalizeNullableText,
} from '../domain/reinforcement-xp-domain';
import { GrantManualXpDto } from '../dto/reinforcement-xp.dto';
import {
  ReinforcementXpRepository,
  XpEnrollmentPlacementRecord,
} from '../infrastructure/reinforcement-xp.repository';
import { presentXpLedgerEntry } from '../presenters/reinforcement-xp.presenter';
import {
  buildLedgerAuditEntry,
  enforceXpPolicyForGrant,
  findEffectivePolicyForScope,
  resolveXpAcademicYearId,
  scopeFromEnrollment,
  toJsonInput,
  validateXpAcademicContext,
} from './reinforcement-xp-use-case.helpers';

@Injectable()
export class GrantManualXpUseCase {
  constructor(
    private readonly xpRepository: ReinforcementXpRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: GrantManualXpDto) {
    const scope = requireReinforcementScope();
    const academicYearId = resolveXpAcademicYearId(command);
    await validateXpAcademicContext({
      repository: this.xpRepository,
      academicYearId,
      termId: command.termId,
    });

    const normalized = assertManualBonusPayload(command);
    const student = await this.xpRepository.findStudent(command.studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', {
        studentId: command.studentId,
      });
    }

    const enrollment = await this.resolveEnrollment({
      command,
      academicYearId,
      termId: command.termId,
    });

    const sourceType = XpSourceType.MANUAL_BONUS;
    const sourceId =
      normalizeNullableText(command.sourceId) ??
      normalizeNullableText(command.dedupeKey) ??
      randomUUID();
    const existing = await this.xpRepository.findExistingLedgerBySource({
      sourceType,
      sourceId,
      studentId: command.studentId,
    });
    if (existing) {
      return presentXpLedgerEntry(existing);
    }

    const now = new Date();
    const resolvedScope = scopeFromEnrollment({
      studentId: command.studentId,
      enrollment,
    });
    const policy = await findEffectivePolicyForScope({
      repository: this.xpRepository,
      schoolId: scope.schoolId,
      academicYearId,
      termId: command.termId,
      scope: resolvedScope,
      now,
    });
    const capUsage = await enforceXpPolicyForGrant({
      repository: this.xpRepository,
      policy,
      academicYearId,
      termId: command.termId,
      studentId: command.studentId,
      amount: normalized.amount,
      reason: normalized.reason,
      sourceType,
      now,
    });

    const payload = buildXpLedgerPayload({
      schoolId: scope.schoolId,
      academicYearId,
      termId: command.termId,
      studentId: command.studentId,
      enrollmentId: enrollment.id,
      policyId: policy?.id ?? null,
      sourceType,
      sourceId,
      amount: normalized.amount,
      reason: normalized.reason,
      reasonAr: command.reasonAr,
      actorUserId: scope.actorId,
      occurredAt: now,
      metadata: {
        dedupeKey: normalizeNullableText(command.dedupeKey),
        sourceIdProvided: Boolean(normalizeNullableText(command.sourceId)),
      },
    });

    try {
      const ledger = await this.xpRepository.createXpLedger({
        ...payload,
        metadata: toJsonInput(payload.metadata),
      });
      await this.authRepository.createAuditLog(
        buildLedgerAuditEntry({
          scope,
          action: 'reinforcement.xp.manual_bonus',
          ledger,
          capUsage,
        }),
      );

      return presentXpLedgerEntry(ledger);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const duplicate = await this.xpRepository.findExistingLedgerBySource({
          sourceType,
          sourceId,
          studentId: command.studentId,
        });
        if (duplicate) return presentXpLedgerEntry(duplicate);
      }

      throw error;
    }
  }

  private async resolveEnrollment(params: {
    command: GrantManualXpDto;
    academicYearId: string;
    termId: string;
  }): Promise<XpEnrollmentPlacementRecord> {
    const enrollment = params.command.enrollmentId
      ? await this.xpRepository.findEnrollment(params.command.enrollmentId)
      : await this.xpRepository.resolveEnrollmentForStudent({
          studentId: params.command.studentId,
          academicYearId: params.academicYearId,
          termId: params.termId,
        });

    if (
      !enrollment ||
      enrollment.studentId !== params.command.studentId ||
      enrollment.academicYearId !== params.academicYearId ||
      enrollment.termId !== params.termId
    ) {
      throw new NotFoundDomainException('Enrollment not found', {
        enrollmentId: params.command.enrollmentId ?? null,
        studentId: params.command.studentId,
        academicYearId: params.academicYearId,
        termId: params.termId,
      });
    }

    return enrollment;
  }
}
