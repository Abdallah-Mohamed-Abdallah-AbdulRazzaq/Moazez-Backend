import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Reinforcement task allocation coordination source contract', () => {
  const repositorySource = readFileSync(
    join(
      process.cwd(),
      'src/modules/reinforcement/tasks/infrastructure/reinforcement-tasks.repository.ts',
    ),
    'utf8',
  );
  const dtoSource = readFileSync(
    join(
      process.cwd(),
      'src/modules/reinforcement/tasks/dto/reinforcement-task.dto.ts',
    ),
    'utf8',
  );
  const useCaseHelpersSource = readFileSync(
    join(
      process.cwd(),
      'src/modules/reinforcement/tasks/application/reinforcement-task-use-case.helpers.ts',
    ),
    'utf8',
  );

  it('keeps automatic fallback enforcement inside the creation transaction', () => {
    const primitive = sourceBetween(
      repositorySource,
      'async createTaskWithTargetsStagesAssignments(',
      'async duplicateTaskWithTargetsStagesAssignments(',
    );

    expect(primitive).toContain('this.prisma.$transaction(async (tx) =>');
    expect(primitive).toContain('if (input.operationalWriteGate)');
    expect(primitive).toContain(
      'await this.coordinateCoreTeacherTaskWithAllocations(tx, input);',
    );
    expect(
      primitive.indexOf('coordinateCoreTeacherTaskWithAllocations'),
    ).toBeLessThan(primitive.indexOf('tx.reinforcementTask.create'));
  });

  it('uses only the supplied transaction for automatic discovery and gating', () => {
    const fallback = sourceBetween(
      repositorySource,
      'private async coordinateCoreTeacherTaskWithAllocations(',
      'async duplicateTaskWithTargetsStagesAssignments(',
    );

    expect(fallback).toContain('tx.user.findMany');
    expect(fallback).toContain('tx.enrollment.findMany');
    expect(fallback).toContain('tx.teacherSubjectAllocation.findMany');
    expect(fallback).toContain('this.teacherAllocationWriteGate.lock(tx,');
    expect(fallback).not.toContain('this.prisma.');
    expect(fallback).not.toContain('$transaction');
  });

  it('does not expose allocation IDs on the public Reinforcement task DTO', () => {
    expect(dtoSource).not.toMatch(/allocationIds?/);
    expect(dtoSource).not.toMatch(/operationalWriteGate/);
  });

  it('preserves management ownership classification for duplicate operations', () => {
    const duplicateBuilder = sourceBetween(
      useCaseHelpersSource,
      'export async function buildDuplicateTaskMutationInput(',
      'export function normalizeTaskListFilters(',
    );
    const duplicateDto = sourceBetween(
      dtoSource,
      'export class DuplicateReinforcementTaskDto',
      'export class CancelReinforcementTaskDto',
    );

    expect(duplicateBuilder).toContain('assignedById: params.scope.actorId');
    expect(duplicateBuilder).toContain('createdById: params.scope.actorId');
    expect(duplicateDto).not.toContain('assignedById');
  });
});

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}
