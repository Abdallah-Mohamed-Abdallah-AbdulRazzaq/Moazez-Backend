import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

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
  const productionCreateCalls = findInjectedUseCaseExecuteCalls(
    'CreateReinforcementTaskUseCase',
  );
  const productionPrimitiveCalls = findProductionMethodCalls(
    'createTaskWithTargetsStagesAssignments',
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

  it('classifies by current allocation ownership before lifecycle-independent Teacher identity fallback', () => {
    const fallback = sourceBetween(
      repositorySource,
      'private async coordinateCoreTeacherTaskWithAllocations(',
      'async duplicateTaskWithTargetsStagesAssignments(',
    );

    expect(fallback.indexOf('tx.enrollment.findMany')).toBeLessThan(
      fallback.indexOf('tx.teacherSubjectAllocation.findMany'),
    );
    expect(
      fallback.indexOf('tx.teacherSubjectAllocation.findMany'),
    ).toBeLessThan(fallback.indexOf('tx.user.findMany'));
    for (const lifecycleDependency of [
      'MembershipStatus',
      'memberships',
      'endedAt',
      'employmentStatus',
      'UserStatus',
    ]) {
      expect(fallback).not.toContain(lifecycleDependency);
    }
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

  it('allows only the Core public route and Teacher App to call the create use case', () => {
    expect(
      productionCreateCalls.map(({ path, argumentCount }) => ({
        path,
        argumentCount,
      })),
    ).toEqual([
      {
        path: 'src/modules/reinforcement/tasks/controller/reinforcement-tasks.controller.ts',
        argumentCount: 1,
      },
      {
        path: 'src/modules/teacher-app/tasks/application/create-teacher-task.use-case.ts',
        argumentCount: 2,
      },
    ]);

    const teacherAppCall = productionCreateCalls[1];
    expect(teacherAppCall.secondArgumentProperties).toEqual([
      'allocationIds',
      'expectedTeacherUserId',
    ]);
    expect(
      productionCreateCalls.filter(
        (call) =>
          call.argumentCount > 1 &&
          call.path !==
            'src/modules/teacher-app/tasks/application/create-teacher-task.use-case.ts',
      ),
    ).toHaveLength(0);
    expect(productionPrimitiveCalls).toEqual([
      'src/modules/reinforcement/tasks/application/create-reinforcement-task.use-case.ts',
      'src/modules/reinforcement/tasks/infrastructure/reinforcement-tasks.repository.ts',
    ]);
  });
});

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function findInjectedUseCaseExecuteCalls(typeName: string): Array<{
  path: string;
  argumentCount: number;
  secondArgumentProperties: string[];
}> {
  const sourceRoot = join(process.cwd(), 'src');
  const calls: Array<{
    path: string;
    argumentCount: number;
    secondArgumentProperties: string[];
  }> = [];

  for (const absolutePath of listProductionTypeScriptFiles(sourceRoot)) {
    const source = readFileSync(absolutePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      absolutePath,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    const injectedPropertyNames = new Set<string>();

    walk(sourceFile, (node) => {
      if (
        ts.isParameter(node) &&
        ts.isIdentifier(node.name) &&
        node.type?.getText(sourceFile) === typeName
      ) {
        injectedPropertyNames.add(node.name.text);
      }
    });
    if (injectedPropertyNames.size === 0) continue;

    walk(sourceFile, (node) => {
      if (
        !ts.isCallExpression(node) ||
        !ts.isPropertyAccessExpression(node.expression) ||
        node.expression.name.text !== 'execute' ||
        !ts.isPropertyAccessExpression(node.expression.expression) ||
        node.expression.expression.expression.kind !==
          ts.SyntaxKind.ThisKeyword ||
        !injectedPropertyNames.has(node.expression.expression.name.text)
      ) {
        return;
      }

      const secondArgument = node.arguments[1];
      calls.push({
        path: relative(process.cwd(), absolutePath).replaceAll('\\', '/'),
        argumentCount: node.arguments.length,
        secondArgumentProperties:
          secondArgument && ts.isObjectLiteralExpression(secondArgument)
            ? secondArgument.properties
                .map((property) => property.name)
                .filter((name): name is ts.PropertyName => Boolean(name))
                .map((name) => name.getText(sourceFile))
            : [],
      });
    });
  }

  return calls.sort((left, right) => left.path.localeCompare(right.path));
}

function findProductionMethodCalls(methodName: string): string[] {
  const sourceRoot = join(process.cwd(), 'src');
  const calls: string[] = [];

  for (const absolutePath of listProductionTypeScriptFiles(sourceRoot)) {
    const sourceFile = ts.createSourceFile(
      absolutePath,
      readFileSync(absolutePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    walk(sourceFile, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === methodName
      ) {
        calls.push(relative(process.cwd(), absolutePath).replaceAll('\\', '/'));
      }
    });
  }

  return calls.sort();
}

function listProductionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'tests'
        ? []
        : listProductionTypeScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

function walk(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  node.forEachChild((child) => walk(child, visitor));
}
