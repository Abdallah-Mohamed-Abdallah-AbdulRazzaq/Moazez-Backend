import {
  ReinforcementProofType,
  ReinforcementTargetScope,
} from '@prisma/client';
import {
  assertNoDuplicateTargets,
  buildDefaultStage,
  normalizeProofType,
  normalizeTargetScope,
  normalizeTaskStages,
  normalizeTaskTarget,
  ReinforcementTaskDuplicateTargetException,
} from '../domain/reinforcement-task-domain';

describe('Reinforcement task domain helpers', () => {
  it('normalizes frontend target scope and proof type strings', () => {
    expect(normalizeTargetScope('classroom')).toBe(
      ReinforcementTargetScope.CLASSROOM,
    );
    expect(normalizeTargetScope('STUDENT')).toBe(
      ReinforcementTargetScope.STUDENT,
    );
    expect(normalizeProofType('none')).toBe(ReinforcementProofType.NONE);
  });

  it('rejects duplicate target scopes and ids', () => {
    const first = normalizeTaskTarget({
      schoolId: 'school-1',
      target: { scopeType: 'student', scopeId: 'student-1' },
    });
    const second = normalizeTaskTarget({
      schoolId: 'school-1',
      target: { scopeType: 'student', scopeId: 'student-1' },
    });

    expect(() => assertNoDuplicateTargets([first, second])).toThrow(
      ReinforcementTaskDuplicateTargetException,
    );
  });

  it('creates a safe default stage when stages are omitted', () => {
    expect(
      normalizeTaskStages({
        taskTitleEn: 'Lead reading',
        taskTitleAr: null,
      }),
    ).toEqual([
      expect.objectContaining({
        sortOrder: 1,
        titleEn: 'Lead reading',
        titleAr: 'Lead reading',
        proofType: ReinforcementProofType.NONE,
        requiresApproval: true,
      }),
    ]);

    expect(buildDefaultStage({ taskTitleEn: null, taskTitleAr: null })).toEqual(
      expect.objectContaining({
        titleEn: 'Task stage',
        titleAr: 'Task stage',
      }),
    );
  });
});
