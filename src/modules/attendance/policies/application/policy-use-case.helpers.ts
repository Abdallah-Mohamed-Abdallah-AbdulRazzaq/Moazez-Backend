import {
  AttendanceMode,
  AttendanceScopeType,
  DailyComputationStrategy,
  Prisma,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  AttendancePolicyScopeIdsDto,
  CreateAttendancePolicyDto,
  EffectiveAttendancePolicyQueryDto,
  UpdateAttendancePolicyDto,
  ValidateAttendancePolicyNameQueryDto,
} from '../dto/attendance-policy.dto';
import {
  AttendanceScopeIds,
  buildScopeKey,
  NormalizedAttendancePolicyScope,
  validateEffectiveDateRange,
  validateNormalizedScope,
} from '../domain/policy-scope';
import {
  AttendancePoliciesRepository,
  AttendancePolicyRecord,
  TermReferenceRecord,
} from '../infrastructure/attendance-policies.repository';

type PolicyScopeInput = {
  scopeType: AttendanceScopeType;
  scopeKey?: string;
  scopeIds?: AttendancePolicyScopeIdsDto;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
};

type PolicyConfigInput = {
  mode?: AttendanceMode;
  dailyComputationStrategy?: DailyComputationStrategy;
  requireExcuseAttachment?: boolean;
  requireAttachmentForExcuse?: boolean;
  allowParentExcuseRequests?: boolean;
  allowExcuses?: boolean;
  notifyGuardiansOnAbsence?: boolean;
  notifyGuardians?: boolean;
  notifyOnAbsent?: boolean;
};

type PolicyDateInput = {
  effectiveFrom?: string | null;
  effectiveStartDate?: string | null;
  effectiveTo?: string | null;
  effectiveEndDate?: string | null;
};

type PolicyTextInput = {
  nameAr?: string;
  nameEn?: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  notes?: string | null;
  notesAr?: string | null;
  notesEn?: string | null;
};

export function resolveAcademicYearId(input: {
  academicYearId?: string;
  yearId?: string;
}): string {
  const academicYearId = input.academicYearId ?? input.yearId;
  if (!academicYearId) {
    throw new ValidationDomainException('Academic year is required', {
      field: 'yearId',
    });
  }

  return academicYearId;
}

export async function validateAcademicPolicyContext(
  repository: AttendancePoliciesRepository,
  academicYearId: string,
  termId: string,
): Promise<{ term: TermReferenceRecord }> {
  const [academicYear, term] = await Promise.all([
    repository.findAcademicYearById(academicYearId),
    repository.findTermById(termId),
  ]);

  if (!academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId,
    });
  }

  if (!term || term.academicYearId !== academicYearId) {
    throw new NotFoundDomainException('Term not found', {
      termId,
      academicYearId,
    });
  }

  return { term };
}

export function assertTermWritable(term: TermReferenceRecord): void {
  if (!term.isActive) {
    throw new ValidationDomainException(
      'Attendance policies cannot be changed in a closed term',
      { termId: term.id },
    );
  }
}

export async function resolvePolicyScope(
  repository: AttendancePoliciesRepository,
  input: PolicyScopeInput,
): Promise<NormalizedAttendancePolicyScope> {
  const requestedIds = extractScopeIds(input);

  switch (input.scopeType) {
    case AttendanceScopeType.SCHOOL: {
      rejectIds(requestedIds, [
        'stageId',
        'gradeId',
        'sectionId',
        'classroomId',
      ]);
      return {
        scopeType: AttendanceScopeType.SCHOOL,
        scopeKey: 'school',
        stageId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
      };
    }

    case AttendanceScopeType.STAGE: {
      rejectIds(requestedIds, ['gradeId', 'sectionId', 'classroomId']);
      const stageId = requireId(
        'stageId',
        requestedIds.stageId,
        input.scopeType,
      );
      const stage = await repository.findStageById(stageId);
      if (!stage) {
        throw new NotFoundDomainException('Stage not found', { stageId });
      }

      return normalizeScope({
        scopeType: AttendanceScopeType.STAGE,
        stageId: stage.id,
      });
    }

    case AttendanceScopeType.GRADE: {
      rejectIds(requestedIds, ['sectionId', 'classroomId']);
      const gradeId = requireId(
        'gradeId',
        requestedIds.gradeId,
        input.scopeType,
      );
      const grade = await repository.findGradeById(gradeId);
      if (!grade) {
        throw new NotFoundDomainException('Grade not found', { gradeId });
      }

      assertOptionalParent('stageId', requestedIds.stageId, grade.stageId);

      return normalizeScope({
        scopeType: AttendanceScopeType.GRADE,
        stageId: grade.stageId,
        gradeId: grade.id,
      });
    }

    case AttendanceScopeType.SECTION: {
      rejectIds(requestedIds, ['classroomId']);
      const sectionId = requireId(
        'sectionId',
        requestedIds.sectionId,
        input.scopeType,
      );
      const section = await repository.findSectionById(sectionId);
      if (!section) {
        throw new NotFoundDomainException('Section not found', { sectionId });
      }

      assertOptionalParent('gradeId', requestedIds.gradeId, section.gradeId);
      assertOptionalParent(
        'stageId',
        requestedIds.stageId,
        section.grade.stageId,
      );

      return normalizeScope({
        scopeType: AttendanceScopeType.SECTION,
        stageId: section.grade.stageId,
        gradeId: section.gradeId,
        sectionId: section.id,
      });
    }

    case AttendanceScopeType.CLASSROOM: {
      const classroomId = requireId(
        'classroomId',
        requestedIds.classroomId,
        input.scopeType,
      );
      const classroom = await repository.findClassroomById(classroomId);
      if (!classroom) {
        throw new NotFoundDomainException('Classroom not found', {
          classroomId,
        });
      }

      assertOptionalParent(
        'sectionId',
        requestedIds.sectionId,
        classroom.sectionId,
      );
      assertOptionalParent(
        'gradeId',
        requestedIds.gradeId,
        classroom.section.gradeId,
      );
      assertOptionalParent(
        'stageId',
        requestedIds.stageId,
        classroom.section.grade.stageId,
      );

      return normalizeScope({
        scopeType: AttendanceScopeType.CLASSROOM,
        stageId: classroom.section.grade.stageId,
        gradeId: classroom.section.gradeId,
        sectionId: classroom.sectionId,
        classroomId: classroom.id,
      });
    }
  }
}

export async function resolveEffectiveRequestScope(
  repository: AttendancePoliciesRepository,
  query: EffectiveAttendancePolicyQueryDto,
): Promise<NormalizedAttendancePolicyScope> {
  const scopeType = inferScopeType(query);
  return resolvePolicyScope(repository, {
    ...query,
    scopeType,
  });
}

export function mergePolicyScopeInput(
  existing: AttendancePolicyRecord,
  command: UpdateAttendancePolicyDto,
): PolicyScopeInput {
  const scopeType = command.scopeType ?? existing.scopeType;
  const scopeTypeChanged =
    command.scopeType !== undefined && command.scopeType !== existing.scopeType;
  const base = scopeTypeChanged
    ? {}
    : {
        stageId: existing.stageId,
        gradeId: existing.gradeId,
        sectionId: existing.sectionId,
        classroomId: existing.classroomId,
      };

  return {
    scopeType,
    scopeKey:
      command.scopeKey ?? (scopeTypeChanged ? undefined : existing.scopeKey),
    scopeIds: command.scopeIds,
    stageId: hasOwn(command, 'stageId') ? command.stageId : base.stageId,
    gradeId: hasOwn(command, 'gradeId') ? command.gradeId : base.gradeId,
    sectionId: hasOwn(command, 'sectionId')
      ? command.sectionId
      : base.sectionId,
    classroomId: hasOwn(command, 'classroomId')
      ? command.classroomId
      : base.classroomId,
  };
}

export function hasScopePatch(command: UpdateAttendancePolicyDto): boolean {
  return (
    hasOwn(command, 'scopeType') ||
    hasOwn(command, 'scopeKey') ||
    hasOwn(command, 'scopeIds') ||
    hasOwn(command, 'stageId') ||
    hasOwn(command, 'gradeId') ||
    hasOwn(command, 'sectionId') ||
    hasOwn(command, 'classroomId')
  );
}

export function buildCreatePolicyData(params: {
  schoolId: string;
  academicYearId: string;
  termId: string;
  scope: NormalizedAttendancePolicyScope;
  command: CreateAttendancePolicyDto;
}): Prisma.AttendancePolicyUncheckedCreateInput {
  const effectiveFrom = resolveCreateDate(params.command, 'from');
  const effectiveTo = resolveCreateDate(params.command, 'to');
  validateEffectiveDateRange(effectiveFrom, effectiveTo);

  return {
    schoolId: params.schoolId,
    academicYearId: params.academicYearId,
    termId: params.termId,
    scopeType: params.scope.scopeType,
    scopeKey: params.scope.scopeKey,
    stageId: params.scope.stageId,
    gradeId: params.scope.gradeId,
    sectionId: params.scope.sectionId,
    classroomId: params.scope.classroomId,
    nameAr: requireTrimmed('nameAr', params.command.nameAr),
    nameEn: requireTrimmed('nameEn', params.command.nameEn),
    descriptionAr: normalizeOptionalString(params.command.descriptionAr),
    descriptionEn: normalizeOptionalString(params.command.descriptionEn),
    notes: resolveNotes(params.command),
    mode: params.command.mode,
    dailyComputationStrategy:
      params.command.dailyComputationStrategy ??
      DailyComputationStrategy.MANUAL,
    requireExcuseAttachment: resolveCreateRequireExcuseAttachment(
      params.command,
    ),
    allowParentExcuseRequests: resolveCreateAllowExcuses(params.command),
    notifyGuardiansOnAbsence: resolveCreateNotifyGuardians(params.command),
    effectiveFrom,
    effectiveTo,
    isActive: params.command.isActive ?? true,
  };
}

export function buildUpdatePolicyData(params: {
  existing: AttendancePolicyRecord;
  academicYearId: string;
  termId: string;
  scope: NormalizedAttendancePolicyScope;
  command: UpdateAttendancePolicyDto;
}): Prisma.AttendancePolicyUncheckedUpdateInput {
  const data: Prisma.AttendancePolicyUncheckedUpdateInput = {};

  if (params.academicYearId !== params.existing.academicYearId) {
    data.academicYearId = params.academicYearId;
  }
  if (params.termId !== params.existing.termId) {
    data.termId = params.termId;
  }
  if (
    params.scope.scopeType !== params.existing.scopeType ||
    params.scope.scopeKey !== params.existing.scopeKey
  ) {
    data.scopeType = params.scope.scopeType;
    data.scopeKey = params.scope.scopeKey;
    data.stageId = params.scope.stageId;
    data.gradeId = params.scope.gradeId;
    data.sectionId = params.scope.sectionId;
    data.classroomId = params.scope.classroomId;
  }

  if (params.command.nameAr !== undefined) {
    data.nameAr = requireTrimmed('nameAr', params.command.nameAr);
  }
  if (params.command.nameEn !== undefined) {
    data.nameEn = requireTrimmed('nameEn', params.command.nameEn);
  }
  if (hasOwn(params.command, 'descriptionAr')) {
    data.descriptionAr = normalizeOptionalString(params.command.descriptionAr);
  }
  if (hasOwn(params.command, 'descriptionEn')) {
    data.descriptionEn = normalizeOptionalString(params.command.descriptionEn);
  }
  if (
    hasOwn(params.command, 'notes') ||
    hasOwn(params.command, 'notesAr') ||
    hasOwn(params.command, 'notesEn')
  ) {
    data.notes = resolveNotes(params.command);
  }
  if (params.command.mode !== undefined) {
    data.mode = params.command.mode;
  }
  if (params.command.dailyComputationStrategy !== undefined) {
    data.dailyComputationStrategy = params.command.dailyComputationStrategy;
  }

  const requireExcuseAttachment = resolveUpdateRequireExcuseAttachment(
    params.command,
  );
  if (requireExcuseAttachment !== undefined) {
    data.requireExcuseAttachment = requireExcuseAttachment;
  }

  const allowParentExcuseRequests = resolveUpdateAllowExcuses(params.command);
  if (allowParentExcuseRequests !== undefined) {
    data.allowParentExcuseRequests = allowParentExcuseRequests;
  }

  const notifyGuardiansOnAbsence = resolveUpdateNotifyGuardians(params.command);
  if (notifyGuardiansOnAbsence !== undefined) {
    data.notifyGuardiansOnAbsence = notifyGuardiansOnAbsence;
  }

  const effectiveFrom = resolveUpdateDate(params.command, 'from');
  const effectiveTo = resolveUpdateDate(params.command, 'to');
  const nextEffectiveFrom =
    effectiveFrom === undefined ? params.existing.effectiveFrom : effectiveFrom;
  const nextEffectiveTo =
    effectiveTo === undefined ? params.existing.effectiveTo : effectiveTo;
  validateEffectiveDateRange(nextEffectiveFrom, nextEffectiveTo);

  if (effectiveFrom !== undefined) data.effectiveFrom = effectiveFrom;
  if (effectiveTo !== undefined) data.effectiveTo = effectiveTo;

  if (params.command.isActive !== undefined) {
    data.isActive = params.command.isActive;
  }

  return data;
}

export function validateAtLeastOneName(input: {
  nameAr?: string;
  nameEn?: string;
}): void {
  if (!input.nameAr && !input.nameEn) {
    throw new ValidationDomainException(
      'At least one policy name is required',
      { fields: ['nameAr', 'nameEn'] },
    );
  }
}

export function normalizePolicyNames(input: PolicyTextInput): {
  nameAr?: string;
  nameEn?: string;
} {
  return {
    nameAr:
      input.nameAr === undefined
        ? undefined
        : requireTrimmed('nameAr', input.nameAr),
    nameEn:
      input.nameEn === undefined
        ? undefined
        : requireTrimmed('nameEn', input.nameEn),
  };
}

export function normalizeQueryScopeInput(
  query: ValidateAttendancePolicyNameQueryDto,
): PolicyScopeInput {
  return {
    scopeType: query.scopeType,
    scopeKey: query.scopeKey,
    stageId: query.stageId,
    gradeId: query.gradeId,
    sectionId: query.sectionId,
    classroomId: query.classroomId,
  };
}

function normalizeScope(params: {
  scopeType: AttendanceScopeType;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
}): NormalizedAttendancePolicyScope {
  const scope = {
    scopeType: params.scopeType,
    scopeKey: buildScopeKey(params.scopeType, params),
    stageId: params.stageId ?? null,
    gradeId: params.gradeId ?? null,
    sectionId: params.sectionId ?? null,
    classroomId: params.classroomId ?? null,
  };

  validateNormalizedScope(scope);
  return scope;
}

function extractScopeIds(input: PolicyScopeInput): AttendanceScopeIds {
  return {
    stageId: input.stageId ?? input.scopeIds?.stageId ?? null,
    gradeId: input.gradeId ?? input.scopeIds?.gradeId ?? null,
    sectionId: input.sectionId ?? input.scopeIds?.sectionId ?? null,
    classroomId: input.classroomId ?? input.scopeIds?.classroomId ?? null,
  };
}

function rejectIds(
  ids: AttendanceScopeIds,
  fields: (keyof AttendanceScopeIds)[],
): void {
  const present = fields.filter((field) => Boolean(ids[field]));
  if (present.length > 0) {
    throw new ValidationDomainException(
      'Attendance policy scope contains ids that do not match its scope type',
      { fields: present },
    );
  }
}

function requireId(
  field: keyof AttendanceScopeIds,
  value: string | null | undefined,
  scopeType: AttendanceScopeType,
): string {
  if (!value) {
    throw new ValidationDomainException(
      `${scopeType} attendance policy scope requires ${field}`,
      { scopeType, field },
    );
  }

  return value;
}

function assertOptionalParent(
  field: keyof AttendanceScopeIds,
  provided: string | null | undefined,
  actual: string,
): void {
  if (provided && provided !== actual) {
    throw new ValidationDomainException(
      'Attendance policy scope parent ids do not match the selected scope',
      { field },
    );
  }
}

function inferScopeType(
  query: EffectiveAttendancePolicyQueryDto,
): AttendanceScopeType {
  if (query.scopeType) return query.scopeType;
  if (query.classroomId) return AttendanceScopeType.CLASSROOM;
  if (query.sectionId) return AttendanceScopeType.SECTION;
  if (query.gradeId) return AttendanceScopeType.GRADE;
  if (query.stageId) return AttendanceScopeType.STAGE;
  return AttendanceScopeType.SCHOOL;
}

function resolveCreateDate(
  input: PolicyDateInput,
  edge: 'from' | 'to',
): Date | null {
  return (
    parseOptionalDate(
      edge === 'from'
        ? (input.effectiveFrom ?? input.effectiveStartDate)
        : (input.effectiveTo ?? input.effectiveEndDate),
    ) ?? null
  );
}

function resolveUpdateDate(
  input: PolicyDateInput,
  edge: 'from' | 'to',
): Date | null | undefined {
  const canonicalKey = edge === 'from' ? 'effectiveFrom' : 'effectiveTo';
  const aliasKey = edge === 'from' ? 'effectiveStartDate' : 'effectiveEndDate';
  const hasCanonical = hasOwn(input, canonicalKey);
  const hasAlias = hasOwn(input, aliasKey);

  if (!hasCanonical && !hasAlias) return undefined;

  return parseOptionalDate(
    hasCanonical
      ? input[canonicalKey as keyof PolicyDateInput]
      : input[aliasKey as keyof PolicyDateInput],
  );
}

function parseOptionalDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return new Date(value);
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireTrimmed(field: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationDomainException(`${field} must not be empty`, {
      field,
    });
  }

  return trimmed;
}

function resolveNotes(input: PolicyTextInput): string | null {
  return normalizeOptionalString(input.notes ?? input.notesEn ?? input.notesAr);
}

function resolveCreateRequireExcuseAttachment(
  input: PolicyConfigInput,
): boolean {
  return (
    input.requireExcuseAttachment ?? input.requireAttachmentForExcuse ?? false
  );
}

function resolveUpdateRequireExcuseAttachment(
  input: PolicyConfigInput,
): boolean | undefined {
  return input.requireExcuseAttachment ?? input.requireAttachmentForExcuse;
}

function resolveCreateAllowExcuses(input: PolicyConfigInput): boolean {
  return input.allowParentExcuseRequests ?? input.allowExcuses ?? true;
}

function resolveUpdateAllowExcuses(
  input: PolicyConfigInput,
): boolean | undefined {
  return input.allowParentExcuseRequests ?? input.allowExcuses;
}

function resolveCreateNotifyGuardians(input: PolicyConfigInput): boolean {
  return resolveUpdateNotifyGuardians(input) ?? true;
}

function resolveUpdateNotifyGuardians(
  input: PolicyConfigInput,
): boolean | undefined {
  if (input.notifyGuardiansOnAbsence !== undefined) {
    return input.notifyGuardiansOnAbsence;
  }

  if (
    input.notifyGuardians !== undefined &&
    input.notifyOnAbsent !== undefined
  ) {
    return input.notifyGuardians && input.notifyOnAbsent;
  }

  return input.notifyGuardians ?? input.notifyOnAbsent;
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
