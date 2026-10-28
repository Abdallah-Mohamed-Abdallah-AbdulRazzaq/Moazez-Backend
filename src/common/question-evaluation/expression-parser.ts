import { invalid } from './contracts';
import { parseExactDecimal } from './exact-decimal';
import { list, text, unique } from './strict-data';

export const EXPRESSION_LIMITS = Object.freeze({
  length: 512,
  tokens: 128,
  nodes: 256,
  depth: 32,
  variables: 8,
  power: 16,
  rationalBits: 4096,
  operations: 4096,
});
export type ExpressionNode = Readonly<
  | { kind: 'literal'; coefficient: bigint; exponent: number; depth: number }
  | { kind: 'variable'; name: string; depth: number }
  | {
      kind: 'unary';
      operator: '+' | '-';
      operand: ExpressionNode;
      depth: number;
    }
  | {
      kind: 'binary';
      operator: '+' | '-' | '*' | '/' | '^';
      left: ExpressionNode;
      right: ExpressionNode;
      depth: number;
    }
>;
export function validateVariables(values: string[]): string[] {
  if (values.length > EXPRESSION_LIMITS.variables) invalid();
  const forbidden = new Set([
    'constructor',
    'prototype',
    '__proto__',
    'eval',
    'Function',
    'globalThis',
    'global',
    'window',
    'document',
    'process',
    'require',
    'import',
    'this',
    'toString',
    'toJSON',
    'valueOf',
  ]);
  for (const value of values)
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/u.test(value) || forbidden.has(value))
      invalid();
  unique(values);
  return [...values].sort();
}
/** Independent node/depth ceilings, even though the token limit usually wins. */
export class ExpressionNodeBudget {
  private nodes = 0;
  add<T extends ExpressionNode>(node: T): T {
    if (
      ++this.nodes > EXPRESSION_LIMITS.nodes ||
      node.depth > EXPRESSION_LIMITS.depth
    )
      invalid();
    return Object.freeze(node);
  }
}
export function parseExpression(
  value: unknown,
  variables: unknown,
): ExpressionNode {
  const expression = text(value, EXPRESSION_LIMITS.length);
  const declared = validateVariables(
    list(variables, 8).map((value) => text(value, 32)),
  );
  const tokens: string[] = [];
  let cursor = 0;
  while (cursor < expression.length) {
    if (/[ \t\r\n]/u.test(expression[cursor])) {
      cursor++;
      continue;
    }
    const match =
      /^(?:\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z][A-Za-z0-9_]*|[()+\-*/^])/u.exec(
        expression.slice(cursor),
      );
    if (!match || tokens.length === EXPRESSION_LIMITS.tokens) invalid();
    tokens.push(match[0]);
    cursor += match[0].length;
  }
  let index = 0,
    nesting = 0;
  const budget = new ExpressionNodeBudget();
  const nested = (parse: () => ExpressionNode): ExpressionNode => {
    if (++nesting > EXPRESSION_LIMITS.depth) invalid();
    try {
      return parse();
    } finally {
      nesting--;
    }
  };
  const binary = (
    operator: '+' | '-' | '*' | '/' | '^',
    left: ExpressionNode,
    right: ExpressionNode,
  ) =>
    budget.add({
      kind: 'binary',
      operator,
      left,
      right,
      depth: Math.max(left.depth, right.depth) + 1,
    } as const);
  function sum(): ExpressionNode {
    let node = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const op = tokens[index++] as '+' | '-';
      node = binary(op, node, product());
    }
    return node;
  }
  function product(): ExpressionNode {
    let node = unary();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const op = tokens[index++] as '*' | '/';
      node = binary(op, node, unary());
    }
    return node;
  }
  function unary(): ExpressionNode {
    if (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++] as '+' | '-';
      const operand = nested(unary);
      return budget.add({
        kind: 'unary',
        operator,
        operand,
        depth: operand.depth + 1,
      });
    }
    return power();
  }
  function power(): ExpressionNode {
    let node = primary();
    if (tokens[index] === '^') {
      index++;
      node = binary('^', node, nested(unary));
    }
    return node;
  }
  function primary(): ExpressionNode {
    const token = tokens[index++];
    if (!token) invalid();
    if (token === '(') {
      const node = nested(sum);
      if (tokens[index++] !== ')') invalid();
      return node;
    }
    if (/^\d/u.test(token)) {
      const value = parseExactDecimal(token);
      return budget.add({ kind: 'literal', ...value, depth: 1 });
    }
    if (declared.includes(token))
      return budget.add({ kind: 'variable', name: token, depth: 1 });
    return invalid();
  }
  const root = sum();
  if (index !== tokens.length) invalid();
  return root;
}
